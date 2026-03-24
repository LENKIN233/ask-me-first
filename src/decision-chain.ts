/**
 * Avatar Decision Chain
 *
 * Core prompt-assembly logic extracted from the before_prompt_build hook.
 * Given a sender's identity, current avatar state, and message text,
 * produces the system-context prompt parts for the LLM.
 */

import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { EscalationRouter } from './escalation/router.js';
import { EscalateLevel } from './escalation/types.js';
import type { MessageContext } from './escalation/types.js';
import { RelationshipAnalyzer } from './identity/relationship.js';
import { defaultInfoLevel, defaultRelationship } from './identity/types.js';
import type { UserEntry } from './identity/types.js';
import { stateDescription, defaultState } from './state/state.js';
import type { AppState } from './state/state.js';
import { ContextTool } from './tools/context.js';
import { MemoryTool } from './tools/memory.js';
import { atomicWriteFileSync } from './utils/safe-write.js';

export interface DecisionChainDeps {
  escalationRouter: EscalationRouter;
  relationshipAnalyzer: RelationshipAnalyzer;
  contextTool: ContextTool;
  memoryTool: MemoryTool;
}

export interface DecisionChainInput {
  workspaceDir: string;
  identity: string;
  userId: string;
  isRestricted: boolean;
  messageText: string;
  personaPrompt: string;
  restrictedPrompt: string;
  usersJsonPath: string;
  cacheTTL: number;
  loadUsers: (workspaceDir: string, cacheTTL: number, usersJsonPath?: string) => { users: any[] } | null;
  logger: { info: (...args: any[]) => void; error: (...args: any[]) => void };
}

export async function buildPromptContext(
  deps: DecisionChainDeps,
  input: DecisionChainInput,
): Promise<string[]> {
  const parts: string[] = [];
  const { workspaceDir, identity, userId, isRestricted, messageText, personaPrompt } = input;
  const { escalationRouter, relationshipAnalyzer, contextTool, memoryTool } = deps;

  const usersData = input.loadUsers(workspaceDir, input.cacheTTL, input.usersJsonPath);
  const rawUser = usersData?.users?.find((u: any) => u.userId === userId);
  const userEntry: UserEntry = rawUser ? {
    userId: rawUser.userId,
    identity: (rawUser.identity as 'admin' | 'member' | 'guest') || 'guest',
    infoLevel: rawUser.infoLevel || undefined,
    relationship: rawUser.relationship && typeof rawUser.relationship === 'object'
      ? rawUser.relationship
      : undefined,
  } : {
    userId: userId || 'unknown',
    identity: 'guest' as const,
  };

  const infoLevel = userEntry.infoLevel || defaultInfoLevel(userEntry.identity);
  const relationship = userEntry.relationship || defaultRelationship();
  const trustLevel = relationshipAnalyzer.trustLevel(userEntry);

  const currentState = loadAvatarState(workspaceDir);

  const msgCtx: MessageContext = { text: messageText, senderId: userId };
  const identityForDecision = { ...userEntry, infoLevel, relationship };
  const decision = escalationRouter.decide(msgCtx, identityForDecision, currentState) ||
    { level: EscalateLevel.Partial, reason: 'router unavailable', suggestedAction: 'reply' as const, priority: 'normal' as const };

  const availEmoji = AVAIL_EMOJI[currentState.availability] || '?';
  const stateDesc = stateDescription(currentState);
  const evidenceText = currentState.evidence.length > 0
    ? currentState.evidence.map(e => e.description).join('; ')
    : 'no evidence available';

  const persona = renderPersona(personaPrompt, {
    availability: currentState.availability,
    availEmoji,
    currentMode: currentState.current_mode,
    interruptibility: currentState.interruptibility,
    confidence: currentState.confidence,
    evidenceText,
    identity,
    trustLevel,
    infoLevel,
    decisionLevel: decision.level,
    decisionReason: decision.reason,
    stateDesc,
    expectedResponse: currentState.availability === 'online' ? '很快可以回复' : '稍后回复',
  });

  parts.push(persona);

  if (identity === 'admin') {
    parts.push([
      '[Decision: FULL ACCESS -- admin user]',
      `Current state: ${availEmoji} ${stateDesc}`,
      'You have full access. Respond comprehensively.',
    ].join('\n'));

    await injectAdminContext(parts, contextTool, memoryTool, workspaceDir);

  } else if (decision.level === EscalateLevel.Answer) {
    parts.push([
      `[Decision: ANSWER -- ${decision.reason}]`,
      `Current state: ${availEmoji} ${stateDesc}`,
      `Your info access level: ${infoLevel}. Only share information at or below this level.`,
      'Respond helpfully within your access level.',
    ].join('\n'));

  } else if (decision.level === EscalateLevel.Partial) {
    parts.push([
      `[Decision: PARTIAL -- ${decision.reason}]`,
      `Current state: ${availEmoji} ${stateDesc}`,
      `Your info access level: ${infoLevel}. Provide only public/basic information.`,
      'After providing what you can, suggest the person contact the owner directly.',
    ].join('\n'));

    if (isRestricted) parts.push(input.restrictedPrompt);

  } else if (decision.level === EscalateLevel.Escalate) {
    parts.push([
      `[Decision: ESCALATE -- ${decision.reason}]`,
      `Current state: ${availEmoji} ${stateDesc}`,
      'This message requires the owner\'s personal attention.',
      'Tell the user this has been flagged for the owner. Provide a timeline expectation based on current state.',
      'Do NOT attempt to answer the underlying question.',
    ].join('\n'));

    if (isRestricted) parts.push(input.restrictedPrompt);

    logEscalation(workspaceDir, userId, identity, decision.reason, messageText, currentState.availability, input.logger);
  }

  return parts;
}

