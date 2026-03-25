/**
 * PersonaLearner — Observes real conversations and distills persona traits over time.
 *
 * Two-phase learning:
 *   1. observe() — append raw observation to persona_events.jsonl (fast, every message)
 *   2. distill() — synthesize observations into persona.json updates (batch, periodic)
 *
 * The learner never overwrites locked_fields (hand-edited by user).
 * Maturity progresses: seed → learning (10+ obs) → stable (50+ obs).
 */

import { existsSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import type { Persona, PersonaMaturity } from './schema.ts';
import { parsePersona, mergePersona, validatePersona } from './schema.ts';
import { atomicWriteFileSync } from '../utils/safe-write.ts';

export interface Observation {
  timestamp: string;
  inbound: string;
  outbound: string;
  senderIdentity: string;
  intent: string;
  wasClaimed: boolean;
}

export interface DistillConfig {
  minObservationsForDistill: number;
  minTimeBetweenDistillMs: number;
}

const DEFAULT_DISTILL_CONFIG: DistillConfig = {
  minObservationsForDistill: 10,
  minTimeBetweenDistillMs: 30 * 60 * 1000, // 30 minutes
};

const MATURITY_THRESHOLDS: Record<PersonaMaturity, number> = {
  seed: 0,
  learning: 10,
  stable: 50,
};

export class PersonaLearner {
  private workspaceDir: string;
  private config: DistillConfig;
  private observationsSinceDistill = 0;
  private lastDistillTime = 0;

  constructor(workspaceDir: string, config?: Partial<DistillConfig>) {
    this.workspaceDir = workspaceDir;
    this.config = { ...DEFAULT_DISTILL_CONFIG, ...config };
  }

  private get personaPath(): string {
    return join(this.workspaceDir, 'ask_me_first/persona.json');
  }

  private get eventsPath(): string {
    return join(this.workspaceDir, 'ask_me_first/persona_events.jsonl');
  }

  loadPersona(): Persona {
    try {
      if (existsSync(this.personaPath)) {
        return parsePersona(readFileSync(this.personaPath, 'utf-8'));
      }
    } catch { /* fall through */ }
    return parsePersona({});
  }

  /**
   * Record a single observed exchange. Appends to persona_events.jsonl.
   * Returns true if distill() should be called (threshold reached).
   */
  observe(
    inboundMsg: string,
    outboundReply: string,
    senderIdentity: string,
    intent: string,
    wasClaimed: boolean,
  ): boolean {
    const obs: Observation = {
      timestamp: new Date().toISOString(),
      inbound: inboundMsg.slice(0, 500),
      outbound: outboundReply.slice(0, 500),
      senderIdentity,
      intent,
      wasClaimed,
    };

    try {
      appendFileSync(this.eventsPath, JSON.stringify(obs) + '\n', 'utf-8');
    } catch {
      return false;
    }

    this.observationsSinceDistill++;

    const timeSinceDistill = Date.now() - this.lastDistillTime;
    return (
      this.observationsSinceDistill >= this.config.minObservationsForDistill &&
      timeSinceDistill >= this.config.minTimeBetweenDistillMs
    );
  }

  /**
   * Synthesize recent observations into persona.json updates.
   *
   * This is a rule-based distiller (no LLM needed). It extracts:
   * - Verbosity signal from reply lengths
   * - Formality signal from language patterns
   * - Emoji usage frequency
   * - Maturity progression
   *
   * Returns the updated persona, or null if distill was skipped.
   */
  distill(): Persona | null {
    const persona = this.loadPersona();
    const observations = this.loadRecentObservations();

    if (observations.length < this.config.minObservationsForDistill) {
      return null;
    }

    const ownerReplies = observations
      .filter(o => !o.wasClaimed && o.outbound.length > 0)
      .map(o => o.outbound);

    if (ownerReplies.length < 3) {
      this.advanceMaturity(persona, observations.length);
      this.savePersona(persona);
      this.lastDistillTime = Date.now();
      this.observationsSinceDistill = 0;
      return persona;
    }

    const updates: Partial<Persona> = {};

    // ── Verbosity signal ──
    const avgLen = ownerReplies.reduce((sum, r) => sum + r.length, 0) / ownerReplies.length;
    const verbosity = avgLen < 30 ? 'terse' as const
      : avgLen < 80 ? 'brief' as const
      : avgLen < 200 ? 'moderate' as const
      : 'detailed' as const;

    // ── Emoji signal ──
    const emojiRe = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
    const emojiCounts = ownerReplies.map(r => (r.match(emojiRe) || []).length);
    const avgEmoji = emojiCounts.reduce((a, b) => a + b, 0) / emojiCounts.length;
    const emojiLevel = avgEmoji < 0.1 ? 'never' as const
      : avgEmoji < 0.5 ? 'rare' as const
      : avgEmoji < 1.5 ? 'moderate' as const
      : 'frequent' as const;

    // ── Formality signal (Chinese-specific heuristics) ──
    const formalMarkers = /[您贵敬请]|谢谢您|烦请|劳驾/g;
    const casualMarkers = /哈哈|嘿|哎|嘛|啦|呀|咋/g;
    let formalScore = 0;
    for (const reply of ownerReplies) {
      const fCount = (reply.match(formalMarkers) || []).length;
      const cCount = (reply.match(casualMarkers) || []).length;
      if (fCount > cCount) formalScore++;
      else if (cCount > fCount) formalScore--;
    }
    const formality = formalScore > ownerReplies.length * 0.3 ? 'high' as const
      : formalScore < -ownerReplies.length * 0.3 ? 'low' as const
      : 'medium' as const;

    updates.voice = {
      ...persona.voice,
      verbosity,
      emoji: emojiLevel,
      formality,
    };

    // ── Advance maturity ──
    const totalObs = persona.learning.observed_messages + observations.length;
    const merged = mergePersona(persona, updates);

    merged.learning = {
      ...merged.learning,
      observed_messages: totalObs,
      confidence: {
        voice: Math.min(1, totalObs / 50),
        judgment: Math.min(1, totalObs / 100),
        boundaries: merged.learning.confidence.boundaries,
      },
    };

    this.advanceMaturity(merged, totalObs);
    this.savePersona(merged);
    this.truncateEvents(observations.length);

    this.lastDistillTime = Date.now();
    this.observationsSinceDistill = 0;

    return merged;
  }

  private advanceMaturity(persona: Persona, totalObs: number): void {
    if (totalObs >= MATURITY_THRESHOLDS.stable) {
      persona.learning.maturity = 'stable';
    } else if (totalObs >= MATURITY_THRESHOLDS.learning) {
      persona.learning.maturity = 'learning';
    }
  }

  private loadRecentObservations(): Observation[] {
    try {
      if (!existsSync(this.eventsPath)) return [];
      const lines = readFileSync(this.eventsPath, 'utf-8')
        .split('\n')
        .filter(l => l.trim());
      return lines.map(l => JSON.parse(l) as Observation);
    } catch {
      return [];
    }
  }

  private savePersona(persona: Persona): void {
    const error = validatePersona(persona);
    if (error) return;
    atomicWriteFileSync(this.personaPath, JSON.stringify(persona, null, 2));
  }

  /**
   * After distill, keep only the last N events as a sliding window.
   * Prevents unbounded growth of persona_events.jsonl.
   */
  private truncateEvents(processedCount: number): void {
    try {
      if (!existsSync(this.eventsPath)) return;
      const lines = readFileSync(this.eventsPath, 'utf-8')
        .split('\n')
        .filter(l => l.trim());

      // Keep events that arrived after the ones we just processed
      const remaining = lines.slice(processedCount);
      if (remaining.length < lines.length) {
        atomicWriteFileSync(this.eventsPath, remaining.join('\n') + (remaining.length > 0 ? '\n' : ''));
      }
    } catch { /* non-critical */ }
  }
}
