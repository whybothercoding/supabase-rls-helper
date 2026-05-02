export interface GenerateOptions {
  table?: string;
  description?: string;
  output?: string;
  columns?: string;
  model?: string;
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

export interface RLSPolicy {
  name: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using?: string;
  withCheck?: string;
  description: string;
}

export interface Config {
  openaiApiKey: string;
}
