/**
 * PersonaRenderer — Compiles persona.json + runtime state into a compact system prompt.
 *
 * Replaces the static persona-system-prompt.md template when a learned persona
 * is available. The output is a dense, token-efficient prompt (400-800 tokens)
 * that captures the avatar's voice, judgment rules, boundaries, and current state.
 */

import type { Persona, PersonaMaturity } from './schema.ts';

// ── Runtime context injected at render time ──

export interface RuntimeContext {
  /** Owner display name */
  ownerName: string;
  /** Current availability: online | busy | focus | offline */
  availability: string;
  /** Current mode description, e.g. "deep work", "meeting" */
  currentMode: string;
  /** 0-1 interruptibility score */
  interruptibility: number;
  /** 0-1 state confidence */
  confidence: number;
  /** Evidence descriptions */
  evidence: string[];
  /** Sender identity: admin | member | guest */
  senderIdentity: string;
  /** Sender trust level: high | medium | low */
  trustLevel: string;
  /** Sender info access level: owner_only | trusted | internal | public */
  infoLevel: string;
  /** Escalation decision: answer | partial | escalate */
  decisionLevel: string;
  /** Why this decision was made */
  decisionReason: string;
  /** Human-readable state description */
  stateDescription: string;
}

// ── Emoji map ──

const AVAIL_EMOJI: Record<string, string> = {
  online: '🟢',
  busy: '🔴',
  focus: '🟡',
  offline: '⚫',
};

// ── Maturity label ──

const MATURITY_LABEL: Record<PersonaMaturity, string> = {
  seed: '初始',
  learning: '学习中',
  stable: '稳定',
};

/**
 * Render a persona + runtime context into a system prompt string.
 *
 * Design goals:
 * - 400-800 tokens for typical persona
 * - All behavioral rules are concrete and actionable
 * - No vague instructions — every line has a clear directive
 * - Structured for LLM readability (headers, bullets)
 */
export function renderPersonaPrompt(persona: Persona, ctx: RuntimeContext): string {
  const sections: string[] = [];

  // ── Identity ──
  const identityRule = persona.boundaries.identity_rule
    .replace(/\{\{ownerName\}\}/g, ctx.ownerName);

  sections.push([
    `# 你是 ${ctx.ownerName} 的工作分身`,
    '',
    identityRule,
    '',
    `人格概要: ${persona.summary}`,
    `成熟度: ${MATURITY_LABEL[persona.learning.maturity] || persona.learning.maturity}`,
  ].join('\n'));

  // ── Voice ──
  const voiceLines = [
    '## 说话风格',
    `- 语气: ${persona.voice.tone.join('、')}`,
    `- 正式度: ${persona.voice.formality}`,
    `- 详细度: ${persona.voice.verbosity}`,
    `- Emoji: ${persona.voice.emoji}`,
  ];
  if (persona.voice.greeting_style) {
    voiceLines.push(`- 打招呼: "${persona.voice.greeting_style}"`);
  }
  if (persona.voice.signoff_style) {
    voiceLines.push(`- 收尾: "${persona.voice.signoff_style}"`);
  }
  if (persona.voice.signature_phrases.length > 0) {
    voiceLines.push(`- 常用表达: ${persona.voice.signature_phrases.map(p => `"${p}"`).join(', ')}`);
  }
  // Language
  voiceLines.push(`- 主语言: ${persona.language.primary}`);
  if (persona.language.secondary.length > 0) {
    voiceLines.push(`- 副语言: ${persona.language.secondary.join(', ')}`);
  }
  if (persona.language.mirror_sender_language) {
    voiceLines.push('- 跟随对方语言');
  }
  sections.push(voiceLines.join('\n'));

  // ── Current state ──
  const emoji = AVAIL_EMOJI[ctx.availability] || '?';
  const intrPct = Math.round(ctx.interruptibility * 100);
  const confPct = Math.round(ctx.confidence * 100);
  const evidenceStr = ctx.evidence.length > 0
    ? ctx.evidence.join('; ')
    : '无';

  sections.push([
    '## 当前状态',
    `${emoji} ${ctx.availability} — ${ctx.currentMode}`,
    `可打断: ${intrPct}% | 置信: ${confPct}%`,
    `依据: ${evidenceStr}`,
  ].join('\n'));

  // ── Sender context ──
  sections.push([
    '## 来访者',
    `身份: ${ctx.senderIdentity} | 信任: ${ctx.trustLevel} | 信息级: ${ctx.infoLevel}`,
    `决策: **${ctx.decisionLevel}** — ${ctx.decisionReason}`,
  ].join('\n'));

  // ── Judgment rules ──
  const judgmentLines = ['## 判断规则'];
  if (persona.judgment.autonomous_when.length > 0) {
    judgmentLines.push('可自主回答:');
    for (const rule of persona.judgment.autonomous_when) {
      judgmentLines.push(`- ${rule}`);
    }
  }
  if (persona.judgment.escalate_when.length > 0) {
    judgmentLines.push('必须升级:');
    for (const rule of persona.judgment.escalate_when) {
      judgmentLines.push(`- ${rule}`);
    }
  }
  if (persona.judgment.annoyances.length > 0) {
    judgmentLines.push('注意回避:');
    for (const rule of persona.judgment.annoyances) {
      judgmentLines.push(`- ${rule}`);
    }
  }
  sections.push(judgmentLines.join('\n'));

  // ── Boundaries ──
  const boundaryLines = ['## 边界'];
  if (persona.boundaries.never_share.length > 0) {
    boundaryLines.push('绝不泄露:');
    for (const item of persona.boundaries.never_share) {
      boundaryLines.push(`- ${item}`);
    }
  }
  if (persona.boundaries.confirm_before.length > 0) {
    boundaryLines.push('需确认后分享:');
    for (const item of persona.boundaries.confirm_before) {
      boundaryLines.push(`- ${item}`);
    }
  }
  if (persona.boundaries.safe_to_answer.length > 0) {
    boundaryLines.push('可自由回答:');
    for (const item of persona.boundaries.safe_to_answer) {
      boundaryLines.push(`- ${item}`);
    }
  }
  sections.push(boundaryLines.join('\n'));

  // ── Common reply patterns (only if any exist) ──
  const patternEntries = Object.entries(persona.patterns.common_replies);
  if (patternEntries.length > 0) {
    const patternLines = ['## 常用回复模板'];
    for (const [scenario, template] of patternEntries) {
      const rendered = template
        .replace(/\{\{ownerName\}\}/g, ctx.ownerName)
        .replace(/\{\{target\}\}/g, '相关人员');
      patternLines.push(`${scenario}: "${rendered}"`);
    }
    sections.push(patternLines.join('\n'));
  }

  // ── Response strategy based on decision ──
  sections.push(renderResponseStrategy(ctx));

  // ── Hard rules (always present, compact) ──
  sections.push([
    '## 铁律',
    '- 不承诺、不越权、不伪装成本人',
    '- 不泄露超出对方信息级的内容',
    '- 不暴露决策内部逻辑',
    '- 不确定时默认升级',
    '- 不编造信息',
  ].join('\n'));

  return sections.join('\n\n');
}

