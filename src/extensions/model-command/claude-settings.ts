import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ClaudeSettingsSnapshot } from './types.js';

interface SettingsJson {
  effortLevel?: unknown;
  alwaysThinkingEnabled?: unknown;
}

async function readSettingsFile(path: string): Promise<SettingsJson | undefined> {
  try {
    const text = await readFile(path, 'utf8');
    return JSON.parse(text) as SettingsJson;
  } catch {
    return undefined;
  }
}

function applySettings(
  target: ClaudeSettingsSnapshot,
  source: SettingsJson | undefined,
  label: string,
): void {
  if (!source) return;
  if (typeof source.effortLevel === 'string' && source.effortLevel.trim()) {
    target.effortLevel = source.effortLevel.trim();
    target.sources.push(label);
  }
  if (typeof source.alwaysThinkingEnabled === 'boolean') {
    target.alwaysThinkingEnabled = source.alwaysThinkingEnabled;
    if (!target.sources.includes(label)) target.sources.push(label);
  }
}

/** Read Claude Code settings from disk (user + optional project + extra files). */
export async function loadClaudeLocalSettings(input: {
  cwd?: string;
  extraSettingsPaths?: readonly string[];
}): Promise<ClaudeSettingsSnapshot> {
  const snapshot: ClaudeSettingsSnapshot = { sources: [] };
  const userPath = join(homedir(), '.claude', 'settings.json');
  applySettings(snapshot, await readSettingsFile(userPath), userPath);

  if (input.cwd) {
    const projectPath = join(input.cwd, '.claude', 'settings.json');
    applySettings(snapshot, await readSettingsFile(projectPath), projectPath);
  }

  for (const path of input.extraSettingsPaths ?? []) {
    if (!path.trim()) continue;
    applySettings(snapshot, await readSettingsFile(path), path);
  }

  return snapshot;
}
