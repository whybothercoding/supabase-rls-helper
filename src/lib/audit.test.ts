import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { auditSources, hasFindingAtOrAbove } from './audit';

function rule(findings: ReturnType<typeof auditSources>, name: string) {
  return findings.filter((f) => f.rule === name);
}

describe('auditSources — individual rules', () => {
  it('flags policies defined with no ENABLE ROW LEVEL SECURITY anywhere', () => {
    const sql = `CREATE POLICY "p" ON posts FOR SELECT USING (true);`;
    const findings = auditSources([{ sourceFile: 'a.sql', sql }]);
    expect(rule(findings, 'policy-without-rls')).toHaveLength(1);
    expect(rule(findings, 'policy-without-rls')[0].severity).toBe('critical');
  });

  it('flags policies defined after RLS was explicitly disabled', () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE posts DISABLE ROW LEVEL SECURITY;
      CREATE POLICY "p" ON posts FOR SELECT USING (true);
    `;
    const findings = auditSources([{ sourceFile: 'a.sql', sql }]);
    expect(rule(findings, 'policy-without-rls')).toHaveLength(1);
  });

  it('does not flag when RLS is enabled across a different file than the policy', () => {
    const sources = [
      { sourceFile: 'a.sql', sql: 'ALTER TABLE posts ENABLE ROW LEVEL SECURITY;' },
      { sourceFile: 'b.sql', sql: 'CREATE POLICY "p" ON posts FOR SELECT USING (true);' },
    ];
    expect(rule(auditSources(sources), 'policy-without-rls')).toHaveLength(0);
  });

  it('flags RLS enabled with zero policies', () => {
    const sql = 'ALTER TABLE posts ENABLE ROW LEVEL SECURITY;';
    const findings = auditSources([{ sourceFile: 'a.sql', sql }]);
    expect(rule(findings, 'rls-enabled-no-policies')).toHaveLength(1);
    expect(rule(findings, 'rls-enabled-no-policies')[0].severity).toBe('warning');
  });

  it('flags a FOR INSERT policy that (invalidly) uses USING instead of WITH CHECK', () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "p" ON posts FOR INSERT USING (user_id = auth.uid());
    `;
    const findings = auditSources([{ sourceFile: 'a.sql', sql }]);
    const found = rule(findings, 'insert-using-invalid');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('critical');
    expect(found[0].message).toContain('Postgres rejects this at deploy time');
  });

  it('flags an INSERT policy with neither USING nor WITH CHECK as a no-op (Postgres denies everything, it does not default to permissive)', () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "p" ON posts FOR INSERT;
    `;
    const findings = auditSources([{ sourceFile: 'a.sql', sql }]);
    const found = rule(findings, 'insert-noop-without-check');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('warning');
  });

  it('does not flag an INSERT policy that has WITH CHECK', () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "p" ON posts FOR INSERT WITH CHECK (user_id = auth.uid());
    `;
    const findings = auditSources([{ sourceFile: 'a.sql', sql }]);
    expect(rule(findings, 'insert-using-invalid')).toHaveLength(0);
    expect(rule(findings, 'insert-noop-without-check')).toHaveLength(0);
  });

  it('does not flag an UPDATE policy with USING but no WITH CHECK — Postgres reuses USING as the implicit check', () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "p" ON posts FOR UPDATE USING (user_id = auth.uid());
    `;
    const findings = auditSources([{ sourceFile: 'a.sql', sql }]);
    expect(findings).toHaveLength(0);
  });

  it('flags WITH CHECK (true) on a write policy with no TO clause', () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "p" ON posts FOR INSERT WITH CHECK (true);
    `;
    const findings = auditSources([{ sourceFile: 'a.sql', sql }]);
    expect(rule(findings, 'unrestricted-write')).toHaveLength(1);
  });

  it('does not flag WITH CHECK (true) on a write policy scoped with TO', () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "p" ON posts FOR INSERT TO service_role WITH CHECK (true);
    `;
    expect(rule(auditSources([{ sourceFile: 'a.sql', sql }]), 'unrestricted-write')).toHaveLength(0);
  });

  it('does not flag USING (true) on a SELECT policy — public read is a legitimate pattern', () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "p" ON posts FOR SELECT USING (true);
    `;
    const findings = auditSources([{ sourceFile: 'a.sql', sql }]);
    expect(findings).toHaveLength(0);
  });
});

describe('auditSources — shipped templates', () => {
  const templatesDir = path.join(__dirname, '..', '..', 'templates');
  const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.sql'));

  it('produces zero findings against every shipped template once placeholders are filled in', () => {
    for (const file of files) {
      const raw = fs.readFileSync(path.join(templatesDir, file), 'utf-8');
      const sql = raw.split('YOUR_TABLE_NAME').join('posts').split('YOUR_OWNER_COLUMN').join('user_id');
      const findings = auditSources([{ sourceFile: file, sql }]);
      expect(findings, `${file} should audit clean:\n${JSON.stringify(findings, null, 2)}`).toHaveLength(0);
    }
  });
});

describe('hasFindingAtOrAbove', () => {
  it('respects severity ranking', () => {
    const findings = [{ rule: 'x', severity: 'warning' as const, table: 't', message: 'm' }];
    expect(hasFindingAtOrAbove(findings, 'warning')).toBe(true);
    expect(hasFindingAtOrAbove(findings, 'critical')).toBe(false);
    expect(hasFindingAtOrAbove(findings, 'info')).toBe(true);
  });
});
