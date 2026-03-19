/**
 * 触发器定义
 * 预定义触发 Escalate 的条件集合
 */

export const Triggers = {
  /**
   * 显式升级关键词
   */
  explicitUpgradeKeywords: ['/upgrade', '找本人', '转接', '升级', 'notify_owner'],

  /**
   * 敏感话题关键词
   */
  sensitiveKeywords: [
    '预算', '工资', '薪资', '人事', '招聘', '解雇',
    '法律', '合规', '合同', '签约', '承诺', '保证'
  ],

  /**
   * 时间承诺关键词（"什么时候完成"类）
   */
  timeCommitmentKeywords: ['什么时候', '多久能', 'deadline', '截止', '交付时间'],

  /**
   * 决策请求关键词
   */
  decisionKeywords: ['决定', '判断', '建议', '是否应该', '你觉得'],

  /**
   * 是否包含显式升级请求
   */
  isExplicitUpgrade(text: string): boolean {
    return Triggers.explicitUpgradeKeywords.some(k => text.toLowerCase().includes(k));
  },

  /**
   * 是否敏感话题
   */
  isSensitive(text: string): boolean {
    return Triggers.sensitiveKeywords.some(k => text.toLowerCase().includes(k));
  },

  /**
   * 是否时间承诺请求
   */
  isTimeCommitment(text: string): boolean {
    return Triggers.timeCommitmentKeywords.some(k => text.toLowerCase().includes(k));
  },

  /**
   * 是否决策请求
   */
  isDecisionRequest(text: string): boolean {
    return Triggers.decisionKeywords.some(k => text.toLowerCase().includes(k));
  }
};
