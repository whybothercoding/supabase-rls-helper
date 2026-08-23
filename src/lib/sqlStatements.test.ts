import { describe, it, expect } from 'vitest';
import { computeInertMask, extractParenGroup, splitStatements, stripComments } from './sqlStatements';

describe('splitStatements', () => {
  it('splits simple statements on semicolons', () => {
    const sql = 'SELECT 1; SELECT 2;';
    expect(splitStatements(sql)).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('ignores semicolons inside string literals', () => {
    const sql = "INSERT INTO t (a) VALUES ('a;b'); SELECT 1;";
    expect(splitStatements(sql)).toEqual(["INSERT INTO t (a) VALUES ('a;b')", 'SELECT 1']);
  });

  it('ignores semicolons inside parens', () => {
    const sql = 'CREATE POLICY p ON t USING (EXISTS (SELECT 1 WHERE a = 1)); SELECT 2;';
    expect(splitStatements(sql)).toEqual([
      'CREATE POLICY p ON t USING (EXISTS (SELECT 1 WHERE a = 1))',
      'SELECT 2',
    ]);
  });

  it('ignores semicolons inside dollar-quoted bodies', () => {
    const sql = "CREATE FUNCTION f() RETURNS void AS $$ SELECT 1; SELECT 2; $$ LANGUAGE sql; SELECT 3;";
    expect(splitStatements(sql)).toEqual([
      "CREATE FUNCTION f() RETURNS void AS $$ SELECT 1; SELECT 2; $$ LANGUAGE sql",
      'SELECT 3',
    ]);
  });

  it('ignores semicolons inside tagged dollar-quoted bodies', () => {
    const sql = 'CREATE FUNCTION f() AS $body$ a; b; $body$ LANGUAGE sql; SELECT 1;';
    expect(splitStatements(sql)).toEqual([
      'CREATE FUNCTION f() AS $body$ a; b; $body$ LANGUAGE sql',
      'SELECT 1',
    ]);
  });

  it('ignores a semicolon in a line comment (comment text is preserved — callers strip separately)', () => {
    const sql = '-- do this; not that\nSELECT 1;';
    expect(splitStatements(sql)).toEqual(['-- do this; not that\nSELECT 1']);
  });

  it('combined with stripComments, drops the comment entirely', () => {
    const sql = '-- do this; not that\nSELECT 1;';
    expect(splitStatements(stripComments(sql))).toEqual(['SELECT 1']);
  });

  it('drops empty statements from doubled semicolons', () => {
    expect(splitStatements('SELECT 1;;SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('handles no trailing semicolon', () => {
    expect(splitStatements('SELECT 1')).toEqual(['SELECT 1']);
  });
});

describe('extractParenGroup', () => {
  it('extracts a simple balanced group', () => {
    const sql = 'USING (user_id = auth.uid())';
    const result = extractParenGroup(sql, sql.indexOf('('));
    expect(result?.body).toBe('user_id = auth.uid()');
  });

  it('extracts nested parens correctly', () => {
    const sql = 'USING (EXISTS (SELECT 1 FROM t WHERE (a = 1)))';
    const result = extractParenGroup(sql, sql.indexOf('('));
    expect(result?.body).toBe('EXISTS (SELECT 1 FROM t WHERE (a = 1))');
  });

  it('ignores an unbalanced paren inside a string literal', () => {
    const sql = "USING (a = '(' AND b = 1)";
    const result = extractParenGroup(sql, sql.indexOf('('));
    expect(result?.body).toBe("a = '(' AND b = 1");
  });

  it('returns null when there is no opening paren', () => {
    expect(extractParenGroup('USING true', 6)).toBeNull();
  });

  it('skips leading whitespace before the opening paren', () => {
    const sql = 'USING   (true)';
    const result = extractParenGroup(sql, 'USING'.length);
    expect(result?.body).toBe('true');
  });
});

describe('stripComments', () => {
  it('removes line comments', () => {
    expect(stripComments('SELECT 1; -- trailing note')).toBe('SELECT 1; ');
  });

  it('removes block comments', () => {
    expect(stripComments('SELECT /* mid */ 1;')).toBe('SELECT  1;');
  });

  it('leaves string contents that look like comments untouched', () => {
    expect(stripComments("SELECT '-- not a comment';")).toBe("SELECT '-- not a comment';");
  });
});

describe('computeInertMask', () => {
  it('flags string and comment ranges, leaves code unflagged', () => {
    const sql = "a 'b' c";
    const mask = computeInertMask(sql);
    expect(Array.from(mask)).toEqual([0, 0, 1, 1, 1, 0, 0]);
  });
});
