import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActiveRuns } from '../../../src/bot/active-runs.js';
import { createDefaultProfileConfig } from '../../../src/config/profile-schema.js';
import { SessionStore } from '../../../src/session/store.js';
import { WorkspaceStore } from '../../../src/workspace/store.js';
import { createFakeChannel } from '../../helpers/fake-channel.js';
import { createTmpProfile } from '../../helpers/tmp-profile.js';

vi.mock('../../../src/extensions/model-command/claude-cli-probe.js', () => ({
  probeClaudeCli: async () => ({ version: '2.1.177 (Claude Code)' }),
}));

const cleanups: Array<() => Promise<void>> = [];

describe('handleModelCommand', () => {
  afterEach(async () => {
    vi.doUnmock('node:os');
    vi.resetModules();
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it('sends a model info card from local sources only', async () => {
    const tmp = await createTmpProfile('model-command-');
    cleanups.push(() => tmp.cleanup());

    const home = await mkdtemp(join(tmpdir(), 'model-cmd-home-'));
    cleanups.push(() => rm(home, { recursive: true, force: true }));

    const workspaceRealpath = await realpath(tmp.workspace);
    const projectDir = join(home, '.claude', 'projects', encodeProjectCwd(workspaceRealpath));
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      join(home, '.claude', 'settings.json'),
      JSON.stringify({ effortLevel: 'high', alwaysThinkingEnabled: true }),
      'utf8',
    );
    await writeFile(
      join(projectDir, 'sess-abc.jsonl'),
      JSON.stringify({
        type: 'assistant',
        message: {
          model: 'claude-haiku-4-5',
          content: [{ type: 'text', text: 'hi' }],
          usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 0 },
        },
      }),
      'utf8',
    );

    vi.doMock('node:os', async () => {
      const actual = await vi.importActual<typeof import('node:os')>('node:os');
      return { ...actual, homedir: () => home };
    });
    vi.resetModules();

    const channel = createFakeChannel();
    const sessions = new SessionStore(join(tmp.profile, 'sessions.json'));
    await sessions.load();
    const workspaces = new WorkspaceStore(join(tmp.profile, 'workspaces.json'));
    await workspaces.load();
    workspaces.setCwd('chat-1', workspaceRealpath);
    sessions.set('chat-1', 'sess-abc', workspaceRealpath);

    const profileConfig = createDefaultProfileConfig({
      agentKind: 'claude',
      accounts: { app: { id: 'app-id', secret: 'secret', tenant: 'feishu' } },
    });
    profileConfig.workspaces.default = workspaceRealpath;

    const { handleModelCommand: dispatch } = await import(
      '../../../src/extensions/model-command/index.js'
    );

    await dispatch('', {
      channel: channel as never,
      msg: { chatId: 'chat-1', messageId: 'msg-1' },
      scope: 'chat-1',
      chatMode: 'p2p',
      sessions,
      workspaces,
      activeRuns: new ActiveRuns(),
      controls: {
        profile: 'default',
        profileConfig,
        configPath: join(tmp.profile, '..', 'config.json'),
        cfg: profileConfig as never,
      },
    });

    expect(channel.sent).toHaveLength(1);
    const content = channel.sent[0]?.content as { card?: { header?: { title?: { content?: string } } } };
    expect(content.card?.header?.title?.content).toContain('模型');
  });
});

function encodeProjectCwd(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}
