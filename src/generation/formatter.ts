/**
 * 回复格式化器
 * 根据决策结果和可用信息，生成最终回复文本
 */

import { Decision, EscalateLevel } from '../escalation/types.js';
import { AppState } from '../state/state.js';
import { UserEntry } from '../identity/types.js';

export interface ReplyContext {
  decision: Decision;
  state: AppState;
  identity: UserEntry;
  // 可用信息（已按可见性过滤）
  answer?: string;
  context?: string;
  topic?: string;
}

export class ReplyFormatter {
  private templates: Record<EscalateLevel, string[]>;

  private static readonly DEFAULT_TEMPLATES: Record<EscalateLevel, string[]> = {
    [EscalateLevel.Answer]: [
      "根据当前状态（{{state}}），{{answer}}",
      "可以直接回答：{{answer}}（我{{state}}）"
    ],
    [EscalateLevel.Partial]: [
      "当前：{{state}}。关于{{topic}}，我只能提供背景：{{context}}。建议你@我本人确认。",
      "我{{state}}。{{context}}。这个问题需要我进一步确认，稍后回复。"
    ],
    [EscalateLevel.Escalate]: [
      "已升级给本人，他将尽快回复。",
      "需要本人处理，已转交。"
    ]
  };

  constructor() {
    this.templates = this.loadTemplates();
  }

  private loadTemplates(): Record<EscalateLevel, string[]> {
    try {
      const fs = require('fs');
      const path = require('path');
      const templatePath = path.join(
        process.env.OPENCLAW_WORKSPACE || process.cwd(),
        'ask_me_first/config/templates.json'
      );
      if (!fs.existsSync(templatePath)) return { ...ReplyFormatter.DEFAULT_TEMPLATES };
      const raw = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
      if (!raw.templates) return { ...ReplyFormatter.DEFAULT_TEMPLATES };
      return {
        [EscalateLevel.Answer]: raw.templates.answer ?? ReplyFormatter.DEFAULT_TEMPLATES[EscalateLevel.Answer],
        [EscalateLevel.Partial]: raw.templates.partial ?? ReplyFormatter.DEFAULT_TEMPLATES[EscalateLevel.Partial],
        [EscalateLevel.Escalate]: raw.templates.escalate ?? ReplyFormatter.DEFAULT_TEMPLATES[EscalateLevel.Escalate]
      };
    } catch {
      return { ...ReplyFormatter.DEFAULT_TEMPLATES };
    }
  }

  /**
   * 格式化最终回复
   */
  format(ctx: ReplyContext): string {
    const level = ctx.decision.level;
    const templates = this.templates[level];
    const template = templates[Math.floor(Math.random() * templates.length)];

    let text = template
      .replace('{{state}}', this.stateSummary(ctx.state))
      .replace('{{answer}}', ctx.answer ?? '暂无可用信息')
      .replace('{{context}}', ctx.context ?? '暂无背景信息')
      .replace('{{topic}}', ctx.topic ?? '此问题');

    // 如果是 escalate，可以附加说明原因（可选）
    if (level === EscalateLevel.Escalate && ctx.decision.reason) {
      text += `\n（原因：${ctx.decision.reason}）`;
    }

    return text;
  }

  /**
   * 状态摘要（简洁版）
   */
  private stateSummary(state: AppState): string {
    const mode = state.current_mode !== 'unknown' ? state.current_mode : '未知模式';
    const avail = state.availability === 'online' ? '在线' :
                  state.availability === 'busy' ? '忙碌' :
                  state.availability === 'focus' ? '专注' : '离线';
    return `${avail}，${mode}`;
  }
}
