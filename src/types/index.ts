export interface GenerateOptions {
  table?: string;
  description?: string;
  output?: string;
  columns?: string;
  model?: string;
  verify?: boolean;
  emitTests?: boolean;
}

export interface ExplainOptions {
  sql?: string;
  model?: string;
}

export interface TemplateOptions {
  use?: string;
  table?: string;
  ownerColumn?: string;
  output?: string;
}

export interface Config {
  openaiApiKey: string;
}

// ── audit ─────────────────────────────────────────────────────────────────────

export type PolicyCommand = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';

export interface ParsedPolicy {
  name: string;
  table: string;
  command: PolicyCommand;
  roles: string[];
  using?: string;
  withCheck?: string;
  raw: string;
  sourceFile?: string;
}

export interface ParsedRlsToggle {
  table: string;
  enabled: boolean;
  sourceFile?: string;
}

export interface TableAudit {
  table: string;
  rlsToggles: ParsedRlsToggle[];
  policies: ParsedPolicy[];
}

export type FindingSeverity = 'critical' | 'warning' | 'info';

export interface AuditFinding {
  rule: string;
  severity: FindingSeverity;
  table: string;
  message: string;
  policyName?: string;
  sourceFile?: string;
}

export interface AuditOptions {
  paths?: string[];
  json?: boolean;
  failOn?: FindingSeverity;
}

// ── verify ────────────────────────────────────────────────────────────────────

export type ProbeIdentity = 'anon' | 'userA' | 'userB';

export type ProbeOperation =
  | 'select'
  | 'insertOwn'
  | 'insertAsOther'
  | 'updateOwn'
  | 'updateReassign'
  | 'deleteOther'
  | 'deleteOwn';

export interface ProbeResult {
  identity: ProbeIdentity;
  operation: ProbeOperation;
  allowed: boolean;
  detail: string;
}

export interface VerificationFinding {
  severity: FindingSeverity;
  message: string;
}

export interface VerificationReport {
  supported: boolean;
  skipReason?: string;
  table: string;
  ownerColumn?: string;
  columns?: Record<string, string>;
  probes: ProbeResult[];
  findings: VerificationFinding[];
  pass: boolean;
}

export interface VerifyOptions {
  file?: string;
  table?: string;
  json?: boolean;
}
