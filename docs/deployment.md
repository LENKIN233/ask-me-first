# 部署指南

## 前置条件

- OpenClaw 已安装并运行
- 飞书机器人已创建，具备以下权限：
  - `docs:document.content:read`
  - `wiki:wiki`
  - `sheets:spreadsheet`
  - `calendar`（如果使用日历功能）
- 已准备好 `users.json` 用户映射（v1.1 格式，含 relationship 字段）

## 安装步骤

### 1. 插件安装

使用 OpenClaw CLI 进行安装：

```bash
openclaw plugins install ask-me-first
```

或者手动安装：将插件代码克隆到 `~/.openclaw/extensions/ask-me-first` 目录下。

### 2. 初始化与配置

插件在首次启动时会自动在工作区创建必要的目录并拷贝配置模板。

- **自动注册管理员**：首个发送消息给机器人的用户将被自动注册为管理员（Admin）。
- **用户映射**：编辑 `users.json`，填入实际的 userId、身份和关系信息。
- **核心配置**：检查 `openclaw.plugin.json` 或插件配置界面中的以下项：
  - `usersJsonPath` — `users.json` 路径
  - `enablePresence` — 是否启用存在感知（默认为 false）
  - `enableCalendar` — 是否启用日历集成

### 3. 验证安装

运行以下命令验证插件状态：

```bash
# 查看插件是否在列表中且已启用
openclaw plugins list

# 运行插件健康检查
openclaw plugins doctor ask-me-first
```

## 验证与测试

- **身份测试**：发送消息给机器人
  - **Admin 用户**：应收到包含详细状态和上下文的回复。
  - **Member 用户**：应收到部分信息，并建议在必要时升级。
  - **Guest 用户**：应收到公开信息或升级提示。
- **决策测试**：发送 "找本人" 或 "转接"，应触发 Escalation 决策并记录到升级队列。
- **冒烟测试**：
  ```bash
  npm test
  ```
  应显示 26 项单元测试全部通过。

## 架构说明

当前采用 **纯插件架构（Pure-Plugin Architecture）**：
- 所有的功能逻辑均通过 `index.ts` 调用 OpenClaw Plugin API 实现。
- 插件通过 `registerCommand('/avatar')` 注册命令。
- 通过 `api.on('message_received')` 拦截并处理消息。
- 通过 `registerService()` 注册后台状态更新服务。
- 不再依赖 `hooks/`、`gateway-patch/` 或 `inject.bat`。

## 常见问题 (FAQ)

**Q: 插件未加载？**
A: 运行 `openclaw plugins list` 确认 `ask-me-first` 是否处于 `enabled` 状态。如果未显示，请检查 `~/.openclaw/extensions/` 目录结构。

**Q: 状态检测没有数据？**
A: 确保在配置中开启了 `enablePresence` 或 `enableCalendar`。本地检测需要相应的系统权限。如果不需要状态感知，可保持 `enablePresence: false`。

**Q: 如何重新指定管理员？**
A: 手动编辑 `users.json`，修改对应用户的 `role` 为 `admin`。

**Q: 升级决策未触发？**
A: 检查 `config/escalationRules.json` 中的规则匹配模式（pattern）是否覆盖了你的输入关键词。
