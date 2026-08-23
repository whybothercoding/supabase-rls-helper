import { describe, it, expect } from 'vitest';
import { inferSandboxSchema } from './schemaInference';
import { parsePolicy } from './policyParser';

function policiesFor(statements: string[]) {
  return statements.map((s) => {
    const p = parsePolicy(s);
    if (!p) throw new Error(`fixture statement did not parse as a policy: ${s}`);
    return p;
  });
}

describe('inferSandboxSchema', () => {
  it('detects a simple owner column with no other columns', () => {
    const policies = policiesFor(['CREATE POLICY "p" ON posts FOR SELECT USING (user_id = auth.uid())']);
    const result = inferSandboxSchema(policies, 'posts');
    expect(result.supported).toBe(true);
    if (result.supported) {
      expect(result.ownerColumn).toBe('user_id');
      expect(result.columns.user_id).toBe('uuid');
    }
  });

  it('detects a boolean-ish column alongside the owner column', () => {
    const policies = policiesFor([
      'CREATE POLICY "p" ON posts FOR SELECT USING (published = true OR user_id = auth.uid())',
    ]);
    const result = inferSandboxSchema(policies, 'posts');
    expect(result.supported).toBe(true);
    if (result.supported) {
      expect(result.ownerColumn).toBe('user_id');
      expect(result.columns.published).toBe('boolean');
    }
  });

  it('resolves a self-qualified column reference (table.column)', () => {
    const policies = policiesFor(['CREATE POLICY "p" ON posts FOR SELECT USING (posts.user_id = auth.uid())']);
    const result = inferSandboxSchema(policies, 'posts');
    expect(result.supported).toBe(true);
    if (result.supported) expect(result.ownerColumn).toBe('user_id');
  });

  it('is case-insensitive when matching the target table for self-qualification', () => {
    const policies = policiesFor(['CREATE POLICY "p" ON Posts FOR SELECT USING (Posts.user_id = auth.uid())']);
    const result = inferSandboxSchema(policies, 'posts');
    expect(result.supported).toBe(true);
  });

  it('flags an external table reference via a join subquery as unsupported', () => {
    const policies = policiesFor([
      `CREATE POLICY "p" ON posts FOR SELECT USING (
        EXISTS (SELECT 1 FROM team_members WHERE team_members.team_id = posts.team_id AND team_members.user_id = auth.uid())
      )`,
    ]);
    const result = inferSandboxSchema(policies, 'posts');
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toContain('team_members');
  });

  it('flags a role-based policy with no owner column as unsupported', () => {
    const policies = policiesFor(["CREATE POLICY \"p\" ON posts FOR INSERT WITH CHECK (auth.role() = 'authenticated')"]);
    const result = inferSandboxSchema(policies, 'posts');
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toContain('role-based');
  });

  it('flags ambiguous ownership when multiple owner-like columns are found', () => {
    const policies = policiesFor([
      'CREATE POLICY "p" ON posts FOR SELECT USING (user_id = auth.uid() OR team_id = auth.uid())',
    ]);
    const result = inferSandboxSchema(policies, 'posts');
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toContain('ambiguous');
  });

  it('does not misidentify a function call as a column', () => {
    const policies = policiesFor(['CREATE POLICY "p" ON posts FOR SELECT USING (user_id = auth.uid() AND now() > created_at)']);
    const result = inferSandboxSchema(policies, 'posts');
    expect(result.supported).toBe(true);
    if (result.supported) {
      expect(result.columns.now).toBeUndefined();
    }
  });

  it('always adds a scratch "note" text column for update probes', () => {
    const policies = policiesFor(['CREATE POLICY "p" ON posts FOR SELECT USING (user_id = auth.uid())']);
    const result = inferSandboxSchema(policies, 'posts');
    expect(result.supported).toBe(true);
    if (result.supported) expect(result.columns.note).toBe('text');
  });
});
