import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface IdentityConfig {
  description: string;
  slashCommands: boolean;
  priority: number;
}

export interface UserEntry {
  userId: string;
  identity: string;
  slashCommandsAllowed?: boolean; // 覆盖 identity 默认值
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UsersData {
  version: string;
  updatedAt: string;
  users: UserEntry[];
  identities: Record<string, IdentityConfig>;
}

export interface QueryEntry {
  timestamp: string;
  senderId: string;
  identity: string;
  restricted: boolean;
  channelId?: string;
  messageId?: string;
}

export interface QueryLog {
  version: string;
  createdAt: string;
  queries: QueryEntry[];
}

/**
 * 读取用户数据
 */
export function loadUsersData(workspaceDir: string): UsersData | null {
  const path = join(workspaceDir, 'ask_me_first/users.json');
  if (!existsSync(path)) {
    console.error('[ask_me_first] users.json not found at', path);
    return null;
  }
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as UsersData;
  } catch (err) {
    console.error('[ask_me_first] Failed to parse users.json:', err);
    return null;
  }
}

// 缓存用户数据，避免频繁读取文件
let usersDataCache: UsersData | null = null;
let usersDataCacheTime: number = 0;
const CACHE_TTL_MS = 5000; // 5 秒缓存

export function getUsersData(workspaceDir: string): UsersData | null {
  const now = Date.now();
  if (usersDataCache && (now - usersDataCacheTime) < CACHE_TTL_MS) {
    return usersDataCache;
  }
  const data = loadUsersData(workspaceDir);
  if (data) {
    usersDataCache = data;
    usersDataCacheTime = now;
  }
  return data;
}

/**
 * 记录查询日志
 */
export function logQuery(workspaceDir: string, entry: QueryEntry) {
  const path = join(workspaceDir, 'ask_me_first/queries.json');
  let log: QueryLog = { version: '1.0', createdAt: new Date().toISOString(), queries: [] };
  if (existsSync(path)) {
    try {
      log = JSON.parse(readFileSync(path, 'utf-8')) as QueryLog;
    } catch (_) {
      // ignore parse error, start fresh
    }
  }
  log.queries.push(entry);
  try {
    writeFileSync(path, JSON.stringify(log, null, 2));
  } catch (err) {
    console.error('[ask_me_first] Failed to write queries.json:', err);
  }
}

/**
 * 查询用户身份并决定是否受限
 * @returns { identity, restricted }
 */
export function checkUser(workspaceDir: string, senderId: string, channelId?: string, messageId?: string): { identity: string; restricted: boolean } {
  const usersData = getUsersData(workspaceDir);
  if (!usersData) {
    // 安全默认：所有用户受限，除了配置的 admin
    // 但此时用户数据加载失败，返回 unknown 且受限
    return { identity: 'unknown', restricted: true };
  }

  const userEntry = usersData.users.find(u => u.userId === senderId);
  const identity = userEntry?.identity || 'guest';
  const identityConfig = usersData.identities[identity];

  let slashAllowed = false;
  if (userEntry?.slashCommandsAllowed !== undefined) {
    slashAllowed = userEntry.slashCommandsAllowed;
  } else if (identityConfig) {
    slashAllowed = identityConfig.slashCommands;
  }

  const restricted = !slashAllowed;

  // 异步记录日志（不阻塞）
  try {
    logQuery(workspaceDir, {
      timestamp: new Date().toISOString(),
      senderId,
      identity,
      restricted,
      channelId,
      messageId,
    });
  } catch (_) {
    // ignore
  }

  return { identity, restricted };
}