/**
 * Render decision-specific response strategy.
 */
function renderResponseStrategy(ctx: RuntimeContext): string {
  const lines = ['## 回复策略'];

  switch (ctx.decisionLevel) {
    case 'answer':
    case 'Answer':
      lines.push(
        '当前决策: 可直接回答',
        '- 在信息级范围内全面回复',
        '- 可提供背景和主动补充',
      );
      break;
    case 'partial':
    case 'Partial':
      lines.push(
        '当前决策: 部分回答',
        '- 分享公开/基础信息',
        `- 说明 ${ctx.ownerName} 需亲自确认`,
        `- 告知: "${ctx.ownerName}目前${ctx.stateDescription}"`,
      );
      break;
    case 'escalate':
    case 'Escalate':
      lines.push(
        '当前决策: 需要升级',
        '- 不尝试回答实质问题',
        `- 告知已转达给 ${ctx.ownerName}`,
        `- 提供时间预期: "${ctx.ownerName}目前${ctx.stateDescription}"`,
      );
      break;
    default:
      lines.push(`当前决策: ${ctx.decisionLevel} — ${ctx.decisionReason}`);
  }

  return lines.join('\n');
}

/**
 * Render a minimal claim-reply prompt for inbound_claim hook.
 * This is a lighter version used when the avatar auto-claims a message
 * and needs to generate a quick reply without the full decision chain.
 *
 * Target: ~200-400 tokens.
 */
export function renderClaimPrompt(
  persona: Persona,
  ctx: Pick<RuntimeContext, 'ownerName' | 'availability' | 'currentMode' | 'stateDescription'>,
  messageContent: string,
  classificationReason: string,
): string {
  const emoji = AVAIL_EMOJI[ctx.availability] || '?';
  const identityRule = persona.boundaries.identity_rule
    .replace(/\{\{ownerName\}\}/g, ctx.ownerName);

  const sections = [
    `你是 ${ctx.ownerName} 的工作分身。${identityRule}`,
    '',
    `状态: ${emoji} ${ctx.availability} — ${ctx.currentMode}`,
    `语气: ${persona.voice.tone.join('、')} | 正式度: ${persona.voice.formality} | 详细度: ${persona.voice.verbosity}`,
  ];

  if (persona.language.mirror_sender_language) {
    sections.push('跟随对方语言。');
  } else {
    sections.push(`使用 ${persona.language.primary}。`);
  }

  // Include relevant common reply template if availability matches
  const availKey = ctx.availability;
  if (persona.patterns.common_replies[availKey]) {
    const template = persona.patterns.common_replies[availKey]
      .replace(/\{\{ownerName\}\}/g, ctx.ownerName);
    sections.push(`参考回复: "${template}"`);
  }

  sections.push(
    '',
    '规则: 不承诺、不越权、不伪装成本人、不编造、简洁。',
    '',
    `分类: ${classificationReason}`,
    `来访消息: "${messageContent}"`,
    '',
    '请生成一条简短回复（1-3句）。',
  );

  return sections.join('\n');
}
