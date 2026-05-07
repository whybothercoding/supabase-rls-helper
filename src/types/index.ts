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

export interface Config {
  openaiApiKey: string;
}
