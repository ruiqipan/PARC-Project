# Product Requirements Document: PARC Hotels

**Version:** 2.3  
**Last Updated:** 2026-04-15  
**Status:** Active Prototype / Demo-Ready

## 1. Product Summary

PARC Hotels is a persona-aware hotel review experience designed to make review reading more relevant and review writing more useful. The app combines imported property/review data with app-managed profile, review, enrichment, and follow-up layers so that travelers see reviews that better match their needs and can contribute structured information with low effort.

## 2. Core Product Goals

- Help readers find the most relevant reviews faster.
- Reduce the effort required to write a useful review.
- Refresh stale hotel knowledge without requiring long-form follow-up writing.
- Keep AI assistance conservative, inspectable, and grounded in user-provided text.

## 3. Primary User Flows

### Onboarding and identity

1. User is redirected to `/login` if no PARC session cookies exist.
2. User enters a username.
3. App creates or restores a stable `user_id`.
4. User completes `/onboarding` and saves persona tags into `User_Personas`.

### Hotel discovery

1. User opens `/`.
2. Hotels are grouped into United States first, then International.
3. Within each group, hotels are sorted by `guestrating_avg_expedia`.
4. Each card links into `/hotels/[id]`.

### Review reading

1. Hotel detail page loads both imported `Reviews_PROC` rows and app-authored `Review_Submissions`.
2. Reviews are ranked by:
   - whether title/body content exists,
   - whether content is meaningful,
   - persona-match strength,
   - recency.
3. Review feed shows 20 reviews at a time.
4. Only the currently visible slice is sent to review enrichment.

### Review writing and follow-up

1. User opens the Reviews tab.
2. User can draft with quick tags, seeded Q&A prompts, voice input, manual text, and optional AI polish.
3. Review is inserted into `Review_Submissions`.
4. A persona-aware follow-up engine selects topics from:
   - the submitted review text,
   - the user's persona tags,
   - hotel/review evidence and freshness signals.
5. Follow-up questions open in a modal popup instead of inline under the review box.
6. Output behavior:
   - negative reviews -> 1-2 questions anchored to the negative experience in that review,
   - positive reviews -> 1-2 questions that can combine the user's review with persona-relevant topics.
7. Question wording is generated on the spot at request time, while topic selection remains deterministic and grounded.
8. User answers via slider, yes / neutral / no agreement controls, typed note, or voice-assisted input.
9. Responses are written to `FollowUp_Answers`.

## 4. Feature Requirements

### Feature 1: Persona Profile
**Status:** Implemented

- 55 curated preset tags across 6 groups.
- Supports custom tags.
- Tags and categories are stored as parallel arrays in `User_Personas`.
- Profile can be edited after onboarding from `/onboarding`.

### Feature 2: Persona-Aware Review Ranking and Similarity
**Status:** Implemented

- Review cards display a purple similarity badge when a review shares semantic clusters with the current user.
- Similarity uses `matchPersonaTags()` plus inferred reviewer tags from:
  - `lob`,
  - rating sub-dimensions,
  - AI enrichment fallback when stored metadata is sparse.
- Similarity affects feed order, not just display.
- Shared tags are surfaced in the purple badge first; blue reviewer tags omit duplicated shared tags.

### Feature 3: Conservative Review Enrichment
**Status:** Implemented

- Sparse reviews can receive:
  - an AI-generated display title,
  - up to 3 AI-generated reviewer tags.
- Enrichment is cached in `Review_Enrichments`.
- Source review tables remain unchanged.
- Enrichment only runs for the visible review slice.
- The prompt is intentionally conservative and may return empty results when evidence is weak.
- Historical `Reviews_PROC` rows have already been backfilled into the enrichment cache.

### Feature 4: AI-Assisted Review Drafting
**Status:** Implemented

- Quick tags append dimension-specific review starters.
- Q&A carousel provides seeded prompt fragments.
- Browser voice input appends dictated text into the draft.
- AI Polish rewrites raw notes into a cleaner review without inventing facts.
- Translation is available per review card in the review feed.

### Feature 5: Persona-First Follow-Up Engine
**Status:** Implemented

The live engine now combines deterministic topic selection with runtime question generation.

Topic selection behavior:

1. Detect topics mentioned in the submitted review.
2. Build a persona topic bundle from the user's tags.
3. Create candidate topics in four buckets:
   - `intersection`
   - `review_only`
   - `blind_spot`
   - `persona_only`
4. Rank candidates primarily by:
   - topic bucket,
   - hotel grounding,
   - freshness / decay,
   - decision risk.

