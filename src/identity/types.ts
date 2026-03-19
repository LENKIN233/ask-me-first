/**
 * 身份配置接口
 */

export interface Relationship {
  team?: string;
  project: string[];
  role: string;
  trustScore: number; // 0-1
  lastInteraction: string;
}

/** 构造默认 Relationship（用于 v1.0 users.json 兼容） */
export function defaultRelationship(): Relationship {
  return {
    project: [],
    role: 'unknown',
    trustScore: 0,
    lastInteraction: new Date().toISOString()
  };
}

export interface UserEntry {
  userId: string;
  identity: 'admin' | 'member' | 'guest';
  /** infoLevel 可选，按 identity 推断默认值 */
  infoLevel?: 'public' | 'internal' | 'trusted' | 'owner_only';
  /** relationship 可选，兼容 v1.0 schema */
  relationship?: Relationship;
  // v1.0 兼容字段
  slashCommandsAllowed?: boolean;
  allowedCommands?: string[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 根据 identity 推断默认 infoLevel */
export function defaultInfoLevel(identity: string): 'public' | 'internal' | 'trusted' | 'owner_only' {
  switch (identity) {
    case 'admin': return 'owner_only';
    case 'member': return 'internal';
    default: return 'public';
  }
}

export interface IdentityConfig {
  version: string;
  users: UserEntry[];
  /** v1.0 的 identities 定义块 */
  identities?: Record<string, {
    description?: string;
    slashCommands?: boolean;
    allowedCommands?: string[];
    escalation?: string;
    infoLevel?: string;
    priority?: number;
  }>;
}
