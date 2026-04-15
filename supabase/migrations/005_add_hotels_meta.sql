-- Migration 005: hotels_meta — gap scores and aggregate stats per hotel

CREATE TABLE IF NOT EXISTS public.hotels_meta (
  eg_property_id    text PRIMARY KEY REFERENCES public."Description_PROC"(eg_property_id) ON DELETE CASCADE,
  gap_score         float NOT NULL DEFAULT 1.0 CHECK (gap_score BETWEEN 0 AND 1),
  gap_scores_by_dim jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_gap_calc     timestamptz,
  total_responses   int NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Auto-populate hotels_meta for all existing properties
INSERT INTO public.hotels_meta (eg_property_id)
SELECT eg_property_id FROM public."Description_PROC"
ON CONFLICT (eg_property_id) DO NOTHING;

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER hotels_meta_updated_at
  BEFORE UPDATE ON public.hotels_meta
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Function: recalculate gap score for one hotel
-- Called by the Edge Function or pg_cron after new responses
CREATE OR REPLACE FUNCTION public.recalculate_gap(p_property_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dims        text[] := ARRAY[
    'wifi', 'service', 'checkin', 'location', 'roomcleanliness',
    'roomcomfort', 'valueformoney', 'hotelcondition', 'accessibility',
    'ecofriendliness', 'roomamenitiesscore', 'roomquality',
    'communication', 'convenienceoflocation', 'neighborhoodsatisfaction'
  ];
  v_dim         text;
  v_count       int;
  v_target      int := 20;  -- responses to close a gap
  v_gap_map     jsonb := '{}'::jsonb;
  v_total_gap   float := 0;
BEGIN
  FOREACH v_dim IN ARRAY v_dims LOOP
    SELECT COUNT(*) INTO v_count
    FROM public.question_responses qr
    JOIN public.questions q ON q.id = qr.question_id
    WHERE qr.eg_property_id = p_property_id
      AND q.dimension = v_dim;

    v_gap_map := v_gap_map || jsonb_build_object(
      v_dim,
      GREATEST(0, 1.0 - (v_count::float / v_target))
    );
    v_total_gap := v_total_gap + GREATEST(0, 1.0 - (v_count::float / v_target));
  END LOOP;

  UPDATE public.hotels_meta SET
    gap_scores_by_dim = v_gap_map,
    gap_score         = v_total_gap / array_length(v_dims, 1),
    last_gap_calc     = now()
  WHERE eg_property_id = p_property_id;
END;
$$;
