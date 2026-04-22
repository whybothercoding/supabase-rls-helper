# Example: Team Workspace

**Scenario:** A `documents` table where access is restricted to members of the team that owns the document.

**Table schema:**
```sql
CREATE TABLE teams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE team_members (
  team_id uuid REFERENCES teams(id) NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid REFERENCES teams(id) NOT NULL,
  title text NOT NULL,
  content text,
  created_by uuid REFERENCES auth.users(id)
);
```

## Complete workflow

**Step 1 — Generate policies:**

```bash
rls generate \
  --table documents \
  --description "Only team members can read, create, update, or delete documents. Membership is determined by the team_members table." \
  --columns "id, team_id, title, content, created_by" \
  --output ./migrations/documents_rls.sql
```

**Step 2 — Review the output file:**

```bash
cat ./migrations/documents_rls.sql
```

**Step 3 — Apply to Supabase:**

```bash
supabase db push
# or paste into the Supabase SQL editor
```

## Expected SQL output

```sql
-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Only team members can read documents
CREATE POLICY "Team members can view documents"
  ON documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = documents.team_id
        AND team_members.user_id = auth.uid()
    )
  );

-- Only team members can create documents for their team
CREATE POLICY "Team members can create documents"
  ON documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = documents.team_id
        AND team_members.user_id = auth.uid()
    )
  );

-- Only team members can update documents
CREATE POLICY "Team members can update documents"
  ON documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = documents.team_id
        AND team_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = documents.team_id
        AND team_members.user_id = auth.uid()
    )
  );

-- Only team members can delete documents
CREATE POLICY "Team members can delete documents"
  ON documents
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = documents.team_id
        AND team_members.user_id = auth.uid()
    )
  );
```

## Template shortcut

```bash
rls templates use --use team-based-access --table documents --output ./migrations/documents_rls.sql
```
