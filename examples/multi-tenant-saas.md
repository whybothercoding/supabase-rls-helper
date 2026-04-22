# Example: Multi-Tenant SaaS

**Scenario:** A `projects` table in a SaaS app where each organisation can only see and manage its own projects. Users belong to an organisation via a `profiles` table.

**Table schema:**
```sql
CREATE TABLE organisations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE profiles (
  id uuid REFERENCES auth.users(id) PRIMARY KEY,
  organisation_id uuid REFERENCES organisations(id) NOT NULL
);

CREATE TABLE projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES organisations(id) NOT NULL,
  name text NOT NULL,
  data jsonb
);
```

## Running the command

```bash
rls generate \
  --table projects \
  --description "Users can only see and manage projects belonging to their own organisation. The user's organisation is stored in the profiles table." \
  --columns "id, org_id, name, data"
```

## Expected SQL output

```sql
-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Users can only select projects from their organisation
CREATE POLICY "Org members can view projects"
  ON projects
  FOR SELECT
  USING (
    org_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

-- Users can only insert projects for their organisation
CREATE POLICY "Org members can create projects"
  ON projects
  FOR INSERT
  WITH CHECK (
    org_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

-- Users can only update their organisation's projects
CREATE POLICY "Org members can update projects"
  ON projects
  FOR UPDATE
  USING (
    org_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    org_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

-- Users can only delete their organisation's projects
CREATE POLICY "Org members can delete projects"
  ON projects
  FOR DELETE
  USING (
    org_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );
```

## Template shortcut

```bash
rls templates use --use row-level-tenant-isolation --table projects
```

Then manually replace `organisation_id` with `org_id` to match your schema.
