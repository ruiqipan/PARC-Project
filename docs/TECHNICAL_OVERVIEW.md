# Technical Overview

This document reflects the current implementation in the repository as of 2026-04-15. It is intentionally implementation-oriented and complements the higher-level PRD.

## 1. System Overview

PARC is a Next.js App Router application that reads hotel metadata and historical reviews from Supabase, layers app-authored state on top, and uses a small set of server-side OpenAI calls to improve review readability and collect structured follow-up information.

At a high level:

1. `Description_PROC` and `Reviews_PROC` are imported and treated as read-only.
2. PARC creates its own user/session/review state in Supabase.
3. Server components fetch and shape data for the hotel list and hotel detail pages.
4. Client components handle review drafting, voice input, enrichment display, and follow-up interactions.

## 2. Primary Runtime Components

### App shell

- [layout.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/layout.tsx)
  - global navigation
  - session-aware nav rendering
  - sticky header + footer

- [proxy.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/proxy.ts)
  - redirects unauthenticated users to `/login`
  - redirects authenticated users away from `/login`

### Pages

- [page.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/page.tsx)
  - loads hotels
  - computes review counts
  - groups cards into US and international sections

- [page.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/hotels/[id]/page.tsx)
  - server-side hotel data aggregation
  - merges imported reviews with `Review_Submissions`
  - loads persona tags for current session
  - sorts reviews by quality, similarity, recency

- [HotelDetailClient.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/hotels/[id]/HotelDetailClient.tsx)
  - hero header
  - tabbed property UI
  - review input + review feed composition

- [page.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/onboarding/page.tsx)
  - loads saved persona data and passes it to the client tag editor

### Key client components

- [PersonaTagger.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/onboarding/PersonaTagger.tsx)
  - 55 preset tags across 6 groups
  - custom tag support
  - direct client-side upsert to `User_Personas`

- [ReviewInput.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/hotel/ReviewInput.tsx)
  - quick tags
  - seeded Q&A carousel
  - voice dictation
  - star rating
  - AI polish
  - write to `Review_Submissions`
  - follow-up request/answer lifecycle

- [ReviewFeed.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/hotel/ReviewFeed.tsx)
  - paginates in slices of 20
  - enriches only visible rows
  - merges cache results into display-ready review objects

- [ReviewCard.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/hotel/ReviewCard.tsx)
  - similarity badge rendering
  - AI title/tag hints
  - translation UI
  - sub-rating display

- [FollowUpCard.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/hotel/FollowUpCard.tsx)
  - slider flow
  - agreement flow
  - optional quick-tag flow path
  - voice-driven answer nudging

## 3. Server-Side Libraries

### Session and database

- [session.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/session.ts)
  - cookie constants
  - username normalization
  - session lookup

- [supabase.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/supabase.ts)
  - lazy browser client
  - server client with service-role preference

### Persona similarity

- [persona-match.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/persona-match.ts)
  - static semantic cluster map
  - inferred reviewer tag generation
  - optional embeddings fallback for custom tags

### Review enrichment

- [review-enrichment.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/review-enrichment.ts)
  - deterministic review keys
  - review source-text hashing
  - AI tag normalization and alias resolution

- [review-enrichment-constants.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/review-enrichment-constants.ts)
  - shared batch-size constants

### Follow-up engine

- [follow-up-engine.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/follow-up-engine.ts)
  - memory decay layer
  - blind-spot layer
  - persona attribute boosts
  - risk weighting
  - deterministic question selection

### Supporting utilities

- [utils.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/utils.ts)
  - array parsing
  - HTML cleanup
  - amenity label mapping

- [hotel-visuals.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/hotel-visuals.ts)
  - hero/listing image mapping and external source URLs

## 4. API Routes

### Session

- [route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/session/login/route.ts)
  - validates username
  - restores or creates `User_Personas` row
  - writes `parc_user_id` and `parc_username` cookies

- [route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/session/logout/route.ts)
  - clears session cookies

### Review authoring helpers

- [route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/ai-polish/route.ts)
  - `gpt-4o`
  - separate prompt path for short inputs
  - anti-hallucination constraints

- [route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/reviews/translate/route.ts)
  - `gpt-4o`
  - target-language translation
  - returns JSON with detected language and translated text

### Review enrichment

- [route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/reviews/enrich/route.ts)
  - batch-caps incoming reviews
  - checks `Review_Enrichments` cache by `review_key`
  - regenerates only when source text hash changed or no valid cache exists
  - persists generated title/tag results back into cache
  - uses recursive split/retry when a batch fails

