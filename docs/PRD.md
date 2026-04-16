# Product Requirements Document: PRISM

**Version:** 2.4  
**Last Updated:** 2026-04-15  
**Status:** Active prototype / demo-ready

## 1. Product Summary

PRISM is a persona-aware hotel review experience designed to make review reading more relevant, review writing more lightweight, and hotel knowledge more current. The product combines imported property and review data with app-managed personas, review submissions, enrichment, and follow-up layers so that travelers can make better decisions with less effort.

## 2. Core Product Goals

- Help travelers find the most relevant reviews faster.
- Reduce the effort required to write a useful hotel review.
- Refresh stale or weakly verified property information with low-friction follow-up questions.
- Keep AI assistance grounded, conservative, and inspectable.
- Improve trust by hiding hotel-listed claims when recent guest evidence strongly conflicts with them.

## 3. Primary User Flows

### Onboarding and identity

1. If no PRISM session cookies exist, the user is redirected to `/login`.
2. The user enters a username.
3. The app restores or creates a stable `user_id`.
4. The user is sent to `/onboarding`.
5. Persona tags are saved into `User_Personas`.

### Hotel discovery

1. The user opens `/`.
2. Hotels are grouped into United States first, then International.
3. Within each group, hotels are sorted by `guestrating_avg_expedia`.
4. Each hotel card links to `/hotels/[id]`.

### Review reading

1. The hotel detail page loads both imported `Reviews_PROC` rows and app-authored `Review_Submissions`.
2. Reviews are ranked primarily by relevance and quality, with persona alignment carrying meaningful weight in the order.
3. The review feed shows 20 reviews at a time.
4. Only the visible slice is sent to review enrichment.

### Review writing and follow-up

1. The user opens the Reviews tab.
2. The user can draft with quick tags, seeded prompts, manual text, voice input, and optional AI polish.
3. The review is inserted into `Review_Submissions`.
4. A persona-aware follow-up engine selects topics using:
   - the submitted review text
   - the user’s persona tags
   - hotel, review, and policy evidence
   - freshness and disagreement signals
5. Follow-up questions open in a modal popup.
6. Output behavior:
   - negative reviews: 1-2 questions anchored to the negative experience in that review
   - positive reviews: 1-2 questions that can combine the user’s review with persona-relevant topics
7. Question wording is generated on the spot at request time, while topic selection remains deterministic and grounded.
8. The user answers via slider, yes / neutral / no controls, typed note, or voice-assisted input.
9. Responses are written to `FollowUp_Answers`.

## 4. Feature Requirements

### Feature 1: Persona Profile
**Status:** Implemented

- 55 curated preset tags across 6 groups
- Custom tag support
- Tags and categories stored as parallel arrays in `User_Personas`
- Profile editable after onboarding from `/onboarding`

### Feature 2: Persona-Aware Review Ranking and Similarity
**Status:** Implemented

- Review cards display a similarity badge when a review shares relevant traits with the current user.
- Similarity uses `matchPersonaTags()` plus inferred reviewer tags from:
  - `lob`
  - rating sub-dimensions
  - cached or on-demand enrichment when metadata is sparse
- Persona alignment affects feed order, not just badge rendering.
- Reviews with persona matches should rank above otherwise comparable reviews with no match.

### Feature 3: Conservative Review Enrichment
**Status:** Implemented

- Sparse reviews can receive:
  - an AI-generated display title
  - up to 3 AI-generated reviewer tags
- Enrichment is cached in `Review_Enrichments`.
- Imported review tables remain unchanged.
- Enrichment runs only for the visible review slice.
- The prompt is intentionally conservative and can return empty output when evidence is weak.

### Feature 4: AI-Assisted Review Drafting
**Status:** Implemented

- Quick tags append dimension-specific review starters.
- The Q&A carousel provides seeded drafting prompts.
- Browser voice input appends dictated text into the draft.
- AI Polish rewrites rough notes into cleaner review prose without inventing facts.
- Translation is available per review card in the review feed.

### Feature 5: Persona-First Follow-Up Engine
**Status:** Implemented

The live engine combines deterministic topic selection with runtime question generation.

Topic selection behavior:

