import OpenAI from 'openai';
import { getApiKey } from './config';

const DEFAULT_MODEL = 'gpt-4o-mini';

async function getClient(): Promise<OpenAI> {
  return new OpenAI({ apiKey: await getApiKey() });
}

export async function generateRLSPolicies(
  table: string,
  description: string,
  columns?: string,
  model = DEFAULT_MODEL
): Promise<string> {
  const client = await getClient();

  let userPrompt = `Table name: ${table}\n\nAccess rules: ${description}`;
  if (columns) {
    userPrompt += `\n\nTable columns: ${columns}`;
  }
  userPrompt += '\n\nGenerate complete RLS policies for this table.';

  const response = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          'You are a Supabase/PostgreSQL expert. Generate Row Level Security policies. Always output only valid SQL. Include ALTER TABLE ... ENABLE ROW LEVEL SECURITY and all necessary CREATE POLICY statements. Use auth.uid() for user identification. Name policies descriptively. Add SQL comments explaining each policy.',
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? '';
}

export async function explainPolicy(sql: string, model = DEFAULT_MODEL): Promise<string> {
  const client = await getClient();

  const response = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          'You are a Supabase/PostgreSQL expert. Explain RLS policies in plain English. Be concise and practical. Focus on who can do what and under what conditions.',
      },
      {
        role: 'user',
        content: `Explain what these RLS policies do in plain English:\n\n${sql}`,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? '';
}
