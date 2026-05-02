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

**Entry point:** `src/index.ts` — Commander program wiring four top-level commands: `generate`, `explain`, `templates`, `config`.

**Command handlers** (`src/commands/`):
- `generate.ts` — prompts for table/description if not passed as flags, calls OpenAI, extracts SQL from the response, runs a basic validator, then writes to a file or pretty-prints to stdout.
- `explain.ts` — takes a SQL policy (flag or interactive editor prompt) and returns a plain-English explanation from OpenAI.
- `templates.ts` — lists or applies SQL templates from the `templates/` directory. Template files use `YOUR_TABLE_NAME` and `YOUR_OWNER_COLUMN` as string-replace placeholders.
- `config.ts` — `configShowCommand`, `configSetCommand`, `configClearCommand` manage the API key stored at `~/.rls-helper/config.json`. Show masks the key as `sk-...XXXX`.

**Lib layer** (`src/lib/`):
- `config.ts` — API key resolution order: `OPENAI_API_KEY` env var → `~/.rls-helper/config.json` → interactive password prompt (saves on success).
- `openai.ts` — thin wrapper around the OpenAI SDK; `generateRLSPolicies(table, description, columns?, model?)` and `explainPolicy(sql, model?)`. Default model is `gpt-4o-mini`, `temperature: 0.1`. A fresh `OpenAI` client is constructed per call (no module-level singleton).
- `parser.ts` — `extractSQL` strips markdown fences from LLM output; `validateSQL` does lightweight structural checks (looks for `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, and balanced parentheses). Both are pure functions covered by `src/lib/parser.test.ts`.
- `highlight.ts` — keyword-based SQL syntax highlighting via chalk, printed directly to stdout.

**Templates** (`templates/*.sql`): Five static SQL files. `getTemplatesDir()` in `templates.ts` resolves as `__dirname/../../templates` — this correctly points to the project root `templates/` whether running from `dist/commands/` (built) or `src/commands/` (ts-node).

**Types** (`src/types/index.ts`): Shared interfaces — `GenerateOptions`, `ExplainOptions`, `TemplateOptions`, `RLSPolicy`, `Config`. `GenerateOptions` and `ExplainOptions` both include an optional `model` field.

## Key constraints

- The CLI binary is named `rls` (not `supabase-rls-helper`) — see `bin` in `package.json`.
- `module: "commonjs"` — no ESM imports. chalk@4, ora@5, inquirer@8 are pinned because v5+/v9+ are pure ESM and will break the build.
- Template placeholder strings are `YOUR_TABLE_NAME` and `YOUR_OWNER_COLUMN` — any new template must use these exact strings to be compatible with `useTemplate`.
