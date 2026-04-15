-- Migration 004: Question responses, feedback, and review submissions

-- Review submissions (app-submitted reviews, vs imported Reviews_PROC)
CREATE TABLE IF NOT EXISTS public.review_submissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  eg_property_id text NOT NULL REFERENCES public."Description_PROC"(eg_property_id) ON DELETE CASCADE,
  stay_date      date,
  source         text NOT NULL DEFAULT 'app'
                   CHECK (source IN ('app', 'followup', 'import')),
  raw_transcript text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.review_submissions (eg_property_id, created_at DESC);

-- Question responses
CREATE TABLE IF NOT EXISTS public.question_responses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id    uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  eg_property_id text NOT NULL,
  response_value text,
  voice_url      text,
  sentiment      float CHECK (sentiment BETWEEN -1 AND 1),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)   -- one response per user per question
);

CREATE INDEX ON public.question_responses (eg_property_id, question_id);
CREATE INDEX ON public.question_responses (user_id);

-- Question feedback (skip / flag / helpful signals)
CREATE TABLE IF NOT EXISTS public.question_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  signal      text NOT NULL
                CHECK (signal IN ('skipped', 'flagged_irrelevant', 'helpful')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)
);

-- RLS for responses and feedback
ALTER TABLE public.review_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_feedback  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own review submissions"
  ON public.review_submissions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage own question responses"
  ON public.question_responses FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage own question feedback"
  ON public.question_feedback FOR ALL
  USING (auth.uid() = user_id);
