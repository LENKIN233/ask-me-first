[English](README.md) | [中文](README.zh-CN.md)

# Ask Me First — 个人工作分身

> 我的工作接口、第一接触面、降低沟通成本减少打断的工作分身。

这是一个真正的**工作分身**系统。它拦截收到的消息并自主代你回复，通过观察真实对话学习你的沟通风格，保护你的专注时间。

## v2.1.x 新特性

*   **人格学习系统**：通过观察你与他人的真实互动，自动提取并进化你的沟通风格。
*   **inbound_claim 消息拦截**：在消息到达主智能体之前，直接认领并回复低风险、高频次消息（如打招呼、进度确认等）。
*   **对话式风格学习**：基于对话流的风格捕获，不再依赖死板的模板。
*   **每用户 persona.json**：精细化的人格定义，支持手动调整和自动演进。

## OpenClaw v2026.3.23 兼容性声明

本插件已完全适配 **OpenClaw v2026.3.23 插件策略调整**：

*   使用 `definePluginEntry` SDK 入口（v2026.3.22 引入）。
*   注册 `inbound_claim` 钩子实现消息自主拦截 —— 这是 3.23 时代插件架构的核心能力。
*   注册 `message_sending` 钩子进行被动对话观察和人格学习。
*   所有能力均在 `openclaw.plugin.json` 中按新版清单规范声明。
*   以 `code-plugin`（非 skill）身份发布至 **ClawHub**，符合更新后的分类体系。

最低 SDK 版本：`>=2026.3.22`。推荐：`>=2026.3.23`。

## 工作原理

Ask Me First 包含两条核心消息处理流程：

#### 1. 拦截流程 (inbound_claim)

适用于低风险的日常沟通，直接由分身接管，不触发主智能体逻辑。

`消息 → inbound_claim → 分类器 (Classifier) → 自动认领低风险消息 → LLM 生成分身回复 → { handled: true }`

#### 2. 复杂流程 (before_prompt_build)

适用于需要深入上下文或权限校验的情况，分身作为主智能体的“前哨”提供决策支持。

`消息 → before_prompt_build → 分身决策链 → 身份识别 + 状态感知 + 升级策略 → 上下文注入 → 最终回复`

## 快速开始

推荐使用 ClawHub 进行一键安装：

```bash
clawhub package install ask-me-first
```

也可以通过 npm 安装：

```bash
npm install ask-me-first
```

或通过 Git 源码安装：

```bash
git clone https://github.com/LENKIN233/ask-me-first.git
```

## 人格系统

分身拥有独立的人格定义文件 `persona.json`，支持从冷启动到成熟的完整生命周期：

*   **冷启动 (Seed)**：使用内置的种子配置开始工作。
*   **学习期 (Learning)**：分身会监听 `message_sending` 钩子，观察主人的回复风格。
*   **成熟期 (Stable)**：风格趋于稳定，能够精准模仿主人的语气、用词和决策偏好。

**核心能力**：
*   **消息分类**：自动识别意图（问候、确认、日程、决策、敏感请求等）。
*   **自动认领**：对低风险意图（如简单的收到、好的）进行秒级自动回复。

## 项目结构

```
ask-me-first/
├── index.ts                       # 插件入口 (hooks, commands, services)
├── openclaw.plugin.json           # 插件清单 + 配置 Schema
├── package.json                   # v2.1.2
├── src/
│   ├── controller.ts              # AvatarController 编排器
│   ├── decision-chain.ts          # 确定性决策链 (232 行)
│   ├── persona/                   # ★ 人格学习系统
│   │   ├── schema.ts              # PersonaProfile 类型、校验、合并
│   │   ├── classifier.ts          # 基于规则的消息分类器 (10 类)
│   │   ├── renderer.ts            # 人格感知的系统提示词渲染
│   │   └── learner.ts             # 对话观察器 + 特征蒸馏器
│   ├── state/                     # 状态检测 (Win32 + 日历)
│   ├── identity/                  # 身份解析 & 信任评分
│   ├── escalation/                # 三级升级引擎
│   ├── generation/                # 回复格式化
│   ├── tools/                     # 日历、在离线、上下文、记忆
│   └── utils/
│       └── safe-write.ts          # 原子化文件写入
├── config/
│   ├── persona-seed.json          # ★ 默认人格种子
│   ├── identities.json
│   ├── escalationRules.json
│   └── templates.json
├── prompts/
│   └── persona-system-prompt.md   # 可自定义的人格提示词
├── tests/                         # 68 项测试, 14 套件
└── docs/
```

## 运行时工作区

插件会在你的 OpenClaw 工作区创建专用目录 `~/.openclaw/workspace/ask_me_first/`。

这里存储了你的分身“灵魂”：
*   `persona.json`：定义了你的语气、边界、自主权等。
*   `persona_events.jsonl`：记录了所有被观察到的对话事件，用于后续的学习蒸馏。

## 配置

在 `openclaw.plugin.json` 或 `users.json` 中可以配置：

*   **信任分系统**：根据互动频率和历史记录动态调整访客信任等级。
*   **状态感知**：关联飞书日历或 Windows 窗口状态，判断当前是否处于“专注模式”。
*   **升级规则**：定义哪些词汇或场景必须交由主人亲自处理。
*   **人格自定义**：手动锁定部分人格字段，防止自动学习覆盖你的特定偏好。

## 核心特性

*   **全自动语气学习**：支持 tone, formality, verbosity, emoji 偏好学习。
*   **多层级拦截**：从简单的正则过滤到复杂的 LLM 意图识别。
*   **Windows 状态感知**：自动识别当前的 IDE、会议软件状态。
*   **飞书日历集成**：根据日程安排自动切换分身的在线状态。

## 安全性

*   **零环境变量依赖**：不读取任何敏感环境变量，所有配置均通过插件系统注入。
*   **安全表达式求值**：采用沙箱化处理，防止远程执行攻击。
*   **原子写入**：所有状态文件均采用原子写入，确保掉电不丢失、不损坏。
*   **透明能力声明**：通过 `openclaw.plugin.json` 显式声明所需的所有权限。

## API 稳定性

| 接口 | 稳定性 | 说明 |
| :--- | :--- | :--- |
| `inbound_claim` | Stable | 核心消息拦截接口 |
| `message_sending` | Stable | 用于观察并学习主人风格 |
| `before_prompt_build` | Stable | 上下文注入接口 |

## 限制

*   **状态检测**：前台窗口检测目前仅支持 Windows 平台。
*   **Distiller**：本地的大规模语料蒸馏 (Distiller) 仍在开发中，目前依赖在线 LLM 进行小规模学习。

## 开源协议

[MIT](LICENSE)
