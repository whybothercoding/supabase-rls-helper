import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build']);

/**
 * Resolves a list of file/directory paths into a flat, deduplicated list of
 * .sql files. Directories are walked recursively, skipping common build/VCS
 * directories. No glob dependency — just a plain recursive readdir.
 */
export function findSqlFiles(inputPaths: string[]): string[] {
  const results = new Set<string>();

  const visit = (target: string) => {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(path.basename(target))) return;
      for (const entry of fs.readdirSync(target)) {
        visit(path.join(target, entry));
      }
    } else if (stat.isFile() && target.toLowerCase().endsWith('.sql')) {
      results.add(path.resolve(target));
    }
  };

  for (const input of inputPaths) {
    if (!fs.existsSync(input)) {
      throw new Error(`Path not found: ${input}`);
    }
    visit(input);
  }

  return Array.from(results).sort();
}
