import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';

const FIXTURE_DIR = join(import.meta.dirname, 'fixtures', '_plugin_test_tmp');

function ensureFixtureDir() {
  if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true });
  const amfDir = join(FIXTURE_DIR, 'ask_me_first');
  if (!existsSync(amfDir)) mkdirSync(amfDir, { recursive: true });
  return FIXTURE_DIR;
}

function cleanFixtureDir() {
  if (existsSync(FIXTURE_DIR)) rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

async function loadPlugin() {
  const mod = await import('../index.ts');
  return mod.default;
}

describe('parseConfig', () => {
  it('returns defaults for empty input', async () => {
    const plugin = await loadPlugin();
    const config = plugin.configSchema.parse(undefined);
    assert.equal(config.enabled, true);
    assert.equal(config.cacheTTL, 5000);
    assert.equal(config.stateRefreshIntervalMs, 600000);
    assert.equal(config.trustDecayRate, 0.01);
    assert.equal(config.enablePresence, false);
    assert.equal(config.enableCalendar, false);
    assert.equal(config.calendarLookaheadHours, 1);
    assert.equal(config.usersJsonPath, 'ask_me_first/users.json');
    assert.equal(config.feishuAppId, '');
    assert.equal(config.feishuAppSecret, '');
    assert.equal(config.feishuCalendarId, 'primary');
    assert.equal(config.autoAdminRegistration, true);
  });

  it('returns defaults for non-object input', async () => {
    const plugin = await loadPlugin();
    assert.deepStrictEqual(plugin.configSchema.parse(null), plugin.configSchema.parse(undefined));
    assert.deepStrictEqual(plugin.configSchema.parse('string'), plugin.configSchema.parse(undefined));
    assert.deepStrictEqual(plugin.configSchema.parse(42), plugin.configSchema.parse(undefined));
    assert.deepStrictEqual(plugin.configSchema.parse([1, 2]), plugin.configSchema.parse(undefined));
  });

  it('respects provided values', async () => {
    const plugin = await loadPlugin();
    const config = plugin.configSchema.parse({
      enabled: false,
      cacheTTL: 10000,
      stateRefreshIntervalMs: 300000,
      trustDecayRate: 0.05,
      enablePresence: false,
      enableCalendar: true,
      calendarLookaheadHours: 4,
      usersJsonPath: 'custom/path.json',
      feishuAppId: 'cli_test123',
      feishuAppSecret: 'secret_test456',
      feishuCalendarId: 'cal_custom',
      autoAdminRegistration: false,
    });
    assert.equal(config.enabled, false);
    assert.equal(config.cacheTTL, 10000);
    assert.equal(config.stateRefreshIntervalMs, 300000);
    assert.equal(config.trustDecayRate, 0.05);
    assert.equal(config.enablePresence, false);
    assert.equal(config.enableCalendar, true);
    assert.equal(config.calendarLookaheadHours, 4);
    assert.equal(config.usersJsonPath, 'custom/path.json');
    assert.equal(config.feishuAppId, 'cli_test123');
    assert.equal(config.feishuAppSecret, 'secret_test456');
    assert.equal(config.feishuCalendarId, 'cal_custom');
    assert.equal(config.autoAdminRegistration, false);
  });

  it('ignores unknown keys', async () => {
    const plugin = await loadPlugin();
    const config = plugin.configSchema.parse({ unknownKey: 'value', enabled: true });
    assert.equal(config.enabled, true);
    assert.equal((config as any).unknownKey, undefined);
  });
});

describe('plugin definition', () => {
  it('exports valid plugin shape', async () => {
    const plugin = await loadPlugin();
    assert.equal(plugin.id, 'ask-me-first');
    assert.equal(plugin.name, 'Ask Me First');
    assert.equal(typeof plugin.description, 'string');
    assert.equal(typeof plugin.register, 'function');
    assert.ok(plugin.configSchema);
    assert.equal(typeof plugin.configSchema.parse, 'function');
  });
});

describe('register', () => {
  it('skips registration when disabled', async () => {
    const plugin = await loadPlugin();
    const calls: string[] = [];
    const mockApi = {
      pluginConfig: { enabled: false },
      logger: { info: (...args: any[]) => calls.push(args.join(' ')), error: () => {} },
      config: { agents: { defaults: { workspace: FIXTURE_DIR } } },
      registerCommand: () => { calls.push('registerCommand'); },
      on: () => { calls.push('on'); },
      registerHook: () => { calls.push('registerHook'); },
      registerService: () => { calls.push('registerService'); },
    };
    plugin.register(mockApi);
    assert.ok(calls.some(c => c.includes('disabled')));
    assert.ok(!calls.includes('registerCommand'));
    assert.ok(!calls.includes('on'));
    assert.ok(!calls.includes('registerService'));
  });

  it('registers all hooks and commands when enabled', async () => {
    const plugin = await loadPlugin();
    const registered: Record<string, number> = { command: 0, on: 0, hook: 0, service: 0 };
    const mockApi = {
      pluginConfig: { enabled: true },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: FIXTURE_DIR } } },
      registerCommand: () => { registered.command++; },
      on: () => { registered.on++; },
      registerHook: () => { registered.hook++; },
      registerService: () => { registered.service++; },
    };
    plugin.register(mockApi);
    assert.equal(registered.command, 1, 'should register 1 command (/avatar)');
    assert.equal(registered.on, 3, 'should register 3 event handlers (message_received + message_sending + before_prompt_build)');
    assert.equal(registered.hook, 1, 'should register 1 hook (inbound_claim)');
    assert.equal(registered.service, 1, 'should register 1 service (state refresh)');
  });
});

