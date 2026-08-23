# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # tsc → compiles src/ to dist/
npm run dev          # ts-node src/index.ts (run without building)
npm start            # node dist/index.js (requires build first)
npm test             # vitest run (single pass, used in CI)
npm run test:watch   # vitest (watch mode for development)
```

To run a single test file:
```bash
npx vitest run src/lib/parser.test.ts
```

To exercise the CLI locally without installing:
```bash
npm run build && node dist/index.js generate --table posts --description "..."
```

## Architecture

**Entry point:** `src/index.ts` — Commander program wiring six top-level commands: `generate`, `explain`, `templates`, `audit`, `verify`, `config`.

**Command handlers** (`src/commands/`):
- `generate.ts` — prompts for table/description if not passed as flags, calls OpenAI, extracts SQL from the response, runs a basic validator, then writes to a file or pretty-prints to stdout. `--verify` runs the result through `lib/sandbox.ts` and prints a report; `--emit-tests` writes a companion `<output>.rls.test.sql` via `lib/testEmitter.ts` (or prints to stdout if no `--output`).
- `explain.ts` — takes a SQL policy (flag or interactive editor prompt) and returns a plain-English explanation from OpenAI.
- `templates.ts` — lists or applies SQL templates from the `templates/` directory. Template files use `YOUR_TABLE_NAME` and `YOUR_OWNER_COLUMN` as string-replace placeholders.
- `audit.ts` — static RLS gap scanner (`rls audit [paths...]`), no LLM. Walks SQL files, runs `lib/audit.ts`'s rule engine, prints or JSON-dumps findings, exits non-zero at or above `--fail-on` (default `critical`).
- `verify.ts` — `rls verify --file <path> --table <name>`, thin wrapper around `lib/sandbox.ts` + `lib/verifyReport.ts`.
- `config.ts` — `configShowCommand`, `configSetCommand`, `configClearCommand` manage the API key stored at `~/.rls-helper/config.json`. Show masks the key as `sk-...XXXX`.

**Lib layer** (`src/lib/`):
- `config.ts` — API key resolution order: `OPENAI_API_KEY` env var → `~/.rls-helper/config.json` → interactive password prompt (saves on success). Exports `CONFIG_FILE` and `CONFIG_DIR` constants (used by `commands/config.ts`).
- `openai.ts` — thin wrapper around the OpenAI SDK; `generateRLSPolicies(table, description, columns?, model?)` and `explainPolicy(sql, model?)`. Default model is `gpt-4o-mini`, `temperature: 0.1`. A fresh `OpenAI` client is constructed per call (no module-level singleton).
- `parser.ts` — `extractSQL` strips markdown fences from LLM output; `validateSQL` does lightweight structural checks (looks for `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, and balanced parentheses). Both are pure functions covered by `src/lib/parser.test.ts`.
- `highlight.ts` — keyword-based SQL syntax highlighting via chalk, printed directly to stdout. Uses a single-pass regex (keywords sorted longest-first) to avoid ANSI sequence corruption from overlapping matches.
- `sqlStatements.ts` — hand-rolled SQL lexer (`scanSqlSegments`), not a regex hack. Distinguishes code from string/quoted-identifier/dollar-quoted/comment ranges so `splitStatements` and `extractParenGroup` aren't fooled by a `;` or `(` sitting inside a string literal. Every other SQL-parsing module in this codebase is built on this one.
- `policyParser.ts` — turns one isolated SQL statement into a structured `ParsedRlsToggle` or `ParsedPolicy` (name, table, command, roles, `using`/`withCheck` bodies) via keyword-position regexes plus `extractParenGroup` for the clause bodies.
- `audit.ts` — `collectTableAudits` groups toggles/policies per table across files; `auditSources`/`auditTables` apply a small rule set. **Every rule is grounded in documented (and PGlite-verified) Postgres RLS defaulting behavior** — read the comment block above `type Rule` before adding or "fixing" a rule; an earlier version of this rule set flagged `UPDATE ... USING (...)` with no `WITH CHECK` as a vulnerability, which is wrong (Postgres reuses `USING` as the implicit `WITH CHECK` for `ALL`/`UPDATE` policies) — that rule was removed after empirical testing caught it. Current rules: `policy-without-rls`, `rls-enabled-no-policies`, `insert-using-invalid`, `insert-noop-without-check`, `unrestricted-write`.
- `schemaInference.ts` — given a table's parsed policies, decides whether the "two synthetic users + one owner column" probe model applies (`inferSandboxSchema`). Bails out (`supported: false`) the moment a `USING`/`WITH CHECK` body references another table via a join/subquery, or has no owner-like column, or has more than one — these need seed data or context this tool can't infer, so it says so rather than guessing. This is the scope boundary for both `sandbox.ts` and `testEmitter.ts`.
- `sandbox.ts` — `verifyPolicies(sql, table)`: boots `@electric-sql/pglite` (WASM Postgres, in-memory, no Docker/network), applies the *exact* input SQL, seeds two rows, and runs SELECT/INSERT/UPDATE/DELETE probes as `anon`/`userA`/`userB` inside `BEGIN ... ROLLBACK` transactions using `SET LOCAL ROLE` + `SET LOCAL request.jwt.claims` (mirrors how Supabase/PostgREST scope a request). Findings come from comparing actual rows returned against a generic ownership/leak check — not from re-deriving policy semantics — so it also catches multi-policy interactions (e.g. two individually-fine SELECT policies that OR into a leak) that static analysis can't. Real Postgres RLS bypass is keyed off the *current role* (post `SET ROLE`), not the connecting superuser, which is why this works without a persisted data directory or role-membership grants — see the module's test file for the empirical checks this relies on.
- `testEmitter.ts` — `emitRegressionTests(sql, table)`: same `schemaInference` scope boundary as `sandbox.ts`, but emits a portable, pgTAP-free SQL script (SELECT/read-isolation checks only) using Supabase's *real* `anon`/`authenticated` role names, meant to run against an actual project via `psql -f`. Deliberately narrower than `sandbox.ts` — write-path probes against a real, possibly non-empty table would risk schema mismatches (unknown NOT NULL columns) this tool has no way to see.
- `verifyReport.ts` — shared pretty/JSON printer for a `VerificationReport`, used by both `commands/verify.ts` and `commands/generate.ts`'s `--verify` path.
- `fileWalk.ts` — dependency-free recursive `.sql` file finder for `rls audit`, skips `node_modules`/`.git`/`dist`/build dirs.

