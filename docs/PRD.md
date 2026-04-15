# Product Requirements Document (PRD): PARC APP

**Version:** 2.1  
**Last Updated:** 2026-04-15  
**Status:** Active Development

---

## 1. Executive Summary

PARC APP is a next-generation hotel booking and review platform designed to solve the problem of stagnant, unverified, or irrelevant hotel reviews.

**The Core Innovation:** Instead of relying solely on users to write comprehensive reviews from scratch, PARC APP actively identifies "Information Gaps" using a 4-Layer Recommendation Engine. After a user leaves a standard review, the platform dynamically generates 1-2 highly personalized, low-friction, multi-modal follow-up questions to fill specific knowledge gaps in the database.

---

## 2. Value Proposition

- **For Users (Readers):** Higher trust in reviews through "Persona Similarity" clustering, ensuring they read reviews from people who share their specific travel needs and sensitivities.
- **For Users (Writers):** A frictionless review process leveraging AI Polish and multi-modal inputs (voice, sliders), reducing cognitive load.
- **For the Platform:** An ever-updating, self-healing database that automatically verifies decaying information and tests hotel marketing claims against actual user experiences.

---

## 3. Core User Flows

- **Onboarding:** First-time visitor lands on `/` → proxy detects no session cookie → redirects to `/login` → user enters username → redirected to `/onboarding` → user selects identity/preference tags (or skips) → persona saved to `User_Personas` → redirected to hotel feed.
- **Browsing:** User browses hotel list (sorted by guest rating, US-first) → opens hotel detail page → reads reviews with persona similarity badges.
- **Drafting a Review:** User opens review form on hotel detail page → uses Quick Tags and/or voice input → optionally clicks "AI Polish" to structure the review → submits → review saved to `Review_Submissions`.
- **Follow-Up (The "Aha" Moment):** After review submission → 4-Layer Engine queries `Description_PROC` and `Reviews_PROC` for gaps → user is presented with 1-2 interactive follow-up questions (slider or agreement axis) → user answers via tap, text, or voice.

---

## 4. Detailed Feature Specifications

### Feature 1: User Onboarding & Persona Engine
**Status: Fully Implemented**

- Users select broad identity and preference tags on first visit (e.g., Business traveler, Wheelchair user, Guide dog owner, Neurodivergent, Tourist).
- 55 curated preset tags across 6 groups: Travel Style, Trip Purpose, Accessibility, Sensory & Health, Companions & Household, Priorities & Preferences.
- Users can add custom tags (Enter/comma to confirm). Tags can be skipped and updated anytime via `/onboarding`.
- Tags and categories saved as parallel arrays in `User_Personas` (one row per user, upserted on save).
- Username-based session identity managed via `parc_user_id` and `parc_username` cookies (1-year expiry, set during login).

### Feature 2: Review Similarity Indicator
**Status: Fully Implemented**

- In the hotel review feed, each `ReviewCard` displays a similarity badge beneath the review metadata.
- Reviewer tags are inferred from `lob` (line of business) and high-scoring rating dimensions in `Reviews_PROC`.
- Logic uses static semantic cluster map covering the curated preset library plus review-derived synonyms (zero-latency). Examples:
  - User tag "Quiet" + reviewer high `roomcomfort` score → "Shares your focus: Quiet / Comfort"
  - User tag "Business traveler" + reviewer `lob = "business"` → "Similar traveler type: Business"
- Optional async embedding fallback available for custom tags (OpenAI `text-embedding-3-small`).
- Does not require exact string matches.

### Feature 3: AI-Assisted Review Creation
**Status: Fully Implemented**

