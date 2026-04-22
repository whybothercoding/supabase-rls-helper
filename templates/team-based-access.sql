-- =============================================================================
-- Template: Team-Based Access
-- Use case: Users can only access rows that belong to a team they are a member
--           of. Membership is determined by a team_members join table.
--
-- Required table structure:
--   CREATE TABLE teams (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     name text NOT NULL
--   );
--   CREATE TABLE team_members (
--     team_id uuid REFERENCES teams(id) NOT NULL,
--     user_id uuid REFERENCES auth.users(id) NOT NULL,
--     PRIMARY KEY (team_id, user_id)
--   );
--   CREATE TABLE YOUR_TABLE_NAME (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     team_id uuid REFERENCES teams(id) NOT NULL,
--     -- ... your other columns
--   );
--
-- Placeholders:
--   YOUR_TABLE_NAME → your actual table name
-- =============================================================================

ALTER TABLE YOUR_TABLE_NAME ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read"
  ON YOUR_TABLE_NAME
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = YOUR_TABLE_NAME.team_id
        AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can insert"
  ON YOUR_TABLE_NAME
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = YOUR_TABLE_NAME.team_id
        AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can update"
  ON YOUR_TABLE_NAME
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = YOUR_TABLE_NAME.team_id
        AND team_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = YOUR_TABLE_NAME.team_id
        AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can delete"
  ON YOUR_TABLE_NAME
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = YOUR_TABLE_NAME.team_id
        AND team_members.user_id = auth.uid()
    )
  );
