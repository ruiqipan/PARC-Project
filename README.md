# PARC Hotels

PARC is a persona-aware hotel review experience built for the Expedia Group Wharton Hack-AI-thon and submitted through the WAIAI Hack-AI-thon 2026 GitHub Classroom repository.

## What the app does

- Lets a user create a lightweight profile of travel needs and preferences.
- Ranks hotel reviews higher when they share more persona-tag commonality with the current user.
- Generates conservative AI review titles and tags for review cards that would otherwise be too sparse to scan.
- Lets users write reviews with quick prompts, voice dictation, optional AI polish, and translation.
- After a review is submitted, generates 1-2 follow-up questions to refresh stale or decision-critical property information.

## Current stack

| Layer | Implementation |
| --- | --- |
| Framework | Next.js 16.2.3 App Router |
| UI | React 19, Tailwind CSS v4, Framer Motion |
| Database | Supabase / PostgreSQL |
| Session model | Cookie-based username session (`parc_user_id`, `parc_username`) |
| LLM usage | OpenAI `gpt-4o` for polish + translation, `gpt-5-nano` for review enrichment |
| Voice input | Browser Web Speech API |

## Runtime architecture

### Pages

- `/login` - username-based session start
- `/onboarding` - persona tag creation and profile editing
- `/` - hotel listing page
- `/hotels/[id]` - hotel detail page with overview, amenities, policies, reviews

### Core app-managed tables

- `User_Personas`
- `Review_Submissions`
- `Review_Enrichments`
- `FollowUp_Answers`

### Imported source-of-truth tables

- `Description_PROC`
- `Reviews_PROC`

The app reads from the imported Expedia-style tables and writes all user-generated or AI-generated metadata into app-managed tables. It does not mutate `Description_PROC` or `Reviews_PROC`.

## Key product flows

### Session and persona flow

1. User lands on the app.
2. Middleware-style proxy redirects unauthenticated users to `/login`.
3. Login creates or restores a stable `User_Personas.user_id`.
4. User completes `/onboarding`, which writes selected tags and categories back to `User_Personas`.

### Review browsing flow

1. Hotel detail page loads imported reviews plus app-authored `Review_Submissions`.
2. Reviews are sorted by:
   - content completeness,
   - meaningful content presence,
   - persona-match strength,
   - recency.
3. The visible review slice is enriched on demand via `POST /api/reviews/enrich`.
4. Review cards show:
   - conservative AI-generated title/tag hints when applicable,
   - persona similarity badge,
   - reviewer tags that are not already represented in the similarity badge.

### Review creation flow

1. User writes a review with quick tags, seeded Q&A prompts, star rating, and optional voice dictation.
2. Optional AI polish rewrites the review while preserving only explicitly stated facts.
3. Review is inserted into `Review_Submissions`.
4. If the user is logged in, the follow-up engine returns 1-2 additional questions.
5. Answers are persisted to `FollowUp_Answers`.

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/session/login` | Start or restore a username-based session |
| `POST` | `/api/session/logout` | Clear PARC session cookies |
| `POST` | `/api/ai-polish` | Turn rough guest notes into a cleaner review without adding facts |
| `POST` | `/api/reviews/translate` | Translate review text into a requested target language |
| `POST` | `/api/reviews/enrich` | Read or generate cached review titles/tags for the currently visible review slice |
| `POST` | `/api/reviews/follow-up` | Run the deterministic 4-layer follow-up engine |
| `POST` | `/api/reviews/follow-up/answers` | Persist follow-up answers |
| `POST` | `/api/personas` | Legacy route currently present in repo but not used by the active onboarding flow |

## Local development

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

- `SUPABASE_SERVICE_ROLE_KEY` is strongly recommended for server routes and background enrichment.
- `OPENAI_API_KEY` is only used server-side.

### 3. Prepare the database

Import the CSV-backed source tables into Supabase using the exact table names expected by the app:

- `Description_PROC`
- `Reviews_PROC`

For a fresh project, run the SQL in:

- `supabase/migrations/app_tables.sql`

For an existing database that predates the latest app tables, also apply:

- `supabase/migrations/20260414_add_username_to_user_personas.sql`
- `supabase/migrations/20260415_add_review_enrichments.sql`

### 4. Run the app

```bash
npm run dev
```

### 5. Verify production build

```bash
npm run build
```

## Repo layout

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

components/
  auth/
  hotel/
  onboarding/
  ui/

lib/
  follow-up-engine.ts
  hotel-visuals.ts
  persona-match.ts
  review-enrichment.ts
  session.ts
  supabase.ts
  utils.ts

scripts/
  backfill-review-enrichments.cjs

supabase/
  migrations/
  schema.sql
  prd_schema.sql
```

## Documentation

- Product requirements: `docs/PRD.md`
- Technical overview: `docs/TECHNICAL_OVERVIEW.md`

## Important technical notes

- Review enrichment is intentionally conservative. Empty enrichment rows can still be valid cache results.
- The follow-up engine is currently deterministic and heuristic-driven at runtime. It does not call an LLM to generate the live question text.
- `Review_Enrichments` is designed as a display cache, not as a source-of-truth content table.
- The repo still contains one legacy API route (`/api/personas`) that does not match the active session-cookie contract.
- The checked-in `Review_Submissions` schema reference currently lags behind the live write path: the app code writes `username` and `rating`, so fresh environments should validate those columns before relying on the setup docs alone.