### Follow-up pipeline

- [route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/reviews/follow-up/route.ts)
  - validates payload
  - calls `runFollowUpEngine`

- [route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/reviews/follow-up/answers/route.ts)
  - validates answer payloads
  - normalizes slider and agreement values
  - persists rows into `FollowUp_Answers`

### Legacy route

- [route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/personas/route.ts)
  - currently not used by the active onboarding flow
  - does not match the active session cookie contract

## 5. Data Model Notes

### Read-only imported tables

- `Description_PROC`
- `Reviews_PROC`

The application assumes these tables already exist and uses them as read-only external data.

### App-managed tables

- `User_Personas`
- `Review_Submissions`
- `Review_Enrichments`
- `FollowUp_Answers`

Primary schema reference:

- [app_tables.sql](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/supabase/migrations/app_tables.sql)

Backfill / migration helpers:

- [20260414_add_username_to_user_personas.sql](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/supabase/migrations/20260414_add_username_to_user_personas.sql)
- [20260415_add_review_enrichments.sql](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/supabase/migrations/20260415_add_review_enrichments.sql)

## 6. Model Usage

| Use case | Model | File |
| --- | --- | --- |
| Review polish | `gpt-4o` | [route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/ai-polish/route.ts) |
| Review translation | `gpt-4o` | [route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/reviews/translate/route.ts) |
| Review title/tag enrichment | `gpt-5-nano` | [review-enrichment.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/review-enrichment.ts) |
| Custom persona matching fallback | `text-embedding-3-small` | [persona-match.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/persona-match.ts) |

Important distinction:

- The follow-up engine now uses deterministic topic selection plus a runtime OpenAI call to generate the final question wording.
- The `llm_prompt` field returned by the follow-up route remains a deterministic generation summary for debugging/transparency rather than the literal model prompt payload.

## 7. Background / Maintenance Scripts

- [backfill-review-enrichments.cjs](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/scripts/backfill-review-enrichments.cjs)
  - backfills `Reviews_PROC` into `Review_Enrichments`
  - batches requests
  - normalizes AI tag output
  - persists enrichment cache rows

## 8. Code Review Findings

### Finding 1: Legacy persona route is stale and broken

- File: [route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/personas/route.ts)
- Severity: Medium
- Details:
  - reads `parc_anon_uid`, while the active session system uses `parc_user_id`
  - does not match the current onboarding write path, which writes directly from the client
  - could mislead future contributors because it looks live but is effectively dead code

### Finding 2: QuickTag persistence is not schema-aligned

- Files:
  - [route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/reviews/follow-up/answers/route.ts)
  - [app_tables.sql](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/supabase/migrations/app_tables.sql)
- Severity: Medium
- Details:
  - the route validator accepts `QuickTag`
  - the UI includes a `QuickTag` rendering path
  - the database check constraint for `FollowUp_Answers.ui_type` currently allows only `Slider` and `Agreement`
  - this is safe today because the live engine emits only `Slider` and `Agreement`, but it blocks future QuickTag activation unless schema and docs are updated together

### Finding 3: Schema references lag behind the live `Review_Submissions` write path

- Files:
  - [app_tables.sql](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/supabase/migrations/app_tables.sql)
  - [PersonaTagger.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/onboarding/PersonaTagger.tsx)
  - [ReviewInput.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/hotel/ReviewInput.tsx)
  - [page.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/hotels/[id]/page.tsx)
- Severity: High
- Details:
  - the active app writes and reads `Review_Submissions.username` and `Review_Submissions.rating`
  - the checked-in schema reference for `Review_Submissions` does not currently declare those columns
  - this creates setup risk for fresh environments and makes the schema docs less trustworthy than the runtime code

### Finding 4: Homepage review counts use an N+1 query pattern

- File: [page.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/page.tsx)
- Severity: Low to Medium
- Details:
  - the homepage fetches all hotels first
  - then issues one `head: true` count query per hotel against `Reviews_PROC`
  - this is acceptable at demo scale but will likely become one of the first bottlenecks as inventory grows

## 9. Documentation Strategy

Current repo documentation is now split by purpose:

- [README.md](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/README.md)
  - setup, architecture snapshot, route overview

- [PRD.md](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/docs/PRD.md)
  - product requirements and implementation status

- [TECHNICAL_OVERVIEW.md](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/docs/TECHNICAL_OVERVIEW.md)
  - implementation details and code-review findings
