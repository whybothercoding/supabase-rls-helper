# Coding Excellence Revision Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the existing `supabase-rls-helper` CLI to portfolio quality by adding a test suite, CI pipeline, a complete `rls config` command, a `--model` flag, and polishing UX rough edges.

**Architecture:** No structural changes — the existing `src/commands` / `src/lib` / `src/types` layout stays intact. Additions are additive: new files for tests and CI, one new command file, and targeted edits to existing modules.

**Tech Stack:** TypeScript (CommonJS, ES2020), vitest for testing, GitHub Actions for CI. All existing deps unchanged.

---

## File Map — Changes Only

| Action | Path | What changes |
|--------|------|--------------|
| Modify | `package.json` | Add `vitest` devDep, add `test`/`test:watch` scripts |
| Create | `vitest.config.ts` | Minimal vitest config pointing at `src/**/*.test.ts` |
| Create | `src/lib/parser.test.ts` | Tests for `extractSQL` and `validateSQL` |
| Create | `src/commands/config.ts` | New `show`/`set`/`clear` subcommands |
| Modify | `src/types/index.ts` | Add `model?: string` to `GenerateOptions` and `ExplainOptions` |
| Modify | `src/lib/openai.ts` | Accept `model` param in both functions; remove module-level singleton (replace with per-call construction so the API key is always fresh) |
| Modify | `src/commands/generate.ts` | Add `--model` flag wiring; fix `resolvedTable!` unsafe assertions |
| Modify | `src/commands/explain.ts` | Add `--model` flag wiring; fix spinner message |
| Modify | `src/index.ts` | Register `rls config` command with `show`/`set`/`clear` subcommands |
| Create | `.github/workflows/ci.yml` | Typecheck + test on push and pull_request |
| Modify | `README.md` | Add CI badge, add `rls config` section |

---

### Task 1: Add vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest
```

Expected: vitest added to `node_modules`, `package-lock.json` updated.

- [ ] **Step 2: Add test scripts to package.json**

Open `package.json` and replace the `"scripts"` block:

```json
"scripts": {
  "build": "tsc",
  "dev": "ts-node src/index.ts",
  "start": "node dist/index.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "prepublishOnly": "npm run build"
},
```

- [ ] **Step 3: Create vitest.config.ts**

Create `/path/to/supabase-rls-helper/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Run npm test to confirm vitest is wired up (no test files yet)**

```bash
npm test
```

Expected output contains: `No test files found` or exits 0 (vitest exits 0 when no files match).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for testing"
```

---

### Task 2: Write tests for parser.ts

**Files:**
- Create: `src/lib/parser.test.ts`

The functions under test live in `src/lib/parser.ts`:
- `extractSQL(llmOutput: string): string` — strips markdown SQL fences
- `validateSQL(sql: string): { valid: boolean; errors: string[] }` — structural check

- [ ] **Step 1: Write the test file**

Create `src/lib/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractSQL, validateSQL } from './parser';

describe('extractSQL', () => {
  it('returns raw SQL when no code fence is present', () => {
    const input = 'ALTER TABLE t ENABLE ROW LEVEL SECURITY;';
    expect(extractSQL(input)).toBe('ALTER TABLE t ENABLE ROW LEVEL SECURITY;');
  });

  it('extracts SQL from a ```sql fence', () => {
    const input = '```sql\nALTER TABLE t ENABLE ROW LEVEL SECURITY;\n```';
    expect(extractSQL(input)).toBe('ALTER TABLE t ENABLE ROW LEVEL SECURITY;');
  });

  it('extracts SQL from a plain ``` fence', () => {
    const input = '```\nALTER TABLE t ENABLE ROW LEVEL SECURITY;\n```';
    expect(extractSQL(input)).toBe('ALTER TABLE t ENABLE ROW LEVEL SECURITY;');
  });

  it('trims leading and trailing whitespace', () => {
    const input = '   SELECT 1;   ';
    expect(extractSQL(input)).toBe('SELECT 1;');
  });
});

