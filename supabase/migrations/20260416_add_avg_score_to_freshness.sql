-- Migration: add avg_score + score_count to property_attribute_freshness
-- and fix FollowUp_Answers to accept QuickTag responses.

ALTER TABLE property_attribute_freshness
  ADD COLUMN IF NOT EXISTS avg_score   NUMERIC(3,1),          -- 0.0–5.0, EMA
  ADD COLUMN IF NOT EXISTS score_count INTEGER NOT NULL DEFAULT 0;

-- Allow QuickTag in FollowUp_Answers (was limited to Slider/Agreement)
ALTER TABLE "FollowUp_Answers"
  DROP CONSTRAINT IF EXISTS "FollowUp_Answers_ui_type_check";

ALTER TABLE "FollowUp_Answers"
  ADD CONSTRAINT "FollowUp_Answers_ui_type_check"
  CHECK (ui_type IN ('Slider', 'Agreement', 'QuickTag'));
