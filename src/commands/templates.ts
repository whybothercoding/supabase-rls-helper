import * as path from 'path';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import { TemplateOptions } from '../types';
import { highlightSQL } from '../lib/highlight';

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
    description: "Admins have full access; regular users are read-only",
  },
  {
    name: 'team-based-access',
    file: 'team-based-access.sql',
    description: "Access restricted to rows belonging to the user's team",
  },
  {
    name: 'row-level-tenant-isolation',
    file: 'row-level-tenant-isolation.sql',
    description: 'Multi-tenant isolation by organisation_id',
  },
];

function getTemplatesDir(): string {
  return path.join(__dirname, '..', '..', 'templates');
}


export async function listTemplates(): Promise<void> {
  console.log(chalk.bold('\nAvailable RLS templates:\n'));
  const nameWidth = 30;
  console.log(chalk.dim(`  ${'Name'.padEnd(nameWidth)}Description`));
  console.log(chalk.dim('  ' + '─'.repeat(70)));
  for (const t of templatesList) {
    console.log(`  ${chalk.cyan(t.name.padEnd(nameWidth))}${t.description}`);
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
    console.error(chalk.red(`Error: Unknown template "${options.use}"`));
    console.error(`Run ${chalk.cyan('rls templates list')} to see available templates.`);
    process.exit(1);
  }

  const templatePath = path.join(getTemplatesDir(), template.file);
  if (!fs.existsSync(templatePath)) {
    console.error(chalk.red(`Error: Template file not found at ${templatePath}`));
    process.exit(1);
  }

  let sql = await fs.readFile(templatePath, 'utf-8');

  if (options.table) {
    sql = sql.split('YOUR_TABLE_NAME').join(options.table);
  }
  if (options.ownerColumn) {
    sql = sql.split('YOUR_OWNER_COLUMN').join(options.ownerColumn);
  }

  if (options.table && !sql.includes(options.table)) {
    console.warn(chalk.yellow('Warning: YOUR_TABLE_NAME placeholder was not found in this template.'));
  }

  if (options.output) {
    await fs.outputFile(options.output, sql, 'utf-8');
    console.log(chalk.green(`✓ Template written to ${options.output}`));
  } else {
    highlightSQL(sql);
  }
}