describe('validateSQL', () => {
  const VALID_SQL = `
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test" ON posts FOR SELECT USING (true);
  `.trim();

  it('returns valid for correct RLS SQL', () => {
    const result = validateSQL(VALID_SQL);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports missing ENABLE ROW LEVEL SECURITY', () => {
    const sql = 'CREATE POLICY "test" ON posts FOR SELECT USING (true);';
    const result = validateSQL(sql);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing: ALTER TABLE ... ENABLE ROW LEVEL SECURITY');
  });

  it('reports missing CREATE POLICY', () => {
    const sql = 'ALTER TABLE posts ENABLE ROW LEVEL SECURITY;';
    const result = validateSQL(sql);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing: at least one CREATE POLICY statement');
  });

  it('reports unclosed parenthesis', () => {
    const sql = `ALTER TABLE t ENABLE ROW LEVEL SECURITY;
CREATE POLICY "p" ON t FOR SELECT USING (user_id = auth.uid(;`;
    const result = validateSQL(sql);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unbalanced'))).toBe(true);
  });

  it('reports extra closing parenthesis and does not double-report', () => {
    const sql = `ALTER TABLE t ENABLE ROW LEVEL SECURITY;
CREATE POLICY "p" ON t FOR SELECT USING (true));`;
    const result = validateSQL(sql);
    expect(result.valid).toBe(false);
    // Should report exactly one parenthesis error, not two
    const parenErrors = result.errors.filter((e) => e.includes('Unbalanced'));
    expect(parenErrors).toHaveLength(1);
    expect(parenErrors[0]).toContain('found ) without matching (');
  });

  it('reports multiple independent errors together', () => {
    const sql = 'SELECT 1;';
    const result = validateSQL(sql);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests — expect one failure (double-error bug)**

```bash
npm test
```

Expected: the `'reports extra closing parenthesis and does not double-report'` test FAILS because `validateSQL` currently pushes both "found ) without matching (" AND "unclosed (" when a stray `)` is encountered. All others should pass.

Inspect `src/lib/parser.ts:26-36`:
```typescript
if (depth < 0) {
  errors.push('Unbalanced parentheses: found ) without matching (');
  hasUnmatchedClose = true;
  break;
}
if (!hasUnmatchedClose && depth !== 0) {   // ← this guard exists
  errors.push('Unbalanced parentheses: unclosed (');
}
```

If the existing `hasUnmatchedClose` guard is in place, the test will actually PASS. Read the file to verify before deciding whether a fix is needed.

```bash
grep -n "hasUnmatchedClose" src/lib/parser.ts
```

**If the guard is present** → all tests pass. Proceed to Step 3.

**If the guard is absent** (simplified version) → fix `src/lib/parser.ts`:

```typescript
export function validateSQL(sql: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const upper = sql.toUpperCase();

  if (!upper.includes('ENABLE ROW LEVEL SECURITY')) {
    errors.push('Missing: ALTER TABLE ... ENABLE ROW LEVEL SECURITY');
  }

  if (!upper.includes('CREATE POLICY')) {
    errors.push('Missing: at least one CREATE POLICY statement');
  }

  let depth = 0;
  let hasUnmatchedClose = false;
  for (const char of sql) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth < 0) {
      errors.push('Unbalanced parentheses: found ) without matching (');
      hasUnmatchedClose = true;
      break;
    }
  }
  if (!hasUnmatchedClose && depth !== 0) {
    errors.push('Unbalanced parentheses: unclosed (');
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 3: Run tests until all pass**

```bash
npm test
```

Expected:
```
✓ src/lib/parser.test.ts (8)
  ✓ extractSQL (4)
  ✓ validateSQL (4 or 5)
Test Files  1 passed (1)
Tests  8 passed (8)
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/parser.test.ts src/lib/parser.ts
git commit -m "test: add vitest suite for parser.ts — extractSQL and validateSQL"
```

---

### Task 3: Add GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create .github/workflows/ci.yml**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Test
        run: npm test
```

- [ ] **Step 3: Verify the file is syntactically correct by reviewing it**

Read `.github/workflows/ci.yml` and confirm:
- `on` has `push` and `pull_request` triggers targeting `main`
- Steps are: checkout → node setup → npm ci → tsc --noEmit → npm test
- No hardcoded secrets

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow — typecheck and test"
git push
```

After pushing, navigate to the GitHub repo → Actions tab and confirm the workflow runs green.

---

### Task 4: Add `rls config` command

**Files:**
- Create: `src/commands/config.ts`
- Modify: `src/index.ts`

The `rls config` command exposes three subcommands:
- `rls config show` — print the stored key masked as `sk-...XXXX` (last 4 chars visible)
- `rls config set <key>` — write a new key to `~/.rls-helper/config.json`
- `rls config clear` — delete the stored key (remove the config file)

- [ ] **Step 1: Create src/commands/config.ts**

```typescript
import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { saveConfig, loadConfig } from '../lib/config';

const CONFIG_FILE = path.join(os.homedir(), '.rls-helper', 'config.json');

export function configShowCommand(): void {
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) {
    console.log(
      chalk.dim('Source:'),
      chalk.cyan('OPENAI_API_KEY environment variable')
    );
    console.log(chalk.dim('Key:   '), maskKey(envKey));
    return;
  }

  const config = loadConfig();
  if (!config?.openaiApiKey) {
    console.log(chalk.yellow('No API key configured.'));
    console.log(
      chalk.dim(`Run ${chalk.cyan('rls config set <key>')} to store one, or set OPENAI_API_KEY.`)
    );
    return;
  }

  console.log(chalk.dim('Source:'), chalk.cyan(CONFIG_FILE));
  console.log(chalk.dim('Key:   '), maskKey(config.openaiApiKey));
}

export function configSetCommand(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) {
    console.error(chalk.red('Error: API key cannot be empty'));
    process.exit(1);
  }
  saveConfig({ openaiApiKey: trimmed });
  console.log(chalk.green(`✓ API key saved to ${CONFIG_FILE}`));
  console.log(chalk.dim('Key:'), maskKey(trimmed));
}

export function configClearCommand(): void {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log(chalk.yellow('No config file found — nothing to clear.'));
    return;
  }
  fs.removeSync(CONFIG_FILE);
  console.log(chalk.green('✓ Config cleared.'));
  console.log(chalk.dim('Set OPENAI_API_KEY env var or run rls config set <key> to reconfigure.'));
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 3) + '...' + key.slice(-4);
}
```

- [ ] **Step 2: Register the config command in src/index.ts**

Open `src/index.ts`. After the `templates` command block (around line 80), add:

```typescript
import { configShowCommand, configSetCommand, configClearCommand } from './commands/config';
```

Add this import at the top of the file alongside the other imports.

Then add the command registration before `program.parseAsync(...)`:

```typescript
// ── config ────────────────────────────────────────────────────────────────────
const config = program
  .command('config')
  .description('View or update the stored OpenAI API key');

