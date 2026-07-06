import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readContextWindowSidecar,
  readSubscriptionUsageSidecar,
} from '../../../src/extensions/model-command/hud-sidecar-reader.js';

describe('hud-sidecar-reader', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanup.splice(0).map((dir) =>
        rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }),
      ),
    );
  });

  it('reads context-window cache keyed by transcript path hash', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hud-home-'));
    cleanup.push(home);
    const transcript = join(home, 'sess.jsonl');
    await writeFile(transcript, '{}', 'utf8');
    const transcriptReal = await realpath(transcript);

    const hash = createHash('sha256').update(resolve(transcriptReal)).digest('hex');
    const cacheDir = join(home, '.claude', 'plugins', 'claude-hud', 'context-cache');
    await mkdir(cacheDir, { recursive: true });
    const now = Date.now();
    await writeFile(
      join(cacheDir, `${hash}.json`),
      JSON.stringify({
        used_percentage: 42,
        context_window_size: 200_000,
        current_usage: { input_tokens: 1200, output_tokens: 300 },
        saved_at: now,
      }),
      'utf8',
    );

    const result = readContextWindowSidecar(transcriptReal, now, home);
    expect(result).toMatchObject({
      usedPercentage: 42,
      contextWindowSize: 200_000,
      stale: false,
    });
    expect(result?.currentUsage?.input_tokens).toBe(1200);
  });

  it('reads subscription usage cache with freshness', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hud-usage-home-'));
    cleanup.push(home);
    const cacheDir = join(home, '.claude', 'plugins', 'claude-hud');
    await mkdir(cacheDir, { recursive: true });
    const now = Date.now();
    await writeFile(
      join(cacheDir, '.usage-cache.json'),
      JSON.stringify({
        timestamp: now,
        data: { fiveHour: 23, sevenDay: 41 },
      }),
      'utf8',
    );

    const fresh = readSubscriptionUsageSidecar(now, home);
    expect(fresh).toMatchObject({ fiveHour: 23, sevenDay: 41, stale: false });

    const stale = readSubscriptionUsageSidecar(now + 6 * 60_000, home);
    expect(stale?.stale).toBe(true);
  });
});
