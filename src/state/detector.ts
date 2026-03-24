import { AppState, defaultState, Evidence } from './state.js';
import { PresenceTool } from '../tools/presence.js';
import { CalendarTool } from '../tools/calendar.js';
import fs from 'fs';
import path from 'path';

export interface StateDetectorConfig {
  enablePresence: boolean;
  enableCalendar: boolean;
  calendarLookaheadHours: number;
  cacheTTL: number;
  workspaceDir?: string;
  feishuAppId?: string;
  feishuAppSecret?: string;
  feishuCalendarId?: string;
}

export class StateDetector {
  private config: StateDetectorConfig;
  private cache: { state: AppState; fetchedAt: number } | null = null;
  private presenceTool = new PresenceTool();
  private calendarTool: CalendarTool;

  constructor(config: StateDetectorConfig) {
    this.config = config;
    this.calendarTool = new CalendarTool({
      appId: config.feishuAppId,
      appSecret: config.feishuAppSecret,
      calendarId: config.feishuCalendarId,
    });
  }

  async getState(): Promise<AppState> {
    const now = Date.now();
    if (this.cache && (now - this.cache.fetchedAt) < this.config.cacheTTL) {
      return this.cache.state;
    }

    const state = await this.detect();
    this.cache = { state, fetchedAt: now };
    return state;
  }

  async refresh(): Promise<AppState> {
    this.cache = null;
    return this.getState();
  }

  private async detect(): Promise<AppState> {
    const explicit = this.readExplicitState();
    if (explicit) return explicit;

    const sources: Promise<{ availability: string; interruptibility: number; mode: string; confidence: number; evidence: Evidence[] }>[] = [];

    if (this.config.enablePresence) {
      sources.push(this.detectPresence());
    }

    if (this.config.enableCalendar) {
      sources.push(this.detectCalendar());
    }

    const results = await Promise.all(sources);

    return this.merge(results);
  }

