import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { SessionUsageSnapshot } from './types.js';

interface UsageFields {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  reasoning_output_tokens?: number;
}

function normalizeTokenCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function usageDedupKey(usage: UsageFields): string {
  return [
    usage.input_tokens,
    usage.output_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_read_input_tokens,
  ].join('|');
}

function contentHasThinking(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some(
    (block) =>
      block &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'thinking',
  );
}

function emptySnapshot(jsonlPath: string): SessionUsageSnapshot {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    turnCount: 0,
    sawThinking: false,
    compactionCount: 0,
    jsonlPath,
    jsonlMissing: false,
  };
}

/**
 * Parse session token totals from a Claude Code transcript jsonl.
 * Aligns with claude-hud: assistant-only, consecutive duplicate usage skipped.
 */
export async function parseTranscriptTokens(
  jsonlPath: string,
): Promise<SessionUsageSnapshot | null> {
  try {
    await access(jsonlPath);
  } catch {
    return null;
  }

  const totals = emptySnapshot(jsonlPath);
  let lastUsageKey: string | undefined;

  const stream = createReadStream(jsonlPath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream });
  try {
    for await (const line of rl) {
      if (!line.trim()) {
        lastUsageKey = undefined;
        continue;
      }

      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        lastUsageKey = undefined;
        continue;
      }

      if (entry.type === 'system' && entry.subtype === 'compact_boundary') {
        totals.compactionCount += 1;
        lastUsageKey = undefined;
        continue;
      }

      if (entry.type !== 'assistant') {
        lastUsageKey = undefined;
        continue;
      }

      const message = entry.message;
      if (!message || typeof message !== 'object') {
        lastUsageKey = undefined;
        continue;
      }

      const msg = message as {
        model?: unknown;
        content?: unknown;
        usage?: UsageFields;
      };

      if (msg.usage) {
        const usage = msg.usage;
        const key = usageDedupKey(usage);
        if (key !== lastUsageKey) {
          totals.inputTokens += normalizeTokenCount(usage.input_tokens);
          totals.outputTokens += normalizeTokenCount(usage.output_tokens);
          totals.cacheCreationTokens += normalizeTokenCount(usage.cache_creation_input_tokens);
          totals.cacheReadTokens += normalizeTokenCount(usage.cache_read_input_tokens);
          const reasoning = normalizeTokenCount(usage.reasoning_output_tokens);
          if (reasoning > 0) {
            totals.reasoningOutputTokens = (totals.reasoningOutputTokens ?? 0) + reasoning;
          }
          totals.turnCount += 1;
        }
        lastUsageKey = key;
      } else {
        lastUsageKey = undefined;
      }

      if (typeof msg.model === 'string') {
        totals.lastModel = msg.model;
      }
      if (contentHasThinking(msg.content)) {
        totals.sawThinking = true;
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return totals;
}

/** @deprecated Use `parseTranscriptTokens`. */
export const aggregateClaudeSessionUsage = parseTranscriptTokens;
