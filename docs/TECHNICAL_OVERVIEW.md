# Technical Overview

This document reflects the current implementation in the repository as of 2026-04-15. It complements the higher-level PRD and is written for contributors who need an accurate snapshot of how the application works today.

## 1. System Overview

PRISM is a Next.js App Router application that reads hotel metadata and historical reviews from Supabase, layers app-authored state on top, and uses a focused set of server-side OpenAI calls to improve review readability and collect structured follow-up information.

At a high level:

1. `Description_PROC` and `Reviews_PROC` are imported and treated as read-only.
2. PRISM stores its own user, session, review, enrichment, and follow-up state in Supabase.
3. Server components fetch and shape data for the hotel list and hotel detail pages.
4. Client components handle review drafting, voice input, enrichment display, and follow-up interactions.

## 2. Primary Runtime Components

### App shell

- [app/layout.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/layout.tsx)
  - global navigation
  - session-aware nav rendering
  - sticky header and footer

- [proxy.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/proxy.ts)
  - redirects unauthenticated users to `/login`
  - redirects authenticated users away from `/login`

### Pages

- [app/page.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/page.tsx)
  - loads hotels
  - computes review counts
  - groups cards into US and international sections

- [app/hotels/[id]/page.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/hotels/[id]/page.tsx)
  - aggregates server-side hotel data
  - merges imported reviews with `Review_Submissions`
  - loads persona tags for the current session
  - sorts reviews by relevance, quality, and recency

- [app/hotels/[id]/HotelDetailClient.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/hotels/[id]/HotelDetailClient.tsx)
  - renders the hotel hero and tabbed property UI
  - composes review input and review feed

- [app/onboarding/page.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/onboarding/page.tsx)
  - loads saved persona data and passes it to the client tag editor

### Key client components

- [components/onboarding/PersonaTagger.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/onboarding/PersonaTagger.tsx)
  - 55 preset tags across 6 groups
  - custom tag support
  - direct client-side upsert to `User_Personas`

- [components/auth/LoginForm.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/auth/LoginForm.tsx)
  - username login form
  - posts to `/api/session/login`
  - uses full-page navigation into `/onboarding` so newly set session cookies are reliably available

- [components/hotel/ReviewInput.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/hotel/ReviewInput.tsx)
  - quick tags
  - seeded Q&A carousel
  - voice dictation
  - star rating
  - AI polish
  - write to `Review_Submissions`
  - follow-up request / answer lifecycle

- [components/hotel/ReviewFeed.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/hotel/ReviewFeed.tsx)
  - paginates in slices of 20
  - enriches only visible rows
  - reapplies ranking when enrichment data is available

- [components/hotel/ReviewCard.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/hotel/ReviewCard.tsx)
  - similarity badge rendering
  - AI title and tag hints
  - translation UI
  - sub-rating display

- [components/hotel/FollowUpCard.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/hotel/FollowUpCard.tsx)
  - slider flow
  - agreement flow
  - optional text and voice expansion
  - modal interaction

## 3. Server-Side Libraries

### Session and database

- [lib/session.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/session.ts)
  - cookie constants
  - username normalization
  - session lookup

- [lib/supabase.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/supabase.ts)
  - lazy browser client
  - server client with service-role preference

### Persona similarity and ranking

- [lib/persona-match.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/persona-match.ts)
  - static semantic cluster map
  - inferred reviewer tag generation
  - optional embeddings fallback for custom tags

- [lib/review-ranking.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/review-ranking.ts)
  - shared persona-first sorting logic
  - keeps matched reviews above unmatched reviews when quality is otherwise comparable

### Review enrichment

- [lib/review-enrichment.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/review-enrichment.ts)
  - deterministic review keys
  - review source-text hashing
  - AI tag normalization and alias resolution

- [lib/review-enrichment-constants.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/review-enrichment-constants.ts)
  - shared batch-size constants

### Follow-up engine and hotel-claim suppression

- [lib/follow-up-engine.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/follow-up-engine.ts)
  - persona-first topic selection
  - review-anchored negative follow-up logic
  - hotel grounding and freshness scoring
  - runtime LLM wording generation with deterministic fallback

- [lib/hotel-claim-suppression.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/hotel-claim-suppression.ts)
  - compares hotel-listed claims against recent guest-submitted signals
  - hides tags when contradiction thresholds are met
  - restores tags when fresh support returns

### Supporting utilities

- [lib/utils.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/utils.ts)
  - array parsing
  - HTML cleanup
  - amenity label mapping

- [lib/hotel-visuals.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/hotel-visuals.ts)
  - hero and listing image mapping
  - external source URL helpers

## 4. API Routes

### Session

- [app/api/session/login/route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/session/login/route.ts)
  - validates username
  - restores or creates a `User_Personas` row
  - writes `parc_user_id` and `parc_username` cookies

- [app/api/session/logout/route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/session/logout/route.ts)
  - clears session cookies

### Review authoring helpers