**Templates** (`templates/*.sql`): Five static SQL files. `getTemplatesDir()` in `templates.ts` resolves as `__dirname/../../templates` — this correctly points to the project root `templates/` whether running from `dist/commands/` (built) or `src/commands/` (ts-node). `rls audit templates/` runs in CI against these on every push (`.github/workflows/ci.yml`) — they must always come back clean; a template edit that trips a rule is a signal to fix the template, not suppress the finding.

**Types** (`src/types/index.ts`): Shared interfaces — `GenerateOptions`, `ExplainOptions`, `TemplateOptions`, `Config`, plus the audit types (`ParsedPolicy`, `ParsedRlsToggle`, `TableAudit`, `AuditFinding`, `FindingSeverity`, `AuditOptions`) and verify types (`ProbeIdentity`, `ProbeOperation`, `ProbeResult`, `VerificationFinding`, `VerificationReport`, `VerifyOptions`). `GenerateOptions` and `ExplainOptions` both include an optional `model` field; `GenerateOptions` also has `verify?` and `emitTests?`.

## Key constraints

- The CLI binary is named `rls` (not `supabase-rls-helper`) — see `bin` in `package.json`.
- `module: "commonjs"` — no ESM imports. chalk@4, ora@5, inquirer@8 are pinned because v5+/v9+ are pure ESM and will break the build. `@electric-sql/pglite` ships proper dual CJS/ESM exports (a `require` condition pointing at `dist/index.cjs`), so it doesn't need the same pin.
- Template placeholder strings are `YOUR_TABLE_NAME` and `YOUR_OWNER_COLUMN` — any new template must use these exact strings to be compatible with `useTemplate`.
- No paid external tools/services: `rls audit` and `rls verify` must never require an API key, a hosted database, or Docker. `verify`/`--verify`/`--emit-tests` depend only on `@electric-sql/pglite` (local, in-process, MIT-licensed).
- Before changing anything in `audit.ts`'s rule set or `sandbox.ts`'s probe logic, verify the underlying Postgres RLS behavior empirically (a throwaway PGlite script) or against the official `CREATE POLICY` docs — don't rely on assumption. The rule set's own history (see `audit.ts`'s comment above `type Rule`) is a cautionary example of getting this wrong.
