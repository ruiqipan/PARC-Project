-- ============================================================
-- PARC APP — PRD-Compliant Schema
-- Run in the Supabase SQL Editor AFTER CSV import of:
--   • Description_PROC  (hotel property data)
--   • Reviews_PROC      (guest review data)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. Description_PROC ──────────────────────────────────────────────────────
-- Read-only. Populated via CSV import. Application code NEVER inserts or
-- updates this table. RLS enforces SELECT-only for all roles.

CREATE TABLE IF NOT EXISTS "Description_PROC" (
    eg_property_id                TEXT PRIMARY KEY,
    city                          TEXT,
    province                      TEXT,
    country                       TEXT,
    star_rating                   SMALLINT,
    property_description          TEXT,
    area_description              TEXT,
    popular_amenities_list        TEXT,
    -- Structured amenity flags (property_amenity_*)
    property_amenity_pool         BOOLEAN,
    property_amenity_gym          BOOLEAN,
    property_amenity_spa          BOOLEAN,
    property_amenity_parking      BOOLEAN,
    property_amenity_restaurant   BOOLEAN,
    property_amenity_wifi         BOOLEAN,
    property_amenity_bar          BOOLEAN,
    property_amenity_pet_friendly BOOLEAN,
    -- Policies
    check_in_start_time           TEXT,
    check_in_end_time             TEXT,
    check_out_time                TEXT,
    check_out_policy              TEXT,
    pet_policy                    TEXT,
    children_and_extra_bed_policy TEXT,
    check_in_instructions         TEXT,
    know_before_you_go            TEXT
);

-- Enforce read-only: revoke write permissions from all Supabase roles.
REVOKE INSERT, UPDATE, DELETE ON "Description_PROC" FROM anon, authenticated;

-- RLS: allow any authenticated or anonymous user to SELECT.
ALTER TABLE "Description_PROC" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "description_proc_select_only"
    ON "Description_PROC"
    FOR SELECT
    USING (true);


-- ── 2. Reviews_PROC ──────────────────────────────────────────────────────────
-- Read-only. Populated via CSV import. The 4-Layer Engine reads this table
-- directly for decay detection and blind-spot analysis. Never written to by
-- the application.

CREATE TABLE IF NOT EXISTS "Reviews_PROC" (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    eg_property_id   TEXT NOT NULL REFERENCES "Description_PROC"(eg_property_id),
    acquisition_date DATE,
    lob              TEXT,
    -- JSONB stores overall score + up to 15 sub-dimension scores
    -- e.g. {"overall": 4.2, "cleanliness": 4.5, "wifi": 3.0, ...}
    rating           JSONB,
    review_title     TEXT,
    review_text      TEXT
);

CREATE INDEX IF NOT EXISTS idx_reviews_proc_property
    ON "Reviews_PROC"(eg_property_id);

CREATE INDEX IF NOT EXISTS idx_reviews_proc_date
    ON "Reviews_PROC"(acquisition_date DESC);

-- Enforce read-only.
REVOKE INSERT, UPDATE, DELETE ON "Reviews_PROC" FROM anon, authenticated;

ALTER TABLE "Reviews_PROC" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_proc_select_only"
    ON "Reviews_PROC"
    FOR SELECT
    USING (true);


-- ── 3. Users ─────────────────────────────────────────────────────────────────
-- Managed by Supabase Auth. This table mirrors auth.users for app-level data.

CREATE TABLE IF NOT EXISTS "Users" (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT,
    email      TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 4. User_Personas ─────────────────────────────────────────────────────────
-- One row per user. tags[] and categories[] are parallel arrays:
--   tags[1]       ↔  categories[1]
--   'Business traveler' ↔ 'Travel Style'
--   'Quiet'             ↔ 'Preference'
--   'Pet owner'         ↔ 'Health'
-- Tags can be skipped on signup and updated freely at any time.

CREATE TABLE IF NOT EXISTS "User_Personas" (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
    -- Parallel arrays — must always have the same length.
    tags       TEXT[] NOT NULL DEFAULT '{}',
    categories TEXT[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT one_persona_per_user UNIQUE (user_id)
);

-- Enforce parallel-array invariant at the database level.
ALTER TABLE "User_Personas"
    ADD CONSTRAINT tags_categories_same_length
    CHECK (array_length(tags, 1) IS NOT DISTINCT FROM array_length(categories, 1));


-- ── 5. Review_Submissions ────────────────────────────────────────────────────
-- App-authored reviews (written via the PARC UI). Distinct from Reviews_PROC
-- which contains imported historical data.

CREATE TABLE IF NOT EXISTS "Review_Submissions" (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    eg_property_id   TEXT NOT NULL REFERENCES "Description_PROC"(eg_property_id),
    user_id          UUID NOT NULL REFERENCES "Users"(id),
    raw_text         TEXT,
    ai_polished_text TEXT,
    sentiment_score  FLOAT CHECK (sentiment_score BETWEEN -1.0 AND 1.0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_submissions_property
    ON "Review_Submissions"(eg_property_id);

CREATE INDEX IF NOT EXISTS idx_review_submissions_user
    ON "Review_Submissions"(user_id);


-- ── 6. FollowUp_Answers ──────────────────────────────────────────────────────
-- Stores the user's response to the 1-2 AI-generated follow-up micro-
-- interactions presented after a review submission (Phase 4).

CREATE TABLE IF NOT EXISTS "FollowUp_Answers" (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id          UUID NOT NULL REFERENCES "Review_Submissions"(id) ON DELETE CASCADE,
    -- Which hotel attribute was probed (e.g. 'WiFi', 'Parking', 'Pet Policy')
    feature_name       TEXT NOT NULL,
    -- Which follow-up widget was rendered
    ui_type            TEXT NOT NULL CHECK (ui_type IN ('Slider', 'Agreement')),
    -- Numeric response:
    --   Slider    → 0.0–1.0 (position on semantic axis)
    --   Agreement → 1–5 (Likert scale)
    quantitative_value NUMERIC(5, 2),
    -- Optional voice/text transcription captured via microphone or free-text
    qualitative_note   TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followup_answers_review
    ON "FollowUp_Answers"(review_id);

CREATE INDEX IF NOT EXISTS idx_followup_answers_feature
    ON "FollowUp_Answers"(feature_name);
