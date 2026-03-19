/**
 * 升级决策结果
 */
export enum EscalateLevel {
  Answer = 'answer',       // 可直接回答
  Partial = 'partial',     // 可部分回答（提供背景，建议升级）
  Escalate = 'escalate'    // 必须升级给本人
}

export interface Decision {
  level: EscalateLevel;
  reason: string;
  suggestedAction: 'reply' | 'notify_owner' | 'wait_for_owner';
  priority: 'low' | 'normal' | 'high';
}

/**
 * 升级规则接口
 */
export interface EscalationRule {
  id: string;
  condition: (msg: MessageContext, state: any, identity: any) => boolean;
  action: EscalateLevel;
  reason: string;
  priority: number;
}

/**
 * 消息上下文（简化）
 */
export interface MessageContext {
  text: string;
  senderId: string;
  // 可扩展：attachments, intent, entities 等
}
