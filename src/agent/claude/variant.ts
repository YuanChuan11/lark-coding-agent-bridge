export const CLAUDE_VARIANT_ENV = 'LARK_CHANNEL_VARIANT';

export type ClaudeBridgeVariant = 'mybot' | 'workbot';

export const CLAUDE_BRIDGE_VARIANTS: readonly ClaudeBridgeVariant[] = ['mybot', 'workbot'];

/**
 * Per-variant default `claude` argv when `AgentRunOptions.model` is unset.
 * Edit the arrays below to change what each bin wrapper passes to Claude Code.
 *
 * `lark-channel-bridge` (no variant) does not set `LARK_CHANNEL_VARIANT` and
 * therefore passes no extra model flags — claude uses its own defaults/aliases.
 */
const VARIANT_DEFAULT_MODEL_ARGS: Record<ClaudeBridgeVariant, readonly string[]> = {
  mybot: [
    '-force-use-model',
    'dashscope/glm-5.2',
    'dashscope/glm-5.2',
    'dashscope/glm-5.2',
    '--effort',
    'high',
    '--settings',
    '/Users/admin/.claude/ft-settings-headless.json'
  ],
  workbot: [
    '-force-use-model',
    // 'claude-haiku-4-5-20251001',
    // 'claude-sonnet-4-6',
    // 'claude-opus-4-6',
    'dashscope/glm-5.2',
    'dashscope/glm-5.2',
    'dashscope/glm-5.2',
    '--effort',
    'high',
  ],
};

export function resolveClaudeBridgeVariant(
  raw = process.env[CLAUDE_VARIANT_ENV],
): ClaudeBridgeVariant | undefined {
  if (!raw?.trim()) return undefined;
  const name = raw.trim();
  if (isClaudeBridgeVariant(name)) return name;
  throw new Error(
    `unknown ${CLAUDE_VARIANT_ENV}: ${raw}. Supported: ${CLAUDE_BRIDGE_VARIANTS.join(', ')}`,
  );
}

export function buildDefaultClaudeModelArgs(
  variant = resolveClaudeBridgeVariant(),
): readonly string[] {
  if (!variant) return [];
  return VARIANT_DEFAULT_MODEL_ARGS[variant];
}

function isClaudeBridgeVariant(value: string): value is ClaudeBridgeVariant {
  return (CLAUDE_BRIDGE_VARIANTS as readonly string[]).includes(value);
}
