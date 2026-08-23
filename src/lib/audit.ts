import { splitStatements, stripComments } from './sqlStatements';
import { parseAlterRls, parsePolicy } from './policyParser';
import { AuditFinding, FindingSeverity, ParsedPolicy, TableAudit } from '../types';

export interface SqlSource {
  sourceFile: string;
  sql: string;
}

/**
 * Groups every ALTER TABLE ... ROW LEVEL SECURITY toggle and CREATE POLICY
 * statement found across one or more files by the table they target. A
 * table's toggle and its policies may live in different migration files —
 * that's normal, so callers pass every file to audit together.
 */
export function collectTableAudits(sources: SqlSource[]): Map<string, TableAudit> {
  const tables = new Map<string, TableAudit>();

  const getOrCreate = (table: string): TableAudit => {
    let entry = tables.get(table);
    if (!entry) {
      entry = { table, rlsToggles: [], policies: [] };
      tables.set(table, entry);
    }
    return entry;
  };

  for (const { sourceFile, sql } of sources) {
    const cleaned = stripComments(sql);
    for (const statement of splitStatements(cleaned)) {
      const toggle = parseAlterRls(statement);
      if (toggle) {
        getOrCreate(toggle.table).rlsToggles.push({ ...toggle, sourceFile });
        continue;
      }
      const policy = parsePolicy(statement);
      if (policy) {
        getOrCreate(policy.table).policies.push({ ...policy, sourceFile });
      }
    }
  }

  return tables;
}

function appliesToInsert(policy: ParsedPolicy): boolean {
  return policy.command === 'INSERT' || policy.command === 'ALL';
}

function isLiterallyTrue(expr: string | undefined): boolean {
  return expr !== undefined && expr.trim().toLowerCase() === 'true';
}

// Two rules below hinge on Postgres's documented (and PGlite-verified) CREATE
// POLICY defaulting behavior:
//   - ALL/UPDATE: an omitted WITH CHECK reuses the USING expression, so
//     "USING but no WITH CHECK" does NOT mean unrestricted writes — it's
//     exactly as strict as USING. There is no rule for that case.
//   - INSERT: USING is not a valid clause at all (Postgres rejects the
//     CREATE POLICY outright) — see insertUsingIsInvalid below.
//   - INSERT/ALL with neither clause present denies every insert (fails
//     closed), it does not default to permissive — see insertNoopWithoutCheck.

type Rule = (table: TableAudit) => AuditFinding[];

const noRlsEnabled: Rule = (table) => {
  if (table.policies.length === 0) return [];
  // Last toggle wins if a table is enabled then later disabled in the same set.
  const lastToggle = table.rlsToggles[table.rlsToggles.length - 1];
  if (lastToggle?.enabled) return [];
  return [
    {
      rule: 'policy-without-rls',
      severity: 'critical',
      table: table.table,
      message: lastToggle
        ? `${table.policies.length} polic${table.policies.length === 1 ? 'y' : 'ies'} defined, but RLS is disabled on "${table.table}" — they have no effect.`
        : `${table.policies.length} polic${table.policies.length === 1 ? 'y' : 'ies'} defined for "${table.table}", but no ENABLE ROW LEVEL SECURITY statement was found — they have no effect.`,
      sourceFile: table.policies[0].sourceFile,
    },
  ];
};

const rlsEnabledNoPolicies: Rule = (table) => {
  const lastToggle = table.rlsToggles[table.rlsToggles.length - 1];
  if (!lastToggle?.enabled || table.policies.length > 0) return [];
  return [
    {
      rule: 'rls-enabled-no-policies',
      severity: 'warning',
      table: table.table,
      message: `RLS is enabled on "${table.table}" with zero policies — the table is completely locked, including for its owner via the API.`,
      sourceFile: lastToggle.sourceFile,
    },
  ];
};

const insertUsingIsInvalid: Rule = (table) => {
  const findings: AuditFinding[] = [];
  for (const policy of table.policies) {
    if (policy.command !== 'INSERT' || policy.using === undefined) continue;
    findings.push({
      rule: 'insert-using-invalid',
      severity: 'critical',
      table: table.table,
      policyName: policy.name,
      message: `Policy "${policy.name}" on "${table.table}" is FOR INSERT with a USING clause — Postgres rejects this at deploy time ("only WITH CHECK expression allowed for INSERT"). Move the condition into WITH CHECK.`,
      sourceFile: policy.sourceFile,
    });
  }
  return findings;
};

const insertNoopWithoutCheck: Rule = (table) => {
  const findings: AuditFinding[] = [];
  for (const policy of table.policies) {
    if (!appliesToInsert(policy) || policy.withCheck !== undefined || policy.using !== undefined) continue;
    findings.push({
      rule: 'insert-noop-without-check',
      severity: 'warning',
      table: table.table,
      policyName: policy.name,
      message: `Policy "${policy.name}" on "${table.table}" applies to INSERT with no WITH CHECK clause at all — Postgres denies every insert under it (fails closed, it does not default to permissive). Add a WITH CHECK or this policy grants nothing.`,
      sourceFile: policy.sourceFile,
    });
  }
  return findings;
};

const unrestrictedWrite: Rule = (table) => {
  const findings: AuditFinding[] = [];
  for (const policy of table.policies) {
    const isWriteCommand = policy.command === 'INSERT' || policy.command === 'UPDATE' || policy.command === 'ALL';
    if (!isWriteCommand || !isLiterallyTrue(policy.withCheck) || policy.roles.length > 0) continue;
    findings.push({
      rule: 'unrestricted-write',
      severity: 'warning',
      table: table.table,
      policyName: policy.name,
      message: `Policy "${policy.name}" on "${table.table}" has WITH CHECK (true) and no TO clause — any caller can write arbitrary rows here.`,
      sourceFile: policy.sourceFile,
    });
  }
  return findings;
};

const RULES: Rule[] = [noRlsEnabled, rlsEnabledNoPolicies, insertUsingIsInvalid, insertNoopWithoutCheck, unrestrictedWrite];

export function auditTables(tables: Map<string, TableAudit>): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const table of tables.values()) {
    for (const rule of RULES) {
      findings.push(...rule(table));
    }
  }
  return findings;
}

export function auditSources(sources: SqlSource[]): AuditFinding[] {
  return auditTables(collectTableAudits(sources));
}

const SEVERITY_RANK: Record<FindingSeverity, number> = { info: 0, warning: 1, critical: 2 };

export function hasFindingAtOrAbove(findings: AuditFinding[], minSeverity: FindingSeverity): boolean {
  return findings.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[minSeverity]);
}
