# 部署指南 (v2.1.2)

## 前置条件

- OpenClaw 已安装并运行 (SDK >=2026.3.22)
- 飞书机器人已创建，并具备以下权限：
  - `docs:document.content:read`
  - `wiki:wiki`
  - `sheets:spreadsheet`
  - `calendar`（如果使用日历功能）

## 安装步骤

### 1. 插件安装

通过 ClawHub 安装最新版插件：

```bash
clawhub package install ask-me-first
```

或者通过 Git 克隆仓库后手动放入工作区插件目录：
```bash
git clone https://github.com/LENKIN233/ask-me-first.git
```

### 2. 初始化与配置

插件在首次启动时会自动在工作区（Workspace）创建必要的目录并拷贝配置模板。

- **自动注册管理员**：首个发送消息给机器人的用户将被自动注册为管理员（Admin），其 userId 会被写入 `users.json`。
- **人格初始化 (`persona.json`)**：系统会自动生成初始人格档案。首次运行后，建议根据实际需要微调其中的语气与偏好。
- **配置项说明**：在 OpenClaw 的插件配置界面中进行以下设置：
  - `enablePresence` — 是否启用存在感知（Windows 前台窗口检测）。
  - `enableCalendar` — 是否启用日历集成（需填入 Feishu App ID/Secret）。
  - `autoAdminRegistration` — 是否允许自动注册首位管理员。

> **注意**：所有凭证（如飞书 App ID/Secret）均通过插件配置界面安全传入，无需配置系统环境变量。

### 3. 验证安装

运行以下命令验证插件状态：

```bash
# 查看插件是否已启用
clawhub package list --installed

# 运行单元测试
npm test
```

v2.1.2 版本应显示 68 项单元测试全部通过。

## 验证与测试

- **身份测试**：发送消息给机器人。
  - **Admin 用户**：拥有全部权限，可运行 `/avatar` 设置显式状态。
  - **Guest 用户**：受限于 Restricted Mode，无法执行管理指令，仅能进行自然对话。
- **人格学习测试**：
  - 发送几条常规对话消息。
  - 观察 `persona_events.jsonl` 是否自动记录了对话事件。
  - 随着交互增加，`persona.json` 中的 `learning.observed_messages` 计数会增长。
- **inbound_claim 测试**：
  - 发送简单的打招呼或进度询问。
  - 检查分身是否通过 `inbound_claim` 钩子进行了即时回复（响应通常比主 Agent 更快）。

## 架构说明

本项目采用 **SDK v2026.3.22+ 纯插件架构**：
- **Hooks**: 注册了 `inbound_claim` (自动拦截) 和 `message_sending` (观察学习) 钩子。
- **Events**: 监听 `before_prompt_build` 以注入实时分身人格与工作状态。
- **Services**: 注册后台状态更新服务，定期同步日历与本地活跃度。
- **Storage**: 所有持久化数据（状态、人格、身份、日志）均存储在工作区的 `ask_me_first/` 子目录下。

## 常见问题 (FAQ)

**Q: 插件未加载？**
A: 运行 `clawhub package list --installed` 确认 `ask-me-first` 是否已启用。检查 SDK 版本是否满足 `>=2026.3.22`。

**Q: 自动认领不生效？**
A: 检查 `persona.json` 中的 `judgment.autonomous_when` 是否涵盖了相关意图。初始阶段意图识别可能较保守，随学习加深会逐步优化。

**Q: 如何手动微调人格？**
A: 编辑 `persona.json`，并将修改过的字段添加到 `learning.locked_fields` 中，防止后续的自动学习将其覆盖。
