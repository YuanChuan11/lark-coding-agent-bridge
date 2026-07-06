import { dirname } from 'node:path';
import { claudeCapability } from '../../agent/capability.js';
import { buildClaudeArgv } from '../../agent/claude/argv.js';
import {
  CLAUDE_VARIANT_ENV,
  resolveClaudeBridgeVariant,
} from '../../agent/claude/variant.js';
import { buildLarkChannelEnv } from '../../agent/lark-channel-env.js';
import { resolveModelArg } from '../../agent/models.js';
import { resolveAppPaths } from '../../config/app-paths.js';
import {
  accessToClaudePermissionMode,
  clampAccess,
  type ClaudePermissionMode,
} from '../../config/permissions.js';
import type { ProfileConfig } from '../../config/profile-schema.js';

export type ClaudeModelArgSource = 'profile' | 'variant-default' | 'claude-default';

export interface ClaudeSpawnPreview {
  binary: string;
  cwd?: string;
  argv: string[];
  argvLine: string;
  stdinNote: string;
  systemPromptNote: string;
  permissionMode: ClaudePermissionMode;
  modelArgSource: ClaudeModelArgSource;
  env: Record<string, string>;
}

export interface BuildClaudeSpawnPreviewInput {
  profileName: string;
  profileConfig: ProfileConfig;
  configPath: string;
  cwd?: string;
  sessionId?: string;
  binary?: string;
}

function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_./:@*=-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export function formatArgvLine(binary: string, argv: readonly string[]): string {
  return [binary, ...argv.map(shellQuote)].join(' ');
}

/** Preview argv/env for the next bridge-triggered `claude` spawn (no subprocess). */
export function buildClaudeSpawnPreview(
  input: BuildClaudeSpawnPreviewInput,
): ClaudeSpawnPreview | null {
  if (input.profileConfig.agentKind !== 'claude') return null;

  const capability = claudeCapability(input.profileConfig);
  const accessMode = clampAccess(
    input.profileConfig.permissions.defaultAccess,
    input.profileConfig.permissions.maxAccess,
    capability.permissions.maxAccess,
  );
  const permissionMode = accessToClaudePermissionMode(
    accessMode,
    input.profileConfig.permissions,
  );
  const model = resolveModelArg('claude', input.profileConfig.preferences.model);
  const argv = buildClaudeArgv({
    permissionMode,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(model ? { model } : {}),
  });

  const rootDir = dirname(input.configPath);
  const appPaths = resolveAppPaths({ rootDir, profile: input.profileName });
  const bridgeEnv = buildLarkChannelEnv({
    profile: input.profileName,
    rootDir: appPaths.rootDir,
    configPath: input.configPath,
    larkCliConfigDir: appPaths.larkCliConfigDir,
    larkCliSourceConfigFile: appPaths.larkCliSourceConfigFile,
  });

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(bridgeEnv)) {
    if (typeof value === 'string') env[key] = value;
  }
  const variant = resolveClaudeBridgeVariant();
  if (variant) env[CLAUDE_VARIANT_ENV] = variant;

  const passthroughKeys = ['CLAUDE_CONFIG_DIR', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_BASE_URL'] as const;
  for (const key of passthroughKeys) {
    const value = process.env[key]?.trim();
    if (value) env[key] = value;
  }

  let modelArgSource: ClaudeModelArgSource = 'claude-default';
  if (model) {
    modelArgSource = 'profile';
  } else if (variant) {
    modelArgSource = 'variant-default';
  }

  const binary = input.binary ?? 'claude';
  return {
    binary,
    ...(input.cwd ? { cwd: input.cwd } : {}),
    argv,
    argvLine: formatArgvLine(binary, argv),
    stdinNote: '<user prompt>（飞书消息构建后经 stdin 传入，不进 argv）',
    systemPromptNote:
      'bridge system prompt 经 --append-system-prompt-file 注入（每次 run 写入临时文件）',
    permissionMode,
    modelArgSource,
    env,
  };
}
