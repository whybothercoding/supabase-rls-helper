import { describe, it, expect } from 'vitest';
import { extractSQL, validateSQL } from './parser';

describe('extractSQL', () => {
  it('returns raw SQL when no code fence is present', () => {
    const input = 'ALTER TABLE t ENABLE ROW LEVEL SECURITY;';
    expect(extractSQL(input)).toBe('ALTER TABLE t ENABLE ROW LEVEL SECURITY;');
  });

  it('extracts SQL from a ```sql fence', () => {
    const input = '```sql\nALTER TABLE t ENABLE ROW LEVEL SECURITY;\n```';
    expect(extractSQL(input)).toBe('ALTER TABLE t ENABLE ROW LEVEL SECURITY;');
  });

  it('extracts SQL from a plain ``` fence', () => {
    const input = '```\nALTER TABLE t ENABLE ROW LEVEL SECURITY;\n```';
    expect(extractSQL(input)).toBe('ALTER TABLE t ENABLE ROW LEVEL SECURITY;');
  });

  it('trims leading and trailing whitespace', () => {
    const input = '   SELECT 1;   ';
    expect(extractSQL(input)).toBe('SELECT 1;');
  });
});

describe('validateSQL', () => {
  const VALID_SQL = [
    'ALTER TABLE posts ENABLE ROW LEVEL SECURITY;',
    'CREATE POLICY "test" ON posts FOR SELECT USING (true);',
  ].join('\n');

  it('returns valid for correct RLS SQL', () => {
    const result = validateSQL(VALID_SQL);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports missing ENABLE ROW LEVEL SECURITY', () => {
    const sql = 'CREATE POLICY "test" ON posts FOR SELECT USING (true);';
    const result = validateSQL(sql);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing: ALTER TABLE ... ENABLE ROW LEVEL SECURITY');
  });

  it('reports missing CREATE POLICY', () => {
    const sql = 'ALTER TABLE posts ENABLE ROW LEVEL SECURITY;';
    const result = validateSQL(sql);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing: at least one CREATE POLICY statement');
  });

  it('reports unclosed parenthesis', () => {
    const sql = [
      'ALTER TABLE t ENABLE ROW LEVEL SECURITY;',
      'CREATE POLICY "p" ON t FOR SELECT USING (user_id = auth.uid(;',
    ].join('\n');
    const result = validateSQL(sql);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unbalanced'))).toBe(true);
  });

  it('reports extra closing parenthesis without double-reporting', () => {
    const sql = [
      'ALTER TABLE t ENABLE ROW LEVEL SECURITY;',
      'CREATE POLICY "p" ON t FOR SELECT USING (true));',
    ].join('\n');
    const result = validateSQL(sql);
    expect(result.valid).toBe(false);
    const parenErrors = result.errors.filter((e) => e.includes('Unbalanced'));
    expect(parenErrors).toHaveLength(1);
    expect(parenErrors[0]).toContain('found ) without matching (');
  });

  it('reports both missing-RLS and missing-policy as separate errors', () => {
    const result = validateSQL('SELECT 1;');
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
