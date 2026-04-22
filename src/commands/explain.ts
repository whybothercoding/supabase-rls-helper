import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { explainPolicy } from '../lib/openai';
import { ExplainOptions } from '../types';

export async function explainCommand(options: ExplainOptions): Promise<void> {
  let { sql } = options;

  if (!sql) {
    if (!process.stdout.isTTY) {
      console.error(chalk.red('Error: --sql flag is required in non-interactive environments'));
      process.exit(1);
    }
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
    const explanation = await explainPolicy(sql!);

    if (!explanation.trim()) {
      spinner.fail('No response from OpenAI');
      process.exit(1);
    }

    spinner.succeed('Done');
    console.log('\n' + explanation + '\n');
  } catch (err) {
    spinner.fail('Failed to explain policy');
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(message));
    process.exit(1);
  }
}
