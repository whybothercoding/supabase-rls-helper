# Example: Basic Blog

**Scenario:** A `posts` table where each user can only manage their own posts. Published posts can be read by anyone.

**Table schema:**
```sql
CREATE TABLE posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  title text NOT NULL,
  content text,
  published boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

## Running the command

```bash
rls generate \
  --table posts \
  --description "Users can create, read, update, and delete their own posts. Anyone can read published posts." \
  --columns "id, user_id, title, content, published, created_at"
```

## Expected SQL output

```sql
-- Enable Row Level Security
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Anyone can read published posts
CREATE POLICY "Public can view published posts"
  ON posts
  FOR SELECT
  USING (published = true OR user_id = auth.uid());

-- Users can only insert their own posts
CREATE POLICY "Users can create own posts"
  ON posts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can only update their own posts
CREATE POLICY "Users can update own posts"
  ON posts
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can only delete their own posts
CREATE POLICY "Users can delete own posts"
  ON posts
  FOR DELETE
  USING (user_id = auth.uid());
```

## Using the template shortcut

For a simpler "users own their rows" pattern you can also apply the template directly:

```bash
rls templates use --use user-owns-row --table posts --owner-column user_id
```
