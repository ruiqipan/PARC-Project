-- Migration 003: Questions table
-- Requires pgvector extension for semantic dedup embeddings

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eg_property_id text NOT NULL REFERENCES public."Description_PROC"(eg_property_id) ON DELETE CASCADE,
  dimension      text NOT NULL,
  question_text  text NOT NULL,
  response_type  text NOT NULL DEFAULT 'short_text'
                   CHECK (response_type IN ('tap_choice', 'short_text', 'voice', 'rating')),
  options        jsonb,             -- for tap_choice: ["Yes", "No", "Partially"]
  persona_ids    int[],             -- which personas are shown this question
  priority_score float NOT NULL DEFAULT 0.5,
  embedding      vector(1536),      -- text-embedding-3-small output
  generated_by   text NOT NULL DEFAULT 'template'
                   CHECK (generated_by IN ('llm', 'template', 'manual')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX ON public.questions (eg_property_id, priority_score DESC);
CREATE INDEX ON public.questions USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- RLS: questions are public-read, service role writes
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Questions are publicly readable"
  ON public.questions FOR SELECT
  USING (true);
