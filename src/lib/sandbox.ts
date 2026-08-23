import { PGlite } from '@electric-sql/pglite';
import { collectTableAudits } from './audit';
import { ColumnType, inferSandboxSchema } from './schemaInference';
import { ProbeIdentity, ProbeOperation, ProbeResult, VerificationFinding, VerificationReport } from '../types';

const USER_A_ID = '11111111-1111-1111-1111-111111111111';
const USER_B_ID = '22222222-2222-2222-2222-222222222222';

interface Identity {
  key: ProbeIdentity;
  role: string;
  uuid: string | null;
}

const IDENTITIES: Identity[] = [
  { key: 'anon', role: 'rls_probe_anon', uuid: null },
  { key: 'userA', role: 'rls_probe_a', uuid: USER_A_ID },
  { key: 'userB', role: 'rls_probe_b', uuid: USER_B_ID },
];

function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function columnDDL(name: string, type: ColumnType): string {
  if (type === 'uuid') return `${q(name)} uuid`;
  if (type === 'boolean') return `${q(name)} boolean not null default false`;
  return `${q(name)} text default ''`;
}

function skip(table: string, reason: string): VerificationReport {
  return { supported: false, skipReason: reason, table, probes: [], findings: [], pass: true };
}

async function beginAs(db: PGlite, identity: Identity): Promise<void> {
  await db.query('BEGIN');
  await db.query(`SET LOCAL ROLE ${identity.role}`);
  if (identity.uuid) {
    const claims = JSON.stringify({ sub: identity.uuid, role: 'authenticated' });
    await db.query(`SET LOCAL request.jwt.claims = '${claims}'`);
  }
}

interface RawQueryResult {
  rows: Array<Record<string, unknown>>;
  affectedRows?: number;
}

async function runProbe(
  db: PGlite,
  identity: Identity,
  operation: ProbeOperation,
  run: () => Promise<RawQueryResult>
): Promise<{ result: ProbeResult; rows: Array<Record<string, unknown>> }> {
  await beginAs(db, identity);
  let allowed = false;
  let detail: string;
  let rows: Array<Record<string, unknown>> = [];
  try {
    const res = await run();
    rows = res.rows ?? [];
    allowed = operation === 'select' ? true : (res.affectedRows ?? rows.length) > 0;
    detail = operation === 'select' ? `${rows.length} row(s) visible` : allowed ? 'succeeded' : 'blocked (0 rows affected)';
  } catch (err) {
    allowed = false;
    detail = err instanceof Error ? err.message : String(err);
  } finally {
    await db.query('ROLLBACK');
  }
  return { result: { identity: identity.key, operation, allowed, detail }, rows };
}

/**
 * Empirically checks generated RLS policies for a table by actually running
 * them in an in-memory Postgres (PGlite) against two synthetic users and an
 * anonymous caller. Only supports the common "single owner column" pattern —
 * see schemaInference.ts for exactly what's in and out of scope, and why.
 */
