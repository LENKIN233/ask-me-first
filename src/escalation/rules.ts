/**
 * 规则配置
 * 可从 escalationRules.json 加载
 */

export interface EscalationRuleConfig {
  id: string;
  pattern?: string[];        // 关键词匹配
  intent?: string[];        // 意图分类（需NLU）
  condition?: string;       // JS表达式，如 "state.confidence < 0.6"
  action: 'answer' | 'partial' | 'escalate';
  reason: string;
  priority: number;
}

/**
 * 规则引擎
 * 支持从配置文件加载规则，并编译 condition 表达式
 */
export class RuleEngine {
  private rules: EscalationRuleConfig[] = [];

  async loadFromFile(path: string): Promise<void> {
    // TODO: 读取并解析 JSON
  }

  addRule(rule: EscalationRuleConfig): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 检查规则是否匹配
   */
  match(text: string, state: any, identity: any): EscalationRuleConfig | null {
    for (const rule of this.rules) {
      if (this.ruleMatches(rule, text, state, identity)) {
        return rule;
      }
    }
    return null;
  }

  private ruleMatches(rule: EscalationRuleConfig, text: string, state: any, identity: any): boolean {
    // 1. 关键词匹配
    if (rule.pattern) {
      const lower = text.toLowerCase();
      if (!rule.pattern.some(p => lower.includes(p.toLowerCase()))) {
        return false;
      }
    }

    // 2. 意图匹配（需 NLU，暂略）

    // 3. 条件表达式
    if (rule.condition) {
      try {
        // 创建安全的评估环境
        const safeState = { ...state };
        const safeIdentity = { ...identity };
        // 注意：实际使用时需严格沙箱化
        // eslint-disable-next-line no-eval
        const ok = eval(rule.condition.replace(/state\./g, 'safeState.').replace(/identity\./g, 'safeIdentity.'));
        if (ok !== true) return false;
      } catch (e) {
        return false;
      }
    }

    return true;
  }
}
