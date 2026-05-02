# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build      # tsc → compiles src/ to dist/
npm run dev        # ts-node src/index.ts (run without building)
npm start          # node dist/index.js (requires build first)
```

No test suite exists. TypeScript strict mode is on — keep it clean.

To exercise the CLI locally without installing:
```bash
npm run build && node dist/index.js generate --table posts --description "..."
```

## Architecture

**Entry point:** `src/index.ts` — sets up the Commander program with three top-level commands: `generate`, `explain`, `templates list`, `templates use`.

**Command handlers** (`src/commands/`):
- `generate.ts` — prompts for table/description if not passed as flags, calls OpenAI, extracts SQL from the response, runs a basic validator, then either writes to a file or pretty-prints to stdout.
- `explain.ts` — takes a SQL policy (flag or interactive editor prompt) and returns a plain-English explanation from OpenAI.
- `templates.ts` — lists or applies SQL templates from the `templates/` directory. Template files use `YOUR_TABLE_NAME` and `YOUR_OWNER_COLUMN` as string-replace placeholders.

**Lib layer** (`src/lib/`):
- `config.ts` — API key resolution order: `OPENAI_API_KEY` env var → `~/.rls-helper/config.json` → interactive password prompt (saves on success).
- `openai.ts` — thin wrapper around the OpenAI SDK; two functions: `generateRLSPolicies` and `explainPolicy`. Model is `gpt-4o-mini` with `temperature: 0.1`.
- `parser.ts` — `extractSQL` strips markdown fences from LLM output; `validateSQL` does lightweight structural checks (looks for `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, and balanced parentheses).
- `highlight.ts` — keyword-based SQL syntax highlighting via chalk, printed directly to stdout.

**Templates** (`templates/*.sql`): Five static SQL files. `getTemplatesDir()` in `templates.ts` resolves the path as `__dirname/../../templates`, which means it points to the project root `templates/` only when running from the compiled `dist/commands/` path. Running templates via `npm run dev` (ts-node from `src/commands/`) will cause the path to resolve incorrectly — use `npm run build && node dist/index.js` when testing the templates command.

**Types** (`src/types/index.ts`): Shared interfaces — `GenerateOptions`, `ExplainOptions`, `TemplateOptions`, `RLSPolicy`, `Config`.

## Key constraints

- The CLI binary is named `rls` (not `supabase-rls-helper`) — see `bin` in `package.json`.
- `module: "commonjs"` — no ESM imports.
- Template placeholder strings are `YOUR_TABLE_NAME` and `YOUR_OWNER_COLUMN` — any new template must use these exact strings to be compatible with `useTemplate`.
- The OpenAI client is lazily instantiated and module-level cached in `openai.ts` — only one instance per process.
