-- =============================================================================
-- Template: Admin Full Access, Users Read-Only
-- Use case: Admins (determined by a profiles table with a role column) have
--           full CRUD access. Regular authenticated users have read-only access.
--
-- Required table structure:
--   CREATE TABLE profiles (
--     id uuid REFERENCES auth.users(id) PRIMARY KEY,
--     role text DEFAULT 'user' CHECK (role IN ('user', 'admin'))
--   );
--   CREATE TABLE YOUR_TABLE_NAME (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     -- ... your other columns
--   );
--
-- Placeholders:
--   YOUR_TABLE_NAME → your actual table name
-- =============================================================================

ALTER TABLE YOUR_TABLE_NAME ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all"
  ON YOUR_TABLE_NAME
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can read all"
  ON YOUR_TABLE_NAME
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can insert"
  ON YOUR_TABLE_NAME
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update"
  ON YOUR_TABLE_NAME
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete"
  ON YOUR_TABLE_NAME
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
