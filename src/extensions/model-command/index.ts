import { collectModelInfo, type ModelCommandInput } from './collect-model-info.js';
import { modelInfoCard } from './model-card.js';

export {
  MODEL_COMMAND_HELP_LINE,
  collectModelInfo,
  type CollectModelInfoInput,
  type ModelCommandInput,
} from './collect-model-info.js';
export { ingestScopeRunStats, setScopeRunRequestedModel, getScopeRunStats } from './scope-run-stats.js';
export { aggregateClaudeSessionUsage, parseTranscriptTokens } from './transcript-tokens.js';
export { readHudSidecars } from './hud-sidecar-reader.js';
export type { ModelInfoSnapshot } from './types.js';

/** Handle `/model` — local reads only, no claude -p agent run. */
export async function handleModelCommand(_args: string, ctx: ModelCommandInput): Promise<void> {
  const info = await collectModelInfo({
    scope: ctx.scope,
    chatMode: ctx.chatMode,
    profileName: ctx.controls.profile,
    profileConfig: ctx.controls.profileConfig,
    configPath: ctx.controls.configPath,
    cfg: ctx.controls.cfg,
    sessions: ctx.sessions,
    workspaces: ctx.workspaces,
    activeRun: Boolean(ctx.activeRuns.get(ctx.scope)),
  });

  await ctx.channel.send(
    ctx.msg.chatId,
    { card: modelInfoCard(info) },
    {
      replyTo: ctx.msg.messageId,
      ...(ctx.msg.threadId ? { replyInThread: true as const } : {}),
    },
  );
}
