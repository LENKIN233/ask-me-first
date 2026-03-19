import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getUsersData, logQuery } from './query.ts';
import type { UserEntry } from './query.ts';

export interface SlashCommandAuth {
  canExecute: boolean;
  identity: string;
  reason?: string;
  allowedCommands?: string[];
}

/**
 * 检查是否允许执行斜杠命令
 * @param workspaceDir 工作区目录
 * @param senderId 发送者 ID
 * @param commandName 命令名（不含斜杠，例如 "new"）
 * @returns 是否允许执行
 */
export function validateSlashCommand(
  workspaceDir: string,
  senderId: string,
  commandName: string
): SlashCommandAuth {
  // 1. 获取用户身份
  const usersData = getUsersData(workspaceDir);
  if (!usersData) {
    return { canExecute: false, identity: 'unknown', reason: '用户数据不可用' };
  }

  const userEntry = usersData.users.find(u => u.userId === senderId);
  const identity = userEntry?.identity || 'guest';
  const identityConfig = usersData.identities[identity];

  // 2. 基础权限判断：是否允许斜杠命令
  let slashAllowed = false;
  if (userEntry?.slashCommandsAllowed !== undefined) {
    slashAllowed = userEntry.slashCommandsAllowed;
  } else if (identityConfig) {
    slashAllowed = identityConfig.slashCommands;
  }

  if (!slashAllowed) {
    return {
      canExecute: false,
      identity,
      reason: `身份 ${identity} 无斜杠命令权限`,
    };
  }

  // 3. 命令白名单检查（如果用户有 allowedCommands 字段）
  if (userEntry && Array.isArray(userEntry.allowedCommands) && userEntry.allowedCommands.length > 0) {
    const hasWildcard = userEntry.allowedCommands.includes('*');
    const isAllowed = hasWildcard || userEntry.allowedCommands.includes(commandName);
    if (!isAllowed) {
      return {
        canExecute: false,
        identity,
        reason: `身份 ${identity} 不允许使用命令 /${commandName}`,
        allowedCommands: userEntry.allowedCommands,
      };
    }
  }

  // 4. 通过
  return { canExecute: true, identity };
}

/**
 * 记录斜杠命令执行日志
 */
export function logSlashCommand(
  workspaceDir: string,
  senderId: string,
  commandName: string,
  auth: SlashCommandAuth,
  messageId?: string,
  channelId?: string
) {
  const logPath = join(workspaceDir, 'ask_me_first/slash_log.json');
  let log: any = { version: '1.0', createdAt: new Date().toISOString(), entries: [] };
  if (existsSync(logPath)) {
    try { log = JSON.parse(readFileSync(logPath, 'utf-8')); } catch (_) {}
  }
  log.entries.push({
    timestamp: new Date().toISOString(),
    senderId,
    commandName,
    identity: auth.identity,
    allowed: auth.canExecute,
    reason: auth.reason,
    messageId,
    channelId,
  });
  try { writeFileSync(logPath, JSON.stringify(log, null, 2)); } catch (_) {}
}

/**
 * 快捷函数：检查并记录
 * @returns { allowed, reason }
 */
export function checkAndLogSlashCommand(
  workspaceDir: string,
  senderId: string,
  commandName: string,
  messageId?: string,
  channelId?: string
): { allowed: boolean; reason?: string; identity: string } {
  const auth = validateSlashCommand(workspaceDir, senderId, commandName);
  logSlashCommand(workspaceDir, senderId, commandName, auth, messageId, channelId);
  return { allowed: auth.canExecute, reason: auth.reason, identity: auth.identity };
}
