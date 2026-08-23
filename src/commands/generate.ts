import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import { generateRLSPolicies } from '../lib/openai';
import { extractSQL, validateSQL } from '../lib/parser';
import { GenerateOptions } from '../types';
import { highlightSQL } from '../lib/highlight';
import { verifyPolicies } from '../lib/sandbox';
import { printVerificationReport } from '../lib/verifyReport';
import { emitRegressionTests } from '../lib/testEmitter';

function deriveTestFilePath(outputPath: string): string {
  const ext = path.extname(outputPath);
  const base = ext ? outputPath.slice(0, -ext.length) : outputPath;
  return `${base}.rls.test.sql`;
}

export async function generateCommand(options: GenerateOptions): Promise<void> {
  let resolvedTable = options.table;
  let resolvedDescription = options.description;
  const { columns, output } = options;

  if (!resolvedTable || !resolvedDescription) {
    if (!process.stdout.isTTY) {
      console.error(chalk.red('Error: --table and --description flags are required in non-interactive environments'));
      process.exit(1);
    }
  }

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
    const raw = await generateRLSPolicies(resolvedTable!, resolvedDescription!, columns, options.model);

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

    if (options.verify) {
      const verifySpinner = ora('Verifying policies in a local sandbox...').start();
      const report = await verifyPolicies(sql, resolvedTable!);
      verifySpinner.stop();
      printVerificationReport(report, false);
    }

    if (options.emitTests) {
      const emitted = emitRegressionTests(sql, resolvedTable!);
      if (!emitted.supported) {
        console.log(chalk.yellow(`Skipped emitting regression tests: ${emitted.skipReason}\n`));
      } else if (output) {
        const testFile = deriveTestFilePath(output);
        await fs.outputFile(testFile, emitted.sql!, 'utf-8');
        console.log(chalk.green(`✓ Regression tests written to ${testFile}`));
      } else {
        console.log(chalk.dim('\n-- Regression tests --\n'));
        console.log(emitted.sql);
      }
    }
  } catch (err) {
    spinner.fail('Failed to generate policies');
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(message));
    process.exit(1);
  }
}
