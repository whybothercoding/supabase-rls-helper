-- =============================================================================
-- Template: User Owns Row
-- Use case: Each user can only SELECT, INSERT, UPDATE, DELETE their own rows.
--
-- Required table structure:
--   CREATE TABLE YOUR_TABLE_NAME (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     YOUR_OWNER_COLUMN uuid REFERENCES auth.users(id) NOT NULL,
--     -- ... your other columns
--   );
--
-- Placeholders (replace before applying):
--   YOUR_TABLE_NAME   → your actual table name
--   YOUR_OWNER_COLUMN → the column that stores the owner's user ID (e.g. user_id)
-- =============================================================================

ALTER TABLE YOUR_TABLE_NAME ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rows"
  ON YOUR_TABLE_NAME
  FOR SELECT
  USING (YOUR_OWNER_COLUMN = auth.uid());

CREATE POLICY "Users can insert own rows"
  ON YOUR_TABLE_NAME
  FOR INSERT
  WITH CHECK (YOUR_OWNER_COLUMN = auth.uid());

CREATE POLICY "Users can update own rows"
  ON YOUR_TABLE_NAME
  FOR UPDATE
  USING (YOUR_OWNER_COLUMN = auth.uid())
  WITH CHECK (YOUR_OWNER_COLUMN = auth.uid());

CREATE POLICY "Users can delete own rows"
  ON YOUR_TABLE_NAME
  FOR DELETE
  USING (YOUR_OWNER_COLUMN = auth.uid());
