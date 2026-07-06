import { describe, expect, it, vi, afterEach } from 'vitest';

describe('readVariantSnapshot', () => {
  const prev = process.env.LARK_CHANNEL_VARIANT;

  afterEach(() => {
    if (prev === undefined) delete process.env.LARK_CHANNEL_VARIANT;
    else process.env.LARK_CHANNEL_VARIANT = prev;
    vi.resetModules();
  });

  it('parses effort and settings paths from variant argv', async () => {
    process.env.LARK_CHANNEL_VARIANT = 'mybot';
    const { readVariantSnapshot } = await import(
      '../../../src/extensions/model-command/variant-flags.js'
    );
    const snap = readVariantSnapshot();
    expect(snap.name).toBe('mybot');
    expect(snap.effort).toBe('high');
    expect(snap.settingsPaths).toContain('/Users/admin/.claude/ft-settings-headless.json');
    expect(snap.forcedModelArgs.length).toBeGreaterThan(0);
  });
});
