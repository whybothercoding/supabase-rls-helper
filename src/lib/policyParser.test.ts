import { describe, it, expect } from 'vitest';
import { parseAlterRls, parsePolicy } from './policyParser';

describe('parseAlterRls', () => {
  it('parses ENABLE ROW LEVEL SECURITY', () => {
    const result = parseAlterRls('ALTER TABLE posts ENABLE ROW LEVEL SECURITY');
    expect(result).toEqual({ table: 'posts', enabled: true });
  });

  it('parses DISABLE ROW LEVEL SECURITY', () => {
    const result = parseAlterRls('ALTER TABLE posts DISABLE ROW LEVEL SECURITY');
    expect(result).toEqual({ table: 'posts', enabled: false });
  });

  it('handles IF EXISTS and a schema-qualified table', () => {
    const result = parseAlterRls('ALTER TABLE IF EXISTS public.posts ENABLE ROW LEVEL SECURITY');
    expect(result).toEqual({ table: 'public.posts', enabled: true });
  });

  it('normalizes unquoted identifiers to lowercase', () => {
    const result = parseAlterRls('ALTER TABLE POSTS ENABLE ROW LEVEL SECURITY');
    expect(result?.table).toBe('posts');
  });

  it('preserves case for quoted identifiers', () => {
    const result = parseAlterRls('ALTER TABLE "Posts" ENABLE ROW LEVEL SECURITY');
    expect(result?.table).toBe('Posts');
  });

  it('returns null for unrelated statements', () => {
    expect(parseAlterRls('SELECT 1')).toBeNull();
    expect(parseAlterRls('ALTER TABLE posts ADD COLUMN x text')).toBeNull();
  });
});

describe('parsePolicy', () => {
  it('parses a full user-owns-row style policy', () => {
    const stmt = `CREATE POLICY "Users can view own rows"
      ON posts
      FOR SELECT
      USING (user_id = auth.uid())`;
    const result = parsePolicy(stmt);
    expect(result).toMatchObject({
      name: 'Users can view own rows',
      table: 'posts',
      command: 'SELECT',
      roles: [],
      using: 'user_id = auth.uid()',
      withCheck: undefined,
    });
  });

  it('parses USING and WITH CHECK together', () => {
    const stmt = `CREATE POLICY "p" ON posts FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())`;
    const result = parsePolicy(stmt);
    expect(result?.using).toBe('user_id = auth.uid()');
    expect(result?.withCheck).toBe('user_id = auth.uid()');
    expect(result?.command).toBe('UPDATE');
  });

  it('defaults command to ALL when FOR is omitted', () => {
    const result = parsePolicy('CREATE POLICY "p" ON posts USING (true)');
    expect(result?.command).toBe('ALL');
  });

  it('parses a TO clause with multiple roles', () => {
    const stmt = 'CREATE POLICY "p" ON posts FOR SELECT TO authenticated, service_role USING (true)';
    const result = parsePolicy(stmt);
    expect(result?.roles).toEqual(['authenticated', 'service_role']);
  });

  it('parses nested EXISTS subqueries in USING without truncating', () => {
    const stmt = `CREATE POLICY "p" ON posts FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM team_members
          WHERE team_members.team_id = posts.team_id
            AND team_members.user_id = auth.uid()
        )
      )`;
    const result = parsePolicy(stmt);
    expect(result?.using).toContain('EXISTS');
    expect(result?.using).toContain('team_members.user_id = auth.uid()');
  });

  it('handles a policy with only WITH CHECK (insert-style)', () => {
    const stmt = 'CREATE POLICY "p" ON posts FOR INSERT WITH CHECK (user_id = auth.uid())';
    const result = parsePolicy(stmt);
    expect(result?.using).toBeUndefined();
    expect(result?.withCheck).toBe('user_id = auth.uid()');
  });

  it('returns null for non-policy statements', () => {
    expect(parsePolicy('ALTER TABLE posts ENABLE ROW LEVEL SECURITY')).toBeNull();
  });
});
