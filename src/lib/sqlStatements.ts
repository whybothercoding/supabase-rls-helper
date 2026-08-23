/**
 * Minimal SQL lexical scanner. Not a parser — it only distinguishes "code"
 * from string/quoted-identifier/dollar-quoted/comment ranges, which is enough
 * to split multi-statement SQL on `;` and extract balanced `(...)` groups
 * without being fooled by a semicolon or paren sitting inside a string.
 */

export type SqlSegmentType =
  | 'code'
  | 'line-comment'
  | 'block-comment'
  | 'string'
  | 'quoted-ident'
  | 'dollar-quoted';

export interface SqlSegment {
  type: SqlSegmentType;
  start: number;
  end: number; // exclusive
}

const DOLLAR_TAG_RE = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

export function scanSqlSegments(sql: string): SqlSegment[] {
  const segments: SqlSegment[] = [];
  const n = sql.length;
  let i = 0;
  let codeStart = 0;

  const flushCode = (end: number) => {
    if (end > codeStart) segments.push({ type: 'code', start: codeStart, end });
  };

  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];

    if (c === '-' && c2 === '-') {
      flushCode(i);
      const start = i;
      while (i < n && sql[i] !== '\n') i++;
      segments.push({ type: 'line-comment', start, end: i });
      codeStart = i;
      continue;
    }

    if (c === '/' && c2 === '*') {
      flushCode(i);
      const start = i;
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i = Math.min(i + 2, n);
      segments.push({ type: 'block-comment', start, end: i });
      codeStart = i;
      continue;
    }

    if (c === "'") {
      flushCode(i);
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      segments.push({ type: 'string', start, end: i });
      codeStart = i;
      continue;
    }

    if (c === '"') {
      flushCode(i);
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          i += 2;
          continue;
        }
        if (sql[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      segments.push({ type: 'quoted-ident', start, end: i });
      codeStart = i;
      continue;
    }

    if (c === '$') {
      const tagMatch = DOLLAR_TAG_RE.exec(sql.slice(i));
      if (tagMatch) {
        flushCode(i);
        const openTag = tagMatch[0];
        const start = i;
        const bodyStart = i + openTag.length;
        const closeIndex = sql.indexOf(openTag, bodyStart);
        const end = closeIndex === -1 ? n : closeIndex + openTag.length;
        segments.push({ type: 'dollar-quoted', start, end });
        i = end;
        codeStart = i;
        continue;
      }
    }

    i++;
  }
  flushCode(n);
  return segments;
}

/** 1 = position sits inside a string/identifier/comment; 0 = live code. */
export function computeInertMask(sql: string): Uint8Array {
  const mask = new Uint8Array(sql.length);
  for (const seg of scanSqlSegments(sql)) {
    if (seg.type !== 'code') mask.fill(1, seg.start, seg.end);
  }
  return mask;
}

/** Removes -- line comments and /* block comments *\/, preserving everything else verbatim. */
export function stripComments(sql: string): string {
  let out = '';
  for (const seg of scanSqlSegments(sql)) {
    if (seg.type === 'line-comment' || seg.type === 'block-comment') continue;
    out += sql.slice(seg.start, seg.end);
  }
  return out;
}

/** Splits on top-level `;` — ignores semicolons inside strings/parens/comments. */
export function splitStatements(sql: string): string[] {
  const mask = computeInertMask(sql);
  const statements: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < sql.length; i++) {
    if (mask[i]) continue;
    const c = sql[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) {
      const stmt = sql.slice(start, i).trim();
      if (stmt) statements.push(stmt);
      start = i + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

export interface ParenGroup {
  body: string;
  end: number; // index just after the closing paren
}

/**
 * Finds the first `(` at or after fromIndex and returns its balanced content.
 * Parens inside strings/comments (per the inert mask) don't count.
 */
export function extractParenGroup(sql: string, fromIndex: number, mask?: Uint8Array): ParenGroup | null {
  const inert = mask ?? computeInertMask(sql);
  let i = fromIndex;
  while (i < sql.length && /\s/.test(sql[i]) && !inert[i]) i++;
  if (sql[i] !== '(' || inert[i]) return null;

  let depth = 0;
  const start = i;
  for (; i < sql.length; i++) {
    if (inert[i]) continue;
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') {
      depth--;
      if (depth === 0) {
        return { body: sql.slice(start + 1, i).trim(), end: i + 1 };
      }
    }
  }
  return null;
}
