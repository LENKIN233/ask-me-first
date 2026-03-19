---
name: ask-me-first
description: "Avatar controller — identity resolution, state-aware escalation, and access control for the Ask My Avatar First system"
homepage: https://github.com/your-username/ask-me-first
metadata:
  openclaw:
    emoji: "🔒"
    events: ["message:received", "agent:bootstrap"]
    requires:
      config: ["workspace.dir"]
---

# Ask Me First — Personal Avatar Controller

## 架构

三层实现：

1. **Gateway bundle patch** (`reply-*.js` → `handleCommands()`)
   - 在命令执行前同步拦截未授权的斜杠命令
   - 返回 `⛔` 拒绝消息 + 记录到 `slash_log.json`
   - 5 秒内存缓存读取 `users.json`

2. **Hook handler** (`handler.ts`)
   - `agent:bootstrap`：实例化 AvatarController 并注入到 agent context
   - `message:received`：更新用户交互历史、trustScore

3. **AvatarController** (`src/controller.ts`)
   - 身份解析（identity/resolver.ts）
   - 状态检测（state/detector.ts）— 本地活跃度 + 日历
   - 升级路由（escalation/router.ts）— 规则引擎决定 Answer/Partial/Escalate
   - 回复格式化（generation/formatter.ts）— 模板化回复

## 决策流程

```
message:received → 更新 lastInteraction / trustScore
                   ↓
agent:bootstrap  → 注入 AvatarController 实例
                   ↓
消息到达          → controller.process(text, senderId)
                   ↓
                   1. identity = resolver.resolve(senderId)
                   2. state = detector.getState()
                   3. decision = router.decide(msg, identity, state)
                   4. reply = formatter.format(decision, state, identity)
```

## 数据文件

- `ask_me_first/users.json` — 用户身份与权限配置（v1.1 含 relationship）
- `ask_me_first/config/escalationRules.json` — 升级规则
- `ask_me_first/config/templates.json` — 回复模板
- `ask_me_first/config/identities.json` — 身份定义
- `ask_me_first/slash_log.json` — 斜杠命令审计日志
- `ask_me_first/queries.json` — 身份查询日志

## npm update 注意

Gateway bundle patch 会被 `npm update openclaw` 覆盖。更新后需重新运行 `gateway-patch/inject.bat`。
