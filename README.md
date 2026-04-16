# PRISM

PRISM is a persona-aware hotel review experience built for the Expedia Group Wharton Hack-AI-thon. It helps travelers find the reviews that matter most to them, lowers the friction of writing useful reviews, and refreshes stale hotel knowledge through targeted follow-up questions.

## Live App

- Login and demo entry point: [https://parc-project.vercel.app/login](https://parc-project.vercel.app/login)

## What PRISM Does

- Builds lightweight traveler personas from curated and custom tags.
- Reorders hotel reviews so persona-aligned reviews surface first.
- Makes sparse reviews easier to scan with conservative AI-generated titles and tags.
- Supports low-friction review writing with guided prompts, voice dictation, optional AI polish, and translation.
- Generates persona-aware follow-up questions to verify missing, stale, or disputed hotel information.
- Suppresses hotel-listed tags when enough recent guest evidence contradicts them.

## Product Snapshot

PRISM is designed around three product loops:

1. **Personalized reading**
   Review ranking and similarity badges help travelers focus on reviews from guests with similar priorities.

2. **Low-friction writing**
   Guided drafting tools make it easier to leave structured, useful feedback without forcing users into long-form writing.

3. **Reality calibration**
   Follow-up questions and hotel-claim suppression help the platform keep property information fresh and trustworthy over time.

## Core User Flows

### 1. Login and onboarding

1. A new or returning user enters a username on `/login`.
2. The app restores or creates a stable `user_id`.
3. The user is sent to `/onboarding` to select persona tags.
4. Tags are stored in `User_Personas`.

### 2. Hotel browsing and review reading

1. The homepage loads hotels from imported Expedia-style property data.
2. The hotel page merges imported reviews with app-authored reviews.
3. Reviews are ranked so higher-quality, persona-aligned reviews appear first.
4. Only the visible review slice is enriched for display with conservative AI-generated titles and tags.

### 3. Review writing and follow-up

1. A user drafts a review with quick tags, seeded prompts, optional voice input, and AI polish.
2. The review is saved to `Review_Submissions`.
3. PRISM generates one or two follow-up questions:
   - negative reviews stay anchored to the reported issue
   - positive reviews can expand into persona-relevant, evidence-backed topics
4. Follow-up answers are saved to `FollowUp_Answers`.

## Tech Stack

| Layer | Implementation |
| --- | --- |
| Framework | Next.js 16.2.3 App Router |
| UI | React 19, Tailwind CSS v4, Framer Motion |
| Database | Supabase / PostgreSQL |
| Session model | Cookie-based username session |
| LLM usage | OpenAI models for polish, translation, enrichment, and follow-up wording |
| Voice input | Browser Web Speech API |

## Data Model

### Imported read-only tables

- `Description_PROC`
- `Reviews_PROC`

### App-managed tables

- `User_Personas`
- `Review_Submissions`
- `Review_Enrichments`
- `FollowUp_Answers`

The application reads property and historical review data from the imported tables and stores all app-authored state in the app-managed tables.

## API Surface

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/session/login` | Start or restore a username-based session |
| `POST` | `/api/session/logout` | Clear PRISM session cookies |
| `POST` | `/api/ai-polish` | Rewrite rough review notes without adding facts |
| `POST` | `/api/reviews/translate` | Translate review text into a requested language |
| `POST` | `/api/reviews/enrich` | Fetch or generate cached title/tag enrichments |
| `POST` | `/api/reviews/follow-up` | Select follow-up topics and generate follow-up wording |
| `POST` | `/api/reviews/follow-up/answers` | Persist follow-up answers |

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` is recommended for server routes and enrichment flows.
- `OPENAI_API_KEY` is used only on the server.

### 3. Prepare the database

Import the source tables into Supabase using the exact names expected by the app:

- `Description_PROC`
- `Reviews_PROC`

Then apply:

- `supabase/migrations/app_tables.sql`

If your database predates the latest schema updates, also apply:

- `supabase/migrations/20260414_add_username_to_user_personas.sql`
- `supabase/migrations/20260415_add_review_enrichments.sql`

### 4. Run the app

```bash
npm run dev
```

### 5. Verify the production build

```bash
npm run build
```

## Repository Layout

```text
app/
  api/
    ai-polish/
    personas/
    reviews/
      enrich/
      follow-up/
      translate/
    session/
  hotels/[id]/
  login/
  onboarding/
  pitch/

components/
  auth/
  hotel/
  onboarding/
  ui/

docs/
  PRD.md
  TECHNICAL_OVERVIEW.md

lib/
  follow-up-engine.ts
  hotel-claim-suppression.ts
  hotel-visuals.ts
  persona-match.ts
  review-enrichment.ts
  review-ranking.ts
  session.ts
  supabase.ts

scripts/
  backfill-review-enrichments.cjs

supabase/
  migrations/
```

## Documentation

- Product requirements: [docs/PRD.md](docs/PRD.md)
- Technical overview: [docs/TECHNICAL_OVERVIEW.md](docs/TECHNICAL_OVERVIEW.md)
- Team onboarding notes: [ONBOARDING.md](ONBOARDING.md)

## Notes

- Review enrichment is intentionally conservative. Empty enrichment results can still be valid cache entries.
- Follow-up topic selection is grounded and deterministic; the final question wording is generated at request time.
- The repo still contains a legacy `/api/personas` route that is not used by the active onboarding flow.
- The checked-in schema references should be validated against the live Supabase schema before production deployment.
