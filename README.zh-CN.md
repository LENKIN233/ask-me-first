[English](README.md) | [中文](README.zh-CN.md)

# Ask Me First — 个人工作数字分身系统

> 让别人先接触我的分身，而不是先打断我本人。

一套为 [OpenClaw](https://github.com/openclaw) 深度定制的生产级个人工作数字分身系统。它为个人建立了一个智能代理层，通过身份识别、状态感知和三级升级决策机制，替你承接同事的日常咨询。

## 功能介绍

当有人给你发消息时，他们会先和你的分身对话。分身会执行以下逻辑：

1. **识别身份**：判断对方是谁（管理员 / 成员 / 访客）。
2. **感知状态**：检测你当前的实时状态（写代码 / 开会中 / 空闲）。
3. **做出决策**：
   - ✅ **直接回答**：处理常规问题或公共信息。
   - ⚠️ **部分回答**：涉及敏感话题时，根据身份进行信息脱敏或过滤。
   - 🔺 **升级给你**：仅在紧急或复杂事务时才转接给本人。

## 架构

```
Message → OpenClaw Gateway → AvatarController → Decision Engine → Reply

AvatarController:
├── StateDetector     — 本地状态（前台窗口）+ 日历感知
├── IdentityResolver  — 用户身份解析 + 动态信任分系统
├── EscalationRouter  — 基于规则的升级决策引擎
└── ReplyFormatter    — 基于模板的回复生成
```

## 快速开始

### 前置条件

- 已安装并运行 [OpenClaw](https://github.com/openclaw)
- Windows 系统（状态检测需调用 Win32 API）
- 已配置飞书/Lark 通道

### 安装

```bash
openclaw plugins install ask-me-first
```

### 手动安装

1. **克隆**项目到 OpenClaw 的 extensions 目录：
   ```bash
   cd ~/.openclaw/extensions
   git clone https://github.com/LENKIN233/ask-me-first.git
   ```

2. **配置身份**（可选 — 系统会自动将第一个发消息的人注册为管理员）：
   - 如需手动设置：编辑 `users.json`，将 `ou_your_admin_id_here` 替换为你的飞书 userId。
   - 根据需要调整 member/guest 条目。

3. **重启 OpenClaw Gateway**

### 首次启动

插件在首次加载时会自动执行：
- 创建 `~/.openclaw/workspace/ask_me_first/` 和 `ask_me_first/config/` 目录。
- 如果工作区尚不存在配置文件，则自动复制模板文件（`users.json`、`restricted-mode-prompt.txt`、升级规则等）。
- 绝不覆盖你已有的自定义配置。

**管理员零配置设置**：安装后第一个发送消息的用户将被自动注册为管理员。无需手动编辑 `users.json` —— 插件会识别模板中的占位符 `userId` 并将其替换为真实的飞书 userId。后续用户将根据 `users.json` 的配置解析为成员或访客。

### 验证

```bash
openclaw plugins list          # 应当显示 ask-me-first
openclaw plugins doctor        # 应当报告无错误
```

重启 Gateway 后，给你的机器人发送任意消息。第一个发送者将自动注册为管理员。接着可以尝试：

```
/avatar set coding
```

机器人应当回复确认信息，如 `✅ State overridden to: coding`。

## 项目结构

```
ask-me-first/
├── index.ts                      # 插件入口（Hooks、命令、服务集成）
├── openclaw.plugin.json          # 插件清单（配置 Schema、UI 提示）
├── package.json                  # npm 元数据 + OpenClaw 扩展声明
├── users.json                    # 用户身份映射模板（编辑后拷贝至工作区）
├── restricted-mode-prompt.txt    # 访客受限模式提示词模板
├── src/                          # 核心 TypeScript 源码
│   ├── controller.ts             # AvatarController 编排器
│   ├── state/                    # 状态检测（检测器、缓存）
│   ├── identity/                 # 身份解析与信任管理
│   ├── escalation/               # 升级规则引擎
│   ├── generation/               # 回复格式化
│   └── tools/                    # 日历、在离线、上下文、记忆工具
├── config/
│   ├── identities.json           # 身份等级定义
│   ├── escalationRules.json      # 升级规则配置
│   └── templates.json            # 回复模板
├── prompts/
│   └── avatar-system-prompt.txt  # 系统提示词模板
├── tests/
│   ├── plugin.test.ts            # 插件单元测试
│   ├── smoke.test.ts             # 冒烟测试
│   └── fixtures/
├── docs/
│   ├── PITCH.md                  # 项目完整介绍（中文）
│   ├── deployment.md             # 部署指南
│   ├── ops.md                    # 运维手册
│   └── tuning.md                 # 调优指南
├── IMPLEMENTATION.md             # 原始设计文档（历史参考）
└── SKILL.md                      # OpenClaw Skill 描述
```

### 目录模型

**代码仓库源码**（本仓库 / npm 包）包含模板和核心代码。
**运行时工作区**（`~/.openclaw/workspace/ask_me_first/`）是插件在运行时读写数据的地方：
- `users.json` — 当前活跃的用户身份数据
- `avatar_state.json` — 自动生成的状态快照
- `config/escalationRules.json` — 活跃的升级规则
- `restricted-mode-prompt.txt` — 活跃的受限模式提示词

首次启动时，插件会自动将模板文件从安装包拷贝到工作区的 `ask_me_first/` 目录（仅在文件不存在时执行）。

## 配置

### users.json

核心配置文件，定义权限边界：

| 身份类型 | 信息等级 | 斜杠命令权限 | 升级策略 |
|----------|-----------|----------------|------------|
| `admin`  | owner_only | 全部 (`*`)     | 无需升级       |
| `member` | internal   | 部分受限   | 部分升级    |
| `guest`  | public     | 无          | 自动升级       |

### 动态信任分系统

- 信任分范围：0.0 到 1.0。
- 衰减机制：自上次交互起，每天自动减少 0.01。
- 增益机制：每次确认有效的回复后增加 0.05。
- 信任分越高，分身开放的上下文权限越深。

### 状态感知

后台服务每 10 分钟自动检测一次你的当前活动：
- **前台窗口分析**：识别活跃应用（如 VS Code 对应 coding，Teams 对应 meeting）。
- **日历集成**：读取飞书日历日程。
- **显式覆盖**：通过 `/avatar set <state>` 命令进行手动干预。

### 升级规则

在 `config/escalationRules.json` 中配置：
- 关键词触发逻辑。
- 基于身份的路由规则。
- 状态感知决策（例如：在深度工作期间始终升级）。

## 核心特性

- **原生插件架构**：所有功能集成在单一的 `index.ts` 中，无需额外的 hooks/ 目录。
- **身份感知消息处理**：通过 `message_received` 钩子追踪信任分并映射会话身份。
- **Agent 引导注入**：利用 `agent:bootstrap` 钩子注入身份约束和受限模式提示词。
- **可配置路径**：`usersJsonPath` 和 `trustDecayRate` 可在插件设置中实时调整。
- **5 秒内存缓存**：避免频繁读取磁盘，提升响应速度。
- **信任分衰减**：长期不活跃的用户将逐渐失去访问权限（速率可调）。
- **显式状态覆盖**：管理员可通过 `/avatar set` 强制切换分身状态。
- **模板化回复**：确保回复格式统一、边界清晰且高度可配。
- **升级通知**：自动加入队列供所有者后续审阅。

> ⚠️ **注意**：由于 OpenClaw 目前尚未提供前置命令拦截钩子，插件暂时**无法**通过 API 拦截网关层的未授权斜杠命令。

## 限制与 API 稳定性

| 功能特性 | 依赖项 | 稳定性 |
|---------|-----------|-----------|
| `/avatar` 命令 | `registerCommand` | ✅ 稳定 — 核心插件 API |
| 首次启动初始化 | `register()` 生命周期 | ✅ 稳定 — 随插件加载运行 |
| 身份信息注入 | `agent:bootstrap` 钩子 | ✅ 稳定 — 官方文档支持 |
| 信任分追踪 | `message_received` 事件 | ⚠️ **实验性** — 可能在部分 OpenClaw 版本中失效 |
| 自动注册管理员 | `message_received` 事件 | ⚠️ **实验性** — 依赖同上 |
| 状态检测服务 | `registerService` | ✅ 稳定 — 核心插件 API |

**如果 `message_received` 失效**：信任分将无法自动更新，自动注册管理员功能也将无法触发。此时请手动编辑 `users.json` 设置管理员 userId，信任分将保持初始值直至钩子功能可用。

## 文档

- [PITCH.md](docs/PITCH.md) — 项目完整介绍与设计初衷（中文）
- [IMPLEMENTATION.md](IMPLEMENTATION.md) — 原始设计文档（历史参考）
- [deployment.md](docs/deployment.md) — 生产环境部署
- [ops.md](docs/ops.md) — 运维手册
- [tuning.md](docs/tuning.md) — 性能调优

## 开源协议

MIT

## 备注

> ⚠️ 状态检测目前**仅支持 Windows**（通过 Win32 `GetForegroundWindow` 实现）。
