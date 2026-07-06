import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseTranscriptTokens } from '../../../src/extensions/model-command/transcript-tokens.js';

describe('parseTranscriptTokens', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanup.splice(0).map((dir) =>
        rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }),
      ),
    );
  });

  it('sums assistant usage blocks and tracks last model / thinking', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'model-usage-'));
    cleanup.push(dir);
    const path = join(dir, 'sess.jsonl');
    await writeFile(
      path,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            model: 'claude-sonnet-4-6',
            content: [{ type: 'thinking', thinking: 'hmm' }],
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              cache_read_input_tokens: 5,
              cache_creation_input_tokens: 3,
            },
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            model: 'claude-sonnet-4-6',
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 0 },
          },
        }),
      ].join('\n'),
      'utf8',
    );

    await expect(parseTranscriptTokens(path)).resolves.toEqual({
      inputTokens: 150,
      outputTokens: 30,
      cacheCreationTokens: 3,
      cacheReadTokens: 5,
      turnCount: 2,
      lastModel: 'claude-sonnet-4-6',
      sawThinking: true,
      compactionCount: 0,
      jsonlPath: path,
      jsonlMissing: false,
    });
  });

  it('skips consecutive duplicate usage (dual-logging)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'model-usage-dedup-'));
    cleanup.push(dir);
    const path = join(dir, 'sess.jsonl');
    const row = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5 },
      },
    });
    await writeFile(path, [row, row, row].join('\n'), 'utf8');

    await expect(parseTranscriptTokens(path)).resolves.toMatchObject({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      turnCount: 1,
    });
  });

  it('ignores user message usage and counts compact boundaries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'model-usage-user-'));
    cleanup.push(dir);
    const path = join(dir, 'sess.jsonl');
    await writeFile(
      path,
      [
        JSON.stringify({
          type: 'user',
          message: { usage: { input_tokens: 999, output_tokens: 999 } },
        }),
        JSON.stringify({
          type: 'system',
          subtype: 'compact_boundary',
          timestamp: new Date().toISOString(),
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            usage: { input_tokens: 10, output_tokens: 2 },
          },
        }),
      ].join('\n'),
      'utf8',
    );

    await expect(parseTranscriptTokens(path)).resolves.toMatchObject({
      inputTokens: 10,
      outputTokens: 2,
      turnCount: 1,
      compactionCount: 1,
    });
  });

  it('returns null when jsonl is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'model-usage-missing-'));
    cleanup.push(dir);
    await mkdir(dir, { recursive: true });
    await expect(parseTranscriptTokens(join(dir, 'missing.jsonl'))).resolves.toBeNull();
  });
});
