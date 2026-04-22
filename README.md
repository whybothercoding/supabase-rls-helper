# supabase-rls-helper

> Generate Supabase Row Level Security policies from plain-English descriptions.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/supabase-rls-helper.svg)](https://www.npmjs.com/package/supabase-rls-helper)

## What it does

- Describe your access rules in plain English → get production-ready SQL instantly
- Explain any existing RLS policy back into plain English
- Apply pre-built templates for the most common access patterns, parameterised to your table

## Installation

```bash
npm install -g supabase-rls-helper
```

## Quick start

1. Run the generate command with your table and a plain-English description:

```bash
rls generate \
  --table posts \
  --description "Users can only read, create, and delete their own posts. Anyone can read published posts."
```

2. The CLI outputs production-ready SQL you can paste straight into Supabase:

```sql
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

-- Users can only delete their own posts
CREATE POLICY "Users can delete own posts"
  ON posts
  FOR DELETE
  USING (user_id = auth.uid());
```

3. Save the output directly to a `.sql` file for version control:

```bash
rls generate --table posts --description "..." --output policies/posts.sql
```

## Commands

### `rls generate`

Generate RLS policies from a plain-English description.

| Flag | Alias | Description | Required |
|------|-------|-------------|----------|
| `--table <name>` | `-t` | Target table name | Yes |
| `--description <text>` | `-d` | Plain-English access rules | Yes |
| `--columns <list>` | `-c` | Columns to provide as context to OpenAI | No |
| `--output <file>` | `-o` | Save SQL to a file instead of stdout | No |

---

### `rls explain`

Explain an existing RLS policy in plain English.

| Flag | Description |
|------|-------------|
| `-s, --sql <policy>` | SQL policy to explain (omit to enter interactively via $EDITOR) |

---

### `rls templates list`

List all available built-in templates.

```bash
rls templates list
```

No flags. Prints all template names and a one-line description of each.

---

### `rls templates use`

Apply a built-in template, parameterised to your table.

| Flag | Description |
|------|-------------|
| `-u, --use <name>` | Template name (see: `rls templates list`) |
| `-t, --table <name>` | Replace `YOUR_TABLE_NAME` with this value |
| `--owner-column <col>` | Replace `YOUR_OWNER_COLUMN` with this value |
| `-o, --output <file>` | Write result to a file instead of stdout |

## Templates

| Template | Description |
|----------|-------------|
| `user-owns-row` | Users can read, insert, update, and delete only their own rows |
| `public-read-auth-write` | Anyone can read; only authenticated users can write |
| `admin-full-access` | Users with an admin role have unrestricted access to all rows |
| `team-based-access` | Users can only access rows that belong to their team |
| `row-level-tenant-isolation` | Rows are scoped to a tenant ID; complete isolation between tenants |

## Configuration

**Environment variable** — set `OPENAI_API_KEY` in your shell or `.env` file:

```bash
export OPENAI_API_KEY=sk-...
```

**Config file** — on first run, if no key is found, the CLI prompts you to enter one and saves it to `~/.rls-helper/config.json`. You can edit that file directly at any time:

```json
{
  "openaiApiKey": "sk-..."
}
```

## Examples

- [examples/basic-blog.md](examples/basic-blog.md) — blog with public read and author-only write
- [examples/multi-tenant-saas.md](examples/multi-tenant-saas.md) — multi-tenant SaaS with full tenant isolation
- [examples/team-workspace.md](examples/team-workspace.md) — team workspace with role-based access

## License

MIT — see [LICENSE](LICENSE)
