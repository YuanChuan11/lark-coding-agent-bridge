import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ContextWindowSidecar, SubscriptionUsageSidecar } from './types.js';

const CONTEXT_FRESH_MS = 5 * 60_000;
const USAGE_FRESH_MS = 5 * 60_000;

function expandHomeDirPrefix(inputPath: string, home: string): string {
  if (inputPath === '~') return home;
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return join(home, inputPath.slice(2));
  }
  return inputPath;
}

export function hudPluginDir(home = homedir()): string {
  const envConfigDir = process.env.CLAUDE_CONFIG_DIR?.trim();
  const claudeDir = envConfigDir
    ? resolve(expandHomeDirPrefix(envConfigDir, home))
    : join(home, '.claude');
  return join(claudeDir, 'plugins', 'claude-hud');
}

function contextCachePath(transcriptPath: string, home: string): string {
  let canonical = transcriptPath;
  try {
    canonical = realpathSync(transcriptPath);
  } catch {
    // use path as given
  }
  const hash = createHash('sha256').update(resolve(canonical)).digest('hex');
  return join(hudPluginDir(home), 'context-cache', `${hash}.json`);
}

function parseUsagePercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(Math.min(100, Math.max(0, value)));
}

function parseDateValue(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const millis = value > 1e12 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function readJsonFile(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

/** Read claude-hud context-window snapshot for a transcript (TUI must have run recently). */
export function readContextWindowSidecar(
  transcriptPath: string,
  now = Date.now(),
  home = homedir(),
): ContextWindowSidecar | null {
  const cachePath = contextCachePath(transcriptPath, home);
  const parsed = readJsonFile(cachePath);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const raw = parsed as {
    used_percentage?: unknown;
    remaining_percentage?: unknown;
    context_window_size?: unknown;
    current_usage?: unknown;
    saved_at?: unknown;
  };

  const usedPercentage = parseUsagePercent(raw.used_percentage);
  if (usedPercentage === null) return null;

  const savedAt =
    typeof raw.saved_at === 'number' && Number.isFinite(raw.saved_at) ? raw.saved_at : null;
  if (savedAt === null) return null;

  const stale = now - savedAt > CONTEXT_FRESH_MS;
  const currentUsage =
    raw.current_usage && typeof raw.current_usage === 'object' && !Array.isArray(raw.current_usage)
      ? (raw.current_usage as ContextWindowSidecar['currentUsage'])
      : undefined;

  return {
    usedPercentage,
    remainingPercentage:
      typeof raw.remaining_percentage === 'number' ? raw.remaining_percentage : null,
    contextWindowSize:
      typeof raw.context_window_size === 'number' ? raw.context_window_size : null,
    ...(currentUsage ? { currentUsage } : {}),
    savedAt,
    stale,
  };
}

/** Read claude-hud subscription usage cache (5h / 7d windows). */
export function readSubscriptionUsageSidecar(
  now = Date.now(),
  home = homedir(),
): SubscriptionUsageSidecar | null {
  const cachePath = join(hudPluginDir(home), '.usage-cache.json');
  const parsed = readJsonFile(cachePath);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const envelope = parsed as { timestamp?: unknown; data?: unknown };
  const timestamp =
    typeof envelope.timestamp === 'number' && Number.isFinite(envelope.timestamp)
      ? envelope.timestamp
      : null;
  if (timestamp === null) return null;

  if (!envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
    return null;
  }

  const data = envelope.data as {
    fiveHour?: unknown;
    sevenDay?: unknown;
    fiveHourResetAt?: unknown;
    sevenDayResetAt?: unknown;
  };

  const fiveHour = parseUsagePercent(data.fiveHour);
  const sevenDay = parseUsagePercent(data.sevenDay);
  if (fiveHour === null && sevenDay === null) return null;

  const stale = now - timestamp > USAGE_FRESH_MS;

  return {
    fiveHour,
    sevenDay,
    fiveHourResetAt: parseDateValue(data.fiveHourResetAt),
    sevenDayResetAt: parseDateValue(data.sevenDayResetAt),
    savedAt: timestamp,
    stale,
  };
}

export interface HudSidecars {
  context?: ContextWindowSidecar;
  subscription?: SubscriptionUsageSidecar;
}

export function readHudSidecars(
  transcriptPath: string | undefined,
  now = Date.now(),
  home = homedir(),
): HudSidecars {
  const result: HudSidecars = {};
  if (transcriptPath) {
    const context = readContextWindowSidecar(transcriptPath, now, home);
    if (context) result.context = context;
  }
  const subscription = readSubscriptionUsageSidecar(now, home);
  if (subscription) result.subscription = subscription;
  return result;
}
