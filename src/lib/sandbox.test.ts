import { describe, it, expect } from 'vitest';
import { verifyPolicies } from './sandbox';

describe('verifyPolicies', () => {
  it('passes a correctly-isolated user-owns-row policy with no findings', async () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "select own" ON posts FOR SELECT USING (user_id = auth.uid());
      CREATE POLICY "insert own" ON posts FOR INSERT WITH CHECK (user_id = auth.uid());
      CREATE POLICY "update own" ON posts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      CREATE POLICY "delete own" ON posts FOR DELETE USING (user_id = auth.uid());
    `;
    const report = await verifyPolicies(sql, 'posts');
    expect(report.supported).toBe(true);
    if (!report.supported) return;
    expect(report.pass).toBe(true);
    expect(report.findings.filter((f) => f.severity === 'critical')).toHaveLength(0);

    const select = report.probes.filter((p) => p.operation === 'select');
    expect(select.find((p) => p.identity === 'anon')?.detail).toBe('0 row(s) visible');
    expect(select.find((p) => p.identity === 'userA')?.detail).toBe('1 row(s) visible');
    expect(select.find((p) => p.identity === 'userB')?.detail).toBe('1 row(s) visible');
  }, 20000);

  it('catches a leak from a missing WITH CHECK on INSERT (impersonation succeeds)', async () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "select own" ON posts FOR SELECT USING (user_id = auth.uid());
      CREATE POLICY "insert anything" ON posts FOR INSERT WITH CHECK (true);
    `;
    const report = await verifyPolicies(sql, 'posts');
    expect(report.supported).toBe(true);
    if (!report.supported) return;
    expect(report.pass).toBe(false);
    expect(report.findings.some((f) => f.severity === 'critical' && f.message.includes('impersonation'))).toBe(true);
  }, 20000);

  it('confirms UPDATE with USING only correctly blocks reassignment — Postgres reuses USING as the implicit WITH CHECK', async () => {
    // This is a positive check on Postgres's own documented default: omitting
    // WITH CHECK on an UPDATE policy reuses USING for both read and write
    // scoping, so a row can't be reassigned outside that USING scope even
    // without an explicit WITH CHECK. Confirmed empirically before relying on it.
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "select own" ON posts FOR SELECT USING (user_id = auth.uid());
      CREATE POLICY "update own" ON posts FOR UPDATE USING (user_id = auth.uid());
    `;
    const report = await verifyPolicies(sql, 'posts');
    expect(report.supported).toBe(true);
    if (!report.supported) return;
    expect(report.findings.some((f) => f.message.includes('hijack'))).toBe(false);
    const reassign = report.probes.find((p) => p.identity === 'userA' && p.operation === 'updateReassign');
    expect(reassign?.allowed).toBe(false);
  }, 20000);

  it('skips a bare USING (true) policy — no owner column to build an identity probe around', async () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "select all" ON posts FOR SELECT USING (true);
    `;
    const report = await verifyPolicies(sql, 'posts');
    expect(report.supported).toBe(false);
    if (report.supported) return;
    expect(report.skipReason).toContain('role-based');
  });

  it('catches a data leak when a second, broader SELECT policy exposes every row', async () => {
    // The owner-scoped policy is fine on its own; a second, unrelated
    // permissive SELECT policy (true) ORs in and exposes everything —
    // exactly the kind of multi-policy interaction a static read can't
    // reliably catch but running the SQL for real does.
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "select own" ON posts FOR SELECT USING (user_id = auth.uid());
      CREATE POLICY "select all debug" ON posts FOR SELECT USING (true);
    `;
    const report = await verifyPolicies(sql, 'posts');
    expect(report.supported).toBe(true);
    if (!report.supported) return;
    expect(report.pass).toBe(false);
    expect(report.findings.some((f) => f.severity === 'critical' && f.message.includes('data leak'))).toBe(true);
  }, 20000);

  it('flags an over-restrictive policy that blocks the owner from seeing their own row', async () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "select nobody" ON posts FOR SELECT USING (user_id = '99999999-9999-9999-9999-999999999999'::uuid);
    `;
    const report = await verifyPolicies(sql, 'posts');
    expect(report.supported).toBe(true);
    if (!report.supported) return;
    expect(report.findings.some((f) => f.message.includes('overly restrictive'))).toBe(true);
  }, 20000);

  it('respects a public boolean column — public rows are not flagged as leaks', async () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "select own or published" ON posts FOR SELECT USING (user_id = auth.uid() OR published = true);
    `;
    const report = await verifyPolicies(sql, 'posts');
    expect(report.supported).toBe(true);
    if (!report.supported) return;
    expect(report.findings.filter((f) => f.severity === 'critical')).toHaveLength(0);
    const anonSelect = report.probes.find((p) => p.identity === 'anon' && p.operation === 'select');
    expect(anonSelect?.detail).toBe('1 row(s) visible'); // sees only the published (row-b) row
  }, 20000);

  it('skips a policy that references another table via a join subquery', async () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "team read" ON posts FOR SELECT USING (
        EXISTS (SELECT 1 FROM team_members WHERE team_members.team_id = posts.team_id AND team_members.user_id = auth.uid())
      );
    `;
    const report = await verifyPolicies(sql, 'posts');
    expect(report.supported).toBe(false);
    if (report.supported) return;
    expect(report.skipReason).toContain('team_members');
    expect(report.pass).toBe(true);
  });

  it('skips when there are no policies for the requested table', async () => {
    const report = await verifyPolicies('ALTER TABLE comments ENABLE ROW LEVEL SECURITY;', 'posts');
    expect(report.supported).toBe(false);
  });
});
