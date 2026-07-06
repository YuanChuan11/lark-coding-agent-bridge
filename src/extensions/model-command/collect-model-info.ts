import { modelLabel, normalizeModelSelection } from '../../agent/models.js';
import { getCotMessages } from '../../config/schema.js';
import type { ProfileConfig } from '../../config/profile-schema.js';
import type { AppConfig } from '../../config/schema.js';
import type { SessionStore } from '../../session/store.js';
import type { WorkspaceStore } from '../../workspace/store.js';
import { probeClaudeCli } from './claude-cli-probe.js';
import { buildClaudeSpawnPreview } from './claude-spawn-preview.js';
import { claudeSessionJsonlPath } from './claude-project-path.js';
import { loadClaudeLocalSettings } from './claude-settings.js';
import { getScopeRunStats } from './scope-run-stats.js';
import { readHudSidecars } from './hud-sidecar-reader.js';
import { parseTranscriptTokens } from './transcript-tokens.js';
import type { ModelInfoSnapshot } from './types.js';
import { readVariantSnapshot } from './variant-flags.js';

export interface CollectModelInfoInput {
  scope: string;
  chatMode: 'p2p' | 'group' | 'topic';
  profileName: string;
  profileConfig: ProfileConfig;
  configPath: string;
  cfg: AppConfig;
  sessions: SessionStore;
  workspaces: WorkspaceStore;
  activeRun: boolean;
}

function cotLabel(mode: ReturnType<typeof getCotMessages>): string {
  if (mode === 'brief') return '简略';
  if (mode === 'detailed') return '详细';
  return '关闭';
}

function effectiveCwd(input: CollectModelInfoInput): string | undefined {
  return input.workspaces.cwdFor(input.scope) ?? input.profileConfig.workspaces.default;
}

/** Assemble a zero-API-token model/status snapshot for `/model`. */
export async function collectModelInfo(input: CollectModelInfoInput): Promise<ModelInfoSnapshot> {
  const agentKind = input.profileConfig.agentKind;
  const cwd = effectiveCwd(input);
  const sess = input.sessions.getRaw(input.scope);
  const modelPref = input.profileConfig.preferences.model;
  const normalizedModel = normalizeModelSelection(agentKind, modelPref);
  const variant = readVariantSnapshot();
  const dataSources = ['bridge-config', 'claude-settings', 'variant-flags'];

  const snapshot: ModelInfoSnapshot = {
    agentKind,
    profileName: input.profileName,
    scope: input.scope,
    chatMode: input.chatMode,
    ...(cwd ? { cwd } : {}),
    ...(sess?.sessionId ? { sessionId: sess.sessionId } : {}),
    sessionStale: Boolean(cwd && sess && sess.cwd !== cwd),
    bridgeModelLabel: modelLabel(agentKind, normalizedModel),
    ...(modelPref && normalizedModel !== 'default' ? { bridgeModelPref: normalizedModel } : {}),
    cotMessages: cotLabel(getCotMessages(input.cfg)),
    activeRun: input.activeRun,
    variant,
    claudeSettings: await loadClaudeLocalSettings({
      ...(cwd ? { cwd } : {}),
      extraSettingsPaths: variant.settingsPaths,
    }),
    scopeRun: getScopeRunStats(input.scope),
    cli: {},
    dataSources,
  };

  if (agentKind === 'claude') {
    const spawnPreview = buildClaudeSpawnPreview({
      profileName: input.profileName,
      profileConfig: input.profileConfig,
      configPath: input.configPath,
      ...(cwd ? { cwd } : {}),
      ...(sess?.sessionId && sess.cwd === cwd ? { sessionId: sess.sessionId } : {}),
    });
    if (spawnPreview) {
      snapshot.spawnPreview = spawnPreview;
      dataSources.push('spawn-preview');
    }
  }

  if (agentKind === 'claude' && cwd && sess?.sessionId && sess.cwd === cwd) {
    const jsonlPath = claudeSessionJsonlPath(cwd, sess.sessionId);
    const usage = await parseTranscriptTokens(jsonlPath);
    if (usage) {
      snapshot.sessionUsage = usage;
      dataSources.push('session-jsonl-hud');
    } else {
      snapshot.sessionUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        turnCount: 0,
        sawThinking: false,
        compactionCount: 0,
        jsonlPath,
        jsonlMissing: true,
      };
      dataSources.push('session-jsonl-missing');
    }

    const sidecars = readHudSidecars(jsonlPath);
    if (sidecars.context) {
      snapshot.contextWindow = sidecars.context;
      dataSources.push(sidecars.context.stale ? 'hud-context-cache-stale' : 'hud-context-cache');
    }
    if (sidecars.subscription) {
      snapshot.subscriptionUsage = sidecars.subscription;
      dataSources.push(
        sidecars.subscription.stale ? 'hud-usage-cache-stale' : 'hud-usage-cache',
      );
    }
  }

  snapshot.cli = await probeClaudeCli();
  if (snapshot.cli.version || snapshot.cli.authStatus) {
    dataSources.push('claude-cli-probe');
  }

  if (getScopeRunStats(input.scope)) {
    dataSources.push('scope-run-cache');
  }

  return snapshot;
}

export interface ModelCommandInput {
  channel: import('@larksuite/channel').LarkChannel;
  msg: { chatId: string; messageId: string; threadId?: string };
  scope: string;
  chatMode: 'p2p' | 'group' | 'topic';
  sessions: SessionStore;
  workspaces: WorkspaceStore;
  activeRuns: { get(scope: string): unknown };
  controls: {
    profile: string;
    profileConfig: ProfileConfig;
    configPath: string;
    cfg: AppConfig;
  };
}

export const MODEL_COMMAND_HELP_LINE =
  '- `/model` — 查看模型、effort、thinking、token 等（读本地配置/会话，零 API token）';