describe('/avatar command handler', () => {
  beforeEach(() => {
    cleanFixtureDir();
    ensureFixtureDir();
  });

  it('returns no-data message when avatar_state.json missing', async () => {
    const plugin = await loadPlugin();
    let handler: any;
    const mockApi = {
      pluginConfig: { enabled: true },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: FIXTURE_DIR } } },
      registerCommand: (opts: any) => { handler = opts.handler; },
      on: () => {},
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);
    assert.ok(handler, 'handler should be registered');
    const result = handler({ args: '' });
    assert.ok(result.text.includes('暂无状态数据'));
  });

  it('reads and formats existing avatar_state.json', async () => {
    const workDir = ensureFixtureDir();
    const state = {
      availability: 'busy',
      interruptibility: 0.2,
      current_mode: 'coding',
      confidence: 0.85,
      updatedAt: '2025-01-01T12:00:00.000Z',
      evidence: [{ type: 'presence', description: 'VS Code 前台', timestamp: '2025-01-01T12:00:00Z', source: 'win32' }],
    };
    writeFileSync(join(workDir, 'ask_me_first/avatar_state.json'), JSON.stringify(state));

    const plugin = await loadPlugin();
    let handler: any;
    const mockApi = {
      pluginConfig: { enabled: true },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: (opts: any) => { handler = opts.handler; },
      on: () => {},
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);
    const result = handler({ args: '' });
    assert.ok(result.text.includes('🔴 忙碌'));
    assert.ok(result.text.includes('coding'));
    assert.ok(result.text.includes('20%'));
    assert.ok(result.text.includes('85%'));
  });

  it('rejects non-admin /avatar set', async () => {
    const workDir = ensureFixtureDir();
    const users = { users: [{ userId: 'user1', identity: 'guest' }] };
    writeFileSync(join(workDir, 'ask_me_first/users.json'), JSON.stringify(users));

    const plugin = await loadPlugin();
    let handler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0 },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: (opts: any) => { handler = opts.handler; },
      on: () => {},
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);
    const result = handler({ args: 'set busy', senderId: 'user1' });
    assert.ok(result.text.includes('⛔'));
  });

  it('allows admin /avatar set and writes state file', async () => {
    const workDir = ensureFixtureDir();
    const users = { users: [{ userId: 'admin1', identity: 'admin' }] };
    writeFileSync(join(workDir, 'ask_me_first/users.json'), JSON.stringify(users));

    const plugin = await loadPlugin();
    let handler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0 },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: (opts: any) => { handler = opts.handler; },
      on: () => {},
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);
    const result = handler({ args: 'set focus', senderId: 'admin1' });
    assert.ok(result.text.includes('✅'));
    assert.ok(result.text.includes('🟡 专注'));

    const written = JSON.parse(readFileSync(join(workDir, 'ask_me_first/avatar_state.json'), 'utf-8'));
    assert.equal(written.availability, 'focus');
    assert.equal(written.explicit, true);
    assert.equal(written.current_mode, 'manual');
  });

  it('returns no-sender error for /avatar set without senderId', async () => {
    const plugin = await loadPlugin();
    let handler: any;
    const mockApi = {
      pluginConfig: { enabled: true },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: FIXTURE_DIR } } },
      registerCommand: (opts: any) => { handler = opts.handler; },
      on: () => {},
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);
    const result = handler({ args: 'set online' });
    assert.ok(result.text.includes('⛔'));
    assert.ok(result.text.includes('无法识别'));
  });
});

