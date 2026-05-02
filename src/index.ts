#!/usr/bin/env node

import { Command } from 'commander';
import { generateCommand } from './commands/generate';
import { explainCommand } from './commands/explain';
import { listTemplates, useTemplate } from './commands/templates';
import { configShowCommand, configSetCommand, configClearCommand } from './commands/config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('rls')
  .description('Generate Supabase Row Level Security policies from plain English')
  .version(version);

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

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