export async function verifyPolicies(sql: string, table: string): Promise<VerificationReport> {
  const normalizedTable = table.trim().toLowerCase();
  const tables = collectTableAudits([{ sourceFile: 'input', sql }]);
  const tableAudit = tables.get(normalizedTable);

  if (!tableAudit || tableAudit.policies.length === 0) {
    return skip(table, `no CREATE POLICY statements found for table "${table}" in the given SQL`);
  }

  const inferred = inferSandboxSchema(tableAudit.policies, normalizedTable);
  if (!inferred.supported) {
    return skip(table, inferred.reason);
  }

  const { ownerColumn, columns } = inferred;
  const booleanColumns = Object.entries(columns)
    .filter(([, type]) => type === 'boolean')
    .map(([name]) => name);
  const tableIdent = q(normalizedTable);
  const columnDefs = Object.entries(columns).map(([name, type]) => columnDDL(name, type));

  const db = new PGlite();
  try {
    try {
      await db.exec(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
          SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
        $$;
        CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
          SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::json->>'role', 'anon')
        $$;

        CREATE TABLE ${tableIdent} (id serial primary key, ${columnDefs.join(', ')});
        ALTER TABLE ${tableIdent} ENABLE ROW LEVEL SECURITY;
      `);

      for (const policy of tableAudit.policies) {
        await db.exec(policy.raw);
      }

      await db.exec(`
        CREATE ROLE rls_probe_anon;
        CREATE ROLE rls_probe_a;
        CREATE ROLE rls_probe_b;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ${tableIdent} TO rls_probe_anon, rls_probe_a, rls_probe_b;
        GRANT USAGE ON SEQUENCE ${q(`${normalizedTable}_id_seq`)} TO rls_probe_anon, rls_probe_a, rls_probe_b;
      `);

      const seedColumns = [ownerColumn, 'note', ...booleanColumns];
      const placeholders = seedColumns.map((_, i) => `$${i + 1}`).join(', ');
      const insertSeedSql = `INSERT INTO ${tableIdent} (${seedColumns.map(q).join(', ')}) VALUES (${placeholders})`;
      await db.query(insertSeedSql, [USER_A_ID, 'row-a', ...booleanColumns.map(() => false)]);
      await db.query(insertSeedSql, [USER_B_ID, 'row-b', ...booleanColumns.map(() => true)]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return skip(table, `could not set up the sandbox from the given SQL: ${message}`);
    }

    const probes: ProbeResult[] = [];
    const selectRows: Partial<Record<ProbeIdentity, Array<Record<string, unknown>>>> = {};

    for (const identity of IDENTITIES) {
      const select = await runProbe(db, identity, 'select', () => db.query(`SELECT * FROM ${tableIdent}`));
      probes.push(select.result);
      selectRows[identity.key] = select.rows;

      if (identity.key === 'anon') {
        const insertAsOther = await runProbe(db, identity, 'insertAsOther', () =>
          db.query(`INSERT INTO ${tableIdent} (${q(ownerColumn)}) VALUES ($1)`, [USER_A_ID])
        );
        probes.push(insertAsOther.result);

        const deleteOther = await runProbe(db, identity, 'deleteOther', () =>
          db.query(`DELETE FROM ${tableIdent} WHERE ${q(ownerColumn)} = $1`, [USER_A_ID])
        );
        probes.push(deleteOther.result);
        continue;
      }

      const selfId = identity.uuid as string;
      const otherId = identity.key === 'userA' ? USER_B_ID : USER_A_ID;

      const insertOwn = await runProbe(db, identity, 'insertOwn', () =>
        db.query(`INSERT INTO ${tableIdent} (${q(ownerColumn)}) VALUES ($1)`, [selfId])
      );
      probes.push(insertOwn.result);

      const insertAsOther = await runProbe(db, identity, 'insertAsOther', () =>
        db.query(`INSERT INTO ${tableIdent} (${q(ownerColumn)}) VALUES ($1)`, [otherId])
      );
      probes.push(insertAsOther.result);

      const updateOwn = await runProbe(db, identity, 'updateOwn', () =>
        db.query(`UPDATE ${tableIdent} SET ${q('note')} = $1 WHERE ${q(ownerColumn)} = $2`, ['updated', selfId])
      );
      probes.push(updateOwn.result);

      const updateReassign = await runProbe(db, identity, 'updateReassign', () =>
        db.query(`UPDATE ${tableIdent} SET ${q(ownerColumn)} = $1 WHERE ${q(ownerColumn)} = $2`, [otherId, selfId])
      );
      probes.push(updateReassign.result);

      const deleteOther = await runProbe(db, identity, 'deleteOther', () =>
        db.query(`DELETE FROM ${tableIdent} WHERE ${q(ownerColumn)} = $1`, [otherId])
      );
      probes.push(deleteOther.result);

      const deleteOwn = await runProbe(db, identity, 'deleteOwn', () =>
        db.query(`DELETE FROM ${tableIdent} WHERE ${q(ownerColumn)} = $1`, [selfId])
      );
      probes.push(deleteOwn.result);
    }

    const findings = computeFindings(selectRows, probes, ownerColumn, booleanColumns);
    const pass = !findings.some((f) => f.severity === 'critical');

    return { supported: true, table, ownerColumn, columns, probes, findings, pass };
  } finally {
    await db.close();
  }
}

function computeFindings(
  selectRows: Partial<Record<ProbeIdentity, Array<Record<string, unknown>>>>,
  probes: ProbeResult[],
  ownerColumn: string,
  booleanColumns: string[]
): VerificationFinding[] {
  const findings: VerificationFinding[] = [];
  const isPublicRow = (row: Record<string, unknown>) => booleanColumns.some((c) => row[c] === true);

  for (const identity of IDENTITIES) {
    const rows = selectRows[identity.key] ?? [];
    for (const row of rows) {
      const isOwn = identity.uuid !== null && row[ownerColumn] === identity.uuid;
      if (!isOwn && !isPublicRow(row)) {
        findings.push({
          severity: 'critical',
          message: `${identity.key} can SELECT a row (id=${row.id}) they don't own and that isn't marked public — data leak.`,
        });
      }
    }
    if (identity.uuid !== null && !rows.some((r) => r[ownerColumn] === identity.uuid)) {
      findings.push({
        severity: 'warning',
        message: `${identity.key} cannot SELECT their own row — the policy may be overly restrictive.`,
      });
    }
  }

  const byKey = new Map(probes.map((p) => [`${p.identity}:${p.operation}`, p]));

  const criticalIfAllowed: Array<[string, string]> = [
    ['anon:insertAsOther', 'anon was able to INSERT a row (unauthenticated write).'],
    ['anon:deleteOther', 'anon was able to DELETE a row (unauthenticated delete).'],
    ['userA:insertAsOther', 'userA was able to INSERT a row claiming to be userB (impersonation).'],
    ['userB:insertAsOther', 'userB was able to INSERT a row claiming to be userA (impersonation).'],
    ['userA:updateReassign', "userA was able to reassign their row's owner to userB (ownership hijack)."],
    ['userB:updateReassign', "userB was able to reassign their row's owner to userA (ownership hijack)."],
    ['userA:deleteOther', "userA was able to DELETE userB's row."],
    ['userB:deleteOther', "userB was able to DELETE userA's row."],
  ];
  for (const [key, message] of criticalIfAllowed) {
    if (byKey.get(key)?.allowed) findings.push({ severity: 'critical', message });
  }

  const warningIfBlocked: Array<[string, string]> = [
    ['userA:insertOwn', 'userA could not INSERT their own row — the policy may be overly restrictive.'],
    ['userB:insertOwn', 'userB could not INSERT their own row — the policy may be overly restrictive.'],
    ['userA:updateOwn', 'userA could not UPDATE their own row — the policy may be overly restrictive.'],
    ['userB:updateOwn', 'userB could not UPDATE their own row — the policy may be overly restrictive.'],
    ['userA:deleteOwn', 'userA could not DELETE their own row — the policy may be overly restrictive.'],
    ['userB:deleteOwn', 'userB could not DELETE their own row — the policy may be overly restrictive.'],
  ];
  for (const [key, message] of warningIfBlocked) {
    const probe = byKey.get(key);
    if (probe && !probe.allowed) findings.push({ severity: 'warning', message });
  }

  return findings;
}
