-- ============================================================
-- PARC APP — Application Tables Migration
-- Run this in the Supabase SQL Editor.
-- Description_PROC and Reviews_PROC must already exist (CSV import).
-- ============================================================

-- ── User_Personas ─────────────────────────────────────────────────────────────
-- One row per anonymous user (identified by cookie UID).
-- tags[] and categories[] are parallel arrays of equal length.

CREATE TABLE IF NOT EXISTS "User_Personas" (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL,
    username   TEXT NOT NULL,
    tags       TEXT[] NOT NULL DEFAULT '{}',
    categories TEXT[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT one_persona_per_user UNIQUE (user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_personas_username_lower_idx
    ON "User_Personas"(LOWER(username));

ALTER TABLE "User_Personas"
    DROP CONSTRAINT IF EXISTS tags_categories_same_length;
ALTER TABLE "User_Personas"
    ADD CONSTRAINT tags_categories_same_length
    CHECK (
      array_length(tags, 1) IS NOT DISTINCT FROM array_length(categories, 1)
    );

-- ── Review_Submissions ────────────────────────────────────────────────────────
-- App-authored reviews written via the PARC UI.
-- Distinct from Reviews_PROC (imported, read-only).
-- user_id is nullable until Supabase Auth is fully wired up.

CREATE TABLE IF NOT EXISTS "Review_Submissions" (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eg_property_id   TEXT NOT NULL REFERENCES "Description_PROC"(eg_property_id),
    user_id          UUID,
    raw_text         TEXT,
    ai_polished_text TEXT,
    sentiment_score  FLOAT CHECK (sentiment_score BETWEEN -1.0 AND 1.0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_submissions_property
    ON "Review_Submissions"(eg_property_id);

CREATE INDEX IF NOT EXISTS idx_review_submissions_user
    ON "Review_Submissions"(user_id);

-- ── FollowUp_Answers ──────────────────────────────────────────────────────────
-- Stores responses to the 1-2 AI-generated follow-up micro-interactions
-- presented after a review submission.

CREATE TABLE IF NOT EXISTS "FollowUp_Answers" (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id          UUID NOT NULL REFERENCES "Review_Submissions"(id) ON DELETE CASCADE,
    feature_name       TEXT NOT NULL,
    ui_type            TEXT NOT NULL CHECK (ui_type IN ('Slider', 'Agreement')),
    quantitative_value NUMERIC(5, 2),
    qualitative_note   TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followup_answers_review
    ON "FollowUp_Answers"(review_id);
