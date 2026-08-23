# supabase-rls-helper

> Generate Supabase Row Level Security policies from plain-English descriptions.

[![CI](https://github.com/whybothercoding/supabase-rls-helper/actions/workflows/ci.yml/badge.svg)](https://github.com/whybothercoding/supabase-rls-helper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/supabase-rls-helper.svg)](https://www.npmjs.com/package/supabase-rls-helper)

## What it does

- Describe your access rules in plain English → get production-ready SQL instantly
- Explain any existing RLS policy back into plain English
- Apply pre-built templates for the most common access patterns, parameterised to your table
- **Audit** SQL files for common RLS gaps — no LLM involved, just a deterministic rule set built on documented Postgres RLS semantics (`rls audit`)
- **Verify** generated policies for real — spins up an in-memory Postgres, applies the exact SQL, and runs two synthetic users plus an anonymous caller against it to prove isolation, not just assert it (`rls verify`, `--verify`)
- **Emit** a portable regression-test SQL file you can run against your real Supabase project later (`--emit-tests`)
- Manage your OpenAI API key with a built-in `config` command

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

## Beyond generation: audit and verify

LLM output can be wrong. This tool doesn't just trust it — two independent layers check the SQL, neither of which needs an API key:

**`rls audit`** is a deterministic static checker with zero LLM involvement. It parses SQL with a small hand-rolled tokenizer (not a regex hack — it correctly ignores semicolons and parens inside string/dollar-quoted literals) and flags real, Postgres-documented RLS footguns: policies defined with RLS never enabled, RLS enabled with zero policies (silently locks the table), a `FOR INSERT` policy that (invalidly) uses `USING` instead of `WITH CHECK`, and more. Every rule here is grounded in verified Postgres behavior, not assumption — see [`src/lib/audit.ts`](src/lib/audit.ts) for the reasoning behind each one, including a documented default-behavior correction that empirical testing (below) caught during development.

```bash
rls audit templates/                  # scan a directory recursively
rls audit policies/posts.sql --json   # machine-readable output
rls audit . --fail-on warning         # CI gate: exit non-zero on warning or worse
```

**`rls verify`** goes further: it actually runs the SQL. It boots [PGlite](https://pglite.dev) — Postgres compiled to WebAssembly, no Docker, no network, no external service — applies your exact policies to a real table, and executes SELECT/INSERT/UPDATE/DELETE as two synthetic users and an anonymous caller inside rolled-back transactions. It then checks the *actual rows returned* against who's supposed to see what, catching things static analysis can't — like two individually-reasonable policies that OR together into a leak. It's honest about its limits: policies that check access via a join/subquery against another table (team membership, admin role lookups) are structurally too complex for the automatic probe, and it says so rather than guessing.

```bash
rls generate --table posts --description "..." --verify        # generate, then prove it
rls verify --file policies/posts.sql --table posts              # verify SQL you already have
rls generate --table posts --description "..." --emit-tests -o policies/posts.sql
# → also writes policies/posts.rls.test.sql: a portable, pgTAP-free regression
#   test you can run against your real Supabase project with `psql -f`
```

## Commands

### `rls generate`

Generate RLS policies from a plain-English description.

| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--table <name>` | `-t` | Target table name | prompted |
| `--description <text>` | `-d` | Plain-English access rules | prompted |
| `--columns <list>` | `-c` | Columns to provide as context | — |
| `--output <file>` | `-o` | Save SQL to a file instead of stdout | — |
| `--model <name>` | `-m` | OpenAI model to use | `gpt-4o-mini` |
| `--verify` | | Empirically test the generated policies in a local Postgres sandbox | off |
| `--emit-tests` | | Write a portable regression-test SQL file alongside the output | off |

---

### `rls audit [paths...]`

Scan SQL files or directories for common RLS gaps. No LLM, no network call — pure static analysis. Defaults to scanning the current directory recursively if no path is given.

| Flag | Description | Default |
|------|-------------|---------|
| `--json` | Output findings as JSON | off |
| `--fail-on <level>` | Minimum severity that exits non-zero: `critical`, `warning`, or `info` | `critical` |

Exit code is non-zero when a finding at or above `--fail-on` is present — drop it straight into CI. A ready-made composite GitHub Action wraps it: see [`.github/actions/rls-audit`](.github/actions/rls-audit/action.yml).

```yaml
- uses: whybothercoding/supabase-rls-helper/.github/actions/rls-audit@main
  with:
    path: supabase/migrations
    fail-on: warning
```

---

### `rls verify`

Empirically test one table's RLS policies against an in-memory Postgres sandbox (PGlite) — two synthetic users plus an anonymous caller, checking real SELECT/INSERT/UPDATE/DELETE outcomes.

| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--file <path>` | `-f` | SQL file containing the policies to verify | required |
| `--table <name>` | `-t` | Table name to verify | required |
| `--json` | | Output the verification report as JSON | off |

Only supports policies that reference a single "owner" column directly on the target table (the common `user_id = auth.uid()` pattern) — join/subquery-based access control (team membership, admin role lookups) is out of scope and the tool says so explicitly rather than guessing.

---

### `rls explain`

Explain an existing RLS policy in plain English.

| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--sql <policy>` | `-s` | SQL policy to explain | prompted |
| `--model <name>` | `-m` | OpenAI model to use | `gpt-4o-mini` |

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

---

### `rls config`

Manage the stored OpenAI API key.

```bash
rls config show            # Print the active key source and masked value
rls config set <key>       # Save a new key to ~/.rls-helper/config.json
rls config clear           # Remove the stored key
```

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

**Config file** — on first run, if no key is found, the CLI prompts you to enter one and saves it to `~/.rls-helper/config.json`. Manage it directly with `rls config`:

```bash
rls config show      # see what's stored
rls config set sk-…  # update the key
rls config clear     # remove it
```

## Examples

- [examples/basic-blog.md](examples/basic-blog.md) — blog with public read and author-only write
- [examples/multi-tenant-saas.md](examples/multi-tenant-saas.md) — multi-tenant SaaS with full tenant isolation
- [examples/team-workspace.md](examples/team-workspace.md) — team workspace with role-based access

## License

MIT — see [LICENSE](LICENSE)