- [app/api/ai-polish/route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/ai-polish/route.ts)
  - uses `gpt-4o`
  - has a separate prompt path for short inputs
  - includes anti-hallucination constraints

- [app/api/reviews/translate/route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/reviews/translate/route.ts)
  - uses `gpt-4o`
  - translates into the requested target language
  - returns detected language and translated text

### Review enrichment

- [app/api/reviews/enrich/route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/reviews/enrich/route.ts)
  - batch-caps incoming reviews
  - checks `Review_Enrichments` by `review_key`
  - regenerates only when the source text hash changed or no valid cache exists
  - persists generated title and tag results back into the cache
  - uses recursive split-and-retry when a batch fails

### Follow-up pipeline

- [app/api/reviews/follow-up/route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/reviews/follow-up/route.ts)
  - validates the payload
  - calls `runFollowUpEngine`

- [app/api/reviews/follow-up/answers/route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/reviews/follow-up/answers/route.ts)
  - validates answer payloads
  - normalizes slider and agreement values
  - persists rows into `FollowUp_Answers`

### Legacy route

- [app/api/personas/route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/personas/route.ts)
  - not used by the active onboarding flow
  - does not match the active session-cookie contract

## 5. Data Model Notes

### Read-only imported tables

- `Description_PROC`
- `Reviews_PROC`

The application assumes these tables already exist and treats them as external, read-only inputs.

### App-managed tables

- `User_Personas`
- `Review_Submissions`
- `Review_Enrichments`
- `FollowUp_Answers`

Primary schema reference:

- [supabase/migrations/app_tables.sql](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/supabase/migrations/app_tables.sql)

Backfill and migration helpers:

- [supabase/migrations/20260414_add_username_to_user_personas.sql](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/supabase/migrations/20260414_add_username_to_user_personas.sql)
- [supabase/migrations/20260415_add_review_enrichments.sql](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/supabase/migrations/20260415_add_review_enrichments.sql)

## 6. Model Usage

| Use case | Model | File |
| --- | --- | --- |
| Review polish | `gpt-4o` | [app/api/ai-polish/route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/ai-polish/route.ts) |
| Review translation | `gpt-4o` | [app/api/reviews/translate/route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/reviews/translate/route.ts) |
| Review title/tag enrichment | `gpt-5-nano` | [lib/review-enrichment.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/review-enrichment.ts) |
| Follow-up wording | `gpt-4o-mini` | [lib/follow-up-engine.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/follow-up-engine.ts) |
| Custom persona matching fallback | `text-embedding-3-small` | [lib/persona-match.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/lib/persona-match.ts) |

Important distinction:

- Follow-up topic selection is deterministic and grounded.
- Final follow-up wording is generated at runtime, with deterministic fallback when needed.
- Review enrichment is a display layer, not a source-of-truth content layer.

## 7. Background / Maintenance Scripts

- [scripts/backfill-review-enrichments.cjs](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/scripts/backfill-review-enrichments.cjs)
  - backfills `Reviews_PROC` into `Review_Enrichments`
  - batches requests
  - normalizes AI tag output
  - persists enrichment cache rows

## 8. Known Constraints and Risks

### 1. Legacy persona route remains in the repo

- File: [app/api/personas/route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/personas/route.ts)
- Impact:
  - can mislead future contributors because it looks live but is effectively dead code
  - does not match the current username-cookie contract

### 2. `QuickTag` support is not fully schema-aligned

- Files:
  - [app/api/reviews/follow-up/answers/route.ts](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/api/reviews/follow-up/answers/route.ts)
  - [supabase/migrations/app_tables.sql](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/supabase/migrations/app_tables.sql)
- Impact:
  - the route validator accepts `QuickTag`
  - the UI contains a `QuickTag` rendering path
  - the database check constraint currently allows only `Slider` and `Agreement`
  - this is safe today because the live engine emits only `Slider` and `Agreement`, but it blocks future `QuickTag` activation unless schema and docs are updated together

### 3. Checked-in schema references should be validated against the live database

- Files:
  - [supabase/migrations/app_tables.sql](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/supabase/migrations/app_tables.sql)
  - [components/hotel/ReviewInput.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/components/hotel/ReviewInput.tsx)
  - [app/hotels/[id]/page.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/hotels/[id]/page.tsx)
- Impact:
  - the runtime app expects certain columns such as `username` and `rating`
  - fresh environments should verify schema parity before production rollout

### 4. Homepage review counts still use an N+1 query pattern

- File: [app/page.tsx](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/app/page.tsx)
- Impact:
  - acceptable for demo scale
  - likely to become an early bottleneck as inventory grows

## 9. Documentation Map

- [README.md](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/README.md)
  - setup instructions
  - architecture snapshot
  - route overview

- [docs/PRD.md](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/docs/PRD.md)
  - product requirements
  - implementation status

- [docs/TECHNICAL_OVERVIEW.md](/Users/rickypan/Documents/Projects/PARC_Project/PARC-Project/docs/TECHNICAL_OVERVIEW.md)
  - implementation details
  - constraints and contributor guidance