config
  .command('show')
  .description('Show the currently configured API key (masked)')
  .action(() => {
    configShowCommand();
  });

config
  .command('set <key>')
  .description('Save a new OpenAI API key to ~/.rls-helper/config.json')
  .action((key: string) => {
    configSetCommand(key);
  });

config
  .command('clear')
  .description('Remove the stored API key from ~/.rls-helper/config.json')
  .action(() => {
    configClearCommand();
  });
```

- [ ] **Step 3: Build and smoke-test**

```bash
npm run build
node dist/index.js config show
```

Expected (if no key configured): `No API key configured.` with hint.

```bash
node dist/index.js config set sk-testkey123456789
node dist/index.js config show
```

Expected: `✓ API key saved to ...` then `Key: sk-...6789`.

```bash
node dist/index.js config clear
node dist/index.js config show
```

Expected: `✓ Config cleared.` then `No API key configured.`

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/config.ts src/index.ts
git commit -m "feat: add rls config command — show, set, clear"
```

---

### Task 5: Add `--model` flag to generate and explain

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/openai.ts`
- Modify: `src/commands/generate.ts`
- Modify: `src/commands/explain.ts`
- Modify: `src/index.ts`

This adds `--model <name>` to both commands. Defaults to `gpt-4o-mini`. Accepted values include any OpenAI chat model string.

- [ ] **Step 1: Update src/types/index.ts**

Add `model?: string` to `GenerateOptions` and `ExplainOptions`:

```typescript
export interface GenerateOptions {
  table?: string;
  description?: string;
  output?: string;
  columns?: string;
  model?: string;
}

