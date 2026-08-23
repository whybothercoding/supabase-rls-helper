import * as fs from 'fs-extra';
import chalk from 'chalk';
import { auditSources, hasFindingAtOrAbove } from '../lib/audit';
import { findSqlFiles } from '../lib/fileWalk';
import { AuditFinding, AuditOptions, FindingSeverity } from '../types';

const SEVERITY_ICON: Record<FindingSeverity, string> = {
  critical: '✖',
  warning: '⚠',
  info: 'ℹ',
};

const SEVERITY_COLOR: Record<FindingSeverity, (s: string) => string> = {
  critical: chalk.red,
  warning: chalk.yellow,
  info: chalk.dim,
};

function summarize(findings: AuditFinding[]): Record<FindingSeverity, number> {
  const summary: Record<FindingSeverity, number> = { critical: 0, warning: 0, info: 0 };
  for (const f of findings) summary[f.severity]++;
  return summary;
}

export async function auditCommand(options: AuditOptions): Promise<void> {
  const paths = options.paths && options.paths.length > 0 ? options.paths : ['.'];
  const failOn: FindingSeverity = options.failOn ?? 'critical';

  let files: string[];
  try {
    files = findSqlFiles(paths);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }

  if (files.length === 0) {
    console.log(chalk.yellow('No .sql files found to audit.'));
    return;
  }

  const sources = files.map((sourceFile) => ({
    sourceFile,
    sql: fs.readFileSync(sourceFile, 'utf-8'),
  }));

  const findings = auditSources(sources);
  const summary = summarize(findings);

  if (options.json) {
    console.log(JSON.stringify({ findings, summary, filesScanned: files.length }, null, 2));
  } else {
    console.log(chalk.dim(`\nAuditing ${files.length} SQL file(s)...\n`));

    if (findings.length === 0) {
      console.log(chalk.green('✓ No RLS issues found.\n'));
    } else {
      const byFile = new Map<string, AuditFinding[]>();
      for (const finding of findings) {
        const key = finding.sourceFile ?? '(unknown source)';
        if (!byFile.has(key)) byFile.set(key, []);
        byFile.get(key)!.push(finding);
      }

      for (const [file, fileFindings] of byFile) {
        console.log(chalk.bold(file));
        for (const finding of fileFindings) {
          const color = SEVERITY_COLOR[finding.severity];
          console.log(`  ${color(SEVERITY_ICON[finding.severity])} ${color(`[${finding.severity}]`)} ${finding.rule} — ${finding.message}`);
        }
        console.log('');
      }

      console.log(
        chalk.bold(
          `Summary: ${summary.critical} critical, ${summary.warning} warning, ${summary.info} info across ${files.length} file(s).\n`
        )
      );
    }
  }

  if (hasFindingAtOrAbove(findings, failOn)) {
    process.exit(1);
  }
}
