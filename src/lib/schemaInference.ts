import { ParsedPolicy } from '../types';

export type ColumnType = 'uuid' | 'boolean' | 'text';

export interface InferredSchema {
  supported: true;
  ownerColumn: string;
  columns: Record<string, ColumnType>;
}

export interface UnsupportedSchema {
  supported: false;
  reason: string;
}

const KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'exists', 'in', 'is', 'null',
  'true', 'false', 'like', 'ilike', 'between', 'any', 'all', 'as', 'case',
  'when', 'then', 'else', 'end', 'distinct', 'coalesce', 'now', 'current_date',
]);

const BOOLEAN_NAME_RE = /^(is_|has_)|^(published|active|enabled|public|archived|deleted|hidden|visible)$/i;
const OWNER_NAME_RE = /(^id$)|(_id$)/i;

const AUTH_CALL_RE = /\bauth\.[a-z_]+\s*\([^)]*\)/gi;
const QUALIFIED_IDENT_RE = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
const BARE_IDENT_RE = /\b([A-Za-z_][A-Za-z0-9_]*)\b(\s*\()?/g;

function classify(column: string): ColumnType {
  if (column.toLowerCase() === 'id') return 'uuid';
  if (OWNER_NAME_RE.test(column)) return 'uuid';
  if (BOOLEAN_NAME_RE.test(column)) return 'boolean';
  return 'text';
}

/**
 * Looks at every USING/WITH CHECK expression for a table's policies and
 * decides whether the "two synthetic users, one owner column" probe model
 * applies. Bails out (supported: false) the moment a policy references
 * another table via a join/subquery — those need seed data this tool has
 * no way to infer, so an empirical check would just be guessing.
 */
export function inferSandboxSchema(policies: ParsedPolicy[], table: string): InferredSchema | UnsupportedSchema {
  const normalizedTable = table.toLowerCase();
  const externalTables = new Set<string>();
  const candidateColumns = new Set<string>();

  for (const policy of policies) {
    for (const expr of [policy.using, policy.withCheck]) {
      if (!expr) continue;

      const withoutAuthCalls = expr.replace(AUTH_CALL_RE, ' ');

      let qualified: RegExpExecArray | null;
      QUALIFIED_IDENT_RE.lastIndex = 0;
      const consumedSpans: Array<[number, number]> = [];
      while ((qualified = QUALIFIED_IDENT_RE.exec(withoutAuthCalls)) !== null) {
        const [full, qualifier, member] = qualified;
        consumedSpans.push([qualified.index, qualified.index + full.length]);
        if (qualifier.toLowerCase() === normalizedTable) {
          candidateColumns.add(member.toLowerCase());
        } else {
          externalTables.add(qualifier);
        }
      }

      if (externalTables.size > 0) continue; // no point scanning further once unsupported

      // Remove already-consumed qualified spans before the bare-identifier pass
      // so `posts.user_id` doesn't also emit a loose `posts` and `user_id`.
      let remaining = withoutAuthCalls;
      for (const [start, end] of consumedSpans.reverse()) {
        remaining = remaining.slice(0, start) + ' '.repeat(end - start) + remaining.slice(end);
      }

      let bare: RegExpExecArray | null;
      BARE_IDENT_RE.lastIndex = 0;
      while ((bare = BARE_IDENT_RE.exec(remaining)) !== null) {
        const [, ident, followedByParen] = bare;
        if (followedByParen) continue; // function call, not a column
        const lower = ident.toLowerCase();
        if (KEYWORDS.has(lower)) continue;
        if (/^\d+$/.test(ident)) continue;
        candidateColumns.add(lower);
      }
    }
  }

  if (externalTables.size > 0) {
    return {
      supported: false,
      reason: `references external table(s) [${Array.from(externalTables).join(', ')}] — the sandbox only auto-provisions the target table`,
    };
  }

  const columns: Record<string, ColumnType> = {};
  const ownerCandidates: string[] = [];
  for (const col of candidateColumns) {
    if (col === 'id') continue; // reserved for the synthetic primary key
    const type = classify(col);
    columns[col] = type;
    if (type === 'uuid') ownerCandidates.push(col);
  }

  if (ownerCandidates.length === 0) {
    return {
      supported: false,
      reason: 'no per-row owner column detected — this policy looks role-based rather than row-owner-based',
    };
  }
  if (ownerCandidates.length > 1) {
    return {
      supported: false,
      reason: `ambiguous ownership — multiple owner-like columns detected [${ownerCandidates.join(', ')}]`,
    };
  }

  columns.note = 'text';

  return { supported: true, ownerColumn: ownerCandidates[0], columns };
}
