/**
 * Hook: ask-me-first
 * Events: agent:bootstrap, message:received
 *
 * Unified handler:
 * - agent:bootstrap: Inject AvatarController + identity/restricted prompts into bootstrap files
 * - message:received: Update trust score, track session identity for bootstrap injection
 */

import { AvatarController } from '../../ask_me_first/src/controller.js';
import { IdentityResolver } from '../../ask_me_first/src/identity/resolver.js';

const { join } = require('path');
const { existsSync, readFileSync } = require('fs');

// ── Session tracking ──
// Maps sessionKey → { restricted, identity, userId } so bootstrap can access identity resolved during message:received
const restrictedSessions = new Map<string, { restricted: boolean; identity: string; userId: string }>();

// ── Restricted prompt cache ──
let promptCache: string = '';
let promptCacheTime = 0;
const PROMPT_CACHE_TTL = 5000;

/**
 * Check user identity and restricted status from users.json
 */
function checkUser(workspaceDir: string, senderId: string, _channelId?: string, _messageId?: string): { identity: string; restricted: boolean } {
  try {
    const usersPath = join(workspaceDir, 'ask_me_first/users.json');
    if (!existsSync(usersPath)) return { identity: 'guest', restricted: true };

    const data = JSON.parse(readFileSync(usersPath, 'utf-8'));
    const user = data.users?.find((u: any) => u.userId === senderId);

    if (!user) return { identity: 'guest', restricted: true };

    const identity = user.identity || 'guest';
    // admin is never restricted; others are restricted (no direct slash commands unless explicitly allowed)
    const restricted = identity !== 'admin';
    return { identity, restricted };
  } catch {
    return { identity: 'guest', restricted: true };
  }
}

/**
 * Load restricted-mode prompt (with 5s cache)
 */
function loadRestrictedPrompt(workspaceDir: string): string {
  const now = Date.now();
  if (promptCache && (now - promptCacheTime) < PROMPT_CACHE_TTL) return promptCache;

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

  promptCache = content;
  promptCacheTime = now;
  return content;
}

const handler = async (event: any) => {
  const { type, action, context } = event;
  if (!context) return;

  const workspaceDir: string = context.workspaceDir || process.env.OPENCLAW_WORKSPACE || process.cwd();

  // ── message:received ──
  if (type === 'message' && action === 'received') {
    const metadata = context.metadata ?? {};
    const senderId: string | undefined = metadata.senderId;
    const sessionKey: string | undefined = event.sessionKey;

    if (!senderId) return;

    // 1. Check identity and track for bootstrap
    const { identity, restricted } = checkUser(workspaceDir, senderId, metadata.channelId, metadata.messageId);

    if (sessionKey) {
      restrictedSessions.set(sessionKey, { restricted, identity, userId: senderId });
    }

    // 2. Update trust score for non-admin users
    if (identity !== 'admin') {
      try {
        const resolver = new IdentityResolver(workspaceDir);
        await resolver.updateTrustScore(senderId, 0.01);
      } catch (e) {
        console.error('[ask_me_first] trust score update failed:', e);
      }
    }

    return;
  }

  // ── agent:bootstrap ──
  if (type === 'agent' && action === 'bootstrap') {
    if (!Array.isArray(context.bootstrapFiles)) return;

    // 1. Initialize AvatarController and inject into global context
    if (context.global) {
      try {
        const stateConfig = {
          enablePresence: true,
          enableCalendar: true,
          calendarLookaheadHours: 1,
          cacheTTL: 10 * 60 * 1000
        };
        const controller = new AvatarController({ workspaceDir, stateConfig });
        await controller.init();
        context.global.set('avatarController', controller);
        console.log('[ask_me_first] AvatarController injected');
      } catch (e) {
        console.error('[ask_me_first] AvatarController init failed:', e);
      }
    }

    // 2. Resolve identity from session tracking or metadata
    const sessionKey: string | undefined = event.sessionKey;
    let identity = 'unknown';
    let userId = '';
    let isRestricted = false;

    if (sessionKey && restrictedSessions.has(sessionKey)) {
      const session = restrictedSessions.get(sessionKey)!;
      identity = session.identity;
      userId = session.userId;
      isRestricted = session.restricted;
    }

    if (!userId && context.metadata?.senderId) {
      userId = context.metadata.senderId;
      const result = checkUser(workspaceDir, userId);
      identity = result.identity;
      isRestricted = result.restricted;
    }

    // Admin gets no restrictions
    if (!userId || identity === 'admin') return;

    // 3. Inject identity prompt
    const identityPrompt = [
      `[User Identity — injected by ask_me_first]`,
      `User ID: ${userId}`,
      `Identity: ${identity}`,
      `The current user is NOT an administrator. Treat them according to their "${identity}" role.`,
    ].join('\n');

    context.bootstrapFiles = [
      ...context.bootstrapFiles,
      {
        name: 'user-identity.txt',
        path: join(workspaceDir, 'ask_me_first/users.json'),
        content: identityPrompt,
      },
    ];

    // 4. Inject restricted-mode prompt for non-admin users
    if (isRestricted) {
      const promptContent = loadRestrictedPrompt(workspaceDir);
      context.bootstrapFiles = [
        ...context.bootstrapFiles,
        {
          name: 'restricted-mode-prompt.txt',
          path: join(workspaceDir, 'ask_me_first/restricted-mode-prompt.txt'),
          content: promptContent,
        },
      ];
    }

    return;
  }
};

export default handler;
