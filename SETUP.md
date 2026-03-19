# Ask Me First - 安装与集成说明

## 功能概述

- 身份识别：通过 `users.json` 验证每个发消息的用户
- 命令拦截：未授权用户的斜杠命令在 Gateway 层被直接阻断，返回 `⛔` 拒绝消息
- 身份注入：所有非 admin 用户的 agent 会话自动注入用户身份信息（userId + identity）
- 仅对话模式：受限用户（如 guest）的 agent 会话额外注入 restricted-mode 系统提示词
- 审计日志：被拒绝的命令记录到 `slash_log.json`，身份查询记录到 `queries.json`

## 架构

访问控制分两层：

| 层级 | 文件 | 机制 | 作用 |
|------|------|------|------|
| Gateway bundle 补丁 | `reply-Bm8VrLQh.js` → `handleCommands()` | 同步拦截 | 阻断未授权斜杠命令 |
| Workspace hook | `hooks/ask-me-first/handler.ts` | `agent:bootstrap` 事件 | 注入用户身份提示词（所有非 admin）+ 受限模式提示词（guest 等受限身份） |

## 已完成的集成

### 1. Gateway Bundle 补丁（命令拦截）

已在 `%APPDATA%\npm\node_modules\openclaw\dist\reply-Bm8VrLQh.js` 的 `handleCommands()` 函数中注入访问控制代码。

补丁位置标记：
```
/* ── ask_me_first: slash command access control (patched) ────────── */
...
/* ── end ask_me_first patch ─────────────────────────────────────── */
```

补丁逻辑：
- 5 秒内存缓存读取 `workspace/ask_me_first/users.json`
- 从 `params.command.senderId` 获取发送者 ID
- 检查 identity 级别权限 → 检查 `allowedCommands` 白名单
- 拒绝时返回友好消息 + 写入 `slash_log.json`

### 2. Hook（身份识别 + 提示词注入）

已部署到 `workspace/hooks/ask-me-first/`：
- `message:received`：追踪用户会话状态，记录 userId、identity、restricted 标记（fire-and-forget）
- `agent:bootstrap`：
  - **所有非 admin 用户**：注入 `user-identity.txt` 提示词，包含用户 ID 和身份角色
  - **受限用户（guest 等）**：额外注入 `restricted-mode-prompt.txt` 限制操作范围

身份注入格式示例：
```
[User Identity — injected by ask_me_first]
User ID: ou_example_member
Identity: member
The current user is NOT an administrator. Treat them according to their "member" role.
```

### 3. 配置

`openclaw.json` 中已启用：
```json
{
  "hooks": {
    "internal": {
      "enabled": true
    }
  }
}
```

## 验证方法

### 斜杠命令拦截
1. 使用非 admin 用户发送 `/new` → 应收到 `⛔ 无法执行 /new — 身份 guest 无斜杠命令权限`
2. Member 用户发送 `/config` → 应被拒绝（不在白名单）
3. Member 用户发送 `/new` → 应正常执行（在白名单）
4. Admin 用户所有命令正常执行
5. 检查 `ask_me_first/slash_log.json` 是否有拒绝记录

### 身份注入
6. Member 用户发起对话 → agent 系统提示词应包含 `[User Identity — injected by ask_me_first]`
7. Guest 用户发起对话 → 系统提示词应同时包含身份信息和 restricted-mode 限制
8. Admin 用户发起对话 → 无任何注入（完全正常访问）
9. 检查 Gateway 日志确认 `bootstrapFiles` 包含 `user-identity.txt`

## ⚠️ npm update 注意

`npm update openclaw` 会覆盖 bundle 补丁。更新后需重新注入，详见 `INTEGRATION.md`。
