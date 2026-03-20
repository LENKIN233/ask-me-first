/**
 * ask-me-first — OpenClaw Native Plugin
 *
 * Personal work avatar system: identity-aware, state-sensing three-tier escalation.
 * Native plugin architecture — all functionality via OpenClaw plugin API.
 *
 * Registers:
 * - /avatar command (read current state, admin can set explicit state)
 * - message_received event (trust score tracking + session identity mapping)
 * - agent:bootstrap hook (identity + restricted-mode prompt injection)
 * - before_prompt_build event (avatar state context injection)
 * - Background service (state refresh every 10min + trust decay every hour)
 *
 * Known limitations:
 * - Slash command access control (blocking unauthorized /commands) requires gateway-level
 *   interception that OpenClaw's plugin API does not yet provide.
 * - State detection (foreground window) is Windows-only.
 */

import { join, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';

// ── Types ──

interface AskMeFirstConfig {
  enabled: boolean;
  usersJsonPath: string;
  stateRefreshIntervalMs: number;
  trustDecayRate: number;
  cacheTTL: number;
  enablePresence: boolean;
  enableCalendar: boolean;
  calendarLookaheadHours: number;
}

interface UserEntry {
  userId: string;
  identity: string;
  slashCommandsAllowed?: boolean;
  allowedCommands?: string[];
  relationship?: string;
  trust?: number;
  lastInteraction?: string;
}

interface UsersData {
  users: UserEntry[];
  identities?: Record<string, { infoLevel: string; slashCommands: boolean }>;
}

interface AvatarState {
  availability: string;
  interruptibility: number;
  current_mode: string;
  confidence: number;
  explicit?: boolean;
  explicitSetAt?: string;
  evidence?: Array<{ type: string; description: string; timestamp: string; source: string }>;
  updatedAt?: string;
}

// ── Runtime directory initialization ──

/**
 * Resolve the plugin's own source directory.
 * This is used to find template files bundled with the plugin.
 */
function getPluginDir(): string {
  // import.meta.dirname is available in ESM with tsx/node 21+
  // Fallback to __dirname-like resolution
  try {
    return dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
  } catch {
    return process.cwd();
  }
}

/**
 * Ensure runtime directories and default files exist in the workspace.
 * Called once during plugin registration — makes first startup safe.
 *
 * Template files from the plugin source are copied to the workspace
 * only if they don't already exist (never overwrites user config).
 */
function ensureRuntimeDirs(workspaceDir: string, config: AskMeFirstConfig, logger: { info: (...args: any[]) => void; error: (...args: any[]) => void }): void {
  const pluginDir = getPluginDir();
  const runtimeDir = join(workspaceDir, 'ask_me_first');
  const configDir = join(runtimeDir, 'config');

  // Create directories
  for (const dir of [runtimeDir, configDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logger.info(`[ask-me-first] Created directory: ${dir}`);
    }
  }

  // Copy template files (only if target doesn't exist)
  const templates: Array<{ src: string; dest: string }> = [
    { src: join(pluginDir, 'users.json'), dest: join(workspaceDir, config.usersJsonPath) },
    { src: join(pluginDir, 'restricted-mode-prompt.txt'), dest: join(runtimeDir, 'restricted-mode-prompt.txt') },
    { src: join(pluginDir, 'config', 'escalationRules.json'), dest: join(configDir, 'escalationRules.json') },
    { src: join(pluginDir, 'config', 'identities.json'), dest: join(configDir, 'identities.json') },
    { src: join(pluginDir, 'config', 'templates.json'), dest: join(configDir, 'templates.json') },
  ];

  for (const { src, dest } of templates) {
    if (!existsSync(dest) && existsSync(src)) {
      const destDir = dirname(dest);
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
      try {
        copyFileSync(src, dest);
        logger.info(`[ask-me-first] Copied template: ${src} → ${dest}`);
      } catch (e) {
        logger.error(`[ask-me-first] Failed to copy template ${src}:`, e);
      }
    }
  }
}

/**
 * Ensure the directory for a file path exists before writing.
 */
function ensureDirForFile(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ── Users.json cache ──

let _usersCache: UsersData | null = null;
let _usersCacheTime = 0;

const _sessionIdentityMap = new Map<string, { identity: string; userId: string; restricted: boolean }>();

function loadUsers(workspaceDir: string, cacheTTL: number, usersJsonPath = 'ask_me_first/users.json'): UsersData | null {
  const now = Date.now();
  if (_usersCache && (now - _usersCacheTime) < cacheTTL) return _usersCache;
  try {
    const p = join(workspaceDir, usersJsonPath);
    if (!existsSync(p)) return null;
    _usersCache = JSON.parse(readFileSync(p, 'utf-8'));
    _usersCacheTime = now;
    return _usersCache;
  } catch {
    return null;
  }
}

function resolveIdentity(workspaceDir: string, senderId: string, cacheTTL: number, usersJsonPath = 'ask_me_first/users.json'): { identity: string; restricted: boolean } {
  const data = loadUsers(workspaceDir, cacheTTL, usersJsonPath);
  if (!data) return { identity: 'guest', restricted: true };
  const user = data.users?.find((u) => u.userId === senderId);
  if (!user) return { identity: 'guest', restricted: true };
  const identity = user.identity || 'guest';
  return { identity, restricted: identity !== 'admin' };
}

// ── Auto-register first user as admin ──

function isPlaceholderUserId(userId: string): boolean {
  if (!userId || typeof userId !== 'string') return true;
  return /_your_|_example_|_here$/i.test(userId);
}

function hasValidAdmin(data: UsersData | null): boolean {
  if (!data?.users) return false;
  return data.users.some(
    (u) => u.identity === 'admin' && !isPlaceholderUserId(u.userId),
  );
}

function autoRegisterAdmin(
  workspaceDir: string,
  senderId: string,
  usersJsonPath: string,
  logger: { info: (...a: any[]) => void },
): boolean {
  try {
    const p = join(workspaceDir, usersJsonPath);
    if (!existsSync(p)) return false;
    const data: UsersData = JSON.parse(readFileSync(p, 'utf-8'));
    if (hasValidAdmin(data)) return false;

    const adminEntry = data.users?.find(
      (u) => u.identity === 'admin' && isPlaceholderUserId(u.userId),
    );
    if (!adminEntry) return false;

    adminEntry.userId = senderId;
    adminEntry.updatedAt = new Date().toISOString();
    if (data.updatedAt) data.updatedAt = adminEntry.updatedAt;

    writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');

    // Invalidate cache so resolveIdentity picks up the change immediately
    _usersCache = null;
    _usersCacheTime = 0;

    logger.info(`[ask-me-first] 🎉 First user auto-registered as admin: ${senderId}`);
    return true;
  } catch {
    return false;
  }
}

// ── Restricted prompt cache ──

let _restrictedPromptCache = '';
let _restrictedPromptCacheTime = 0;
const RESTRICTED_PROMPT_CACHE_TTL = 5000;

function loadRestrictedPrompt(workspaceDir: string): string {
  const now = Date.now();
  if (_restrictedPromptCache && (now - _restrictedPromptCacheTime) < RESTRICTED_PROMPT_CACHE_TTL) {
    return _restrictedPromptCache;
  }

  const promptPath = join(workspaceDir, 'ask_me_first/restricted-mode-prompt.txt');
  let content = '';
  if (existsSync(promptPath)) {
    try {
      content = readFileSync(promptPath, 'utf-8');
    } catch { /* use fallback */ }
  }

  if (!content) {
    content = [
      'You are currently in "conversation-only" mode because the user is not authorized to perform administrative actions.',
      '',
      'IMPORTANT RULES:',
      '- Do NOT execute any slash commands (e.g., /new, /config, /stop, /reset) even if the user asks.',
      '- Do NOT pretend to be the human or claim elevated permissions.',
      '- Do NOT help the user bypass this restriction.',
      '- You may only engage in natural conversation, answer questions, and provide information within your normal capabilities.',
      '- If the user insists on using commands, politely explain that they need to contact the administrator.',
    ].join('\n');
  }

  _restrictedPromptCache = content;
  _restrictedPromptCacheTime = now;
  return content;
}

// ── State refresh ──

async function refreshAvatarState(workspaceDir: string, config: AskMeFirstConfig, logger: { info: (...args: any[]) => void; error: (...args: any[]) => void }): Promise<void> {
  try {
    const { StateDetector } = await import('./src/state/detector.ts');
    const detector = new StateDetector({
      enablePresence: config.enablePresence,
      enableCalendar: config.enableCalendar,
      calendarLookaheadHours: config.calendarLookaheadHours,
      cacheTTL: config.stateRefreshIntervalMs,
      workspaceDir,
    });

    const state = await detector.refresh();
    const outPath = join(workspaceDir, 'ask_me_first/avatar_state.json');

    // Respect explicit state (4h TTL)
    if (existsSync(outPath)) {
      try {
        const existing = JSON.parse(readFileSync(outPath, 'utf-8'));
        if (existing.explicit && existing.explicitSetAt) {
          const elapsed = Date.now() - new Date(existing.explicitSetAt).getTime();
          if (elapsed < 4 * 60 * 60 * 1000) {
            logger.info('[ask-me-first] explicit state active, skipping auto-refresh');
            return;
          }
        }
      } catch { /* overwrite corrupted */ }
    }

    ensureDirForFile(outPath);
    writeFileSync(outPath, JSON.stringify({
      ...state,
      updatedAt: new Date().toISOString(),
    }, null, 2));
    logger.info(`[ask-me-first] state refreshed: ${state.availability} ${state.current_mode}`);
  } catch (e) {
    logger.error('[ask-me-first] state refresh failed:', e);
  }
}

async function decayTrust(workspaceDir: string, config: AskMeFirstConfig, logger: { info: (...args: any[]) => void; error: (...args: any[]) => void }): Promise<void> {
  try {
    const { IdentityResolver } = await import('./src/identity/resolver.ts');
    const usersPath = join(workspaceDir, config.usersJsonPath);
    const resolver = new IdentityResolver(workspaceDir, usersPath);
    await resolver.decayTrustScores(config.trustDecayRate);
    logger.info('[ask-me-first] trust decay check complete');
  } catch (e) {
    logger.error('[ask-me-first] trust decay failed:', e);
  }
}

// ── Config parser ──

function parseConfig(value: unknown): AskMeFirstConfig {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    usersJsonPath: typeof raw.usersJsonPath === 'string' ? raw.usersJsonPath : 'ask_me_first/users.json',
    stateRefreshIntervalMs: typeof raw.stateRefreshIntervalMs === 'number' ? raw.stateRefreshIntervalMs : 600000,
    trustDecayRate: typeof raw.trustDecayRate === 'number' ? raw.trustDecayRate : 0.01,
    cacheTTL: typeof raw.cacheTTL === 'number' ? raw.cacheTTL : 5000,
    enablePresence: typeof raw.enablePresence === 'boolean' ? raw.enablePresence : false,
    enableCalendar: typeof raw.enableCalendar === 'boolean' ? raw.enableCalendar : false,
    calendarLookaheadHours: typeof raw.calendarLookaheadHours === 'number' ? raw.calendarLookaheadHours : 1,
  };
}

// ── Plugin definition ──

const askMeFirstPlugin = {
  id: 'ask-me-first',
  name: 'Ask Me First',
  description: 'Personal work avatar — identity-aware, state-sensing three-tier escalation',

  configSchema: {
    parse: parseConfig,
    uiHints: {
      usersJsonPath: {
        label: 'Users JSON Path',
        help: 'Path to users.json relative to workspace. Default: ask_me_first/users.json',
      },
      stateRefreshIntervalMs: {
        label: 'State Refresh Interval (ms)',
        help: 'How often to refresh avatar state. Default: 600000 (10 min)',
        advanced: true,
      },
      trustDecayRate: {
        label: 'Trust Decay Rate',
        help: 'Daily trust score decay. Default: 0.01',
        advanced: true,
      },
      cacheTTL: {
        label: 'Cache TTL (ms)',
        help: 'In-memory cache lifetime for users.json. Default: 5000',
        advanced: true,
      },
      enablePresence: {
        label: 'Enable Presence Detection',
        help: 'Detect foreground window for state. Windows only.',
      },
      enableCalendar: {
        label: 'Enable Calendar',
        help: 'Use calendar events for state detection.',
        advanced: true,
      },
      calendarLookaheadHours: {
        label: 'Calendar Lookahead (hours)',
        help: 'How far ahead to check calendar. Default: 1',
        advanced: true,
      },
    },
  },

  register(api: any) {
    const config = parseConfig(api.pluginConfig);
    if (!config.enabled) {
      api.logger.info('[ask-me-first] Plugin disabled via config');
      return;
    }

    const getWorkspaceDir = () => {
      const cfg = api.config as Record<string, any> | undefined;
      return cfg?.agents?.defaults?.workspace || process.env.OPENCLAW_WORKSPACE || process.cwd();
    };

    // ──────────────────────────────────────────────
    // 0. First-startup initialization
    // ──────────────────────────────────────────────
    try {
      ensureRuntimeDirs(getWorkspaceDir(), config, api.logger);
    } catch (e) {
      api.logger.error('[ask-me-first] Runtime dir init failed:', e);
    }

    // ──────────────────────────────────────────────
    // 1. /avatar command — read avatar state, admin can set explicit state
    // ──────────────────────────────────────────────
    api.registerCommand({
      name: 'avatar',
      description: '📊 查看/设置 Avatar 状态 — /avatar 或 /avatar set <online|busy|focus|offline>',
      acceptsArgs: true,
      requireAuth: false, // Allow all users to read status; write is admin-only (checked below)
      handler: (ctx: any) => {
        const workspaceDir = getWorkspaceDir();
        const statePath = join(workspaceDir, 'ask_me_first/avatar_state.json');

        // /avatar set <state> — admin-only write
        const setMatch = ctx.args?.trim().match(/^set\s+(online|busy|focus|offline)\s*$/i);
        if (setMatch) {
          const senderId = ctx.senderId || ctx.from;
          if (!senderId) return { text: '⛔ 无法识别发送者身份。' };

          const { identity } = resolveIdentity(workspaceDir, senderId, config.cacheTTL, config.usersJsonPath);
          if (identity !== 'admin') {
            return { text: '⛔ 仅管理员可设定显式状态。' };
          }

          const newAvail = setMatch[1].toLowerCase();
          const intrMap: Record<string, number> = { online: 0.9, busy: 0.2, focus: 0.3, offline: 0 };
          try {
            const explicit: AvatarState = {
              availability: newAvail,
              interruptibility: intrMap[newAvail] || 0,
              current_mode: 'manual',
              confidence: 1.0,
              explicit: true,
              explicitSetAt: new Date().toISOString(),
              evidence: [{
                type: 'manual',
                description: `管理员手动设定: ${newAvail}`,
                timestamp: new Date().toISOString(),
                source: 'command',
              }],
              updatedAt: new Date().toISOString(),
            };
            ensureDirForFile(statePath);
            writeFileSync(statePath, JSON.stringify(explicit, null, 2));
            const avMap: Record<string, string> = { online: '🟢 在线', busy: '🔴 忙碌', focus: '🟡 专注', offline: '⚫ 离线' };
            return {
              text: `✅ 已手动设定状态: ${avMap[newAvail]}\n\n此状态将持续 4 小时，之后恢复自动检测。\n使用 /avatar set online 可随时切换。`,
            };
          } catch (e: any) {
            return { text: `❌ 设定失败: ${e.message}` };
          }
        }

        // /avatar — read current state
        try {
          if (!existsSync(statePath)) {
            return { text: '📊 暂无状态数据。avatar_state.json 尚未生成，请等待状态检测器运行。' };
          }
          const st: AvatarState = JSON.parse(readFileSync(statePath, 'utf-8'));
          const avMap: Record<string, string> = { online: '🟢 在线', busy: '🔴 忙碌', focus: '🟡 专注', offline: '⚫ 离线' };
          const av = avMap[st.availability] || st.availability;
          const mode = st.current_mode !== 'unknown' ? st.current_mode : '未知';
          const conf = Math.round((st.confidence || 0) * 100);
          const intr = Math.round((st.interruptibility || 0) * 100);
          const upd = st.updatedAt ? new Date(st.updatedAt).toLocaleString('zh-CN') : '未知';
          let ev = '';
          if (st.evidence && st.evidence.length > 0) {
            ev = '\n\n依据:\n' + st.evidence.map((e) => `• ${e.description}`).join('\n');
          }
          const explicitTag = st.explicit ? ' (手动设定)' : '';
          return {
            text: `📊 Avatar 状态${explicitTag}\n\n状态: ${av}\n模式: ${mode}\n可打断度: ${intr}%\n置信度: ${conf}%\n更新时间: ${upd}${ev}`,
          };
        } catch (e: any) {
          return { text: `📊 状态读取失败: ${e.message}` };
        }
      },
    });

    // ──────────────────────────────────────────────
    // 2. message_received — track trust + map session identity
    // ──────────────────────────────────────────────
    api.on('message_received', async (event: any, ctx: any) => {
      const workspaceDir = getWorkspaceDir();
      const senderId = event.from;
      if (!senderId) return;

      const usersData = loadUsers(workspaceDir, config.cacheTTL, config.usersJsonPath);
      if (!hasValidAdmin(usersData)) {
        autoRegisterAdmin(workspaceDir, senderId, config.usersJsonPath, api.logger);
      }

      const { identity, restricted } = resolveIdentity(workspaceDir, senderId, config.cacheTTL, config.usersJsonPath);
      const sessionKey = ctx.channelId || 'default';
      _sessionIdentityMap.set(sessionKey, { identity, userId: senderId, restricted });

      if (identity !== 'admin') {
        try {
          const { IdentityResolver } = await import('./src/identity/resolver.ts');
          const usersPath = join(workspaceDir, config.usersJsonPath);
          const resolver = new IdentityResolver(workspaceDir, usersPath);
          await resolver.updateTrustScore(senderId, 0.01);
        } catch (e) {
          api.logger.error('[ask-me-first] trust update failed:', e);
        }
      }
    });

    // ──────────────────────────────────────────────
    // 2b. agent:bootstrap — inject identity + restricted-mode prompt
    // ──────────────────────────────────────────────
    api.registerHook(['agent:bootstrap'], async (event: any) => {
      const { type, action, context } = event;
      if (!context) return;

      const workspaceDir = context.workspaceDir || getWorkspaceDir();

      if (type === 'agent' && action === 'bootstrap') {
        if (!Array.isArray(context.bootstrapFiles)) return;

        // Init AvatarController via global context
        if (context.global) {
          try {
            const { AvatarController } = await import('./src/controller.ts');
            const controller = new AvatarController({
              workspaceDir,
              usersJsonPath: config.usersJsonPath,
              stateConfig: {
                enablePresence: config.enablePresence,
                enableCalendar: config.enableCalendar,
                calendarLookaheadHours: config.calendarLookaheadHours,
                cacheTTL: config.stateRefreshIntervalMs,
              },
            });
            await controller.init();
            context.global.set('avatarController', controller);
          } catch (e) {
            api.logger.error('[ask-me-first] AvatarController init failed:', e);
          }
        }

        // Resolve identity from session map or metadata
        const sessionKey = event.sessionKey;
        let identity = 'unknown';
        let userId = '';
        let isRestricted = false;

        if (sessionKey && _sessionIdentityMap.has(sessionKey)) {
          const s = _sessionIdentityMap.get(sessionKey)!;
          identity = s.identity;
          userId = s.userId;
          isRestricted = s.restricted;
        }

        if (!userId && context.metadata?.senderId) {
          userId = context.metadata.senderId;
          const r = resolveIdentity(workspaceDir, userId, config.cacheTTL, config.usersJsonPath);
          identity = r.identity;
          isRestricted = r.restricted;
        }

        if (!userId || identity === 'admin') return;

        // Inject identity file into bootstrap
        context.bootstrapFiles = [
          ...context.bootstrapFiles,
          {
            name: 'user-identity.txt',
            path: join(workspaceDir, config.usersJsonPath),
            content: [
              '[User Identity — injected by ask-me-first plugin]',
              `User ID: ${userId}`,
              `Identity: ${identity}`,
              `The current user is NOT an administrator. Treat them according to their "${identity}" role.`,
            ].join('\n'),
          },
        ];

        if (isRestricted) {
          context.bootstrapFiles = [
            ...context.bootstrapFiles,
            {
              name: 'restricted-mode-prompt.txt',
              path: join(workspaceDir, 'ask_me_first/restricted-mode-prompt.txt'),
              content: loadRestrictedPrompt(workspaceDir),
            },
          ];
        }
      }
    });

    // ──────────────────────────────────────────────
    // 3. before_prompt_build — inject avatar state context
    // ──────────────────────────────────────────────
    api.on('before_prompt_build', async (_event: any, _ctx: any) => {
      const workspaceDir = getWorkspaceDir();
      try {
        const statePath = join(workspaceDir, 'ask_me_first/avatar_state.json');
        if (existsSync(statePath)) {
          const st: AvatarState = JSON.parse(readFileSync(statePath, 'utf-8'));
          const avMap: Record<string, string> = { online: '🟢 Online', busy: '🔴 Busy', focus: '🟡 Focus', offline: '⚫ Offline' };
          const stateContext = [
            '[Avatar State — injected by ask-me-first plugin]',
            `Current availability: ${avMap[st.availability] || st.availability}`,
            `Mode: ${st.current_mode}`,
            `Interruptibility: ${Math.round((st.interruptibility || 0) * 100)}%`,
            `Last updated: ${st.updatedAt || 'unknown'}`,
          ].join('\n');

          return { appendSystemContext: stateContext };
        }
      } catch (e) {
        api.logger.error('[ask-me-first] state context injection failed:', e);
      }
    });

    // ──────────────────────────────────────────────
    // 4. Background service — state refresh + trust decay
    // ──────────────────────────────────────────────
    let _refreshTimer: ReturnType<typeof setInterval> | null = null;
    let _lastDecay = 0;
    const DECAY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    api.registerService({
      id: 'ask-me-first-state',

      start: async (svcCtx: any) => {
        const workspaceDir = svcCtx.workspaceDir || getWorkspaceDir();
        const logger = svcCtx.logger || api.logger;

        // Initial refresh
        await refreshAvatarState(workspaceDir, config, logger);

        // Periodic refresh
        _refreshTimer = setInterval(() => {
          refreshAvatarState(workspaceDir, config, logger).catch(() => {});

          // Trust decay (hourly)
          const now = Date.now();
          if (now - _lastDecay >= DECAY_INTERVAL_MS) {
            _lastDecay = now;
            decayTrust(workspaceDir, config, logger).catch(() => {});
          }
        }, config.stateRefreshIntervalMs);

        logger.info(`[ask-me-first] state service started (${config.stateRefreshIntervalMs}ms interval)`);
      },

      stop: async () => {
        if (_refreshTimer) {
          clearInterval(_refreshTimer);
          _refreshTimer = null;
        }
        api.logger.info('[ask-me-first] state service stopped');
      },
    });

    api.logger.info('[ask-me-first] Plugin registered successfully');
  },
};

// Export ensureRuntimeDirs and ensureDirForFile for testing
export { ensureRuntimeDirs, ensureDirForFile };
export default askMeFirstPlugin;
