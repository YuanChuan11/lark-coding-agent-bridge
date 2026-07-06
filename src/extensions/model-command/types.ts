export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  /** @deprecated Prefer cacheReadTokens on session snapshots. */
  cachedInputTokens: number;
  reasoningOutputTokens: number;
  costUsd?: number;
}

export interface SessionUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  reasoningOutputTokens?: number;
  turnCount: number;
  lastModel?: string;
  sawThinking: boolean;
  compactionCount: number;
  jsonlPath?: string;
  jsonlMissing: boolean;
}

export interface ContextWindowSidecar {
  usedPercentage: number;
  remainingPercentage?: number | null;
  contextWindowSize?: number | null;
  currentUsage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  savedAt: number;
  stale: boolean;
}

export interface SubscriptionUsageSidecar {
  fiveHour: number | null;
  sevenDay: number | null;
  fiveHourResetAt: Date | null;
  sevenDayResetAt: Date | null;
  savedAt: number;
  stale: boolean;
}

export interface ScopeRunSnapshot {
  requestedModel?: string;
  actualModel?: string;
  lastUsage?: TokenTotals;
  updatedAt: number;
}

export interface ClaudeSettingsSnapshot {
  effortLevel?: string;
  alwaysThinkingEnabled?: boolean;
  sources: string[];
}

export interface VariantSnapshot {
  name?: string;
  effort?: string;
  settingsPaths: string[];
  forcedModelArgs: string[];
}

export interface ClaudeCliSnapshot {
  version?: string;
  authStatus?: string;
  authLabel?: string;
}

export interface ClaudeSpawnPreviewSnapshot {
  binary: string;
  cwd?: string;
  argv: string[];
  argvLine: string;
  stdinNote: string;
  systemPromptNote: string;
  permissionMode: string;
  modelArgSource: 'profile' | 'variant-default' | 'claude-default';
  env: Record<string, string>;
}

export interface ModelInfoSnapshot {
  agentKind: 'claude' | 'codex';
  profileName: string;
  scope: string;
  chatMode: 'p2p' | 'group' | 'topic';
  cwd?: string;
  sessionId?: string;
  sessionStale: boolean;
  bridgeModelPref?: string;
  bridgeModelLabel: string;
  cotMessages: string;
  activeRun: boolean;
  variant: VariantSnapshot;
  claudeSettings: ClaudeSettingsSnapshot;
  sessionUsage?: SessionUsageSnapshot;
  contextWindow?: ContextWindowSidecar;
  subscriptionUsage?: SubscriptionUsageSidecar;
  spawnPreview?: ClaudeSpawnPreviewSnapshot;
  scopeRun?: ScopeRunSnapshot;
  cli: ClaudeCliSnapshot;
  dataSources: string[];
}
