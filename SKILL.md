---
name: ask-me-first
description: "Personal work avatar system for OpenClaw — identity-aware, state-sensing digital proxy with persona learning and inbound_claim auto-interception"
---

# Ask Me First — 个人工作分身

> **让别人先接触我的分身，而不是先打断我本人。**

## 概述

Ask Me First 是一套运行在 OpenClaw 上的个人工作数字分身系统。它是你的工作接口与第一接触面，旨在降低沟通成本并减少日常打断。分身通过观察真实对话学习你的沟通风格，实时感知你的工作状态，并根据来访者身份和问题性质进行三级智能决策：**直接回答、部分回答、或升级给本人**。

## 核心能力

- **消息拦截 (inbound_claim)** — 核心低延迟拦截钩子，自动认领并回答低风险消息，无需进入主 Agent 循环，节省 Token 并提升响应速度。
- **人格学习** — 观察主人的真实对话历史，自动提取沟通风格、常用短语与决策逻辑，存储于 `persona.json`，让分身随时间推移越来越像你。
- **身份解析** — 自动识别来访者身份（admin/member/guest）并进行信任评分（Trust Scoring），根据身份与信任度决定信息开放深度。
- **状态感知** — 结合 Win32 前台窗口检测、日历行程及显式覆盖（Explicit Override），实时计算当前的可用性与可打断度。
- **三级决策** — 灵活的决策链：直接回答（Autonomous）、部分回答（Partial/Sensitive）、或升级给本人（Escalate）。
- **安全保障** — 采用安全表达式解析（弃用 `new Function`）、原子化文件写入（Atomic Writes）、无环境变量依赖（通过插件配置传入凭证）及严格的能力声明。

## 架构

```
来访者消息 → inbound_claim (分身认领) → 自动回复
              ↓ (未认领)
          before_prompt_build (注入分身人格与状态)
              ↓
          LLM 决策层 (决策链: 答复/部分答复/升级)
              ↓
          message_sending (分身观察学习) → 更新 persona.json
```

## 文件结构

```
ask-me-first/
├── index.ts                    # 插件入口 (SDK v2026.3.22+)
├── openclaw.plugin.json        # 插件能力声明与配置 Schema
├── package.json                # npm 元数据
├── persona.json                # 核心人格配置文件 (Workspace)
├── persona_events.jsonl        # 观察到的对话事件流
├── users.json                  # 用户身份与信任评分数据
├── config/
│   └── persona-seed.json       # 初始人格种子
├── src/
│   ├── persona/                # 人格系统 (Learning, Classifier, Renderer)
│   ├── identity/               # 身份解析与信任评分
│   ├── escalation/             # 升级路由逻辑
│   ├── decision-chain.ts       # 三级决策链实现
│   └── utils/
│       └── safe-write.ts       # 原子化写入工具
└── prompts/                    # 分身提示词模板
```

## 安装

```bash
# 通过 ClawHub 安装插件包
clawhub package install ask-me-first
```

## 配置

- **插件设置界面**: 在 OpenClaw UI 中直接配置飞书凭证、检测频率等。
- **persona.json**: 存储于 Workspace 目录，可手动编辑以微调分身的人格特质（如语气、常用语、决策边界）。
- **users.json**: 管理用户身份映射，支持首位发送者自动注册为管理员。

## 适用场景

- **独立开发者**: 减少不必要的沟通打断，专注核心代码。
- **团队 Lead**: 自动分流日常询问，处理重复性 FAQ。
- **异步沟通**: 为远程工作者提供一层缓冲，保护深度工作时间。
- **个性化进阶**: 通过对话式学习逐步个性化分身人格，使其更贴合真实的沟通风格。
