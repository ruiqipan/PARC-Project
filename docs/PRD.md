# Product Requirements Document (PRD): PARC APP

---

## 1. Executive Summary

PARC APP is a next-generation hotel booking and review platform (analogous to Expedia) designed to solve the problem of stagnant, unverified, or irrelevant hotel reviews.

**The Core Innovation:** Instead of relying solely on users to write comprehensive reviews from scratch, PARC APP actively identifies "Information Gaps" using a 4-Layer Recommendation Engine. After a user leaves a standard review, the platform dynamically generates 1-2 highly personalized, low-friction, multi-modal follow-up questions to fill specific knowledge gaps in the database.

---

## 2. Value Proposition

- **For Users (Readers):** Higher trust in reviews through "Persona Similarity" clustering, ensuring they read reviews from people who share their specific travel needs and sensitivities.
- **For Users (Writers):** A frictionless review process leveraging AI Polish and multi-modal inputs (voice, image, sliders), reducing cognitive load.
- **For the Platform:** An ever-updating, self-healing database that automatically verifies decaying information and tests hotel marketing claims against actual user experiences.

---

## 3. Core User Flows

- **Onboarding:** User logs in → Selects identity/preference tags (or skips) → Persona is saved.
- **Browsing:** User searches for a hotel → Reads reviews → System highlights shared tags between the user and the review authors.
- **Drafting a Review:** User stays at the hotel → Opens review form → Uses quick-tags and voice input → Clicks "AI Polish" to structure the review.
- **Follow-Up (The "Aha" Moment):** User submits review → AI analyzes the hotel's data gaps → User is presented with 1-2 interactive "Statements for Confirmation" (e.g., a slider or agreement axis) → User completes the micro-interaction.

---

## 4. Detailed Feature Specifications

### Feature 1: User Onboarding & Persona Engine

- **Functionality:** Users select broad identity tags upon signup (e.g., Business traveler, wheelchair user, guide dog owner, neurodivergent, tourist).
- **Customization:** Users can create custom tags. Tags can be skipped and updated later.
- **Purpose:** Forms the baseline for sorting algorithms (surfacing reviews from similar users) and the AI question engine.

### Feature 2: Review Similarity Indicator

- **Functionality:** In the hotel review feed, beneath the reviewer's name, display shared or clustered tags matching the viewing user.
- **Logic:** Does not require exact string matches. Uses semantic clustering (e.g., User likes "Quiet" + Reviewer tagged "Sleep Quality" → UI displays: "Shares your focus: Quiet / Sleep Quality").

### Feature 3: AI-Assisted Review Creation

- **Quick Tags & Q&A:** Interface provides one-click dimensional tags (Location, Facilities) that auto-fill text snippets ("200m from subway"). Shows Top Q&A from the community.
- **Multi-Modal Input:** Supports image drag-and-drop and voice dictation.
- **AI Polish:** A button that takes fragmented, colloquial input (e.g., "room clean, food good") and transforms it into a structured 2-4 sentence review.
- **Constraint:** Strict anti-hallucination guardrails; AI must only format, not invent facts.

### Feature 4: The 4-Layer Question Recommendation Engine

When a user submits a review, the backend determines the 1-2 most critical questions to ask them based on this funnel:

1. **Property Memory Decay Engine:** Ranks information by volatility. Parking policies, construction status, and breakfast quality decay rapidly. Proximity to transit decays slowly. Prioritizes high-decay items.
2. **Review Blind Spot Detector (Mismatch):** Compares the hotel's official description with the review database. If the hotel claims "Free Parking" but no recent reviews confirm it, this becomes a high-priority gap.
3. **Personalized Persona Matching:** Filters the gaps based on the user's tags. A business traveler is asked to verify WiFi speeds; a pet owner is asked to verify dog policies.
4. **Decision-Risk Minimization:** Final sorting layer. Weights items by their impact on future bookings (deal-breakers like late check-in or safety > minor details like coffee brand).

### Feature 5: Low-Friction Follow-Up UI

Converts open-ended questions into "Statements for Confirmation" (Recognition over Recall).

- **Semantic Sliders:** For degree-based questions (e.g., Lighting: Soft ↔ Office White).
- **Agreement Axis:** 1-5 slider for statement validation (e.g., "This hotel is very dog friendly: Disagree → Agree").
- **Quick Tag List:** Multi-select grids without typing.
- **Continuous Multi-Modal:** Every UI state has a persistent microphone and camera icon. If a user says "the light was too bright", NLP maps the sentiment and auto-slides the semantic slider to the right.

---

## 5. Technical Architecture & Tech Stack

### Recommended Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (React), Tailwind CSS, Framer Motion |
| Backend | Next.js API Routes (Serverless) |
| Database & Auth | Supabase (PostgreSQL) |
| LLM | Anthropic Claude 3.5 Sonnet or OpenAI GPT-4o |
| Audio | OpenAI Whisper API |

### Database Schema (PostgreSQL via Supabase)

**1. Users**
```
id            UUID  PK
name          Text
email         Text
created_at    Timestamp
```

**2. User_Personas**
```
id            UUID   PK
user_id       UUID   FK → Users
tags          Text[] (array of tag strings, e.g., ['Business traveler', 'Quiet', 'Pet owner'])
categories    Text[] (parallel array of categories for each tag, e.g., ['Travel Style', 'Preference', 'Health'])
updated_at    Timestamp
```
*One row per user. All persona tags are stored as arrays on a single record and can be updated freely.*

**3. Description_PROC** *(existing — hotel property data, sourced from CSV import)*
```
eg_property_id  Text  PK
city, province, country, star_rating
property_description, area_description
popular_amenities_list, property_amenity_*
check_in_*, check_out_*, pet_policy, ...
```
*No separate Hotels table is maintained. All hotel identity and feature data is read directly from this table.*

**4. Reviews_PROC** *(existing — guest review data, sourced from CSV import)*
```
eg_property_id  Text  FK → Description_PROC
acquisition_date, lob
rating          JSONB  (overall + 15 sub-dimension scores)
review_title, review_text
```
*No separate Reviews table is maintained. The 4-Layer Engine queries this table directly to detect decay and blind spots.*

**5. Review_Submissions** *(app-authored reviews)*
```
id                UUID  PK
eg_property_id    Text  FK → Description_PROC
user_id           UUID  FK → Users
raw_text          Text
ai_polished_text  Text
sentiment_score   Float
created_at        Timestamp
```

**6. FollowUp_Answers**
```
id                  UUID  PK
review_id           UUID  FK → Review_Submissions
feature_name        String  (e.g., 'WiFi')
ui_type             Enum  ('Slider' | 'Agreement')
quantitative_value  Float/Int  (e.g., 4 out of 5)
qualitative_note    Text  (optional voice/text transcription)
```

---

## 6. Implementation Milestones

| Phase | Hours | Scope |
|---|---|---|
| **Phase 1** | 0–6 | Scaffold Next.js, set up Supabase schema, build landing page (persona tagging), basic hotel browsing feed |
| **Phase 2** | 6–12 | Review input component with "AI Polish" text expansion; "Similarity Badge" logic on frontend |
| **Phase 3** | 12–18 | Core AI backend — API route that takes a submitted review, queries Description_PROC and Reviews_PROC for decay and blind spots, matches against user tags, outputs 1-2 JSON question objects |
| **Phase 4** | 18–24 | Dynamic follow-up UI (sliders/agreement axis) rendering from Phase 3 JSON payload; Whisper API voice input; design polish & demo prep |
