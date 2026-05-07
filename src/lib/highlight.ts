import chalk from 'chalk';

const SQL_KEYWORDS = [
  'ALTER TABLE', 'ENABLE ROW LEVEL SECURITY', 'CREATE POLICY',
  'FOR SELECT', 'FOR INSERT', 'FOR UPDATE', 'FOR DELETE',
  'USING', 'WITH CHECK', 'EXISTS', 'SELECT', 'FROM', 'WHERE',
  'AND', 'OR', 'NOT', 'NULL', 'TRUE', 'FALSE',
];

export function highlightSQL(sql: string): void {
  const sorted = [...SQL_KEYWORDS].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    sorted.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'g'
  );
  console.log(sql.replace(pattern, (match) => chalk.blue(match)));
}