describe('custom usersJsonPath', () => {
  beforeEach(() => {
    cleanFixtureDir();
    ensureFixtureDir();
  });

  it('resolves identity from custom path', async () => {
    const workDir = ensureFixtureDir();
    const customDir = join(workDir, 'custom');
    mkdirSync(customDir, { recursive: true });
    const users = { users: [{ userId: 'admin1', identity: 'admin' }] };
    writeFileSync(join(customDir, 'people.json'), JSON.stringify(users));

    const plugin = await loadPlugin();
    let handler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0, usersJsonPath: 'custom/people.json' },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: (opts: any) => { handler = opts.handler; },
      on: () => {},
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);

    writeFileSync(join(workDir, 'ask_me_first/avatar_state.json'), JSON.stringify({
      availability: 'online', interruptibility: 0.9, current_mode: 'idle',
      confidence: 0.8, updatedAt: new Date().toISOString(),
    }));

    const result = handler({ args: 'set online', senderId: 'admin1' });
    assert.ok(result.text.includes('✅'), 'admin should be resolved from custom path');
  });
});

describe('enablePresence default', () => {
  it('defaults to false (opt-in, Windows-only feature)', async () => {
    const plugin = await loadPlugin();
    const config = plugin.configSchema.parse({});
    assert.equal(config.enablePresence, false);
  });

  it('can be explicitly overridden to true on non-windows', async () => {
    const plugin = await loadPlugin();
    const config = plugin.configSchema.parse({ enablePresence: true });
    assert.equal(config.enablePresence, true);
  });

  it('can be explicitly overridden to false on windows', async () => {
    const plugin = await loadPlugin();
    const config = plugin.configSchema.parse({ enablePresence: false });
    assert.equal(config.enablePresence, false);
  });
});

describe('IdentityResolver', () => {
  beforeEach(() => {
    cleanFixtureDir();
    ensureFixtureDir();
  });

  it('updateTrustScore persists to users.json', async () => {
    const workDir = ensureFixtureDir();
    const usersPath = join(workDir, 'ask_me_first/users.json');
    const users = {
      version: '1.0',
      users: [{
        userId: 'member1',
        identity: 'member',
        relationship: { project: [], role: 'peer', trustScore: 0.5, lastInteraction: new Date().toISOString() },
      }],
    };
    writeFileSync(usersPath, JSON.stringify(users, null, 2));

    const { IdentityResolver } = await import('../src/identity/resolver.js');
    const resolver = new IdentityResolver(workDir, usersPath);
    await resolver.updateTrustScore('member1', 0.1);

    const persisted = JSON.parse(readFileSync(usersPath, 'utf-8'));
    assert.ok(Math.abs(persisted.users[0].relationship.trustScore - 0.6) < 0.001, `expected ~0.6, got ${persisted.users[0].relationship.trustScore}`);
  });

  it('updateTrustScore creates relationship for users without one', async () => {
    const workDir = ensureFixtureDir();
    const usersPath = join(workDir, 'ask_me_first/users.json');
    const users = {
      version: '1.0',
      users: [{ userId: 'guest1', identity: 'guest' }],
    };
    writeFileSync(usersPath, JSON.stringify(users, null, 2));

    const { IdentityResolver } = await import('../src/identity/resolver.js');
    const resolver = new IdentityResolver(workDir, usersPath);
    await resolver.updateTrustScore('guest1', 0.05);

    const persisted = JSON.parse(readFileSync(usersPath, 'utf-8'));
    assert.ok(persisted.users[0].relationship, 'relationship should be created');
    assert.ok(Math.abs(persisted.users[0].relationship.trustScore - 0.05) < 0.001);
  });

  it('decayTrustScores uses custom decay rate', async () => {
    const workDir = ensureFixtureDir();
    const usersPath = join(workDir, 'ask_me_first/users.json');
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const users = {
      version: '1.0',
      users: [{
        userId: 'member1',
        identity: 'member',
        relationship: { project: [], role: 'peer', trustScore: 0.5, lastInteraction: twoDaysAgo },
      }],
    };
    writeFileSync(usersPath, JSON.stringify(users, null, 2));

    const { IdentityResolver } = await import('../src/identity/resolver.js');
    const resolver = new IdentityResolver(workDir, usersPath);
    await resolver.decayTrustScores(0.1);

    const persisted = JSON.parse(readFileSync(usersPath, 'utf-8'));
    assert.ok(persisted.users[0].relationship.trustScore < 0.5, 'trust should have decayed');
    assert.ok(Math.abs(persisted.users[0].relationship.trustScore - 0.3) < 0.001, `expected ~0.3, got ${persisted.users[0].relationship.trustScore}`);
  });

  it('gracefully handles missing users.json', async () => {
    const workDir = ensureFixtureDir();
    const missingPath = join(workDir, 'nonexistent/users.json');

    const { IdentityResolver } = await import('../src/identity/resolver.js');
    const resolver = new IdentityResolver(workDir, missingPath);
    const user = await resolver.resolve('anyone');
    assert.equal(user.identity, 'guest');
  });
});

