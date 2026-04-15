# PARC APP — Technical Architecture

**Version:** 1.0  
**Date:** 2026-04-14

---

## 1. Tech Stack

### Frontend

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15+ (App Router) | SSR for SEO, RSC for DB queries, streaming |
| Styling | Tailwind CSS v4 | Already in use |
| State | Zustand | Lightweight, no boilerplate |
| Audio capture | Web Audio API + MediaRecorder | No extra dep; 15s clips max |
| Animations | Framer Motion | Micro-interactions on question cards |

### Backend / BaaS

| Layer | Choice | Rationale |
|---|---|---|
| Database | Supabase (Postgres) | Already in use; RLS, realtime |
| Auth | Supabase Auth | OAuth + magic link out of the box |
| Storage | Supabase Storage | Voice clips in `voice-responses` bucket |
| Background jobs | Supabase Edge Functions + pg_cron | Gap recalculation on review insert |
| API routes | Next.js Route Handlers | Co-located, edge-deployable |

### AI Layer

| Layer | Choice | Rationale |
|---|---|---|
| Transcription | OpenAI Whisper (`whisper-1`) | Accurate, cheap per minute |
| Gap detection & Q-gen | `gpt-4o` or `claude-sonnet-4-6` | Semantic clustering + question synthesis |
| Embeddings | `text-embedding-3-small` | Semantic dedup of generated questions |
| Vector store | pgvector (Supabase extension) | Keep it in Postgres, no extra infra |

### Infrastructure

- **Deployment:** Vercel (Next.js native, edge functions)
- **CDN / Voice storage:** Supabase Storage + signed URLs
- **Monitoring:** Vercel Analytics + Sentry
- **CI/CD:** GitHub Actions → Vercel preview per PR

---

## 2. Database Schema

### `users`
```sql
users
  id              uuid PK  -- FK to auth.users
  email           text UNIQUE NOT NULL
  persona_id      int FK → personas
  created_at      timestamptz DEFAULT now()
  preferences     jsonb    -- {budget, travel_frequency, accessibility_needs}
```

### `personas`
```sql
personas
  id              serial PK
  name            text NOT NULL  -- 'business' | 'family' | 'solo' | 'couple' | 'accessibility'
  question_weights jsonb         -- {service: 1.4, wifi: 1.8, ...} per dimension
  description     text
```

### `hotels_meta` (extends existing `Description_PROC`)
```sql
hotels_meta
  eg_property_id  text PK FK → "Description_PROC"
  gap_score       float         -- 0–1, overall % of dimensions covered
  gap_scores_by_dim jsonb       -- {service: 0.9, wifi: 0.3, ...}
  last_gap_calc   timestamptz
  total_responses int DEFAULT 0
```

### `review_submissions` (extends existing `Reviews_PROC`)
```sql
review_submissions
  id              uuid PK DEFAULT gen_random_uuid()
  user_id         uuid FK → users
  eg_property_id  text FK → "Description_PROC"
  stay_date       date
  source          text          -- 'app' | 'followup' | 'import'
  raw_transcript  text          -- Whisper output if voice
  created_at      timestamptz DEFAULT now()
```

### `questions`
```sql
questions
  id              uuid PK DEFAULT gen_random_uuid()
  eg_property_id  text FK → "Description_PROC"
  dimension       text          -- maps to rating key: 'wifi' | 'cleanliness' | etc.
  question_text   text NOT NULL
  response_type   text          -- 'tap_choice' | 'short_text' | 'voice' | 'rating'
  options         jsonb         -- for tap_choice: ['Yes', 'No', 'Partially']
  persona_ids     int[]         -- which personas see this question
  priority_score  float         -- recalculated by gap engine
  embedding       vector(1536)  -- for semantic dedup via pgvector
  generated_by    text          -- 'llm' | 'template' | 'manual'
  created_at      timestamptz DEFAULT now()
```

### `question_responses`
```sql
question_responses
  id              uuid PK DEFAULT gen_random_uuid()
  question_id     uuid FK → questions
  user_id         uuid FK → users
  eg_property_id  text
  response_value  text          -- tap answer, text, or transcript
  voice_url       text          -- Supabase Storage path
  sentiment       float         -- -1 to 1, computed async
  created_at      timestamptz DEFAULT now()
```