- **Quick Tags:** 8 one-click dimensional stubs (Location, Facilities, Cleanliness, Service, WiFi, Breakfast, Value, Noise) that append a neutral prefix to the textarea for the user to complete.
- **Top Q&A Carousel:** 6 pre-written community questions displayed 2 at a time; clicking a card appends a seed phrase to the textarea.
- **Voice Input:** Live Web Speech API capture. Mic button toggles listening; recognized speech appends to textarea in real time. Pulses red while active.
- **AI Polish:** Sends raw text to `/api/ai-polish` (OpenAI `gpt-4o`, temperature 0.3). Returns a structured 2-4 sentence review. Strict anti-hallucination guardrails — AI only formats, never invents facts. Undo polish supported.
- **Submission:** Review saved to `Review_Submissions` with `raw_text`, `ai_polished_text`, and `eg_property_id`.

### Feature 4: The 4-Layer Question Recommendation Engine
**Status: Fully Implemented**

Triggered via `POST /api/reviews/follow-up` after a review is submitted. Returns 1-2 JSON question objects for the follow-up UI.

1. **Property Memory Decay Engine (Layer 1):** Scans `Reviews_PROC` for 15 tracked attributes (parking, breakfast, wifi, pet policy, construction, cleanliness, etc.). Flags attributes not mentioned in reviews within their decay window (7 days for cleanliness → 365 days for transit proximity).

2. **Review Blind Spot Detector (Layer 2):** Reads hotel claims from `Description_PROC` (amenity flags, policy fields). Cross-references against `Reviews_PROC`. If a claimed feature has no recent reviewer confirmation, it becomes a high-priority gap.

3. **Personalized Persona Matching (Layer 3):** Loads the submitting user's tags from `User_Personas`. Boosts gap priority for attributes relevant to those tags across the 55-tag preset library (e.g., "Pet owner" → pet_policy, "Business traveler" → wifi).

4. **Decision-Risk Minimization (Layer 4):** Merges duplicate gaps, applies deal-breaker weights (safety=10, accessibility=10, late_checkin=8, wifi=7, … breakfast_quality=2). Returns the top 2 gaps. Calls OpenAI `gpt-4o` to generate natural-language questions from the gaps. Falls back to deterministic template questions if LLM fails.

### Feature 5: Low-Friction Follow-Up UI
**Status: Fully Implemented**

Converts open-ended questions into "Statements for Confirmation" (Recognition over Recall).

- **Semantic Sliders:** For degree-based questions (e.g., Lighting: Soft ↔ Office White). Returns 0–1 float.
- **Agreement Axis:** 1-5 Likert scale for statement validation (e.g., "This hotel is very dog friendly: Disagree → Agree").
- **Quick Tag Grid:** Multi-select chip grid for categorical answers.
- **Continuous Multi-Modal:** Persistent microphone button on every question state. Voice transcript is mapped to slider/agreement values via NLP keyword matching with intensity modifiers (very/slightly/not negation support).
- Animated slide transitions between questions (Framer Motion). Completion screen on finish.

---

## 5. Technical Architecture & Tech Stack

### Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.3 (App Router, React 19) |
| Styling | Tailwind CSS v4, Framer Motion 12 |
| Database & Auth | Supabase (PostgreSQL) — username-based session via cookies |
| LLM | OpenAI `gpt-4o` (review polish + follow-up question generation) |
| Embeddings | OpenAI `text-embedding-3-small` (optional persona matching fallback) |
| Audio | Web Speech API (browser-native, no API key required) |
| Deployment | Vercel (Next.js native) |

### Database Schema

**`Description_PROC`** *(read-only — CSV import, never modified by app)*
```
eg_property_id  Text  PK
city, province, country, star_rating, guestrating_avg_expedia
property_description, area_description
popular_amenities_list  JSONB
property_amenity_*      JSONB / Text  (14 amenity category columns)
check_in_start_time, check_in_end_time, check_out_time
check_out_policy, pet_policy, children_and_extra_bed_policy  JSONB
check_in_instructions  JSONB
know_before_you_go      Text
```

**`Reviews_PROC`** *(read-only — CSV import, never modified by app)*
```
eg_property_id   Text  FK → Description_PROC
acquisition_date Date
lob              Text
rating           JSONB  (overall + 15 sub-dimension scores)
review_title     Text
review_text      Text
```

