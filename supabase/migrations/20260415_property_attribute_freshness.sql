-- Migration: Property_Attribute_Freshness
--
-- Persists the decay state for each (property, attribute) pair.
-- The follow-up engine reads this table instead of re-scanning 500+ reviews
-- every time a question is generated.
--
-- Populated:
--   • On first engine run (backfilled from Reviews_PROC + Review_Submissions)
--   • Incrementally when a new review is submitted (last_mentioned_at)
--   • Incrementally when a follow-up answer is saved (last_confirmed_at)

CREATE TABLE IF NOT EXISTS Property_Attribute_Freshness (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  eg_property_id    TEXT        NOT NULL REFERENCES "Description_PROC"(eg_property_id) ON DELETE CASCADE,
  attribute         TEXT        NOT NULL,
  last_mentioned_at TIMESTAMPTZ,           -- most recent review mention of this attribute
  last_confirmed_at TIMESTAMPTZ,           -- most recent follow-up answer confirmation
  mention_count     INTEGER     NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (eg_property_id, attribute)
);

CREATE INDEX IF NOT EXISTS idx_paf_property
  ON Property_Attribute_Freshness(eg_property_id);

-- Trigger: keep updated_at current on every write
CREATE OR REPLACE FUNCTION update_paf_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paf_updated_at ON Property_Attribute_Freshness;
CREATE TRIGGER trg_paf_updated_at
  BEFORE UPDATE ON Property_Attribute_Freshness
  FOR EACH ROW EXECUTE FUNCTION update_paf_updated_at();

-- RLS
ALTER TABLE Property_Attribute_Freshness ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read freshness data (used to show gap context in UI)
CREATE POLICY "paf_read" ON Property_Attribute_Freshness
  FOR SELECT TO authenticated USING (true);

-- Service role has full access for engine writes
CREATE POLICY "paf_write" ON Property_Attribute_Freshness
  FOR ALL TO service_role USING (true);

-- Anon can also read (needed for non-logged-in hotel detail page views)
CREATE POLICY "paf_read_anon" ON Property_Attribute_Freshness
  FOR SELECT TO anon USING (true);
