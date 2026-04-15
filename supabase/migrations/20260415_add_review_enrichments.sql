CREATE TABLE IF NOT EXISTS "Review_Enrichments" (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type      TEXT NOT NULL CHECK (source_type IN ('reviews_proc', 'review_submissions')),
    review_key       TEXT NOT NULL,
    eg_property_id   TEXT NOT NULL REFERENCES "Description_PROC"(eg_property_id),
    source_text_hash TEXT NOT NULL,
    generated_title  TEXT,
    generated_tags   TEXT[] NOT NULL DEFAULT '{}',
    title_model      TEXT,
    tags_model       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT review_enrichments_review_key_unique UNIQUE (review_key)
);

CREATE INDEX IF NOT EXISTS idx_review_enrichments_source_type
    ON "Review_Enrichments"(source_type);

CREATE INDEX IF NOT EXISTS idx_review_enrichments_property
    ON "Review_Enrichments"(eg_property_id);
