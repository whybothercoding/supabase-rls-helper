-- =============================================================================
-- Template: Row-Level Tenant Isolation
-- Use case: Multi-tenant SaaS. Each user belongs to an organisation, and can
--           only access rows belonging to their own organisation.
--
-- Required table structure:
--   CREATE TABLE profiles (
--     id uuid REFERENCES auth.users(id) PRIMARY KEY,
--     organisation_id uuid REFERENCES organisations(id) NOT NULL
--   );
--   CREATE TABLE organisations (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     name text NOT NULL
--   );
--   CREATE TABLE YOUR_TABLE_NAME (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     organisation_id uuid REFERENCES organisations(id) NOT NULL,
--     -- ... your other columns
--   );
--
-- Placeholders:
--   YOUR_TABLE_NAME → your actual table name
-- =============================================================================

ALTER TABLE YOUR_TABLE_NAME ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation — select"
  ON YOUR_TABLE_NAME
  FOR SELECT
  USING (
    organisation_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Tenant isolation — insert"
  ON YOUR_TABLE_NAME
  FOR INSERT
  WITH CHECK (
    organisation_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Tenant isolation — update"
  ON YOUR_TABLE_NAME
  FOR UPDATE
  USING (
    organisation_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    organisation_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Tenant isolation — delete"
  ON YOUR_TABLE_NAME
  FOR DELETE
  USING (
    organisation_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );
