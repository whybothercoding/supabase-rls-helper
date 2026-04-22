# supabase-rls-helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready, publishable TypeScript CLI tool that generates Supabase RLS policies from plain-English descriptions using OpenAI.

**Architecture:** Commander-based CLI with three top-level commands (`generate`, `explain`, `templates`). OpenAI integration is isolated in `src/lib/openai.ts`; config management (API key persistence) in `src/lib/config.ts`; SQL parsing/validation in `src/lib/parser.ts`. All commands live under `src/commands/`. Entry point at `src/index.ts` wires everything together via Commander.

**Tech Stack:** TypeScript (CommonJS, ES2020), Commander, OpenAI SDK, chalk@4, ora@5, inquirer@8, fs-extra. Node ≥18 required.

> **CRITICAL COMPATIBILITY NOTE:** chalk v5+, ora v6+, and inquirer v9+ are all pure ESM and will break a CommonJS build. Pin to chalk@4, ora@5, inquirer@8.

---

## File Map

| Path | Responsibility |
|------|---------------|
| `package.json` | Project metadata, deps, scripts, bin entry |
| `tsconfig.json` | TS compiler config (CommonJS, ES2020, strict) |
| `.gitignore` | Ignore node_modules, dist, config files with secrets |
| `LICENSE` | MIT |
| `src/types/index.ts` | All shared TypeScript interfaces |
| `src/lib/config.ts` | API key load/save/prompt (~/.rls-helper/config.json) |
| `src/lib/openai.ts` | OpenAI client, generateRLSPolicies(), explainPolicy() |
| `src/lib/parser.ts` | extractSQL(), validateSQL() — pure functions |
| `src/commands/generate.ts` | `rls generate` interactive + flag-driven flow |
| `src/commands/explain.ts` | `rls explain` flow |
| `src/commands/templates.ts` | templatesList, listTemplates(), useTemplate() |
| `src/index.ts` | Commander wiring, all commands + subcommands |
| `templates/user-owns-row.sql` | Template: user owns their rows |
| `templates/public-read-auth-write.sql` | Template: public read, auth write |
| `templates/admin-full-access.sql` | Template: admin full, users read-only |
| `templates/team-based-access.sql` | Template: team membership-based access |
| `templates/row-level-tenant-isolation.sql` | Template: multi-tenant org isolation |
| `examples/basic-blog.md` | Example: posts table scenario |
| `examples/multi-tenant-saas.md` | Example: projects table multi-tenant |
| `examples/team-workspace.md` | Example: documents table team access |
| `README.md` | Full public documentation |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `src/` directory structure (all subdirs)
- Create: `templates/` directory
- Create: `examples/` directory

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/commands src/lib src/types templates examples
```

- [ ] **Step 2: Create package.json**

Create `/Users/theoslasha/Documents/Projects/OPEN_SOURCE/supabase-rls-helper/package.json`:

```json
{
  "name": "supabase-rls-helper",
  "version": "0.1.0",
  "description": "Generate Supabase RLS policies from plain English",
  "bin": {
    "rls": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "start": "node dist/index.js",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "chalk": "^4.1.2",
    "commander": "^12.0.0",
    "fs-extra": "^11.2.0",
    "inquirer": "^8.2.6",
    "openai": "^4.47.1",
    "ora": "^5.4.1"
  },
  "devDependencies": {
    "@types/fs-extra": "^11.0.4",
    "@types/inquirer": "^8.2.10",
    "@types/node": "^20.12.7",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.5"
  },
  "engines": {
    "node": ">=18"
  },
  "keywords": [
    "supabase",
    "rls",
    "postgresql",
    "cli",
    "security",
    "developer-tools"
  ],
  "license": "MIT"
}
```

- [ ] **Step 3: Create tsconfig.json**

Create `/Users/theoslasha/Documents/Projects/OPEN_SOURCE/supabase-rls-helper/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create .gitignore**

Create `/Users/theoslasha/Documents/Projects/OPEN_SOURCE/supabase-rls-helper/.gitignore`:

```
node_modules/
dist/
*.js.map
.env
.env.local
~/.rls-helper/
*.tsbuildinfo
```

- [ ] **Step 5: Create LICENSE**

Create `/Users/theoslasha/Documents/Projects/OPEN_SOURCE/supabase-rls-helper/LICENSE`:

```
MIT License

Copyright (c) 2026 Theo / IndieGoWeb Ltd

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore LICENSE
git commit -m "chore: project scaffolding — package.json, tsconfig, gitignore, license"
```

---

### Task 2: Types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Write src/types/index.ts**

```typescript
export interface GenerateOptions {
  table?: string;
  description?: string;
  output?: string;
  columns?: string;
}

export interface ExplainOptions {
  sql?: string;
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

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared TypeScript interfaces"
```

---

### Task 3: Config Module

**Files:**
- Create: `src/lib/config.ts`

- [ ] **Step 1: Write src/lib/config.ts**

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import inquirer from 'inquirer';
import { Config } from '../types/index.js';

const CONFIG_DIR = path.join(os.homedir(), '.rls-helper');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): Config | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    return fs.readJsonSync(CONFIG_FILE) as Config;
  } catch {
    return null;
  }
}

export function saveConfig(config: Config): void {
  fs.ensureDirSync(CONFIG_DIR);
  fs.writeJsonSync(CONFIG_FILE, config, { spaces: 2 });
}

export async function getApiKey(): Promise<string> {
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  const config = loadConfig();
  if (config?.openaiApiKey) {
    return config.openaiApiKey;
  }

  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your OpenAI API key:',
      validate: (input: string) =>
        input.trim().length > 0 ? true : 'API key cannot be empty',
    },
  ]);

  saveConfig({ openaiApiKey: apiKey.trim() });
  return apiKey.trim();
}
```

> **Note:** The import path uses `../types/index.js` — TypeScript resolves `.js` imports to `.ts` source during compilation when using `moduleResolution: node`. If you see resolution errors, use `../types` instead.

- [ ] **Step 2: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat: add config module with API key load/save/prompt"
```

---

### Task 4: OpenAI Module

**Files:**
- Create: `src/lib/openai.ts`

- [ ] **Step 1: Write src/lib/openai.ts**

```typescript
import OpenAI from 'openai';
import { getApiKey } from './config';

async function getClient(): Promise<OpenAI> {
  const apiKey = await getApiKey();
  return new OpenAI({ apiKey });
}

export async function generateRLSPolicies(
  table: string,
  description: string,
  columns?: string
): Promise<string> {
  const client = await getClient();

  let userPrompt = `Table name: ${table}\n\nAccess rules: ${description}`;
  if (columns) {
    userPrompt += `\n\nTable columns: ${columns}`;
  }
  userPrompt += '\n\nGenerate complete RLS policies for this table.';

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
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

export async function explainPolicy(sql: string): Promise<string> {
  const client = await getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
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

- [ ] **Step 2: Commit**

```bash
git add src/lib/openai.ts
git commit -m "feat: add OpenAI module — generateRLSPolicies and explainPolicy"
```

---

### Task 5: Parser Module

**Files:**
- Create: `src/lib/parser.ts`

- [ ] **Step 1: Write src/lib/parser.ts**

```typescript
export function extractSQL(llmOutput: string): string {
  // Strip markdown SQL code fences if present
  const fencePattern = /```(?:sql)?\s*([\s\S]*?)```/i;
  const match = llmOutput.match(fencePattern);
  if (match) {
    return match[1].trim();
  }
  return llmOutput.trim();
}

export function validateSQL(sql: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const upper = sql.toUpperCase();

  if (!upper.includes('ENABLE ROW LEVEL SECURITY')) {
    errors.push('Missing: ALTER TABLE ... ENABLE ROW LEVEL SECURITY');
  }

  if (!upper.includes('CREATE POLICY')) {
    errors.push('Missing: at least one CREATE POLICY statement');
  }

  // Check balanced parentheses
  let depth = 0;
  for (const char of sql) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth < 0) {
      errors.push('Unbalanced parentheses: found ) without matching (');
      break;
    }
  }
  if (depth !== 0) {
    errors.push('Unbalanced parentheses: unclosed (');
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 2: Verify functions manually by tracing through a test case**

Trace `extractSQL('```sql\nSELECT 1;\n```')`:
- fencePattern matches, match[1] = `SELECT 1;`, returns `SELECT 1;` ✓

Trace `validateSQL('ALTER TABLE t ENABLE ROW LEVEL SECURITY; CREATE POLICY p ON t USING (true);')`:
- Contains `ENABLE ROW LEVEL SECURITY` ✓
- Contains `CREATE POLICY` ✓
- Parens: 1 open, 1 close, depth ends at 0 ✓
- Returns `{ valid: true, errors: [] }` ✓

- [ ] **Step 3: Commit**

```bash
git add src/lib/parser.ts
git commit -m "feat: add SQL parser — extractSQL and validateSQL"
```

---

### Task 6: Template SQL Files

**Files:**
- Create: `templates/user-owns-row.sql`
- Create: `templates/public-read-auth-write.sql`
- Create: `templates/admin-full-access.sql`
- Create: `templates/team-based-access.sql`
- Create: `templates/row-level-tenant-isolation.sql`

- [ ] **Step 1: Create templates/user-owns-row.sql**

```sql
-- =============================================================================
-- Template: User Owns Row
-- Use case: Each user can only SELECT, INSERT, UPDATE, DELETE their own rows.
--
-- Required table structure:
--   CREATE TABLE YOUR_TABLE_NAME (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     YOUR_OWNER_COLUMN uuid REFERENCES auth.users(id) NOT NULL,
--     -- ... your other columns
--   );
--
-- Placeholders (replace before applying):
--   YOUR_TABLE_NAME   → your actual table name
--   YOUR_OWNER_COLUMN → the column that stores the owner's user ID (e.g. user_id)
-- =============================================================================

-- Enable RLS on the table
ALTER TABLE YOUR_TABLE_NAME ENABLE ROW LEVEL SECURITY;

-- Allow users to read only their own rows
CREATE POLICY "Users can view own rows"
  ON YOUR_TABLE_NAME
  FOR SELECT
  USING (YOUR_OWNER_COLUMN = auth.uid());

-- Allow users to insert rows where they are the owner
CREATE POLICY "Users can insert own rows"
  ON YOUR_TABLE_NAME
  FOR INSERT
  WITH CHECK (YOUR_OWNER_COLUMN = auth.uid());

-- Allow users to update only their own rows
CREATE POLICY "Users can update own rows"
  ON YOUR_TABLE_NAME
  FOR UPDATE
  USING (YOUR_OWNER_COLUMN = auth.uid())
  WITH CHECK (YOUR_OWNER_COLUMN = auth.uid());

-- Allow users to delete only their own rows
CREATE POLICY "Users can delete own rows"
  ON YOUR_TABLE_NAME
  FOR DELETE
  USING (YOUR_OWNER_COLUMN = auth.uid());
```

- [ ] **Step 2: Create templates/public-read-auth-write.sql**

```sql
-- =============================================================================
-- Template: Public Read, Authenticated Write
-- Use case: Anyone (including anonymous) can read rows. Only authenticated
--           users can insert, update, or delete.
--
-- Required table structure:
--   CREATE TABLE YOUR_TABLE_NAME (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     -- ... your other columns
--   );
--
-- Placeholders:
--   YOUR_TABLE_NAME → your actual table name
-- =============================================================================

-- Enable RLS on the table
ALTER TABLE YOUR_TABLE_NAME ENABLE ROW LEVEL SECURITY;

-- Allow anyone (anon + authenticated) to read all rows
CREATE POLICY "Anyone can read"
  ON YOUR_TABLE_NAME
  FOR SELECT
  USING (true);

-- Only authenticated users can insert
CREATE POLICY "Authenticated users can insert"
  ON YOUR_TABLE_NAME
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Only authenticated users can update
CREATE POLICY "Authenticated users can update"
  ON YOUR_TABLE_NAME
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Only authenticated users can delete
CREATE POLICY "Authenticated users can delete"
  ON YOUR_TABLE_NAME
  FOR DELETE
  USING (auth.role() = 'authenticated');
```

- [ ] **Step 3: Create templates/admin-full-access.sql**

```sql
-- =============================================================================
-- Template: Admin Full Access, Users Read-Only
-- Use case: Admins (determined by a profiles table with a role column) have
--           full CRUD access. Regular authenticated users have read-only access.
--
-- Required table structure:
--   -- A profiles table with a role column:
--   CREATE TABLE profiles (
--     id uuid REFERENCES auth.users(id) PRIMARY KEY,
--     role text DEFAULT 'user' CHECK (role IN ('user', 'admin'))
--   );
--
--   CREATE TABLE YOUR_TABLE_NAME (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     -- ... your other columns
--   );
--
-- Placeholders:
--   YOUR_TABLE_NAME → your actual table name
-- =============================================================================

-- Enable RLS on the table
ALTER TABLE YOUR_TABLE_NAME ENABLE ROW LEVEL SECURITY;

-- Admins can read all rows
CREATE POLICY "Admins can read all"
  ON YOUR_TABLE_NAME
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Regular authenticated users can also read all rows
CREATE POLICY "Users can read all"
  ON YOUR_TABLE_NAME
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can insert
CREATE POLICY "Admins can insert"
  ON YOUR_TABLE_NAME
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Only admins can update
CREATE POLICY "Admins can update"
  ON YOUR_TABLE_NAME
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Only admins can delete
CREATE POLICY "Admins can delete"
  ON YOUR_TABLE_NAME
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
```

- [ ] **Step 4: Create templates/team-based-access.sql**

```sql
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
--
--   CREATE TABLE team_members (
--     team_id uuid REFERENCES teams(id) NOT NULL,
--     user_id uuid REFERENCES auth.users(id) NOT NULL,
--     PRIMARY KEY (team_id, user_id)
--   );
--
--   CREATE TABLE YOUR_TABLE_NAME (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     team_id uuid REFERENCES teams(id) NOT NULL,
--     -- ... your other columns
--   );
--
-- Placeholders:
--   YOUR_TABLE_NAME → your actual table name
-- =============================================================================

-- Enable RLS on the table
ALTER TABLE YOUR_TABLE_NAME ENABLE ROW LEVEL SECURITY;

-- Users can only read rows belonging to their teams
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

-- Users can only insert rows for their teams
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

-- Users can only update rows belonging to their teams
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

-- Users can only delete rows belonging to their teams
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
```

- [ ] **Step 5: Create templates/row-level-tenant-isolation.sql**

```sql
-- =============================================================================
-- Template: Row-Level Tenant Isolation
-- Use case: Multi-tenant SaaS. Each user belongs to an organisation, and can
--           only access rows belonging to their own organisation.
--
-- Required table structure:
--   CREATE TABLE profiles (
--     id uuid REFERENCES auth.users(id) PRIMARY KEY,
--     organisation_id uuid REFERENCES organisations(id) NOT NULL
--   );
--
--   CREATE TABLE organisations (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     name text NOT NULL
--   );
--
--   CREATE TABLE YOUR_TABLE_NAME (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     organisation_id uuid REFERENCES organisations(id) NOT NULL,
--     -- ... your other columns
--   );
--
-- Placeholders:
--   YOUR_TABLE_NAME → your actual table name
-- =============================================================================

-- Enable RLS on the table
ALTER TABLE YOUR_TABLE_NAME ENABLE ROW LEVEL SECURITY;

-- Users can only read rows belonging to their organisation
CREATE POLICY "Tenant isolation — select"
  ON YOUR_TABLE_NAME
  FOR SELECT
  USING (
    organisation_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

-- Users can only insert rows for their organisation
CREATE POLICY "Tenant isolation — insert"
  ON YOUR_TABLE_NAME
  FOR INSERT
  WITH CHECK (
    organisation_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

-- Users can only update rows belonging to their organisation
CREATE POLICY "Tenant isolation — update"
  ON YOUR_TABLE_NAME
  FOR UPDATE
  USING (
    organisation_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    organisation_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

-- Users can only delete rows belonging to their organisation
CREATE POLICY "Tenant isolation — delete"
  ON YOUR_TABLE_NAME
  FOR DELETE
  USING (
    organisation_id = (
      SELECT organisation_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );
```

- [ ] **Step 6: Commit**

```bash
git add templates/
git commit -m "feat: add 5 production-ready RLS SQL templates"
```

---

### Task 7: Templates Command

**Files:**
- Create: `src/commands/templates.ts`

- [ ] **Step 1: Write src/commands/templates.ts**

```typescript
import * as path from 'path';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import { TemplateOptions } from '../types/index';

export const templatesList = [
  {
    name: 'user-owns-row',
    file: 'user-owns-row.sql',
    description: 'Users can only CRUD their own rows (via user_id column)',
  },
  {
    name: 'public-read-auth-write',
    file: 'public-read-auth-write.sql',
    description: 'Anyone can read; only authenticated users can write',
  },
  {
    name: 'admin-full-access',
    file: 'admin-full-access.sql',
    description: 'Admins have full access; regular users are read-only',
  },
  {
    name: 'team-based-access',
    file: 'team-based-access.sql',
    description: 'Access restricted to rows belonging to the user\'s team',
  },
  {
    name: 'row-level-tenant-isolation',
    file: 'row-level-tenant-isolation.sql',
    description: 'Multi-tenant isolation by organisation_id',
  },
];

function getTemplatesDir(): string {
  // When installed globally, templates live next to the package root
  // __dirname is dist/commands/, so go up two levels to package root
  return path.join(__dirname, '..', '..', 'templates');
}

export async function listTemplates(): Promise<void> {
  console.log(chalk.bold('\nAvailable RLS templates:\n'));
  const nameWidth = 30;
  console.log(
    chalk.dim(
      `  ${'Name'.padEnd(nameWidth)}Description`
    )
  );
  console.log(chalk.dim('  ' + '─'.repeat(70)));
  for (const t of templatesList) {
    console.log(
      `  ${chalk.cyan(t.name.padEnd(nameWidth))}${t.description}`
    );
  }
  console.log('');
}

export async function useTemplate(options: TemplateOptions): Promise<void> {
  if (!options.use) {
    console.error(chalk.red('Error: --use <name> is required'));
    process.exit(1);
  }

  const template = templatesList.find((t) => t.name === options.use);
  if (!template) {
    console.error(
      chalk.red(`Error: Unknown template "${options.use}"`),
      '\nRun',
      chalk.cyan('rls templates list'),
      'to see available templates.'
    );
    process.exit(1);
  }

  const templatePath = path.join(getTemplatesDir(), template.file);
  if (!fs.existsSync(templatePath)) {
    console.error(chalk.red(`Error: Template file not found at ${templatePath}`));
    process.exit(1);
  }

  let sql = fs.readFileSync(templatePath, 'utf-8');

  if (options.table) {
    sql = sql.split('YOUR_TABLE_NAME').join(options.table);
  }
  if (options.ownerColumn) {
    sql = sql.split('YOUR_OWNER_COLUMN').join(options.ownerColumn);
  }

  if (options.output) {
    await fs.outputFile(options.output, sql, 'utf-8');
    console.log(chalk.green(`✓ Template written to ${options.output}`));
  } else {
    highlightSQL(sql);
  }
}

function highlightSQL(sql: string): void {
  const keywords = [
    'ALTER TABLE', 'ENABLE ROW LEVEL SECURITY', 'CREATE POLICY',
    'FOR SELECT', 'FOR INSERT', 'FOR UPDATE', 'FOR DELETE',
    'USING', 'WITH CHECK', 'EXISTS', 'SELECT', 'FROM', 'WHERE', 'AND', 'OR',
  ];
  let highlighted = sql;
  for (const kw of keywords) {
    highlighted = highlighted.split(kw).join(chalk.blue(kw));
  }
  console.log(highlighted);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/templates.ts
git commit -m "feat: add templates command — list and use subcommands"
```

---

### Task 8: Generate Command

**Files:**
- Create: `src/commands/generate.ts`

- [ ] **Step 1: Write src/commands/generate.ts**

```typescript
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import { generateRLSPolicies } from '../lib/openai';
import { extractSQL, validateSQL } from '../lib/parser';
import { GenerateOptions } from '../types/index';

const SQL_KEYWORDS = [
  'ALTER TABLE', 'ENABLE ROW LEVEL SECURITY', 'CREATE POLICY',
  'FOR SELECT', 'FOR INSERT', 'FOR UPDATE', 'FOR DELETE',
  'USING', 'WITH CHECK', 'EXISTS', 'SELECT', 'FROM', 'WHERE',
  'AND', 'OR', 'NOT', 'NULL', 'TRUE', 'FALSE',
];

function highlightSQL(sql: string): void {
  let result = sql;
  for (const kw of SQL_KEYWORDS) {
    result = result.split(kw).join(chalk.blue(kw));
  }
  console.log(result);
}

export async function generateCommand(options: GenerateOptions): Promise<void> {
  let { table, description, columns, output } = options;

  if (!table) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'table',
        message: 'Table name:',
        validate: (v: string) => v.trim().length > 0 || 'Table name is required',
      },
    ]);
    table = answers.table.trim();
  }

  if (!description) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Describe the access rules (plain English):',
        validate: (v: string) => v.trim().length > 0 || 'Description is required',
      },
    ]);
    description = answers.description.trim();
  }

  const spinner = ora('Generating RLS policies...').start();

  try {
    const raw = await generateRLSPolicies(table, description, columns);
    spinner.stop();

    const sql = extractSQL(raw);
    const validation = validateSQL(sql);

    if (!validation.valid) {
      console.warn(chalk.yellow('\nWarnings:'));
      for (const err of validation.errors) {
        console.warn(chalk.yellow(`  ⚠ ${err}`));
      }
      console.warn('');
    }

    if (output) {
      await fs.outputFile(output, sql, 'utf-8');
      console.log(chalk.green(`✓ Policies written to ${output}`));
    } else {
      console.log('\n');
      highlightSQL(sql);
    }
  } catch (err) {
    spinner.fail('Failed to generate policies');
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(message));
    process.exit(1);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/generate.ts
git commit -m "feat: add generate command with interactive prompts and SQL highlighting"
```

---

### Task 9: Explain Command

**Files:**
- Create: `src/commands/explain.ts`

- [ ] **Step 1: Write src/commands/explain.ts**

```typescript
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { explainPolicy } from '../lib/openai';
import { ExplainOptions } from '../types/index';

export async function explainCommand(options: ExplainOptions): Promise<void> {
  let { sql } = options;

  if (!sql) {
    console.log(chalk.dim('Paste your SQL policy below, then press Enter twice:\n'));
    const answers = await inquirer.prompt([
      {
        type: 'editor',
        name: 'sql',
        message: 'SQL policy to explain:',
        validate: (v: string) => v.trim().length > 0 || 'SQL cannot be empty',
      },
    ]);
    sql = answers.sql.trim();
  }

  const spinner = ora('Analysing policy...').start();

  try {
    const explanation = await explainPolicy(sql);
    spinner.stop();
    console.log('\n' + explanation + '\n');
  } catch (err) {
    spinner.fail('Failed to explain policy');
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(message));
    process.exit(1);
  }
}
```

> **Note on `type: 'editor'`** — inquirer's editor prompt opens `$EDITOR` for multiline input. If the user doesn't have `$EDITOR` set, it may fail. As a fallback, the `--sql` flag accepts inline SQL from the command line.

- [ ] **Step 2: Commit**

```bash
git add src/commands/explain.ts
git commit -m "feat: add explain command"
```

---

### Task 10: CLI Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write src/index.ts**

```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import { generateCommand } from './commands/generate';
import { explainCommand } from './commands/explain';
import { listTemplates, useTemplate } from './commands/templates';

const program = new Command();

program
  .name('rls')
  .description('Generate Supabase Row Level Security policies from plain English')
  .version('0.1.0');

// ── generate ──────────────────────────────────────────────────────────────────
program
  .command('generate')
  .description('Generate RLS policies for a table from a plain-English description')
  .option('-t, --table <name>', 'Table name to generate policies for')
  .option('-d, --description <text>', 'Plain-English description of the access rules')
  .option('-c, --columns <list>', 'Comma-separated list of column names (optional context)')
  .option('-o, --output <file>', 'Write generated SQL to this file instead of stdout')
  .action(async (options) => {
    try {
      await generateCommand(options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      process.exit(1);
    }
  });

// ── explain ───────────────────────────────────────────────────────────────────
program
  .command('explain')
  .description('Explain what an existing RLS policy does in plain English')
  .option('-s, --sql <policy>', 'SQL policy string to explain (or omit to enter interactively)')
  .action(async (options) => {
    try {
      await explainCommand(options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      process.exit(1);
    }
  });

// ── templates ─────────────────────────────────────────────────────────────────
const templates = program
  .command('templates')
  .description('List or apply pre-built RLS policy templates');

templates
  .command('list')
  .description('List all available templates')
  .action(async () => {
    try {
      await listTemplates();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      process.exit(1);
    }
  });

templates
  .command('use')
  .description('Apply a template, replacing placeholder values with real names')
  .option('-u, --use <name>', 'Template name (see: rls templates list)')
  .option('-t, --table <name>', 'Replace YOUR_TABLE_NAME with this value')
  .option('--owner-column <col>', 'Replace YOUR_OWNER_COLUMN with this value')
  .option('-o, --output <file>', 'Write result to this file instead of stdout')
  .action(async (options) => {
    try {
      await useTemplate(options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire up CLI entry point with Commander"
```

---

### Task 11: Example Files

**Files:**
- Create: `examples/basic-blog.md`
- Create: `examples/multi-tenant-saas.md`
- Create: `examples/team-workspace.md`

- [ ] **Step 1: Create examples/basic-blog.md**

````markdown
# Example: Basic Blog

**Scenario:** A `posts` table where each user can only manage their own posts.
Published posts can be read by anyone.

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
````

- [ ] **Step 2: Create examples/multi-tenant-saas.md**

````markdown
# Example: Multi-Tenant SaaS

**Scenario:** A `projects` table in a SaaS app where each organisation can only
see and manage its own projects. Users belong to an organisation via a `profiles`
table.

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
  data jsonb,
  created_at timestamptz DEFAULT now()
);
```

## Running the command

```bash
rls generate \
  --table projects \
  --description "Users can only see and manage projects belonging to their own organisation. The user's organisation is stored in the profiles table." \
  --columns "id, org_id, name, data, created_at"
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
````

- [ ] **Step 3: Create examples/team-workspace.md**

````markdown
# Example: Team Workspace

**Scenario:** A `documents` table where access is restricted to members of the
team that owns the document. Teams and membership are managed via a `teams`
and `team_members` table.

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
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
```

## Complete workflow

**Step 1 — Generate policies:**

```bash
rls generate \
  --table documents \
  --description "Only team members can read, create, update, or delete documents. Membership is determined by the team_members table." \
  --columns "id, team_id, title, content, created_by, created_at" \
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
````

- [ ] **Step 4: Commit**

```bash
git add examples/
git commit -m "docs: add three example scenarios with commands and SQL output"
```

---

### Task 12: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

````markdown
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

**1. Generate policies for a table:**

```bash
rls generate \
  --table posts \
  --description "Users can only read, create, and delete their own posts. Anyone can read published posts."
```

**2. Get the SQL:**

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

**3. Save to a file and apply:**

```bash
rls generate --table posts --description "..." --output ./migrations/posts_rls.sql
# then paste into the Supabase SQL editor or run via supabase db push
```

## Commands

### `rls generate`

Generate RLS policies from a plain-English description.

```
Options:
  -t, --table <name>          Table name to generate policies for
  -d, --description <text>    Plain-English description of the access rules
  -c, --columns <list>        Comma-separated column names (optional — improves output)
  -o, --output <file>         Write SQL to a file instead of stdout
```

If `--table` or `--description` are omitted, you'll be prompted interactively.

### `rls explain`

Explain what an existing RLS policy does in plain English.

```
Options:
  -s, --sql <policy>   SQL policy to explain (omit to enter interactively via $EDITOR)
```

### `rls templates list`

List all available built-in templates.

### `rls templates use`

Apply a template, replacing placeholder table and column names.

```
Options:
  -u, --use <name>          Template name (see: rls templates list)
  -t, --table <name>        Replace YOUR_TABLE_NAME with this value
  --owner-column <col>      Replace YOUR_OWNER_COLUMN with this value
  -o, --output <file>       Write result to a file instead of stdout
```

## Templates

| Name | Description |
|------|-------------|
| `user-owns-row` | Users can only CRUD their own rows (via owner column = auth.uid()) |
| `public-read-auth-write` | Anyone can read; only authenticated users can write |
| `admin-full-access` | Admins (from a profiles table) have full access; users are read-only |
| `team-based-access` | Access restricted to rows belonging to the user's team (via team_members) |
| `row-level-tenant-isolation` | Multi-tenant isolation — users only see their own organisation's rows |

## Configuration

**Option 1 — Environment variable (recommended for CI):**

```bash
export OPENAI_API_KEY=sk-...
rls generate --table posts --description "..."
```

**Option 2 — Config file (for local use):**

On first run without the env var set, you'll be prompted for your API key. It's saved to `~/.rls-helper/config.json` for future use.

## Examples

- [Basic blog (posts table)](examples/basic-blog.md)
- [Multi-tenant SaaS (projects table)](examples/multi-tenant-saas.md)
- [Team workspace (documents table)](examples/team-workspace.md)

## License

MIT — see [LICENSE](LICENSE).
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with install, quick start, commands, templates, and examples"
```

---

### Task 13: Install, Compile, and Fix Errors

**Files:** No new files — this task resolves any type errors surfaced by the compiler.

- [ ] **Step 1: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 2: Run TypeScript compiler**

```bash
npx tsc
```

Expected: `dist/` directory created with compiled JS files, no errors.

- [ ] **Step 3: If compiler errors — common fixes**

**Error: `Cannot find module '../types/index.js'`**
In `src/lib/config.ts`, change the import path:
```typescript
// from
import { Config } from '../types/index.js';
// to
import { Config } from '../types/index';
```

**Error: `Module '"inquirer"' has no exported member ...`**
Confirm `inquirer@8` is installed (not v9). Check `node_modules/inquirer/package.json` version field. If v9 is present, run:
```bash
npm install inquirer@8
```

**Error: `Parameter 'v' implicitly has an 'any' type` in inquirer validate callbacks**
Add explicit string type annotation:
```typescript
validate: (v: string) => v.trim().length > 0 || 'Message',
```

**Error: `Object is possibly 'undefined'` on `response.choices[0]`**
Use optional chaining as already written: `response.choices[0]?.message?.content ?? ''`

**Error: `Cannot find name 'process'`**
Add `"lib": ["ES2020"]` to compilerOptions in `tsconfig.json` — `process` comes from `@types/node` which is already a devDep, but `skipLibCheck: true` should prevent this.

- [ ] **Step 4: Verify dist/ structure after successful compile**

```bash
ls dist/
# expected: commands/  index.js  index.d.ts  lib/  types/
ls dist/commands/
# expected: generate.js  explain.js  templates.js
```

- [ ] **Step 5: Commit dist/ exclusion (dist should not be committed)**

Ensure `.gitignore` has `dist/` (added in Task 1). Run:

```bash
git status
# dist/ should NOT appear in untracked files
```

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript compilation errors"
```

---

### Task 14: Git Init, Commit, and GitHub Publish

**Files:** No new files.

- [ ] **Step 1: Initialise git (if not already done)**

```bash
git init
git add -A
git status
# verify no dist/ or node_modules/ appear
```

- [ ] **Step 2: Create initial commit**

```bash
git commit -m "Initial commit: CLI tool for generating Supabase RLS policies from plain English"
```

- [ ] **Step 3: Create GitHub repo and push**

```bash
gh repo create supabase-rls-helper \
  --public \
  --description "CLI tool that generates Supabase Row Level Security policies from plain-English descriptions. Describe your access rules, get production-ready SQL instantly." \
  --source=. \
  --push
```

Expected output: GitHub repo URL printed, branch pushed.

- [ ] **Step 4: Add repository topics**

```bash
gh repo edit supabase-rls-helper \
  --add-topic supabase \
  --add-topic rls \
  --add-topic postgresql \
  --add-topic cli \
  --add-topic typescript \
  --add-topic security \
  --add-topic developer-tools
```

- [ ] **Step 5: Verify**

```bash
gh repo view supabase-rls-helper --web
```

The repository should be live and public with all topics applied.

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| package.json with exact fields | Task 1 |
| tsconfig.json settings | Task 1 |
| src/types/index.ts interfaces | Task 2 |
| src/lib/config.ts with getApiKey() | Task 3 |
| src/lib/openai.ts generateRLSPolicies + explainPolicy | Task 4 |
| src/lib/parser.ts extractSQL + validateSQL | Task 5 |
| All 5 SQL template files | Task 6 |
| src/commands/templates.ts | Task 7 |
| src/commands/generate.ts | Task 8 |
| src/commands/explain.ts | Task 9 |
| src/index.ts Commander wiring | Task 10 |
| examples/*.md with real scenarios | Task 11 |
| README.md with all required sections | Task 12 |
| npm install + npx tsc | Task 13 |
| git init + commit + gh repo create + gh repo edit | Task 14 |

All spec requirements covered.

### Potential issues flagged

1. **ESM/CJS compatibility** — explicitly handled by pinning chalk@4, ora@5, inquirer@8. Documented in Task 13 common fixes.
2. **`__dirname` in templates command** — `getTemplatesDir()` navigates from `dist/commands/` up two levels to reach `templates/`. This is correct for a globally installed npm package. When running with `ts-node` in dev, `__dirname` is `src/commands/` so the path resolves to `templates/` at project root — also correct.
3. **inquirer editor prompt** — requires `$EDITOR` env var. The `--sql` flag bypasses this. Documented in explain command note.
4. **Git init vs pre-existing git** — `git init` is safe to run on an already-initialised repo. Task 14 Step 1 handles both cases.
