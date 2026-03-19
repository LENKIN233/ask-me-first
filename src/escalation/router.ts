import { EscalateLevel, Decision, EscalationRule, MessageContext } from './types.js';
import { Triggers } from './triggers.js';
import { Permissions, InfoLevel } from '../identity/permissions.js';
import { AppState } from '../state/state.js';
import { UserEntry } from '../identity/types.js';

interface RuleConfig {
  id: string;
  pattern?: string[];
  intent?: string[];
  condition?: string;
  action: 'answer' | 'partial' | 'escalate';
  reason: string;
  priority: number;
}

interface RulesFile {
  rules: RuleConfig[];
}

export class EscalationRouter {
  private rules: EscalationRule[] = [];
  private configLoaded = false;

  constructor() {
    this.initDefaultRules();
  }

  async loadRules(configPath: string): Promise<void> {
    try {
      const fs = require('fs');
      const raw = fs.readFileSync(configPath, 'utf-8');
      const file: RulesFile = JSON.parse(raw);

      const configRules: EscalationRule[] = file.rules.map(r => ({
        id: r.id,
        condition: (msg: MessageContext, state: any, identity: any) => {
          if (r.pattern && r.pattern.length > 0) {
            const lower = msg.text.toLowerCase();
            if (!r.pattern.some(p => lower.includes(p.toLowerCase()))) return false;
          }
          if (r.condition) {
            try {
              const fn = new Function('state', 'identity', 'msg', `return (${r.condition});`);
              if (!fn(state, identity, msg)) return false;
            } catch {
              return false;
            }
          }
          return true;
        },
        action: this.parseLevel(r.action),
        reason: r.reason,
        priority: r.priority
      }));

      // Config rules take precedence, then defaults fill in
      this.rules = [...configRules, ...this.rules.filter(def =>
        !configRules.some(cr => cr.id === def.id)
      )];
      this.configLoaded = true;
    } catch (error) {
      console.error('[EscalationRouter] Failed to load rules:', error);
    }
  }

  decide(msg: MessageContext, identity: UserEntry & { infoLevel: string; relationship: any }, state: AppState): Decision {
    const sorted = [...this.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sorted) {
      if (rule.condition(msg, state, identity)) {
        return {
          level: rule.action,
          reason: rule.reason,
          suggestedAction: this.actionFromLevel(rule.action),
          priority: rule.priority > 80 ? 'high' : rule.priority > 50 ? 'normal' : 'low'
        };
      }
    }

    const defaultLevel = identity.identity === 'admin' ? EscalateLevel.Answer : EscalateLevel.Partial;
    return {
      level: defaultLevel,
      reason: '默认规则',
      suggestedAction: this.actionFromLevel(defaultLevel),
      priority: 'normal'
    };
  }

  private actionFromLevel(level: EscalateLevel): Decision['suggestedAction'] {
    switch (level) {
      case EscalateLevel.Answer:
      case EscalateLevel.Partial:
        return 'reply';
      case EscalateLevel.Escalate:
        return 'notify_owner';
      default:
        return 'reply';
    }
  }

  private parseLevel(action: string): EscalateLevel {
    switch (action) {
      case 'answer': return EscalateLevel.Answer;
      case 'partial': return EscalateLevel.Partial;
      case 'escalate': return EscalateLevel.Escalate;
      default: return EscalateLevel.Partial;
    }
  }

  private initDefaultRules(): void {
    this.rules = [
      {
        id: 'explicit_upgrade',
        condition: (msg) => Triggers.isExplicitUpgrade(msg.text),
        action: EscalateLevel.Escalate,
        reason: '用户明确请求升级',
        priority: 100
      },
      {
        id: 'sensitive_topics',
        condition: (msg) => Triggers.isSensitive(msg.text),
        action: EscalateLevel.Escalate,
        reason: '涉及敏感话题',
        priority: 90
      },
      {
        id: 'low_confidence',
        condition: (_msg, state) => state.confidence < 0.6,
        action: EscalateLevel.Partial,
        reason: '状态不确定，仅提供背景信息',
        priority: 80
      },
      {
        id: 'time_commitment',
        condition: (msg) => Triggers.isTimeCommitment(msg.text),
        action: EscalateLevel.Escalate,
        reason: '涉及时间承诺，需本人确认',
        priority: 85
      },
      {
        id: 'info_level_mismatch',
        condition: (_msg, _state, identity) =>
          identity.identity === 'guest' && !Permissions.canAnswer(identity.infoLevel, InfoLevel.Internal),
        action: EscalateLevel.Partial,
        reason: '权限不足，仅提供公开信息',
        priority: 75
      }
    ];
  }
}