const AVAIL_EMOJI: Record<string, string> = { online: '🟢', busy: '🔴', focus: '🟡', offline: '⚫' };

function loadAvatarState(workspaceDir: string): AppState {
  try {
    const statePath = join(workspaceDir, 'ask_me_first/avatar_state.json');
    if (existsSync(statePath)) {
      const raw = JSON.parse(readFileSync(statePath, 'utf-8'));
      return {
        availability: raw.availability || 'offline',
        interruptibility: raw.interruptibility ?? 0,
        current_mode: raw.current_mode || 'unknown',
        confidence: raw.confidence ?? 0,
        evidence: raw.evidence || [],
        updatedAt: raw.updatedAt || new Date().toISOString(),
      };
    }
  } catch { }
  return defaultState();
}

interface PersonaVars {
  availability: string;
  availEmoji: string;
  currentMode: string;
  interruptibility: number;
  confidence: number;
  evidenceText: string;
  identity: string;
  trustLevel: string;
  infoLevel: string;
  decisionLevel: string;
  decisionReason: string;
  stateDesc: string;
  expectedResponse: string;
}

function renderPersona(template: string, vars: PersonaVars): string {
  return template
    .replace(/\{\{ownerName\}\}/g, 'Owner')
    .replace(/\{\{availability\}\}/g, vars.availability)
    .replace(/\{\{availabilityEmoji\}\}/g, vars.availEmoji)
    .replace(/\{\{currentMode\}\}/g, vars.currentMode)
    .replace(/\{\{interruptibility\}\}/g, String(Math.round(vars.interruptibility * 100)))
    .replace(/\{\{confidence\}\}/g, String(Math.round(vars.confidence * 100)))
    .replace(/\{\{evidence\}\}/g, vars.evidenceText)
    .replace(/\{\{senderIdentity\}\}/g, vars.identity)
    .replace(/\{\{senderRole\}\}/g, vars.identity)
    .replace(/\{\{trustLevel\}\}/g, vars.trustLevel)
    .replace(/\{\{infoLevel\}\}/g, vars.infoLevel)
    .replace(/\{\{decisionLevel\}\}/g, vars.decisionLevel)
    .replace(/\{\{decisionReason\}\}/g, vars.decisionReason)
    .replace(/\{\{stateDescription\}\}/g, vars.stateDesc)
    .replace(/\{\{expectedResponse\}\}/g, vars.expectedResponse)
    .replace(/\{\{version\}\}/g, '2.0.0');
}

async function injectAdminContext(
  parts: string[],
  contextTool: ContextTool,
  memoryTool: MemoryTool,
  workspaceDir: string,
): Promise<void> {
  try {
    const projCtx = await contextTool.getContext(workspaceDir);
    if (projCtx.recentCommits.length > 0 || projCtx.currentTask) {
      const ctxLines = ['[Project Context]'];
      if (projCtx.currentTask) ctxLines.push(`Current task: ${projCtx.currentTask}`);
      if (projCtx.recentCommits.length > 0) ctxLines.push(`Recent commits:\n${projCtx.recentCommits.join('\n')}`);
      if (projCtx.openFiles.length > 0) ctxLines.push(`Open files: ${projCtx.openFiles.join(', ')}`);
      parts.push(ctxLines.join('\n'));
    }
  } catch { }

  try {
    const memPath = join(workspaceDir, 'MEMORY.md');
    const memory = await memoryTool.readMemory(memPath);
    if (memory) {
      parts.push(`[Memory Context]\n${memory.slice(0, 2000)}`);
    }
  } catch { }
}

function logEscalation(
  workspaceDir: string,
  userId: string,
  identity: string,
  reason: string,
  messageText: string,
  availability: string,
  logger: { error: (...args: any[]) => void },
): void {
  try {
    const escalationLogPath = join(workspaceDir, 'ask_me_first/escalations.json');
    let escalations: any[] = [];
    if (existsSync(escalationLogPath)) {
      try { escalations = JSON.parse(readFileSync(escalationLogPath, 'utf-8')); } catch { escalations = []; }
    }
    escalations.push({
      timestamp: new Date().toISOString(),
      senderId: userId,
      identity,
      reason,
      messagePreview: messageText.slice(0, 200),
      state: availability,
    });
    if (escalations.length > 100) escalations = escalations.slice(-100);
    atomicWriteFileSync(escalationLogPath, JSON.stringify(escalations, null, 2));
  } catch (e) {
    logger.error('[ask-me-first] escalation log failed:', e);
  }
}
