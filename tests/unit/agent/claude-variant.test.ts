import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDefaultClaudeModelArgs,
  CLAUDE_VARIANT_ENV,
  resolveClaudeBridgeVariant,
} from '../../../src/agent/claude/variant';

describe('claude bridge variant', () => {
  const prev = process.env[CLAUDE_VARIANT_ENV];

  afterEach(() => {
    if (prev === undefined) delete process.env[CLAUDE_VARIANT_ENV];
    else process.env[CLAUDE_VARIANT_ENV] = prev;
  });

  it('passes no extra model args when env is unset', () => {
    delete process.env[CLAUDE_VARIANT_ENV];
    expect(resolveClaudeBridgeVariant()).toBeUndefined();
    expect(buildDefaultClaudeModelArgs()).toEqual([]);
  });

  it('maps mybot variant to its configured model stack', () => {
    process.env[CLAUDE_VARIANT_ENV] = 'mybot';
    expect(resolveClaudeBridgeVariant()).toBe('mybot');
    expect(buildDefaultClaudeModelArgs()).toEqual([
      '-force-use-model',
      'dashscope/glm-5.2',
      'dashscope/glm-5.2',
      'dashscope/glm-5.2',
      '--effort',
      'high',
    ]);
  });

  it('maps workbot variant to its configured model stack', () => {
    process.env[CLAUDE_VARIANT_ENV] = 'workbot';
    expect(resolveClaudeBridgeVariant()).toBe('workbot');
    expect(buildDefaultClaudeModelArgs()).toEqual([
      '-force-use-model',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      '--effort',
      'xhigh',
    ]);
  });

  it('rejects unknown variants', () => {
    process.env[CLAUDE_VARIANT_ENV] = 'unknown';
    expect(() => resolveClaudeBridgeVariant()).toThrow(/unknown LARK_CHANNEL_VARIANT/);
  });
});
