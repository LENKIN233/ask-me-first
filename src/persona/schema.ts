/**
 * Persona Schema — Type-safe definitions for the per-user persona system.
 *
 * The persona.json file is human-readable and hand-editable.
 * It captures communication style, judgment rules, boundaries,
 * and learning state for the user's work avatar.
 */

// ── Voice & Style ──

export interface PersonaVoice {
  /** Tone descriptors, e.g. ["warm", "direct", "professional"] */
  tone: string[];
  /** Formality level */
  formality: 'low' | 'medium' | 'high';
  /** Response length preference */
  verbosity: 'terse' | 'brief' | 'moderate' | 'detailed';
  /** Emoji usage frequency */
  emoji: 'never' | 'rare' | 'moderate' | 'frequent';
  /** Signature phrases the user commonly uses */
  signature_phrases: string[];
  /** Typical greeting style */
  greeting_style: string;
  /** Typical sign-off style */
  signoff_style: string;
}

// ── Judgment Rules ──

export interface PersonaJudgment {
  /** Situations where the avatar can act autonomously */
  autonomous_when: string[];
  /** Situations that MUST be escalated to the user */
  escalate_when: string[];
  /** Things that annoy the user (avatar should avoid/deflect) */
  annoyances: string[];
}

// ── Relationship Defaults ──

export interface PersonaRelationshipDefaults {
  /** Default warmth for unknown contacts (0-1) */
  warmth: number;
  /** Default formality for unknown contacts */
  formality: 'low' | 'medium' | 'high';
  /** Default info-sharing level */
  info_level: 'minimal' | 'basic' | 'standard' | 'full';
}

export interface PersonaRelationships {
  /** Default behavior for unrecognized contacts */
  default: PersonaRelationshipDefaults;
  /** Override defaults by role (e.g. "manager", "peer", "client") */
  by_role: Record<string, Partial<PersonaRelationshipDefaults>>;
  /** Override defaults by specific contact ID */
  by_contact: Record<string, Partial<PersonaRelationshipDefaults>>;
}

// ── Boundaries ──

export interface PersonaBoundaries {
  /** Topics/info the avatar must NEVER share */
  never_share: string[];
  /** Topics that require user confirmation before sharing */
  confirm_before: string[];
  /** Topics safe to answer freely */
  safe_to_answer: string[];
  /** How the avatar identifies itself */
  identity_rule: string;
}

// ── Language ──

export interface PersonaLanguage {
  /** Primary language code, e.g. "zh-CN", "en" */
  primary: string;
  /** Additional languages */
  secondary: string[];
  /** Whether to mirror the sender's language */
  mirror_sender_language: boolean;
}

// ── Common Reply Patterns ──

export interface PersonaPatterns {
  /** Templated replies for common scenarios, keyed by scenario name */
  common_replies: Record<string, string>;
}

// ── Learning State ──

export type PersonaMaturity = 'seed' | 'learning' | 'stable';

export interface PersonaConfidence {
  voice: number;
  judgment: number;
  boundaries: number;
}

export interface PersonaLearning {
  /** Current learning maturity level */
  maturity: PersonaMaturity;
  /** Per-domain confidence scores (0-1) */
  confidence: PersonaConfidence;
  /** Total observed message exchanges */
  observed_messages: number;
  /** Fields that should NOT be overwritten by learning (hand-edited by user) */
  locked_fields: string[];
}

// ── Root Persona ──

export interface Persona {
  version: number;
  /** Short natural-language summary of the persona */
  summary: string;
  voice: PersonaVoice;
  judgment: PersonaJudgment;
  relationships: PersonaRelationships;
  boundaries: PersonaBoundaries;
  language: PersonaLanguage;
  patterns: PersonaPatterns;
  learning: PersonaLearning;
}

// ── Seed (default cold-start persona) ──

