---
name: ask-me-first
description: "Personal work avatar system for OpenClaw — identity-aware, state-sensing digital proxy that handles colleague inquiries with three-tier escalation (answer / partial / escalate to owner)"
---

# Ask Me First — Personal Avatar Controller Skill

> **让别人先接触我的分身，而不是先打断我本人。**

## 概述

Ask My Avatar First 是一套运行在 OpenClaw 上的个人工作数字分身系统。当同事想找你时，他们首先接触你的数字分身。分身实时感知你的工作状态，根据来访者身份和问题性质进行三级智能决策：**直接回答、部分回答、或升级给本人**。

## 核心能力

- **身份解析** — 自动识别来访者身份（admin/member/guest），根据身份决定信息深度
- **状态感知** — 实时检测本人工作状态（coding/meeting/writing/idle），通过前台窗口检测 + 日历集成
- **三级决策** — 基于规则引擎自动决定：直接回答、部分回答（隐藏敏感信息）、升级给本人
- **斜杠命令守卫** — 未授权用户无法执行管理命令，Gateway 层同步拦截
- **信任评分** — 基于交互频率动态调整用户信任度，影响信息可见范围
- **升级通知** — 当决策为"升级"时，自动记录到升级队列供本人查看

## 架构

```
飞书消息 → OpenClaw Gateway → AvatarController → 决策层 → 回复

AvatarController:
├── StateDetector     — 状态检测（前台窗口 + 日历）
├── IdentityResolver  — 身份解析（users.json + trust score）
├── EscalationRouter  — 升级路由（规则引擎）
└── ReplyFormatter    — 回复格式化（模板化输出）
```

## 文件结构

```
ask-me-first/
├── src/                    # 核心 TypeScript 源码
│   ├── controller.ts       # AvatarController 主控
│   ├── state/              # 状态检测
│   ├── identity/           # 身份与权限
│   ├── escalation/         # 升级决策引擎
│   ├── generation/         # 回复生成
│   └── tools/              # 工具集成（日历、存在感知等）
├── config/                 # 配置文件
├── hooks/                  # OpenClaw hooks
│   ├── ask-me-first/       # 消息处理 hook
│   └── avatar-state/       # 状态刷新 hook
├── gateway-patch/          # Gateway bundle 补丁
├── prompts/                # 系统提示词
├── tests/                  # 测试
└── docs/                   # 详细文档
```

## 安装

1. 克隆此仓库到 OpenClaw workspace
2. 复制 `hooks/` 下的两个目录到 `~/.openclaw/workspace/hooks/`
3. 编辑 `users.json`，将 `ou_your_admin_id_here` 替换为你的飞书 userId
4. 运行 `gateway-patch/inject.bat` 注入斜杠命令守卫
5. 重启 OpenClaw Gateway

## 配置

- `users.json` — 用户身份映射（必须配置 admin userId）
- `config/identities.json` — 身份级别定义
- `config/escalationRules.json` — 升级规则
- `config/templates.json` — 回复模板
- `prompts/avatar-system-prompt.txt` — 头像系统提示词（替换 `[Name]` 为你的名字）

## 适用场景

- 个人独立开发者希望减少被打断的频率
- 团队 lead 需要自动分流日常询问
- 远程工作者需要异步沟通缓冲层
