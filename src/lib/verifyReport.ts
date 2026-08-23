import chalk from 'chalk';
import { VerificationReport } from '../types';

export function printVerificationReport(report: VerificationReport, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!report.supported) {
    console.log(chalk.yellow(`\nSkipped empirical verification for "${report.table}": ${report.skipReason}`));
    console.log(chalk.dim('(`rls audit` still applies structural checks regardless.)\n'));
    return;
  }

  console.log(chalk.dim(`\nVerifying "${report.table}" in a local Postgres sandbox (owner column: ${report.ownerColumn})...\n`));

  for (const probe of report.probes) {
    const icon = probe.allowed ? chalk.green('✓') : chalk.dim('·');
    console.log(`  ${icon} ${probe.identity.padEnd(6)} ${probe.operation.padEnd(15)} ${probe.detail}`);
  }
  console.log('');

  if (report.findings.length === 0) {
    console.log(chalk.green('✓ No isolation issues found.\n'));
  } else {
    for (const finding of report.findings) {
      const color = finding.severity === 'critical' ? chalk.red : chalk.yellow;
      const icon = finding.severity === 'critical' ? '✖' : '⚠';
      console.log(`  ${color(icon)} ${color(`[${finding.severity}]`)} ${finding.message}`);
    }
    console.log('');
  }

  console.log(report.pass ? chalk.green.bold('PASS\n') : chalk.red.bold('FAIL\n'));
}
