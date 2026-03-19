/**
 * 状态模型定义
 * 描述本人当前的工作状态，用于分身在决策时提供上下文
 */

export interface Evidence {
  type: 'calendar' | 'presence' | 'explicit' | 'context';
  description: string;
  timestamp: string;
  source?: string;
}

export interface AppState {
  /**
   * 可用性：人在不在、是否能被打扰
   */
  availability: 'online' | 'busy' | 'focus' | 'offline';

  /**
   * 可打断度：0-1，越高越适合打扰
   * 与 availability 关联，但更细粒度
   */
  interruptibility: number;

  /**
   * 当前工作模式：coding / meeting / writing / planning / idle 等
   */
  current_mode: string;

  /**
   * 状态置信度：0-1，表示状态数据的可靠程度
   * 多源冲突时降低，显式声明时提高
   */
  confidence: number;

  /**
   * 状态依据：用于向用户解释"为什么我这么判断"
   */
  evidence: Evidence[];

  /**
   * 状态更新时间
   */
  updatedAt: string;
}

/**
 * 默认状态
 */
export function defaultState(): AppState {
  return {
    availability: 'offline',
    interruptibility: 0,
    current_mode: 'unknown',
    confidence: 0,
    evidence: [],
    updatedAt: new Date().toISOString()
  };
}

/**
 * 状态描述文本（用于回复模板）
 */
export function stateDescription(state: AppState): string {
  const modeText = state.current_mode !== 'unknown' ? `正在${state.current_mode}` : '';
  const availText = state.availability === 'online' ? '在线' :
                    state.availability === 'busy' ? '忙碌' :
                    state.availability === 'focus' ? '专注中' : '离线';
  if (modeText) {
    return `${availText}（${modeText}）`;
  }
  return availText;
}
