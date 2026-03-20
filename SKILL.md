---
name: ask-me-first
description: "Personal work avatar system for OpenClaw — identity-aware, state-sensing digital proxy that handles colleague inquiries with three-tier escalation (answer / partial / escalate to owner)"
---

# Ask Me First — Personal Avatar Controller Skill

> **让别人先接触我的分身，而不是先打断我本人。**

## 概述

Ask Me First 是一套运行在 OpenClaw 上的个人工作数字分身系统。当同事想找你时，他们首先接触你的数字分身。分身实时感知你的工作状态，根据来访者身份和问题性质进行三级智能决策：**直接回答、部分回答、或升级给本人**。

## 核心能力

- **身份解析** — 自动识别来访者身份（admin/member/guest），根据身份决定信息深度
- **状态感知** — 实时检测本人工作状态（coding/meeting/writing/idle），通过前台窗口检测 + 日历集成
- **三级决策** — 基于规则引擎自动决定：直接回答、部分回答（隐藏敏感信息）、升级给本人
- **信任评分** — 基于交互频率动态调整用户信任度，影响信息可见范围
- **升级通知** — 当决策为"升级"时，自动记录到升级队列供本人查看

> ⚠️ 斜杠命令访问控制（在 gateway 层拦截未授权 /commands）目前无法通过插件 API 实现，需要 OpenClaw 提供 pre-command 拦截钩子。

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
├── index.ts                    # 插件入口（hooks, commands, services 一体化）
├── openclaw.plugin.json        # 插件 manifest（配置 schema, UI hints）
├── package.json                # npm 元数据 + OpenClaw 扩展声明
├── users.json                  # 用户身份映射模板
├── restricted-mode-prompt.txt  # Guest 限制模式提示词模板
├── src/                        # 核心 TypeScript 源码
│   ├── controller.ts           # AvatarController 主控
│   ├── state/                  # 状态检测
│   ├── identity/               # 身份与权限
│   ├── escalation/             # 升级决策引擎
│   ├── generation/             # 回复生成
│   └── tools/                  # 工具集成（日历、存在感知等）
├── config/                     # 配置文件模板
├── prompts/                    # 系统提示词
├── tests/                      # 测试
└── docs/                       # 详细文档
```

## 安装

```bash
# 通过 OpenClaw CLI 安装（推荐）
openclaw plugins install ask-me-first
```

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