  private readExplicitState(): AppState | null {
    try {
      const workspaceDir = this.config.workspaceDir || process.env.OPENCLAW_WORKSPACE || process.cwd();
      const statePath = path.join(workspaceDir, 'ask_me_first/avatar_state.json');
      if (!fs.existsSync(statePath)) return null;
      const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      if (!raw.explicit || !raw.explicitSetAt) return null;

      const EXPLICIT_TTL_MS = 4 * 60 * 60 * 1000;
      const elapsed = Date.now() - new Date(raw.explicitSetAt).getTime();
      if (elapsed > EXPLICIT_TTL_MS) return null;

      return {
        availability: raw.availability,
        interruptibility: raw.interruptibility ?? 0,
        current_mode: raw.current_mode ?? 'manual',
        confidence: 1.0,
        evidence: raw.evidence ?? [],
        updatedAt: raw.updatedAt ?? new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  private async detectPresence(): Promise<{ availability: string; interruptibility: number; mode: string; confidence: number; evidence: Evidence[] }> {
    const evidence: Evidence[] = [];

    try {
      const presence = await this.presenceTool.getPresence();

      evidence.push({
        type: 'presence',
        description: `前台窗口: ${presence.windowTitle} (${presence.processName})`,
        timestamp: new Date().toISOString(),
        source: 'local'
      });

      const mode = this.presenceTool.inferMode(presence.processName, presence.windowTitle);
      const { availability, interruptibility } = this.presenceTool.assessAvailability(presence.processName, presence.windowTitle);

      return { availability, interruptibility, mode, confidence: 0.7, evidence };
    } catch (error) {
      evidence.push({
        type: 'presence',
        description: `检测失败: ${error}`,
        timestamp: new Date().toISOString(),
        source: 'local'
      });
      return { availability: 'offline', interruptibility: 0, mode: 'unknown', confidence: 0, evidence };
    }
  }

  private async detectCalendar(): Promise<{ availability: string; interruptibility: number; mode: string; confidence: number; evidence: Evidence[] }> {
    const evidence: Evidence[] = [];

    try {
      if (!this.calendarTool.isAvailable()) {
        evidence.push({
          type: 'calendar',
          description: '飞书日历凭证未配置，跳过',
          timestamp: new Date().toISOString(),
          source: 'feishu'
        });
        return { availability: 'online', interruptibility: 0.8, mode: 'unknown', confidence: 0.1, evidence };
      }

      const events = await this.calendarTool.getUpcomingEvents(this.config.calendarLookaheadHours);
      const now = new Date();
      const currentEvent = events.find(ev => new Date(ev.start) <= now && new Date(ev.end) >= now);

      if (currentEvent) {
        evidence.push({
          type: 'calendar',
          description: `当前会议: ${currentEvent.title}`,
          timestamp: new Date().toISOString(),
          source: 'feishu'
        });
        return {
          availability: currentEvent.isBusy ? 'busy' : 'online',
          interruptibility: currentEvent.isBusy ? 0.1 : 0.5,
          mode: 'meeting',
          confidence: 0.9,
          evidence
        };
      }

      const nextEvent = events[0];
      if (nextEvent) {
        const minutesUntil = (new Date(nextEvent.start).getTime() - now.getTime()) / 60000;
        evidence.push({
          type: 'calendar',
          description: `下个事件: ${nextEvent.title}（${Math.round(minutesUntil)}分钟后）`,
          timestamp: new Date().toISOString(),
          source: 'feishu'
        });
        return {
          availability: 'online',
          interruptibility: minutesUntil < 15 ? 0.5 : 0.8,
          mode: 'unknown',
          confidence: 0.6,
          evidence
        };
      }

      evidence.push({
        type: 'calendar',
        description: `未来${this.config.calendarLookaheadHours}小时无日历事件`,
        timestamp: new Date().toISOString(),
        source: 'feishu'
      });
      return { availability: 'online', interruptibility: 0.9, mode: 'unknown', confidence: 0.5, evidence };
    } catch (error) {
      evidence.push({
        type: 'calendar',
        description: `日历读取失败: ${error}`,
        timestamp: new Date().toISOString(),
        source: 'feishu'
      });
      return { availability: 'offline', interruptibility: 0, mode: 'unknown', confidence: 0, evidence };
    }
  }

  /**
   * 合并多源结果（置信度加权平均）
   */
  private merge(results: Array<{ availability: string; interruptibility: number; mode: string; confidence: number; evidence: Evidence[] }>): AppState {
    if (results.length === 0) {
      return defaultState();
    }

    let totalConfidence = 0;
    let weightedAvailability = 0;
    let weightedInterruptibility = 0;
    const modes: string[] = [];
    const allEvidence: Evidence[] = [];

    for (const r of results) {
      const weight = r.confidence;
      totalConfidence += weight;
      weightedAvailability += this.availabilityScore(r.availability) * weight;
      weightedInterruptibility += r.interruptibility * weight;
      if (r.mode !== 'unknown') modes.push(r.mode);
      allEvidence.push(...r.evidence);
    }

    if (totalConfidence === 0) {
      return defaultState();
    }

    const avgInterruptibility = weightedInterruptibility / totalConfidence;
    const avgAvailabilityScore = weightedAvailability / totalConfidence;

    let availability: 'online' | 'busy' | 'focus' | 'offline';
    if (avgAvailabilityScore < 0.3) availability = 'offline';
    else if (avgAvailabilityScore < 0.6) availability = 'busy';
    else if (avgAvailabilityScore < 0.8) availability = 'online';
    else availability = 'online';

    const modeCount = new Map<string, number>();
    for (const m of modes) {
      modeCount.set(m, (modeCount.get(m) ?? 0) + 1);
    }
    const mode = modes.length > 0
      ? Array.from(modeCount.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : 'unknown';

    return {
      availability,
      interruptibility: avgInterruptibility,
      current_mode: mode,
      confidence: Math.min(1, totalConfidence / results.length),
      evidence: allEvidence,
      updatedAt: new Date().toISOString()
    };
  }

  private availabilityScore(avail: string): number {
    switch (avail) {
      case 'offline': return 0;
      case 'busy': return 0.5;
      case 'online': return 1;
      case 'focus': return 0.7;
      default: return 0;
    }
  }
}