export interface ExplainOptions {
  sql?: string;
  model?: string;
}

export interface TemplateOptions {
  use?: string;
  table?: string;
  ownerColumn?: string;
  output?: string;
}

export interface RLSPolicy {
  name: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using?: string;
  withCheck?: string;
  description: string;
}

export interface Config {
  openaiApiKey: string;
}
```

- [ ] **Step 2: Update src/lib/openai.ts to accept a model parameter**

Replace the entire file:

```typescript
import OpenAI from 'openai';
import { getApiKey } from './config';

const DEFAULT_MODEL = 'gpt-4o-mini';

async function getClient(): Promise<OpenAI> {
  return new OpenAI({ apiKey: await getApiKey() });
}

export async function generateRLSPolicies(
  table: string,
  description: string,
  columns?: string,
  model = DEFAULT_MODEL
): Promise<string> {
  const client = await getClient();

  let userPrompt = `Table name: ${table}\n\nAccess rules: ${description}`;
  if (columns) {
    userPrompt += `\n\nTable columns: ${columns}`;
  }
  userPrompt += '\n\nGenerate complete RLS policies for this table.';

  const response = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          'You are a Supabase/PostgreSQL expert. Generate Row Level Security policies. Always output only valid SQL. Include ALTER TABLE ... ENABLE ROW LEVEL SECURITY and all necessary CREATE POLICY statements. Use auth.uid() for user identification. Name policies descriptively. Add SQL comments explaining each policy.',
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? '';
}

export async function explainPolicy(sql: string, model = DEFAULT_MODEL): Promise<string> {
  const client = await getClient();

  const response = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          'You are a Supabase/PostgreSQL expert. Explain RLS policies in plain English. Be concise and practical. Focus on who can do what and under what conditions.',
      },
      {
        role: 'user',
        content: `Explain what these RLS policies do in plain English:\n\n${sql}`,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? '';
}
```

Note: the module-level `_client` singleton is removed. `getClient()` now constructs fresh on each call, which avoids stale API key state if the user runs `rls config set` then `rls generate` in the same shell session without restarting. The OpenAI SDK constructor is cheap; this is not a performance concern.

- [ ] **Step 3: Update src/commands/generate.ts to pass model**

In `src/commands/generate.ts`, change the `generateRLSPolicies` call to pass `options.model`:

Locate the line:
```typescript
const raw = await generateRLSPolicies(resolvedTable!, resolvedDescription!, columns);
```

Replace with:
```typescript
const raw = await generateRLSPolicies(resolvedTable!, resolvedDescription!, columns, options.model);
```

- [ ] **Step 4: Update src/commands/explain.ts to pass model**

In `src/commands/explain.ts`, change the `explainPolicy` call:

Locate:
```typescript
const explanation = await explainPolicy(sql!);
```

Replace with:
```typescript
const explanation = await explainPolicy(sql!, options.model);
```

Also: change `spinner.succeed('Done')` to `spinner.stop()` — the explanation is printed on its own line; "Done" is redundant:

```typescript
spinner.stop();
console.log('\n' + explanation + '\n');
```

- [ ] **Step 5: Add --model flag to both commands in src/index.ts**

In the `generate` command block, add after the existing `.option` lines:
```typescript
.option('-m, --model <name>', 'OpenAI model to use (default: gpt-4o-mini)', 'gpt-4o-mini')
```

In the `explain` command block, add after the existing `.option` line:
```typescript
.option('-m, --model <name>', 'OpenAI model to use (default: gpt-4o-mini)', 'gpt-4o-mini')
```

- [ ] **Step 6: Typecheck and run tests**

```bash
npx tsc --noEmit
npm test
```

Expected: 0 type errors, 8 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/openai.ts src/commands/generate.ts src/commands/explain.ts src/index.ts
git commit -m "feat: add --model flag to generate and explain commands"
```

