-- =============================================================================
-- Template: Public Read, Authenticated Write
-- Use case: Anyone (including anonymous) can read rows. Only authenticated
--           users can insert, update, or delete.
--
-- Required table structure:
--   CREATE TABLE YOUR_TABLE_NAME (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     -- ... your other columns
--   );
--
-- Placeholders:
--   YOUR_TABLE_NAME → your actual table name
-- =============================================================================

ALTER TABLE YOUR_TABLE_NAME ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read"
  ON YOUR_TABLE_NAME
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert"
  ON YOUR_TABLE_NAME
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update"
  ON YOUR_TABLE_NAME
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete"
  ON YOUR_TABLE_NAME
  FOR DELETE
  USING (auth.role() = 'authenticated');
