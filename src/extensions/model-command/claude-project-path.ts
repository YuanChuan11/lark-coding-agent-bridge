import { homedir } from 'node:os';
import { join } from 'node:path';

/** Must match `encodeCwd` in `src/session/history.ts`. */
export function encodeClaudeProjectCwd(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

export function claudeProjectDir(cwd: string, home = homedir()): string {
  return join(home, '.claude', 'projects', encodeClaudeProjectCwd(cwd));
}

export function claudeSessionJsonlPath(cwd: string, sessionId: string, home = homedir()): string {
  return join(claudeProjectDir(cwd, home), `${sessionId}.jsonl`);
}