describe('auto-register first user as admin', () => {
  beforeEach(() => {
    cleanFixtureDir();
    ensureFixtureDir();
  });

  it('auto-registers first message sender as admin when users.json has only placeholders', async () => {
    const workDir = ensureFixtureDir();
    const templateUsers = {
      version: '1.1',
      updatedAt: '2026-01-01T00:00:00Z',
      users: [
        { userId: 'ou_your_admin_id_here', identity: 'admin' },
        { userId: 'ou_example_member', identity: 'member' },
      ],
    };
    writeFileSync(join(workDir, 'ask_me_first/users.json'), JSON.stringify(templateUsers, null, 2));

    const plugin = await loadPlugin();
    let messageHandler: any;
    const logs: string[] = [];
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0 },
      logger: { info: (...a: any[]) => logs.push(a.join(' ')), error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: () => {},
      on: (evt: string, fn: any) => { if (evt === 'message_received') messageHandler = fn; },
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);
    assert.ok(messageHandler, 'message_received handler should be registered');

    await messageHandler({ from: 'ou_real_user_abc' }, { channelId: 'ch1' });

    const persisted = JSON.parse(readFileSync(join(workDir, 'ask_me_first/users.json'), 'utf-8'));
    const admin = persisted.users.find((u: any) => u.identity === 'admin');
    assert.equal(admin.userId, 'ou_real_user_abc', 'placeholder admin should be replaced with real userId');
    assert.ok(logs.some(l => l.includes('auto-registered as admin')), 'should log auto-registration');
  });

  it('does NOT auto-register when users.json already has a real admin', async () => {
    const workDir = ensureFixtureDir();
    const users = {
      version: '1.1',
      users: [
        { userId: 'ou_existing_real_admin', identity: 'admin' },
        { userId: 'ou_example_member', identity: 'member' },
      ],
    };
    writeFileSync(join(workDir, 'ask_me_first/users.json'), JSON.stringify(users, null, 2));

    const plugin = await loadPlugin();
    let messageHandler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0 },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: () => {},
      on: (evt: string, fn: any) => { if (evt === 'message_received') messageHandler = fn; },
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);

    await messageHandler({ from: 'ou_second_user' }, { channelId: 'ch2' });

    const persisted = JSON.parse(readFileSync(join(workDir, 'ask_me_first/users.json'), 'utf-8'));
    const admin = persisted.users.find((u: any) => u.identity === 'admin');
    assert.equal(admin.userId, 'ou_existing_real_admin', 'real admin should NOT be overwritten');
  });

  it('second user message does NOT overwrite the already-registered admin', async () => {
    const workDir = ensureFixtureDir();
    const templateUsers = {
      version: '1.1',
      users: [
        { userId: 'ou_your_admin_id_here', identity: 'admin' },
      ],
    };
    writeFileSync(join(workDir, 'ask_me_first/users.json'), JSON.stringify(templateUsers, null, 2));

    const plugin = await loadPlugin();
    let messageHandler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0 },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: () => {},
      on: (evt: string, fn: any) => { if (evt === 'message_received') messageHandler = fn; },
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);

    await messageHandler({ from: 'ou_first_user' }, { channelId: 'ch1' });
    await messageHandler({ from: 'ou_second_user' }, { channelId: 'ch2' });

    const persisted = JSON.parse(readFileSync(join(workDir, 'ask_me_first/users.json'), 'utf-8'));
    const admin = persisted.users.find((u: any) => u.identity === 'admin');
    assert.equal(admin.userId, 'ou_first_user', 'first user should remain admin after second user message');
  });

  it('does NOT auto-register when autoAdminRegistration is false', async () => {
    const workDir = ensureFixtureDir();
    const templateUsers = {
      version: '1.1',
      users: [
        { userId: 'ou_your_admin_id_here', identity: 'admin' },
      ],
    };
    writeFileSync(join(workDir, 'ask_me_first/users.json'), JSON.stringify(templateUsers, null, 2));

    const plugin = await loadPlugin();
    let messageHandler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0, autoAdminRegistration: false },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: () => {},
      on: (evt: string, fn: any) => { if (evt === 'message_received') messageHandler = fn; },
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);

    await messageHandler({ from: 'ou_real_user_abc' }, { channelId: 'ch1' });

    const persisted = JSON.parse(readFileSync(join(workDir, 'ask_me_first/users.json'), 'utf-8'));
    const admin = persisted.users.find((u: any) => u.identity === 'admin');
    assert.equal(admin.userId, 'ou_your_admin_id_here', 'placeholder should NOT be replaced when autoAdminRegistration=false');
  });

  it('detects various placeholder patterns', async () => {
    const workDir = ensureFixtureDir();

    for (const placeholder of ['ou_your_admin_id_here', 'ou_example_admin', 'some_id_here']) {
      const users = { version: '1.0', users: [{ userId: placeholder, identity: 'admin' }] };
      writeFileSync(join(workDir, 'ask_me_first/users.json'), JSON.stringify(users, null, 2));

      const plugin = await loadPlugin();
      let messageHandler: any;
      const mockApi = {
        pluginConfig: { enabled: true, cacheTTL: 0 },
        logger: { info: () => {}, error: () => {} },
        config: { agents: { defaults: { workspace: workDir } } },
        registerCommand: () => {},
        on: (evt: string, fn: any) => { if (evt === 'message_received') messageHandler = fn; },
        registerHook: () => {},
        registerService: () => {},
      };
      plugin.register(mockApi);
      await messageHandler({ from: 'ou_real_user' }, { channelId: 'ch1' });

      const persisted = JSON.parse(readFileSync(join(workDir, 'ask_me_first/users.json'), 'utf-8'));
      const admin = persisted.users.find((u: any) => u.identity === 'admin');
      assert.equal(admin.userId, 'ou_real_user', `placeholder "${placeholder}" should be detected and replaced`);
    }
  });
});

