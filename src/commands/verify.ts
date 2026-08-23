import * as fs from 'fs-extra';
import chalk from 'chalk';
import { verifyPolicies } from '../lib/sandbox';
import { printVerificationReport } from '../lib/verifyReport';
import { VerifyOptions } from '../types';

export async function verifyCommand(options: VerifyOptions): Promise<void> {
  if (!options.file || !options.table) {
    console.error(chalk.red('Error: --file and --table are both required'));
    process.exit(1);
  }
  if (!fs.existsSync(options.file)) {
    console.error(chalk.red(`Error: file not found: ${options.file}`));
    process.exit(1);
  }

  const sql = await fs.readFile(options.file, 'utf-8');
  const report = await verifyPolicies(sql, options.table);
  printVerificationReport(report, !!options.json);

  if (report.supported && !report.pass) {
    process.exit(1);
  }
}