Current topic coverage includes the original hotel attributes plus newer persona-oriented topics such as:

- `work_environment`
- `extra_bed_policy`
- `crib_setup`
- `pet_fees`
- `pet_restrictions`
- `elevator_access`
- `bathroom_accessibility`
- `room_comfort`

Grounding rules:

- A topic is eligible when it is supported by the submitted review, the user's persona, and real hotel/review/policy evidence.
- Evidence text remains grounded in hotel description text, policy fields, amenities, or actual review evidence.
- If live question generation fails, the engine falls back to deterministic built-in phrasing.

Output behavior:

- Positive review -> 1-2 follow-up questions that can broaden into persona-relevant, evidence-backed topics.
- Non-positive review -> 1-2 follow-up questions anchored to the same negative experience from the submitted review.

### Feature 6: Low-Friction Follow-Up UI
**Status:** Implemented

- Centered modal popup after review submission
- Slider questions for continuous attributes
- Yes / Neutral / No agreement controls for confirm/deny statements
- Optional text and voice input behind an expandable `+` action
- Voice-to-slider and voice-to-agreement mapping via heuristics
- Animated multi-step UI
- Modal dismisses immediately after successful answer submission

Current note:

- The UI code still contains a `QuickTag` path for future expansion, but the live engine currently emits only `Slider` and `Agreement`.

## 5. Technical Architecture

### Frontend

- Next.js 16.2.3 App Router
- React 19
- Tailwind CSS v4
- Framer Motion for transitions and animated follow-up UI

### Backend

- Next.js route handlers
- Supabase as operational datastore
- Cookie-based session model instead of Supabase Auth

### AI usage

- `gpt-4o`
  - `/api/ai-polish`
  - `/api/reviews/translate`
- `gpt-4o-mini`
  - runtime follow-up question wording inside `lib/follow-up-engine.ts`
- `gpt-5-nano`
  - `/api/reviews/enrich`
- `text-embedding-3-small`
  - optional fallback path in `persona-match.ts` for custom tag matching

## 6. Data Model

### Imported source tables

**`Description_PROC`**
- Property metadata, location, amenities, policies, guest rating, descriptions

**`Reviews_PROC`**
- Historical imported reviews
- Includes `lob`, `rating`, `review_title`, `review_text`, `acquisition_date`

### App-managed tables

**`User_Personas`**
- `user_id UUID`
- `username TEXT`
- `tags TEXT[]`
- `categories TEXT[]`

**`Review_Submissions`**
- `eg_property_id`
- `user_id`
- `username`
- `raw_text`
- `ai_polished_text`
- `rating`
- `sentiment_score` currently unused

**`Review_Enrichments`**
- `review_key`
- `source_type`
- `source_text_hash`
- `generated_title`
- `generated_tags`
- `title_model`
- `tags_model`

**`FollowUp_Answers`**
- `review_id`
- `feature_name`
- `ui_type`
- `quantitative_value`
- `qualitative_note`

## 7. Current API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/session/login` | Start or restore a username session |
| `POST` | `/api/session/logout` | Clear cookies |
| `POST` | `/api/ai-polish` | Rewrite raw review notes conservatively |
| `POST` | `/api/reviews/translate` | Translate review text to target language |
| `POST` | `/api/reviews/enrich` | Fetch or generate cached title/tag enrichments |
| `POST` | `/api/reviews/follow-up` | Select follow-up topics and generate live follow-up question text |
| `POST` | `/api/reviews/follow-up/answers` | Persist follow-up answers |

## 8. Non-Goals / Deferred Work

- Full Supabase Auth integration
- Search across hotels or reviews
- Server-side review filtering beyond current ranking logic
- Production-grade analytics and observability
- Automatic sentiment scoring for `Review_Submissions`

## 9. Known Technical Constraints

- Session identity is username-based and cookie-backed, which is sufficient for the demo but weaker than true auth.
- Homepage review counts are currently computed with per-hotel count queries, which is simple but not optimal at larger scale.
- A legacy `/api/personas` route still exists in the repo but is not the active onboarding write path.
- `QuickTag` follow-up support exists in UI/types, but the live engine still emits only `Slider` and `Agreement`.
- The checked-in schema references for `Review_Submissions` lag behind the active write path, which already expects `username` and `rating` columns.

## 10. Success Criteria for This Prototype

- A traveler can create a persona and see review relevance change accordingly.
- Sparse review cards become more scannable through conservative enrichment.
- A user can submit a review with less friction than a blank freeform form.
- The system can capture structured follow-up data after submission.
- Product and technical docs stay aligned with the actual implementation.
