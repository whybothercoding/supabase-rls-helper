export function extractSQL(llmOutput: string): string {
  const fencePattern = /```(?:sql)?\s*([\s\S]*?)```/i;
  const match = llmOutput.match(fencePattern);
  if (match) {
    return match[1].trim();
  }
  return llmOutput.trim();
}

export function validateSQL(sql: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const upper = sql.toUpperCase();

  if (!upper.includes('ENABLE ROW LEVEL SECURITY')) {
    errors.push('Missing: ALTER TABLE ... ENABLE ROW LEVEL SECURITY');
  }

  if (!upper.includes('CREATE POLICY')) {
    errors.push('Missing: at least one CREATE POLICY statement');
  }

  let depth = 0;
  let hasUnmatchedClose = false;
  for (const char of sql) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth < 0) {
      errors.push('Unbalanced parentheses: found ) without matching (');
      hasUnmatchedClose = true;
      break;
    }
  }
  if (!hasUnmatchedClose && depth !== 0) {
    errors.push('Unbalanced parentheses: unclosed (');
  }

  return { valid: errors.length === 0, errors };
}