describe('first-startup initialization', () => {
  const freshDir = join(import.meta.dirname, 'fixtures', '_fresh_startup_test');

  beforeEach(() => {
    if (existsSync(freshDir)) rmSync(freshDir, { recursive: true, force: true });
  });

  it('ensureRuntimeDirs creates dirs and copies templates from clean state', async () => {
    const mod = await import('../index.ts');
    const { ensureRuntimeDirs } = mod;

    const logs: string[] = [];
    const logger = {
      info: (...args: any[]) => logs.push(args.join(' ')),
      error: (...args: any[]) => logs.push('ERROR: ' + args.join(' ')),
    };

    const config = mod.default.configSchema.parse({});
    ensureRuntimeDirs(freshDir, config, logger);

    assert.ok(existsSync(join(freshDir, 'ask_me_first')), 'ask_me_first/ dir should be created');
    assert.ok(existsSync(join(freshDir, 'ask_me_first', 'config')), 'ask_me_first/config/ dir should be created');

    const usersJsonPath = join(freshDir, config.usersJsonPath);
    if (existsSync(usersJsonPath)) {
      const data = JSON.parse(readFileSync(usersJsonPath, 'utf-8'));
      assert.ok(Array.isArray(data.users), 'users.json should have users array');
    }

    assert.ok(logs.some(l => l.includes('Created directory')), 'should log directory creation');

    rmSync(freshDir, { recursive: true, force: true });
  });

  it('ensureRuntimeDirs does not overwrite existing files', async () => {
    const mod = await import('../index.ts');
    const { ensureRuntimeDirs } = mod;

    const logger = {
      info: () => {},
      error: () => {},
    };

    const config = mod.default.configSchema.parse({});

    mkdirSync(join(freshDir, 'ask_me_first'), { recursive: true });
    const usersPath = join(freshDir, config.usersJsonPath);
    writeFileSync(usersPath, JSON.stringify({ users: [{ identity: 'admin', userId: 'CUSTOM' }] }));

    ensureRuntimeDirs(freshDir, config, logger);

    const data = JSON.parse(readFileSync(usersPath, 'utf-8'));
    assert.equal(data.users[0].userId, 'CUSTOM', 'existing users.json must not be overwritten');

    rmSync(freshDir, { recursive: true, force: true });
  });
});