1. Detect topics mentioned in the submitted review.
2. Build a persona topic bundle from the user’s tags and custom-tag interpretations.
3. Create candidate topics in four buckets:
   - `intersection`
   - `review_only`
   - `blind_spot`
   - `persona_only`
4. Rank candidates primarily by:
   - topic bucket
   - hotel grounding
   - freshness / decay
   - decision risk

Current topic coverage includes traditional hotel attributes plus persona-oriented topics such as:

- `work_environment`
- `extra_bed_policy`
- `crib_setup`
- `pet_fees`
- `pet_restrictions`
- `elevator_access`
- `bathroom_accessibility`
- `room_comfort`

Grounding rules:

- A topic is eligible only when it is supported by the submitted review, the user’s persona, or real hotel / review / policy evidence.
- Evidence text remains grounded in description text, policy fields, amenities, or actual review evidence.
- If live wording generation fails, the engine falls back to deterministic phrasing.

Output behavior:

- Positive review: 1-2 follow-up questions that can broaden into persona-relevant, evidence-backed topics
- Negative review: 1-2 follow-up questions anchored to the same negative experience from the submitted review

### Feature 6: Low-Friction Follow-Up UI
**Status:** Implemented

- Centered modal popup after review submission
- Slider questions for continuous attributes
- Yes / Neutral / No agreement controls for confirm / deny statements
- Optional text and voice input behind an expandable `+` action
- Voice-to-slider and voice-to-agreement mapping via heuristics
- Animated multi-step UI
- Modal dismisses immediately after successful answer submission

Current note:

- The UI still contains a `QuickTag` path for future expansion, but the live engine currently emits only `Slider` and `Agreement`.

### Feature 7: Hotel-Claim Suppression
**Status:** Implemented

- PRISM compares hotel-listed tags and amenity claims against recent guest-submitted reviews and follow-up answers.
- When contradictory guest evidence reaches a defined threshold, the corresponding hotel-listed tag can be hidden.
- Hidden tags can reappear later if enough fresh supporting evidence returns.
- This keeps the hotel view closer to current guest reality instead of treating imported metadata as permanently correct.

## 5. Technical Architecture

### Frontend

- Next.js 16.2.3 App Router
- React 19
- Tailwind CSS v4
- Framer Motion for transitions and animated follow-up UI

### Backend

- Next.js route handlers
- Supabase as the operational datastore
- Cookie-based username session instead of Supabase Auth

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
- Property metadata, location, amenities, policies, guest rating, and descriptions

**`Reviews_PROC`**
- Historical imported reviews
- Includes `lob`, `rating`, `review_title`, `review_text`, and `acquisition_date`

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
| `POST` | `/api/reviews/translate` | Translate review text to a target language |
| `POST` | `/api/reviews/enrich` | Fetch or generate cached title/tag enrichments |
| `POST` | `/api/reviews/follow-up` | Select follow-up topics and generate live question text |
| `POST` | `/api/reviews/follow-up/answers` | Persist follow-up answers |

## 8. Non-Goals / Deferred Work

- Full Supabase Auth integration
- Search across hotels or reviews
- Server-side review filtering beyond current ranking logic
- Production-grade analytics and observability
- Automatic sentiment scoring for `Review_Submissions`

## 9. Known Technical Constraints

- Session identity is username-based and cookie-backed, which is sufficient for the demo but weaker than true authentication.
- Homepage review counts are currently computed with per-hotel count queries, which is simple but not ideal at larger scale.
- A legacy `/api/personas` route still exists in the repo but is not the active onboarding write path.
- `QuickTag` follow-up support exists in UI/types, but the live engine emits only `Slider` and `Agreement`.
- Checked-in schema references should be validated against the live Supabase schema before relying on them for a fresh deployment.

## 10. Success Criteria for This Prototype

- A traveler can create a persona and see review relevance change accordingly.
- Sparse review cards become more scannable through conservative enrichment.
- A user can submit a review with less friction than a blank freeform form.
- The system can capture structured follow-up data after submission.
- Hotel-listed claims can be hidden when recent guest evidence strongly contradicts them.
- Product and technical docs remain aligned with the current implementation.
