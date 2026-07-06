import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildClaudeArgv, CLAUDE_SYSTEM_PROMPT_FILE_PLACEHOLDER } from '../../../src/agent/claude/argv.js';
import { CLAUDE_VARIANT_ENV } from '../../../src/agent/claude/variant.js';
import { createDefaultProfileConfig } from '../../../src/config/profile-schema.js';
import { buildClaudeSpawnPreview } from '../../../src/extensions/model-command/claude-spawn-preview.js';

describe('buildClaudeArgv', () => {
  it('builds base flags with placeholder system prompt file', () => {
    expect(buildClaudeArgv({ permissionMode: 'acceptEdits' })).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'acceptEdits',
      '--append-system-prompt-file',
      CLAUDE_SYSTEM_PROMPT_FILE_PLACEHOLDER,
    ]);
  });

  it('adds resume and profile model when provided', () => {
    expect(
      buildClaudeArgv({
        permissionMode: 'bypassPermissions',
        sessionId: 'sess-abc',
        model: 'claude-sonnet-4-6',
        systemPromptFile: '/tmp/prompt.md',
      }),
    ).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'bypassPermissions',
      '--append-system-prompt-file',
      '/tmp/prompt.md',
      '--resume',
      'sess-abc',
      '--model',
      'claude-sonnet-4-6',
    ]);
  });
});

describe('buildClaudeSpawnPreview', () => {
  const prevVariant = process.env[CLAUDE_VARIANT_ENV];

  afterEach(() => {
    if (prevVariant === undefined) delete process.env[CLAUDE_VARIANT_ENV];
    else process.env[CLAUDE_VARIANT_ENV] = prevVariant;
    vi.unstubAllEnvs();
  });

  it('includes variant argv and bridge env when variant is set', () => {
    vi.stubEnv(CLAUDE_VARIANT_ENV, 'mybot');
    const profileConfig = createDefaultProfileConfig({
      agentKind: 'claude',
      accounts: { app: { id: 'app-id', secret: 'secret', tenant: 'feishu' } },
    });
    const configPath = '/tmp/lark-channel/config.json';
    const preview = buildClaudeSpawnPreview({
      profileName: 'default',
      profileConfig,
      configPath,
      cwd: '/workspace/proj',
      sessionId: 'sess-xyz',
    });

    expect(preview).not.toBeNull();
    expect(preview?.argv).toContain('--resume');
    expect(preview?.argv).toContain('sess-xyz');
    expect(preview?.argv).toContain('--effort');
    expect(preview?.modelArgSource).toBe('variant-default');
    expect(preview?.env.LARK_CHANNEL).toBe('1');
    expect(preview?.env.LARK_CHANNEL_PROFILE).toBe('default');
    expect(preview?.env[CLAUDE_VARIANT_ENV]).toBe('mybot');
    expect(preview?.argvLine).toMatch(/^claude /);
  });

  it('uses profile model instead of variant defaults', () => {
    vi.stubEnv(CLAUDE_VARIANT_ENV, 'mybot');
    const profileConfig = createDefaultProfileConfig({
      agentKind: 'claude',
      accounts: { app: { id: 'app-id', secret: 'secret', tenant: 'feishu' } },
    });
    profileConfig.preferences.model = 'claude-haiku-4-5';
    const preview = buildClaudeSpawnPreview({
      profileName: 'default',
      profileConfig,
      configPath: '/tmp/lark-channel/config.json',
    });

    expect(preview?.argv).toContain('--model');
    expect(preview?.argv).toContain('claude-haiku-4-5');
    expect(preview?.argv).not.toContain('--effort');
    expect(preview?.modelArgSource).toBe('profile');
  });

  it('returns null for codex profiles', () => {
    const profileConfig = createDefaultProfileConfig({
      agentKind: 'codex',
      accounts: { app: { id: 'app-id', secret: 'secret', tenant: 'feishu' } },
      codex: { binaryPath: 'codex' },
    });
    expect(
      buildClaudeSpawnPreview({
        profileName: 'codex',
        profileConfig,
        configPath: '/tmp/lark-channel/config.json',
      }),
    ).toBeNull();
  });
});
