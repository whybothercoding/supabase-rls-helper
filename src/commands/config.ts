import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { saveConfig, loadConfig } from '../lib/config';

const CONFIG_FILE = path.join(os.homedir(), '.rls-helper', 'config.json');

export function configShowCommand(): void {
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) {
    console.log(chalk.dim('Source:'), chalk.cyan('OPENAI_API_KEY environment variable'));
    console.log(chalk.dim('Key:   '), maskKey(envKey));
    return;
  }

  const config = loadConfig();
  if (!config?.openaiApiKey) {
    console.log(chalk.yellow('No API key configured.'));
    console.log(
      chalk.dim(`Run ${chalk.cyan('rls config set <key>')} to store one, or set OPENAI_API_KEY.`)
    );
    return;
  }

  console.log(chalk.dim('Source:'), chalk.cyan(CONFIG_FILE));
  console.log(chalk.dim('Key:   '), maskKey(config.openaiApiKey));
}

export function configSetCommand(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) {
    console.error(chalk.red('Error: API key cannot be empty'));
    process.exit(1);
  }
  saveConfig({ openaiApiKey: trimmed });
  console.log(chalk.green(`✓ API key saved to ${CONFIG_FILE}`));
  console.log(chalk.dim('Key:'), maskKey(trimmed));
}

export function configClearCommand(): void {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log(chalk.yellow('No config file found — nothing to clear.'));
    return;
  }
  fs.removeSync(CONFIG_FILE);
  console.log(chalk.green('✓ Config cleared.'));
  console.log(
    chalk.dim('Set OPENAI_API_KEY or run rls config set <key> to reconfigure.')
  );
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 3) + '...' + key.slice(-4);
}
