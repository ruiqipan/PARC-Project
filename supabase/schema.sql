-- ============================================================
-- PARC — Property Awareness & Review Completion
-- Run this in the Supabase SQL editor AFTER importing CSVs.
-- CSVs create: hotels (from Description_PROC) + reviews (from Reviews_PROC)
-- This script adds the remaining tables and augments existing ones.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Augment hotels table (fields that may be missing from CSV import) ─────────
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS slug          TEXT UNIQUE;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS name          TEXT;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS amenities     TEXT[] DEFAULT '{}';
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS price_per_night INTEGER;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS review_count  INTEGER DEFAULT 0;

-- Generate slug from eg_property_id if not set
UPDATE hotels SET slug = 'hotel-' || eg_property_id WHERE slug IS NULL;

-- ── Augment reviews table ─────────────────────────────────────────────────────
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS traveler_persona TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS helpful_count    INTEGER DEFAULT 0;

-- ── Room types ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id        UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('king','twin','family','accessible','suite','standard')),
    capacity        SMALLINT DEFAULT 2,
    price_per_night INTEGER,
    amenities       TEXT[] DEFAULT '{}',
    image_url       TEXT,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_id ON rooms(hotel_id);

-- ── Questions (gap-detected, AI-generated) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id         UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    room_type_id     UUID REFERENCES rooms(id),
    topic            TEXT NOT NULL,
    gap_type         TEXT NOT NULL CHECK (gap_type IN ('missing','conflicting','stale','periodic','complaint_followup')),
    question_text    TEXT NOT NULL,
    target_personas  TEXT[] DEFAULT '{}',
    confidence_score NUMERIC(4,3) DEFAULT 0.500,
    upvotes          INTEGER DEFAULT 0,
    downvotes        INTEGER DEFAULT 0,
    response_count   INTEGER DEFAULT 0,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_questions_hotel_id ON questions(hotel_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic    ON questions(topic);

-- ── Anonymous user sessions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    persona       TEXT,
    special_needs TEXT[] DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Review submissions (new reviews written via the PARC UI) ─────────────────
CREATE TABLE IF NOT EXISTS review_submissions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id    UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    session_id  UUID REFERENCES user_sessions(id),
    review_text TEXT NOT NULL,
    rating      NUMERIC(2,1),
    persona     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_review_submissions_hotel ON review_submissions(hotel_id);

-- ── Responses (Good / Bad / Unknown) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS responses (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id  UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    session_id   UUID REFERENCES user_sessions(id),
    hotel_id     UUID REFERENCES hotels(id),
    answer       TEXT NOT NULL CHECK (answer IN ('good','bad','unknown')),
    comment_text TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_responses_question_id ON responses(question_id);
CREATE INDEX IF NOT EXISTS idx_responses_hotel_id    ON responses(hotel_id);

-- ── Question feedback (upvote / downvote) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_feedback (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    session_id  UUID REFERENCES user_sessions(id),
    vote        TEXT NOT NULL CHECK (vote IN ('up','down')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: keep upvote/downvote counts in sync on questions table
CREATE OR REPLACE FUNCTION sync_question_votes() RETURNS TRIGGER AS $$
BEGIN
    UPDATE questions SET
        upvotes   = (SELECT COUNT(*) FROM question_feedback WHERE question_id = NEW.question_id AND vote = 'up'),
        downvotes = (SELECT COUNT(*) FROM question_feedback WHERE question_id = NEW.question_id AND vote = 'down')
    WHERE id = NEW.question_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_question_votes ON question_feedback;
CREATE TRIGGER trg_sync_question_votes
AFTER INSERT ON question_feedback
FOR EACH ROW EXECUTE FUNCTION sync_question_votes();

-- Trigger: increment response_count on questions
CREATE OR REPLACE FUNCTION increment_response_count() RETURNS TRIGGER AS $$
BEGIN
    UPDATE questions SET response_count = response_count + 1 WHERE id = NEW.question_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_response_count ON responses;
CREATE TRIGGER trg_increment_response_count
AFTER INSERT ON responses
FOR EACH ROW EXECUTE FUNCTION increment_response_count();
