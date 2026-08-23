import { computeInertMask, extractParenGroup } from './sqlStatements';
import { ParsedPolicy, ParsedRlsToggle, PolicyCommand } from '../types';

const ALTER_RLS_RE =
  /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?("(?:[^"]|"")+"|[\w.]+)\s+(ENABLE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY\s*$/i;

const CREATE_POLICY_RE = /^CREATE\s+POLICY\s+("(?:[^"]|"")+"|[\w]+)\s+ON\s+("(?:[^"]|"")+"|[\w.]+)/i;

const FOR_RE = /\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i;
const TO_RE = /\bTO\s+([^\n]+?)(?=\s+USING\s*\(|\s+WITH\s+CHECK\s*\(|$)/i;
const USING_RE = /\bUSING\s*\(/i;
const WITH_CHECK_RE = /\bWITH\s+CHECK\s*\(/i;

function stripQuotes(ident: string): string {
  if (ident.startsWith('"') && ident.endsWith('"')) {
    return ident.slice(1, -1).replace(/""/g, '"');
  }
  return ident;
}

function normalizeIdent(ident: string): string {
  const trimmed = ident.trim();
  if (trimmed.startsWith('"')) return stripQuotes(trimmed);
  return trimmed.toLowerCase();
}

export function parseAlterRls(statement: string): ParsedRlsToggle | null {
  const m = ALTER_RLS_RE.exec(statement.trim());
  if (!m) return null;
  return { table: normalizeIdent(m[1]), enabled: m[2].toUpperCase() === 'ENABLE' };
}

export function parsePolicy(statement: string): ParsedPolicy | null {
  const trimmed = statement.trim();
  const head = CREATE_POLICY_RE.exec(trimmed);
  if (!head) return null;

  const name = stripQuotes(head[1]);
  const table = normalizeIdent(head[2]);
  const mask = computeInertMask(trimmed);

  let command: PolicyCommand = 'ALL';
  const forMatch = FOR_RE.exec(trimmed);
  if (forMatch && !mask[forMatch.index]) {
    command = forMatch[1].toUpperCase() as PolicyCommand;
  }

  let roles: string[] = [];
  const toMatch = TO_RE.exec(trimmed);
  if (toMatch && !mask[toMatch.index]) {
    roles = toMatch[1]
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
  }

  let using: string | undefined;
  const usingMatch = USING_RE.exec(trimmed);
  if (usingMatch && !mask[usingMatch.index]) {
    const parenStart = trimmed.indexOf('(', usingMatch.index);
    const group = extractParenGroup(trimmed, parenStart, mask);
    if (group) using = group.body;
  }

  let withCheck: string | undefined;
  const withCheckMatch = WITH_CHECK_RE.exec(trimmed);
  if (withCheckMatch && !mask[withCheckMatch.index]) {
    const parenStart = trimmed.indexOf('(', withCheckMatch.index);
    const group = extractParenGroup(trimmed, parenStart, mask);
    if (group) withCheck = group.body;
  }

  return { name, table, command, roles, using, withCheck, raw: trimmed };
}
