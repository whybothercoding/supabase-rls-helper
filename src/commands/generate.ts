import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import { generateRLSPolicies } from '../lib/openai';
import { extractSQL, validateSQL } from '../lib/parser';
import { GenerateOptions } from '../types';
import { highlightSQL } from '../lib/highlight';

export async function generateCommand(options: GenerateOptions): Promise<void> {
  let resolvedTable = options.table;
  let resolvedDescription = options.description;
  const { columns, output } = options;

  if (!resolvedTable) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'table',
        message: 'Table name:',
        validate: (v: string) => v.trim().length > 0 || 'Table name is required',
      },
    ]);
    resolvedTable = answers.table.trim();
  }

  if (!resolvedDescription) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Describe the access rules (plain English):',
        validate: (v: string) => v.trim().length > 0 || 'Description is required',
      },
    ]);
    resolvedDescription = answers.description.trim();
  }

  const spinner = ora('Generating RLS policies...').start();

  try {
    const raw = await generateRLSPolicies(resolvedTable!, resolvedDescription!, columns);

    if (!raw.trim()) {
      spinner.fail('No response from OpenAI');
      process.exit(1);
    }

    spinner.succeed('Policies generated');

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
