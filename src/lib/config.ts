import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import inquirer from 'inquirer';
import { Config } from '../types';

export const CONFIG_DIR = path.join(os.homedir(), '.rls-helper');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): Config | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    return fs.readJsonSync(CONFIG_FILE) as Config;
  } catch {
    return null;
  }
}

export function saveConfig(config: Config): void {
  fs.ensureDirSync(CONFIG_DIR);
  fs.writeJsonSync(CONFIG_FILE, config, { spaces: 2 });
}

export async function getApiKey(): Promise<string> {
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  const config = loadConfig();
  if (config?.openaiApiKey?.trim()) {
    return config.openaiApiKey.trim();
  }

  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your OpenAI API key:',
      validate: (input: string) =>
        input.trim().length > 0 ? true : 'API key cannot be empty',
    },
  ]);

  try {
    saveConfig({ openaiApiKey: apiKey.trim() });
  } catch {
    console.warn('Warning: could not save API key to config file.');
  }
  return apiKey.trim();
}
