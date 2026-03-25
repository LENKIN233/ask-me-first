import type { Persona } from './schema.ts';

export type MessageIntent =
  | 'greeting'
  | 'acknowledgement'
  | 'scheduling'
  | 'status_check'
  | 'routing'
  | 'faq'
  | 'request'
  | 'complaint'
  | 'personal'
  | 'decision'
  | 'unknown';

export type SensitivityLevel = 'none' | 'low' | 'medium' | 'high';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface ClassificationResult {
  intent: MessageIntent;
  sensitivity: SensitivityLevel;
  risk: RiskLevel;
  canAutoClaim: boolean;
  reason: string;
}

const GREETING_RE = /^(hi|hello|hey|你好|嗨|哈喽|早|晚上好|下午好|早上好|good\s*(morning|afternoon|evening))[\s!！。.，,]?$/i;
const ACK_RE = /^(ok|okay|好的?|收到|了解|明白|谢谢|thanks?|thank\s*you|thx|👍|🙏|got\s*it|sure)[\s!！。.，,]?$/i;
const SCHEDULE_RE = /(会议|meeting|日程|schedule|calendar|时间|几点|what\s*time|when|明天|tomorrow|下周|next\s*week|约|book|reschedule|取消|cancel)/i;
const STATUS_RE = /(状态|status|进度|progress|update|怎么样了|还在吗|在不在|available|busy|忙不忙|在吗)/i;
const ROUTING_RE = /(转达|forward|转给|谁负责|who\s*(handles?|is\s*responsible)|找谁|contact|联系)/i;
const SENSITIVE_RE = /(工资|salary|薪|钱|money|密码|password|token|key|secret|credentials|私人|private|机密|confidential)/i;
const COMPLAINT_RE = /(投诉|complaint|不满|angry|生气|disgusted|差评|unacceptable|terrible|awful|垃圾)/i;
const PERSONAL_RE = /(感情|relationship|身体|health|病|sick|家人|family|离职|resign|辞职|quit)/i;
const DECISION_RE = /(决定|decide|approve|审批|签|sign|合同|contract|预算|budget|付款|pay|购买|buy|采购|procure)/i;

export function classifyMessage(content: string, persona: Persona, senderIdentity: string): ClassificationResult {
  const text = (content || '').trim();
  if (!text) {
    return { intent: 'unknown', sensitivity: 'none', risk: 'low', canAutoClaim: false, reason: 'empty message' };
  }

  if (senderIdentity === 'admin') {
    return { intent: 'unknown', sensitivity: 'none', risk: 'high', canAutoClaim: false, reason: 'admin messages always pass through' };
  }

  if (GREETING_RE.test(text)) {
    return { intent: 'greeting', sensitivity: 'none', risk: 'low', canAutoClaim: true, reason: 'simple greeting' };
  }

  if (ACK_RE.test(text)) {
    return { intent: 'acknowledgement', sensitivity: 'none', risk: 'low', canAutoClaim: true, reason: 'simple acknowledgement' };
  }

  if (SENSITIVE_RE.test(text)) {
    return { intent: 'request', sensitivity: 'high', risk: 'high', canAutoClaim: false, reason: 'sensitive topic detected' };
  }

  if (DECISION_RE.test(text)) {
    return { intent: 'decision', sensitivity: 'medium', risk: 'high', canAutoClaim: false, reason: 'decision/commitment required' };
  }

  if (COMPLAINT_RE.test(text)) {
    return { intent: 'complaint', sensitivity: 'medium', risk: 'high', canAutoClaim: false, reason: 'complaint/conflict detected' };
  }

  if (PERSONAL_RE.test(text)) {
    return { intent: 'personal', sensitivity: 'high', risk: 'high', canAutoClaim: false, reason: 'personal/emotional topic' };
  }

  if (SCHEDULE_RE.test(text)) {
    return { intent: 'scheduling', sensitivity: 'low', risk: 'low', canAutoClaim: canAutoClaimByMaturity(persona), reason: 'scheduling inquiry' };
  }

  if (STATUS_RE.test(text)) {
    return { intent: 'status_check', sensitivity: 'none', risk: 'low', canAutoClaim: canAutoClaimByMaturity(persona), reason: 'status check' };
  }

  if (ROUTING_RE.test(text)) {
    return { intent: 'routing', sensitivity: 'low', risk: 'low', canAutoClaim: canAutoClaimByMaturity(persona), reason: 'routing request' };
  }

  // Short messages (< 20 chars) with no sensitive keywords — treat as low risk FAQ
  if (text.length < 20 && !SENSITIVE_RE.test(text)) {
    return { intent: 'faq', sensitivity: 'none', risk: 'low', canAutoClaim: canAutoClaimByMaturity(persona), reason: 'short low-risk message' };
  }

  return { intent: 'unknown', sensitivity: 'low', risk: 'medium', canAutoClaim: false, reason: 'unknown intent — escalate to be safe' };
}

function canAutoClaimByMaturity(persona: Persona): boolean {
  return persona.learning.maturity !== 'seed' || persona.learning.confidence.judgment > 0;
}