### `question_feedback`
```sql
question_feedback
  id              uuid PK DEFAULT gen_random_uuid()
  question_id     uuid FK → questions
  user_id         uuid FK → users
  signal          text          -- 'skipped' | 'flagged_irrelevant' | 'helpful'
  created_at      timestamptz DEFAULT now()
```

### Key Indexes
```sql
CREATE INDEX ON question_responses (eg_property_id, question_id);
CREATE INDEX ON questions (eg_property_id, priority_score DESC);
CREATE INDEX ON questions USING ivfflat (embedding vector_cosine_ops);
```

---

## 3. API Layer Design

### Endpoint Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/questions?hotel=&user=` | Serve ranked questions (Layers 3+4) |
| `POST` | `/api/questions/generate` | Trigger LLM question gen for a hotel (Layer 2) |
| `POST` | `/api/responses` | Submit text / tap / voice response |
| `POST` | `/api/gap-detect` | Recalculate gap scores for a hotel (Layer 1) |
| `POST` | `/api/transcribe` | Upload voice clip → Whisper → text |
| `POST` | `/api/feedback` | Record skip / flag / helpful signal |

---

## 4. 4-Layer Question Recommendation Engine

### Architecture Overview

```
Review ingested
      │
      ▼
[Layer 1: Gap Detection]
      │  What dimensions lack coverage for this hotel?
      ▼
[Layer 2: Semantic Dedup]
      │  Is a similar question already unanswered?
      ▼
[Layer 3: Persona Routing]
      │  Which user segments should see this question?
      ▼
[Layer 4: Priority Scoring]
      │  Rank by urgency × persona match × recency
      ▼
Question served to user
```

---

### Layer 1 — Gap Detection (`POST /api/gap-detect`)

**Trigger:** New review inserted (Supabase `pg_cron` or webhook)

**Logic:**
```
Input:  eg_property_id
1. Fetch last 100 reviews → extract dimension scores (15 keys)
2. For each dimension:
   - coverage = count(reviews where dimension score > 0) / total_reviews
   - gap = 1 - coverage
3. Flag dimensions where gap > 0.4 as "open gaps"
4. Persist to hotels_meta.gap_scores_by_dim
```

**Output:**
```typescript
{ dimension: string; gap_score: number; sample_reviews: string[] }[]
```

---

### Layer 2 — Semantic Dedup & Question Generation (`POST /api/questions/generate`)

**Logic:**
```
Input:  open gaps from Layer 1
1. For each gap dimension, prompt LLM:
   "Given these reviews about [dimension] for a hotel in [city],
    generate 2 specific follow-up questions a traveler could answer."
2. Embed each generated question (text-embedding-3-small)
3. Query pgvector: find existing questions with cosine_sim > 0.88
4. Discard near-duplicates; insert novel questions
5. Set generated_by = 'llm', priority_score = gap_score
```

**Dedup query:**
```sql
SELECT id FROM questions
WHERE eg_property_id = $1
  AND embedding <=> $2 < 0.12  -- cosine distance threshold
LIMIT 1;
```

**LLM prompt template:**
```
System: You generate concise, answerable hotel follow-up questions.
        Questions must be answerable in 1 sentence or a single tap.

User:   Hotel location: {city}, {country}
        Dimension: {dimension}
        Recent reviews mentioning this dimension:
        {sample_reviews}

        Generate 2 specific questions a traveler could answer
        from memory about their recent stay.
        Return JSON: [{ "question": "...", "response_type": "tap_choice|short_text", "options": [...] }]
```

---

### Layer 3 — Persona Routing (`GET /api/questions?hotel=X&user=Y`)

**Logic:**
```
Input:  eg_property_id, user_id
1. Load user.persona_id → persona.question_weights
2. Filter questions where dimension is in top-weighted dimensions for persona
   e.g. business persona: wifi weight=1.8 → wifi questions prioritized
3. Exclude questions user already answered or skipped
4. Return top 4 questions sorted by adjusted priority
```

**Persona weight examples:**