describe('/avatar hook-based dispatch (before_prompt_build)', () => {
  beforeEach(() => {
    cleanFixtureDir();
    ensureFixtureDir();
  });

  it('message_received stores pending /avatar command for before_prompt_build', async () => {
    const mod = await import('../index.ts');
    const plugin = mod.default;
    const { _pendingAvatarCmd } = mod;
    _pendingAvatarCmd.clear();

    let messageHandler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0 },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: FIXTURE_DIR } } },
      registerCommand: () => {},
      on: (evt: string, fn: any) => { if (evt === 'message_received') messageHandler = fn; },
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);

    await messageHandler({ from: 'user1', content: '/avatar' }, { channelId: 'ch1', conversationId: 'conv1' });

    assert.ok(_pendingAvatarCmd.has('conv1'), 'pending command should be stored');
    assert.equal(_pendingAvatarCmd.get('conv1')!.senderId, 'user1');
    assert.equal(_pendingAvatarCmd.get('conv1')!.args, '');
    _pendingAvatarCmd.clear();
  });

  it('message_received stores /avatar set args correctly', async () => {
    const mod = await import('../index.ts');
    const plugin = mod.default;
    const { _pendingAvatarCmd } = mod;
    _pendingAvatarCmd.clear();

    let messageHandler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0 },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: FIXTURE_DIR } } },
      registerCommand: () => {},
      on: (evt: string, fn: any) => { if (evt === 'message_received') messageHandler = fn; },
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);

    await messageHandler({ from: 'admin1', content: '/avatar set busy' }, { channelId: 'ch1', conversationId: 'conv2' });

    assert.ok(_pendingAvatarCmd.has('conv2'));
    assert.equal(_pendingAvatarCmd.get('conv2')!.args, 'set busy');
    _pendingAvatarCmd.clear();
  });

  it('before_prompt_build returns avatar status via appendSystemContext when pending /avatar exists', async () => {
    const workDir = ensureFixtureDir();
    const state = {
      availability: 'online',
      interruptibility: 0.9,
      current_mode: 'idle',
      confidence: 0.95,
      updatedAt: '2026-01-15T10:00:00.000Z',
    };
    writeFileSync(join(workDir, 'ask_me_first/avatar_state.json'), JSON.stringify(state));

    const mod = await import('../index.ts');
    const plugin = mod.default;
    const { _pendingAvatarCmd } = mod;
    _pendingAvatarCmd.clear();
    _pendingAvatarCmd.set('conv1', { args: '', senderId: 'user1', ts: Date.now() });

    let promptHandler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0 },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: () => {},
      on: (evt: string, fn: any) => { if (evt === 'before_prompt_build') promptHandler = fn; },
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);

    const result = await promptHandler({ prompt: '/avatar' }, { channelId: 'ch1', conversationId: 'conv1' });

    assert.ok(result, 'should return a result');
    assert.ok(result.appendSystemContext, 'should return appendSystemContext');
    assert.ok(result.appendSystemContext.includes('🟢 在线'), 'should contain online status');
    assert.ok(result.appendSystemContext.includes('CRITICAL INSTRUCTION'), 'should contain critical instruction');
    assert.ok(!_pendingAvatarCmd.has('conv1'), 'pending command should be consumed');
  });

  it('before_prompt_build handles /avatar set by admin via pending command', async () => {
    const workDir = ensureFixtureDir();
    const users = { users: [{ userId: 'admin1', identity: 'admin' }] };
    writeFileSync(join(workDir, 'ask_me_first/users.json'), JSON.stringify(users));

    const mod = await import('../index.ts');
    const plugin = mod.default;
    const { _pendingAvatarCmd } = mod;
    _pendingAvatarCmd.clear();
    _pendingAvatarCmd.set('conv1', { args: 'set focus', senderId: 'admin1', ts: Date.now() });

    let promptHandler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0 },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: () => {},
      on: (evt: string, fn: any) => { if (evt === 'before_prompt_build') promptHandler = fn; },
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);

    const result = await promptHandler({ prompt: '/avatar set focus' }, { channelId: 'ch1', conversationId: 'conv1' });

    assert.ok(result.appendSystemContext.includes('✅'), 'should confirm set');
    assert.ok(result.appendSystemContext.includes('🟡 专注'), 'should include focus status');

    const written = JSON.parse(readFileSync(join(workDir, 'ask_me_first/avatar_state.json'), 'utf-8'));
    assert.equal(written.availability, 'focus');
    assert.equal(written.explicit, true);
  });

  it('before_prompt_build rejects /avatar set by non-admin', async () => {
    const workDir = ensureFixtureDir();
    const users = { users: [{ userId: 'guest1', identity: 'guest' }] };
    writeFileSync(join(workDir, 'ask_me_first/users.json'), JSON.stringify(users));

    const mod = await import('../index.ts');
    const plugin = mod.default;
    const { _pendingAvatarCmd } = mod;
    _pendingAvatarCmd.clear();
    _pendingAvatarCmd.set('conv1', { args: 'set busy', senderId: 'guest1', ts: Date.now() });

    let promptHandler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0 },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: () => {},
      on: (evt: string, fn: any) => { if (evt === 'before_prompt_build') promptHandler = fn; },
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);

    const result = await promptHandler({ prompt: '/avatar set busy' }, { channelId: 'ch1', conversationId: 'conv1' });

    assert.ok(result.appendSystemContext.includes('⛔'), 'should include access denied marker');
  });

  it('before_prompt_build fallback detects /avatar from prompt text', async () => {
    const workDir = ensureFixtureDir();
    const state = {
      availability: 'busy',
      interruptibility: 0.2,
      current_mode: 'meeting',
      confidence: 0.7,
      updatedAt: '2026-01-15T14:00:00.000Z',
    };
    writeFileSync(join(workDir, 'ask_me_first/avatar_state.json'), JSON.stringify(state));

    const mod = await import('../index.ts');
    const plugin = mod.default;
    const { _pendingAvatarCmd } = mod;
    _pendingAvatarCmd.clear();

    let promptHandler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0 },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: () => {},
      on: (evt: string, fn: any) => { if (evt === 'before_prompt_build') promptHandler = fn; },
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);

    const result = await promptHandler({ prompt: '/avatar' }, { channelId: 'ch1', conversationId: 'conv_no_pending' });

    assert.ok(result, 'fallback should return a result');
    assert.ok(result.appendSystemContext.includes('🔴 忙碌'), 'should contain busy status from fallback');
  });

  it('expired pending /avatar command falls through to fallback', async () => {
    const workDir = ensureFixtureDir();
    const state = {
      availability: 'offline',
      interruptibility: 0,
      current_mode: 'sleep',
      confidence: 1.0,
      updatedAt: '2026-01-15T03:00:00.000Z',
    };
    writeFileSync(join(workDir, 'ask_me_first/avatar_state.json'), JSON.stringify(state));

    const mod = await import('../index.ts');
    const plugin = mod.default;
    const { _pendingAvatarCmd, AVATAR_CMD_TTL } = mod;
    _pendingAvatarCmd.clear();
    _pendingAvatarCmd.set('conv1', { args: '', senderId: 'user1', ts: Date.now() - AVATAR_CMD_TTL - 1000 });

    let promptHandler: any;
    const mockApi = {
      pluginConfig: { enabled: true, cacheTTL: 0 },
      logger: { info: () => {}, error: () => {} },
      config: { agents: { defaults: { workspace: workDir } } },
      registerCommand: () => {},
      on: (evt: string, fn: any) => { if (evt === 'before_prompt_build') promptHandler = fn; },
      registerHook: () => {},
      registerService: () => {},
    };
    plugin.register(mockApi);

    const result = await promptHandler({ prompt: '/avatar' }, { channelId: 'ch1', conversationId: 'conv1' });

    assert.ok(result.appendSystemContext.includes('⚫ 离线'), 'should use fallback path and show offline');
  });
});
