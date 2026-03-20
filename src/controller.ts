import { StateDetector } from './state/detector.js';
import { IdentityResolver } from './identity/resolver.js';
import { RelationshipAnalyzer } from './identity/relationship.js';
import { Permissions, InfoLevel } from './identity/permissions.js';
import { EscalationRouter } from './escalation/router.js';
import { EscalateLevel, Decision } from './escalation/types.js';
import { ReplyFormatter } from './generation/formatter.js';
import { AppState, stateDescription } from './state/state.js';
import { UserEntry } from './identity/types.js';
import { MemoryTool } from './tools/memory.js';
import { ContextTool } from './tools/context.js';
import { CalendarTool, CalendarEvent } from './tools/calendar.js';
import fs from 'fs';
import path from 'path';

export interface AvatarControllerConfig {
  workspaceDir: string;
  stateConfig: {
    enablePresence: boolean;
    enableCalendar: boolean;
    calendarLookaheadHours: number;
    cacheTTL: number;
  };
}

type ResolvedUser = UserEntry & { infoLevel: string; relationship: NonNullable<UserEntry['relationship']> };

export interface ProcessResult {
  reply: string;
  decision: Decision;
  state: AppState;
  identity: ResolvedUser;
}

export class AvatarController {
  private stateDetector: StateDetector;
  private identityResolver: IdentityResolver;
  private escalationRouter: EscalationRouter;
  private replyFormatter: ReplyFormatter;
  private relationshipAnalyzer: RelationshipAnalyzer;
  private memoryTool: MemoryTool;
  private contextTool: ContextTool;
  private calendarTool: CalendarTool;
  private initialized = false;

  constructor(private config: AvatarControllerConfig) {
    this.stateDetector = new StateDetector({ ...config.stateConfig, workspaceDir: config.workspaceDir });
    this.identityResolver = new IdentityResolver(config.workspaceDir);
    this.escalationRouter = new EscalationRouter();
    this.replyFormatter = new ReplyFormatter();
    this.relationshipAnalyzer = new RelationshipAnalyzer();
    this.memoryTool = new MemoryTool();
    this.contextTool = new ContextTool();
    this.calendarTool = new CalendarTool();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const rulesPath = path.join(this.config.workspaceDir, 'ask_me_first/config/escalationRules.json');
    await this.escalationRouter.loadRules(rulesPath);
    this.initialized = true;
  }

  async process(inbound: {
    text: string;
    senderId: string;
    messageId?: string;
    channel?: string;
  }): Promise<ProcessResult> {
    await this.init();

    const identity = await this.identityResolver.resolve(inbound.senderId);
    const state = await this.stateDetector.getState();

    const msgCtx = { text: inbound.text, senderId: inbound.senderId };
    const decision = this.escalationRouter.decide(msgCtx, identity, state);

    const reply = await this.generateReply(decision, state, identity, inbound.text);

    return { reply, decision, state, identity };
  }

  private async generateReply(
    decision: Decision,
    state: AppState,
    identity: ResolvedUser,
    originalText: string
  ): Promise<string> {
    if (decision.level === EscalateLevel.Escalate) {
      if (decision.suggestedAction === 'notify_owner') {
        this.appendEscalationLog(originalText, identity, decision);
      }
      return this.replyFormatter.format({
        decision,
        state,
        identity,
        topic: originalText
      });
    }

    if (decision.level === EscalateLevel.Partial) {
      const contextInfo = await this.gatherContext(identity);
      return this.replyFormatter.format({
        decision,
        state,
        identity,
        context: contextInfo,
        topic: originalText
      });
    }

    // EscalateLevel.Answer — full response with all available context
    const contextInfo = await this.gatherContext(identity);
    const calendarSummary = await this.getCalendarSummary();
    const fullContext = [contextInfo, calendarSummary].filter(Boolean).join('\n');

    return this.replyFormatter.format({
      decision,
      state,
      identity,
      answer: fullContext || stateDescription(state),
      topic: originalText
    });
  }

  private async gatherContext(identity: ResolvedUser): Promise<string> {
    const parts: string[] = [];
    const trustLevel = this.relationshipAnalyzer.trustLevel(identity);

    if (Permissions.canAnswer(identity.infoLevel, InfoLevel.Internal)) {
      try {
        const memPath = path.join(this.config.workspaceDir, 'MEMORY.md');
        const mem = await this.memoryTool.readMemory(memPath);
        if (mem) {
          const maxLen = trustLevel === 'high' ? 500 : trustLevel === 'medium' ? 200 : 100;
          parts.push(mem.slice(0, maxLen));
        }
      } catch { }

      try {
        const projectCtx = await this.contextTool.getContext(this.config.workspaceDir);
        if (projectCtx.currentTask) {
          parts.push(`当前任务: ${projectCtx.currentTask}`);
        }
        if (trustLevel !== 'low' && projectCtx.recentCommits.length > 0) {
          const commitLimit = trustLevel === 'high' ? 3 : 1;
          parts.push(`最近提交: ${projectCtx.recentCommits.slice(0, commitLimit).join('; ')}`);
        }
        if (trustLevel === 'high' && projectCtx.openFiles.length > 0) {
          parts.push(`正在编辑: ${projectCtx.openFiles.join(', ')}`);
        }
      } catch { }
    }

    return parts.join('\n') || '暂无可用上下文';
  }

  private async getCalendarSummary(): Promise<string> {
    if (!this.calendarTool.isAvailable()) return '';

    try {
      const events = await this.calendarTool.getUpcomingEvents(2);
      if (events.length === 0) return '';

      const now = new Date();
      const current = events.find((ev: CalendarEvent) => new Date(ev.start) <= now && new Date(ev.end) >= now);
      if (current) return `当前会议: ${current.title}`;

      const next = events[0];
      const mins = Math.round((new Date(next.start).getTime() - now.getTime()) / 60000);
      return `下个日程: ${next.title}（${mins}分钟后）`;
    } catch {
      return '';
    }
  }

  async refreshState(): Promise<AppState> {
    return this.stateDetector.refresh();
  }

  async reloadConfig(): Promise<void> {
    await this.identityResolver.reload();
    this.initialized = false;
    await this.init();
  }

  async confirmReply(userId: string): Promise<void> {
    await this.identityResolver.updateTrustScore(userId, 0.05);
  }

  private appendEscalationLog(
    messageText: string,
    identity: ResolvedUser,
    decision: Decision
  ): void {
    try {
      const logPath = path.join(this.config.workspaceDir, 'ask_me_first/escalations.json');
      let log = { entries: [] as any[] };
      if (fs.existsSync(logPath)) {
        try { log = JSON.parse(fs.readFileSync(logPath, 'utf-8')); } catch { }
      }
      log.entries.push({
        timestamp: new Date().toISOString(),
        senderId: identity.userId,
        senderIdentity: identity.identity,
        message: messageText.slice(0, 500),
        reason: decision.reason,
        priority: decision.priority,
        handled: false
      });
      const logDir = path.dirname(logPath);
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    } catch (e) {
      console.error('[AvatarController] Failed to write escalation log:', e);
    }
  }
}