export const PERSONA_SEED: Persona = {
  version: 1,
  summary: '温暖、直接、简洁的工作分身。优先保护主人的专注时间，对低风险消息自主应答，不确定时礼貌转达。',
  voice: {
    tone: ['warm', 'direct', 'professional'],
    formality: 'medium',
    verbosity: 'brief',
    emoji: 'rare',
    signature_phrases: [],
    greeting_style: '你好',
    signoff_style: '',
  },
  judgment: {
    autonomous_when: [
      'acknowledgement or simple thank-you',
      'scheduling/time-related inquiries',
      'status check (project, availability)',
      'routing to correct person/channel',
      'FAQ or publicly known information',
    ],
    escalate_when: [
      'decision that commits resources or money',
      'personal or emotional topic',
      'conflict or complaint',
      'request from someone the owner has a complex relationship with',
      'anything the avatar is unsure about',
    ],
    annoyances: [],
  },
  relationships: {
    default: {
      warmth: 0.6,
      formality: 'medium',
      info_level: 'basic',
    },
    by_role: {},
    by_contact: {},
  },
  boundaries: {
    never_share: [
      'salary, compensation, or financial details',
      'private health information',
      'login credentials or API keys',
    ],
    confirm_before: [
      'schedule commitments on behalf of the owner',
      'sharing non-public project details',
    ],
    safe_to_answer: [
      'general availability',
      'public project status',
      'contact routing',
    ],
    identity_rule: '我是 {{ownerName}} 的工作分身（数字助理）。我不是本人，但可以帮你处理一些事务。',
  },
  language: {
    primary: 'zh-CN',
    secondary: ['en'],
    mirror_sender_language: true,
  },
  patterns: {
    common_replies: {
      busy: '{{ownerName}} 目前正在专注工作中。我可以先帮你记录一下，稍后转达。',
      offline: '{{ownerName}} 目前不在线。有什么我可以先帮忙的吗？',
      redirect: '这个问题可能需要联系 {{target}}，我帮你转达一下。',
    },
  },
  learning: {
    maturity: 'seed',
    confidence: {
      voice: 0,
      judgment: 0,
      boundaries: 0,
    },
    observed_messages: 0,
    locked_fields: [],
  },
};

// ── Validation ──

/**
 * Validate a persona object. Returns null if valid, or an error message.
 */
export function validatePersona(data: unknown): string | null {
  if (!data || typeof data !== 'object') return 'persona must be an object';
  const p = data as Record<string, unknown>;

  if (typeof p.version !== 'number' || p.version < 1) return 'version must be a positive number';
  if (typeof p.summary !== 'string') return 'summary must be a string';

  // Voice
  if (!p.voice || typeof p.voice !== 'object') return 'voice must be an object';
  const v = p.voice as Record<string, unknown>;
  if (!Array.isArray(v.tone)) return 'voice.tone must be an array';
  if (!['low', 'medium', 'high'].includes(v.formality as string)) return 'voice.formality must be low|medium|high';
  if (!['terse', 'brief', 'moderate', 'detailed'].includes(v.verbosity as string)) return 'voice.verbosity must be terse|brief|moderate|detailed';
  if (!['never', 'rare', 'moderate', 'frequent'].includes(v.emoji as string)) return 'voice.emoji must be never|rare|moderate|frequent';

  // Judgment
  if (!p.judgment || typeof p.judgment !== 'object') return 'judgment must be an object';
  const j = p.judgment as Record<string, unknown>;
  if (!Array.isArray(j.autonomous_when)) return 'judgment.autonomous_when must be an array';
  if (!Array.isArray(j.escalate_when)) return 'judgment.escalate_when must be an array';

  // Relationships
  if (!p.relationships || typeof p.relationships !== 'object') return 'relationships must be an object';

  // Boundaries
  if (!p.boundaries || typeof p.boundaries !== 'object') return 'boundaries must be an object';
  const b = p.boundaries as Record<string, unknown>;
  if (!Array.isArray(b.never_share)) return 'boundaries.never_share must be an array';
  if (typeof b.identity_rule !== 'string') return 'boundaries.identity_rule must be a string';

  // Language
  if (!p.language || typeof p.language !== 'object') return 'language must be an object';
  const l = p.language as Record<string, unknown>;
  if (typeof l.primary !== 'string') return 'language.primary must be a string';

  // Learning
  if (!p.learning || typeof p.learning !== 'object') return 'learning must be an object';
  const le = p.learning as Record<string, unknown>;
  if (!['seed', 'learning', 'stable'].includes(le.maturity as string)) return 'learning.maturity must be seed|learning|stable';

  return null;
}

/**
 * Load and validate a persona from a JSON string or object.
 * Returns the default seed persona on failure.
 */
export function parsePersona(input: string | Record<string, unknown>): Persona {
  try {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    const error = validatePersona(data);
    if (error) return { ...PERSONA_SEED };
    return data as Persona;
  } catch {
    return { ...PERSONA_SEED };
  }
}

/**
 * Merge partial updates into an existing persona, respecting locked_fields.
 */
export function mergePersona(base: Persona, updates: Partial<Persona>): Persona {
  const locked = new Set(base.learning.locked_fields);
  const merged = { ...base };

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'version' || key === 'learning') continue; // protected
    if (locked.has(key)) continue; // user-locked

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      (merged as any)[key] = {
        ...(merged as any)[key],
        ...value,
      };
    } else {
      (merged as any)[key] = value;
    }
  }

  return merged;
}