| Dimension | Business | Family | Solo | Couple | Accessibility |
|---|---|---|---|---|---|
| wifi | 1.8 | 1.2 | 1.5 | 1.0 | 1.0 |
| service | 1.4 | 1.6 | 1.1 | 1.5 | 1.8 |
| roomcleanliness | 1.2 | 1.8 | 1.3 | 1.4 | 1.3 |
| accessibility | 0.8 | 1.2 | 0.9 | 0.9 | 2.0 |
| location | 1.3 | 1.5 | 1.6 | 1.7 | 1.4 |

---

### Layer 4 — Priority Scoring & Feedback Loop

**Adjusted priority formula:**
```
priority = base_priority_score
         × persona_weight[dimension]
         × recency_decay(created_at)   -- questions >30 days old: 0.8x
         × (1 - skip_rate)             -- penalize frequently skipped questions
```

**Real-time recalculation triggers:**
- New `question_responses` row → decrement gap score → lower question priority
- `question_feedback.signal = 'skipped'` → increment skip_rate
- `question_feedback.signal = 'flagged_irrelevant'` → set priority = 0

**Edge Function (runs on response insert):**
```typescript
const { count } = await supabase
  .from('question_responses')
  .select('*', { count: 'exact', head: true })
  .eq('eg_property_id', propertyId)
  .eq('dimension', dimension);

const TARGET_COVERAGE = 20; // responses needed to close a gap
const newGap = Math.max(0, 1 - (count ?? 0) / TARGET_COVERAGE);

await supabase
  .from('hotels_meta')
  .update({ gap_scores_by_dim: { ...existing, [dimension]: newGap } })
  .eq('eg_property_id', propertyId);
```

---

## 5. Data Flow Diagram

```
User submits review
        │
        ▼
  Reviews_PROC insert
        │
        ├──► pg_cron → POST /api/gap-detect
        │         │
        │         ▼
        │    Layer 1: gap scores updated in hotels_meta
        │         │
        │         ▼
        │    Layer 2: LLM generates questions → deduped → stored
        │
        ▼
User visits hotel detail page
        │
        ▼
  GET /api/questions?hotel=X&user=Y
        │
        ├── Layer 3: persona filter applied
        └── Layer 4: priority sort → top 4 returned
                │
                ▼
        Question cards rendered
                │
         User answers ──► POST /api/responses
                              │
                              ▼
                     Gap score decremented
                     Priority recalculated
                     Notification queued if gap closed
```

---

## 6. File Structure (additions to existing project)

```
app/
  api/
    gap-detect/route.ts
    questions/
      route.ts          GET: serve questions
      generate/route.ts POST: trigger LLM generation
    responses/route.ts
    transcribe/route.ts
    feedback/route.ts
  auth/
    login/page.tsx
    callback/route.ts
  profile/
    page.tsx            Persona selection + preferences

components/
  question/
    QuestionCard.tsx    Tap / text / voice response UI
    VoiceRecorder.tsx   MediaRecorder wrapper, 15s max
    QuestionFeed.tsx    Scrollable list of questions for a hotel
  persona/
    PersonaSelector.tsx Onboarding persona picker

lib/
  gap-detector.ts       Layer 1 logic
  question-generator.ts Layer 2 LLM + embedding + dedup
  question-ranker.ts    Layers 3+4 scoring
  topic-keywords.ts     Dimension → keyword mapping

supabase/
  migrations/
    001_add_users.sql
    002_add_personas.sql
    003_add_questions.sql
    004_add_responses.sql
    005_add_hotels_meta.sql
    006_enable_pgvector.sql
  functions/
    recalculate-gap/index.ts   Edge Function
```

---

## 7. Implementation Priority

| Phase | Scope |
|---|---|
| **Phase 1** | Auth + persona selection, response collection schema, basic question UI |
| **Phase 2** | Layer 1 gap detection (template questions only, no LLM) |
| **Phase 3** | Layer 2 LLM question generation + pgvector dedup |
| **Phase 4** | Layers 3+4 persona routing + feedback loop + priority recalculation |
| **Phase 5** | Voice input (Whisper), push/email notifications, gamification |
