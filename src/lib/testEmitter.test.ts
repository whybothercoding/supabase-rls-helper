import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { emitRegressionTests } from './testEmitter';

describe('emitRegressionTests — generation', () => {
  it('skips when the policy pattern is unsupported', () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "team read" ON posts FOR SELECT USING (
        EXISTS (SELECT 1 FROM team_members WHERE team_members.team_id = posts.team_id)
      );
    `;
    const result = emitRegressionTests(sql, 'posts');
    expect(result.supported).toBe(false);
    expect(result.skipReason).toContain('team_members');
  });

  it('emits a script wrapped in BEGIN/ROLLBACK with one probe block per identity', () => {
    const sql = `
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "select own" ON posts FOR SELECT USING (user_id = auth.uid());
    `;
    const result = emitRegressionTests(sql, 'posts');
    expect(result.supported).toBe(true);
    expect(result.sql).toContain('BEGIN;');
    expect(result.sql).toContain('ROLLBACK;');
    expect(result.sql).toContain('SET LOCAL ROLE anon;');
    expect(result.sql).toContain('SET LOCAL ROLE authenticated;');
    expect(result.sql).toMatch(/Probe: anon/);
    expect(result.sql).toMatch(/Probe: userA/);
    expect(result.sql).toMatch(/Probe: userB/);
  });
});

// Proves the emitted SQL is not just plausible-looking text — it's valid,
// executable Postgres. Builds real `anon`/`authenticated` roles (matching
// what the emitted script assumes a live Supabase project already has) and
// runs the script as-is via PGlite.
describe('emitRegressionTests — the emitted SQL actually runs correctly', () => {
  async function setupDb(policySql: string) {
    const db = new PGlite();
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
      $$;
      CREATE TABLE posts (id serial primary key, user_id uuid, published boolean not null default false);
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON posts TO anon, authenticated;
      GRANT USAGE ON SEQUENCE posts_id_seq TO anon, authenticated;
    `);
    await db.exec(policySql);
    return db;
  }

  it('passes (no exception) against a correctly isolated policy', async () => {
    const policySql = `CREATE POLICY "select own" ON posts FOR SELECT USING (user_id = auth.uid());`;
    const db = await setupDb(policySql);
    const result = emitRegressionTests(`ALTER TABLE posts ENABLE ROW LEVEL SECURITY; ${policySql}`, 'posts');
    expect(result.supported).toBe(true);
    await expect(db.exec(result.sql as string)).resolves.toBeDefined();
    await db.close();
  }, 20000);

  it('raises an exception against a policy that leaks another user\'s row', async () => {
    const policySql = `CREATE POLICY "select all" ON posts FOR SELECT USING (true);`;
    const db = await setupDb(policySql);
    // Give it an owner column to infer against via a second, narrower policy —
    // the broad USING (true) policy ORs in and leaks everything.
    const ownerPolicy = `CREATE POLICY "select own too" ON posts FOR SELECT USING (user_id = auth.uid());`;
    await db.exec(ownerPolicy);
    const result = emitRegressionTests(
      `ALTER TABLE posts ENABLE ROW LEVEL SECURITY; ${ownerPolicy} ${policySql}`,
      'posts'
    );
    expect(result.supported).toBe(true);
    await expect(db.exec(result.sql as string)).rejects.toThrow(/FAIL/);
    await db.close();
  }, 20000);

  it('respects a public boolean column — a published row is not a leak', async () => {
    const policySql = `CREATE POLICY "select own or published" ON posts FOR SELECT USING (user_id = auth.uid() OR published = true);`;
    const db = await setupDb(policySql);
    const result = emitRegressionTests(
      `ALTER TABLE posts ENABLE ROW LEVEL SECURITY; ${policySql}`,
      'posts'
    );
    expect(result.supported).toBe(true);
    await expect(db.exec(result.sql as string)).resolves.toBeDefined();
    await db.close();
  }, 20000);
});