---

### Task 6: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add CI badge and rls config section to README.md**

Replace the existing README header and add the config section. The full new README content:

````markdown
# supabase-rls-helper

> Generate Supabase Row Level Security policies from plain-English descriptions.

[![CI](https://github.com/IndieGoWeb/supabase-rls-helper/actions/workflows/ci.yml/badge.svg)](https://github.com/IndieGoWeb/supabase-rls-helper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/supabase-rls-helper.svg)](https://www.npmjs.com/package/supabase-rls-helper)

## What it does

- Describe your access rules in plain English → get production-ready SQL instantly
- Explain any existing RLS policy back into plain English
- Apply pre-built templates for the most common access patterns, parameterised to your table
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
rls config show            # Print the active key (masked)
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
````

- [ ] **Step 2: Update the CI badge URL**

In the badge line, replace `IndieGoWeb/supabase-rls-helper` with the actual GitHub username/repo path. Check with:

```bash
gh repo view --json nameWithOwner --jq '.nameWithOwner'
```

Use the returned value to form the badge URLs. The two occurrences are:
- `https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg`
- `https://github.com/<owner>/<repo>/actions/workflows/ci.yml`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with CI badge, --model flag, and rls config section"
```

---

### Task 7: Final build verification

**Files:** No changes.

- [ ] **Step 1: Clean build**

```bash
rm -rf dist
npm run build
```

Expected: `dist/` recreated with no TypeScript errors.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected:
```
✓ src/lib/parser.test.ts (8)
Test Files  1 passed (1)
Tests  8 passed (8)
```

- [ ] **Step 3: Smoke-test the config command from the built dist**

```bash
node dist/index.js config show
node dist/index.js --help
node dist/index.js generate --help
node dist/index.js explain --help
node dist/index.js templates list
```

Expected: all commands show correctly formatted help. `generate --help` and `explain --help` both show `--model` flag.

- [ ] **Step 4: Push and confirm CI passes on GitHub**

```bash
git push
```

Then: `gh run list --limit 1` — confirm the CI run status is `completed` with conclusion `success`.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve any final build or typecheck issues"
git push
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Test suite for pure functions | Tasks 1–2 |
| GitHub Actions CI (typecheck + test) | Task 3 |
| `rls config show/set/clear` command | Task 4 |
| `--model` flag on generate and explain | Task 5 |
| Fix singleton removal (fresh client per call) | Task 5 |
| Fix `validateSQL` double-error if not already guarded | Task 2 |
| README CI badge + config docs + model flag docs | Task 6 |
| Clean build + smoke test | Task 7 |

All requirements covered.

### Placeholder scan

No TBDs, no "implement later", no "similar to Task N" — all steps contain exact code or exact commands.

### Type consistency

- `GenerateOptions.model?: string` defined in Task 5 Step 1, consumed in `generate.ts` Step 3 and `index.ts` Step 5 — consistent.
- `ExplainOptions.model?: string` defined in Task 5 Step 1, consumed in `explain.ts` Step 4 and `index.ts` Step 5 — consistent.
- `generateRLSPolicies(table, description, columns?, model?)` signature in `openai.ts` Step 2 matches call site in `generate.ts` Step 3 — consistent.
- `explainPolicy(sql, model?)` signature in `openai.ts` Step 2 matches call site in `explain.ts` Step 4 — consistent.
- `configShowCommand`, `configSetCommand`, `configClearCommand` defined in `config.ts` Step 1 and imported in `index.ts` Step 2 — names match.
