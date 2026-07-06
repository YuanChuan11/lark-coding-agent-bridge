import { spawnProcess } from '../../platform/spawn.js';
import type { ClaudeCliSnapshot } from './types.js';

async function runClaude(args: string[], timeoutMs = 8_000): Promise<string | undefined> {
  return new Promise((resolve) => {
    let stdout = '';
    let settled = false;
    const finish = (value: string | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(undefined), timeoutMs);
    try {
      const child = spawnProcess('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.on('error', () => finish(undefined));
      child.on('close', () => finish(stdout.trim() || undefined));
    } catch {
      finish(undefined);
    }
  });
}

function formatAuthLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as {
      loggedIn?: unknown;
      authMethod?: unknown;
      apiProvider?: unknown;
    };
    const loggedIn = parsed.loggedIn === true ? '已登录' : '未登录';
    const method =
      typeof parsed.authMethod === 'string' && parsed.authMethod ? parsed.authMethod : '?';
    const provider =
      typeof parsed.apiProvider === 'string' && parsed.apiProvider ? parsed.apiProvider : '?';
    return `${loggedIn} · ${method} · ${provider}`;
  } catch {
    return trimmed.split('\n')[0]?.trim() ?? trimmed;
  }
}

/** Probe local Claude CLI metadata without starting an agent run. */
export async function probeClaudeCli(): Promise<ClaudeCliSnapshot> {
  const [version, authStatus] = await Promise.all([
    runClaude(['-v']),
    runClaude(['auth', 'status']),
  ]);
  return {
    ...(version ? { version } : {}),
    ...(authStatus ? { authStatus, authLabel: formatAuthLabel(authStatus) } : {}),
  };
}
