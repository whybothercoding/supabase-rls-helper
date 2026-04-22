import chalk from 'chalk';

const SQL_KEYWORDS = [
  'ALTER TABLE', 'ENABLE ROW LEVEL SECURITY', 'CREATE POLICY',
  'FOR SELECT', 'FOR INSERT', 'FOR UPDATE', 'FOR DELETE',
  'USING', 'WITH CHECK', 'EXISTS', 'SELECT', 'FROM', 'WHERE',
  'AND', 'OR', 'NOT', 'NULL', 'TRUE', 'FALSE',
];

export function highlightSQL(sql: string): void {
  let result = sql;
  for (const kw of SQL_KEYWORDS) {
    result = result.split(kw).join(chalk.blue(kw));
  }
  console.log(result);
}