**`User_Personas`** *(app-managed)*
```
id         UUID  PK
user_id    UUID  NOT NULL  (stable app session user ID)
username   Text  NOT NULL  (login handle, unique per user)
tags       Text[]  (e.g., ['Business traveler', 'Quiet', 'Pet owner'])
categories Text[]  (parallel array, e.g., ['Travel Style', 'Trip Purpose', 'Priorities & Preferences'])
updated_at Timestamp
UNIQUE (user_id)
```

**`Review_Submissions`** *(app-managed)*
```
id               UUID  PK
eg_property_id   Text  FK → Description_PROC
user_id          UUID  (nullable — username-session user when available)
raw_text         Text
ai_polished_text Text
sentiment_score  Float  (nullable — not yet computed)
created_at       Timestamp
```

**`FollowUp_Answers`** *(app-managed — designed, not yet written to)*
```
id                 UUID  PK
review_id          UUID  FK → Review_Submissions
feature_name       Text  (e.g., 'WiFi', 'Parking')
ui_type            Enum  ('Slider' | 'Agreement')
quantitative_value Numeric  (0–1 for Slider, 1–5 for Agreement)
qualitative_note   Text  (optional voice/text transcription)
created_at         Timestamp
```

---

## 6. API Routes

| Method | Endpoint | Status | Description |
|---|---|---|---|
| `POST` | `/api/ai-polish` | ✅ Live | Takes `rawText`, returns `polishedText` via GPT-4o |
| `POST` | `/api/reviews/follow-up` | ✅ Live | Runs 4-Layer Engine, returns 1-2 follow-up question objects |
| `POST` | `/api/session/login` | ✅ Live | Takes `username`, restores or creates a stable user session |
| `POST` | `/api/session/logout` | ✅ Live | Clears `parc_user_id` and `parc_username` cookies |

---

## 7. Implementation Status

| Feature | Status | Notes |
|---|---|---|
| Persona Tagging (Onboarding) | ✅ Complete | 55 curated presets across 6 groups + custom tags, saved to `User_Personas` |
| Review Similarity Badge | ✅ Complete | Semantic clustering, inferred from `lob` + rating dimensions |
| Hotel Browsing & Detail | ✅ Complete | 4-tab detail page, all `Description_PROC` fields rendered |
| Review Feed | ✅ Complete | Paginated 20/page, sub-ratings, date, LOB badge |
| Review Submission | ✅ Complete | Quick Tags, Q&A carousel, voice input, AI Polish, submit |
| 4-Layer Follow-Up Engine | ✅ Complete | All 4 layers live, LLM question gen with fallback |
| Follow-Up UI | ✅ Complete | Slider, Agreement, QuickTag widgets with voice NLP |
| Proxy / Session | ✅ Complete | Username login, stable user ID cookies, onboarding redirect |
| FollowUp_Answers persistence | ⚠️ Partial | Table exists, UI collects answers, not yet written to DB |
| Sentiment Scoring | ⚠️ Partial | Column exists in `Review_Submissions`, always NULL |
| User Authentication | ⚠️ Partial | Username-only session login is live; Supabase Auth is not yet integrated |
| Review Filtering / Sorting | ❌ Not Started | Reviews displayed in date DESC order only |
| Hotel Search | ❌ Not Started | No full-text search on hotels or reviews |

---

## 8. Implementation Milestones

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Next.js scaffold, Supabase schema, persona tagging, hotel browsing feed | ✅ Done |
| **Phase 2** | Review input with AI Polish, Similarity Badge on review feed | ✅ Done |
| **Phase 3** | 4-Layer follow-up engine API, persona-aware gap detection | ✅ Done |
| **Phase 4** | Follow-up UI (sliders/agreement), voice input with NLP, design polish | ✅ Done |
| **Phase 5** | Persist `FollowUp_Answers`, sentiment scoring, review filtering/sorting | 🔲 Pending |
| **Phase 6** | Supabase Auth (replace anonymous session), hotel search | 🔲 Pending |
