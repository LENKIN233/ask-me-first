/**
 * 信息可见性策略
 * 根据 user.infoLevel 决定可以回答哪一层级的信息
 */

export interface VisibilityPolicy {
  canAnswer: boolean;
  maxInfoLevel: 'public' | 'internal' | 'trusted' | 'owner_only';
  requireEscalation: boolean;
}

/**
 * 信息级别定义（从低到高）
 */
export enum InfoLevel {
  Public = 'public',         // 任何人都可以问
  Internal = 'internal',     // 团队成员
  Trusted = 'trusted',       // 高信任度协作者
  OwnerOnly = 'owner_only'   // 本人专属
}

/**
 * 权限检查器
 */
export class Permissions {
  /**
   * 判断查询是否允许
   */
  static canAnswer(userInfoLevel: string, requiredLevel: string): boolean {
    const levels = [InfoLevel.Public, InfoLevel.Internal, InfoLevel.Trusted, InfoLevel.OwnerOnly];
    const userIdx = levels.indexOf(userInfoLevel as InfoLevel);
    const reqIdx = levels.indexOf(requiredLevel as InfoLevel);
    return userIdx >= reqIdx;
  }

  /**
   * 判断是否需要升级
   */
  static requiresEscalation(userInfoLevel: string, requiredLevel: string): boolean {
    return !this.canAnswer(userInfoLevel, requiredLevel);
  }

  /**
   * 根据用户身份和查询意图，返回最大可访问级别
   */
  static maxAccessibleLevel(identity: string): InfoLevel {
    switch (identity) {
      case 'admin': return InfoLevel.OwnerOnly;
      case 'member': return InfoLevel.Internal;
      case 'guest': return InfoLevel.Public;
      default: return InfoLevel.Public;
    }
  }
}
