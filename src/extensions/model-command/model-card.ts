import type {
  ClaudeSpawnPreviewSnapshot,
  ContextWindowSidecar,
  ModelInfoSnapshot,
  SessionUsageSnapshot,
  SubscriptionUsageSidecar,
  TokenTotals,
} from './types.js';

function escapeMd(s: string): string {
  return s.replace(/([*_`\\])/g, '\\$1');
}

function escapeCode(s: string): string {
  return s.replace(/`/g, "'");
}

function formatTokens(n: number): string {
  return n.toLocaleString('en-US');
}

/** Compact K display (e.g. 1500 → 1.5K). */
function formatTokensK(n: number): string {
  const k = n / 1000;
  if (k === 0) return '0K';
  if (k >= 10) return `${Math.round(k)}K`;
  if (k >= 1) return `${k.toFixed(1).replace(/\.0$/, '')}K`;
  return `${k.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}K`;
}

function formatAgeMs(savedAt: number): string {
  const ago = Date.now() - savedAt;
  if (ago < 60_000) return '<1 分钟前';
  if (ago < 3_600_000) return `${Math.floor(ago / 60_000)} 分钟前`;
  return `${Math.floor(ago / 3_600_000)} 小时前`;
}

function freshnessNote(savedAt: number, stale: boolean): string {
  const age = formatAgeMs(savedAt);
  return stale ? `_${age}，可能已过期（需 TUI 刷新）_` : `_${age}_`;
}

interface TokenDisplay {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  cachedInputTokens?: number;
  reasoningOutputTokens?: number;
  costUsd?: number;
}

function cacheReadTokens(totals: TokenDisplay): number {
  return totals.cacheReadTokens ?? totals.cachedInputTokens ?? 0;
}

function sessionTokenTotal(totals: SessionUsageSnapshot): number {
  return (
    totals.inputTokens +
    totals.outputTokens +
    totals.cacheCreationTokens +
    totals.cacheReadTokens +
    (totals.reasoningOutputTokens ?? 0)
  );
}

function formatHudSessionTokens(usage: SessionUsageSnapshot): string {
  const total = sessionTokenTotal(usage);
  if (total === 0) return '_暂无用量_';

  const fmt = formatTokensK;
  const parts = [
    `${fmt(usage.inputTokens)} in`,
    `${fmt(usage.outputTokens)} out`,
  ];
  const cacheTotal = usage.cacheCreationTokens + usage.cacheReadTokens;
  if (cacheTotal > 0) {
    parts.push(`${fmt(cacheTotal)} cache`);
  }
  return `**${fmt(total)}** (${parts.join(', ')})`;
}

function formatScopeRunTokens(totals: TokenTotals): string {
  const fmt = formatTokensK;
  const lines = [
    `**上次飞书 run**`,
    `- 输入: ${fmt(totals.inputTokens)}`,
    `- 输出: ${fmt(totals.outputTokens)}`,
    `- 缓存读取: ${fmt(cacheReadTokens(totals))}`,
  ];
  if (totals.reasoningOutputTokens > 0) {
    lines.push(`- 推理输出: ${fmt(totals.reasoningOutputTokens)}`);
  }
  if (totals.costUsd !== undefined) {
    lines.push(`- 估算费用: $${totals.costUsd.toFixed(4)}`);
  }
  return lines.join('\n');
}

function formatContextSection(ctx: ContextWindowSidecar): string {
  const lines = [
    `📐 **上下文占用（claude-hud cache）**`,
    `- 已用: **${ctx.usedPercentage}%**`,
  ];
  if (ctx.contextWindowSize) {
    lines.push(`- 窗口: ${formatTokens(ctx.contextWindowSize)} tokens`);
  }
  if (ctx.currentUsage) {
    const u = ctx.currentUsage;
    const currentTotal =
      (u.input_tokens ?? 0) +
      (u.output_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0);
    if (currentTotal > 0) {
      lines.push(`- 当前帧: ${formatTokensK(currentTotal)}`);
    }
  }
  lines.push(freshnessNote(ctx.savedAt, ctx.stale));
  return lines.join('\n');
}

function formatSubscriptionSection(sub: SubscriptionUsageSidecar): string {
  const lines = [`📈 **订阅额度（claude-hud cache）**`];
  if (sub.fiveHour !== null) {
    lines.push(`- 5 小时: **${sub.fiveHour}%**`);
  }
  if (sub.sevenDay !== null) {
    lines.push(`- 7 天: **${sub.sevenDay}%**`);
  }
  lines.push(freshnessNote(sub.savedAt, sub.stale));
  return lines.join('\n');
}

function effortLine(info: ModelInfoSnapshot): string {
  const parts: string[] = [];
  if (info.claudeSettings.effortLevel) {
    parts.push(`settings → \`${escapeCode(info.claudeSettings.effortLevel)}\``);
  }
  if (info.variant.effort) {
    parts.push(`variant argv → \`${escapeCode(info.variant.effort)}\``);
  }
  if (parts.length === 0) return '_(未配置，跟随 Claude Code 默认)_';
  return parts.join('  ·  ');
}

function thinkingLine(info: ModelInfoSnapshot): string {
  const setting =
    info.claudeSettings.alwaysThinkingEnabled === undefined
      ? '_(settings 未声明)_'
      : info.claudeSettings.alwaysThinkingEnabled
        ? '开启 (`alwaysThinkingEnabled`)'
        : '关闭 (`alwaysThinkingEnabled`)';
  const sessionHint = info.sessionUsage?.sawThinking
    ? ' · session 中出现过 thinking 块'
    : '';
  return `${setting}${sessionHint}`;
}

function modelArgSourceLabel(source: ClaudeSpawnPreviewSnapshot['modelArgSource']): string {
  if (source === 'profile') return 'profile `--model`';
  if (source === 'variant-default') return 'variant 默认参数';
  return 'Claude Code 默认';
}

function formatSpawnPreviewSection(preview: ClaudeSpawnPreviewSnapshot): string {
  const argvBullets = preview.argv.map((arg) => `- \`${escapeCode(arg)}\``).join('\n');
  const lines = [
    '🚀 **下次 run 启动参数（预览）**',
    `- binary: \`${escapeCode(preview.binary)}\``,
    `- cwd: ${preview.cwd ? `\`${escapeCode(preview.cwd)}\`` : '_(未设置)_'}`,
    `- permission-mode: \`${escapeCode(preview.permissionMode)}\``,
    `- 模型参数来源: ${modelArgSourceLabel(preview.modelArgSource)}`,
    `- stdin: ${preview.stdinNote}`,
    `- system prompt: ${preview.systemPromptNote}`,
    '',
    '**argv**',
    argvBullets,
    '',
    `**一行命令**: \`${escapeCode(preview.argvLine)}\``,
  ];

  const envEntries = Object.entries(preview.env);
  if (envEntries.length > 0) {
    lines.push('', '**bridge 注入 env**');
    for (const [key, value] of envEntries) {
      lines.push(`- \`${escapeCode(key)}\`=\`${escapeCode(value)}\``);
    }
  }

  lines.push('', '_按 profile 默认 access 推算 permission-mode；实际 run 可能因用户权限略有不同。_');
  return lines.join('\n');
}

function modelSources(info: ModelInfoSnapshot): string {
  const lines: string[] = [];
  lines.push(`  - 桥接配置: \`${escapeCode(info.bridgeModelLabel)}\``);
  if (info.variant.name) {
    lines.push(`  - variant: \`${escapeCode(info.variant.name)}\``);
  }
  if (info.variant.forcedModelArgs.length > 0) {
    lines.push(
      `  - variant 强制模型参数: \`${escapeCode(info.variant.forcedModelArgs.join(' '))}\``,
    );
  }
  if (info.scopeRun?.requestedModel !== undefined) {
    lines.push(
      `  - 本进程上次 run 请求模型: \`${escapeCode(info.scopeRun.requestedModel || 'default')}\``,
    );
  }
  if (info.scopeRun?.actualModel) {
    lines.push(`  - 本进程上次 run 实际模型: \`${escapeCode(info.scopeRun.actualModel)}\``);
  }
  if (info.sessionUsage?.lastModel) {
    lines.push(`  - session jsonl 最后模型: \`${escapeCode(info.sessionUsage.lastModel)}\``);
  }
  return lines.join('\n');
}

export function modelInfoCard(info: ModelInfoSnapshot): object {
  const scopeLine =
    info.chatMode === 'topic'
      ? `\`${escapeCode(info.scope)}\` _（话题独立 session）_`
      : `\`${escapeCode(info.scope)}\``;
  const cwdLine = info.cwd ? `\`${escapeCode(info.cwd)}\`` : '(未设置)';
  const sessionLine = info.sessionId
    ? `\`${info.sessionId.slice(0, 8)}…\`${info.sessionStale ? ' ⚠️ cwd 已变' : ''}`
    : '(无)';

  const sections: string[] = [
    '🧭 **scope**: ' + scopeLine,
    '🧩 **profile**: ' + escapeMd(info.profileName),
    '📁 **cwd**: ' + cwdLine,
    '🔗 **session**: ' + sessionLine,
    '🤖 **agent**: ' + (info.agentKind === 'claude' ? 'Claude Code' : 'Codex'),
    '🎯 **模型来源**: ',
    modelSources(info),
    '⚡ **effort**: ' + effortLine(info),
    '🧠 **thinking**: ' + thinkingLine(info),
    '💬 **COT 过程消息（飞书展示）**: ' + `\`${escapeCode(info.cotMessages)}\``,
    '🏃 **active run**: ' + (info.activeRun ? 'yes' : 'no'),
  ];

  if (info.agentKind === 'claude') {
    if (info.spawnPreview) {
      sections.push('');
      sections.push(formatSpawnPreviewSection(info.spawnPreview));
    }

    if (info.contextWindow) {
      sections.push('');
      sections.push(formatContextSection(info.contextWindow));
    }

    if (info.sessionUsage) {
      sections.push('');
      if (info.sessionUsage.jsonlMissing) {
        sections.push('📊 **Session 累计 token（HUD 口径）**');
        sections.push('_会话 transcript 尚未生成或路径不可读_');
        if (info.sessionUsage.jsonlPath) {
          sections.push(`\`${escapeCode(info.sessionUsage.jsonlPath)}\``);
        }
      } else {
        sections.push('📊 **Session 累计 token（HUD 口径）**');
        sections.push(formatHudSessionTokens(info.sessionUsage));
        const meta: string[] = [`回合: ${info.sessionUsage.turnCount}`];
        if (info.sessionUsage.compactionCount > 0) {
          meta.push(`compact: ${info.sessionUsage.compactionCount}`);
        }
        sections.push(`_${meta.join(' · ')}_`);
      }
    }

    if (info.subscriptionUsage) {
      sections.push('');
      sections.push(formatSubscriptionSection(info.subscriptionUsage));
    }

    if (info.scopeRun?.lastUsage) {
      sections.push('');
      sections.push(formatScopeRunTokens(info.scopeRun.lastUsage));
    }
  }

  const cliBits: string[] = [];
  if (info.cli.version) cliBits.push(`版本: \`${escapeCode(info.cli.version)}\``);
  const authLine = info.cli.authLabel ?? info.cli.authStatus;
  if (authLine) {
    cliBits.push(`auth: ${escapeMd(authLine)}`);
  }
  if (cliBits.length > 0) {
    sections.push('');
    sections.push('🛠 **Claude CLI**');
    sections.push(cliBits.join('\n'));
  }

  sections.push('');
  sections.push('_数据来源（零 LLM token）:_');
  sections.push(info.dataSources.map((s) => `\`${s}\``).join(' · '));
  sections.push('');
  sections.push(
    '_上下文 % / 订阅额度来自本机 claude-hud 缓存（需 TUI 会话活跃）；修改模型请用 `/config`。_',
  );

  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: { title: { tag: 'plain_text', content: '🎛 模型与用量 ('+escapeCode(info.variant.forcedModelArgs.join(' '))+')' } },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: sections.join('\n') },
      },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '📊 状态' },
            type: 'default',
            value: { cmd: 'status' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '⚙️ 配置' },
            type: 'default',
            value: { cmd: 'config' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '💡 帮助' },
            type: 'default',
            value: { cmd: 'help' },
          },
        ],
      },
    ],
  };
}
