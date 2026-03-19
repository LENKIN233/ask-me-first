# 部署指南

## 前置条件

- OpenClaw 已安装并运行
- 飞书机器人已创建，具备以下权限：
  - `docs:document.content:read`
  - `wiki:wiki`
  - `sheets:spreadsheet`
  - `calendar`（如果使用日历功能）
- 已准备好 `users.json` 用户映射（v1.1 格式，含 relationship 字段）

## 步骤

### 1. 准备配置文件

```bash
cd ask_me_first

# 编辑 users.json，填入实际的 userId、身份和关系信息
# 参考 users.json 中的 ou_example_member / ou_example_guest

# 检查 config/ 下的配置
# - config/escalationRules.json — 升级规则（可按需调整 priority/pattern）
# - config/identities.json — 身份定义
# - config/templates.json — 回复模板
```

### 2. 注入 Gateway 补丁

```powershell
# 运行自动注入脚本（会自动备份、注入、重启）
.\gateway-patch\inject.bat

# 脚本会：
# 1. 定位 reply-*.js bundle
# 2. 检查是否已注入（避免重复）
# 3. 备份到 .backup
# 4. 用 PowerShell 在 handleAbortTrigger 后注入补丁
# 5. 重启 Gateway
```

### 3. Hook 自动发现

OpenClaw 自动扫描 `workspace/hooks/` 目录：

```
workspace/hooks/
├── ask-me-first/
│   ├── HOOK.md          # 前端元数据（events: message:received, agent:bootstrap）
│   └── handler.ts       # agent:bootstrap 注入 AvatarController + message:received 更新交互
│
└── avatar-state/
    ├── HOOK.md          # 前端元数据（events: agent:bootstrap）
    └── updater.ts       # 启动 10min 定时器刷新状态
```

确保 `openclaw.json` 中 `hooks.internal.enabled` 为 `true`：

```json
{
  "hooks": {
    "internal": {
      "enabled": true
    }
  }
}
```

### 4. 重启 Gateway

```bash
openclaw gateway restart
# 或使用 workspace/restart-gateway.cmd
```

### 5. 验证

- 发送消息给 bot：
  - admin 用户：应收到包含状态和上下文的回复
  - member 用户：应收到部分信息 + 建议升级
  - guest 用户：应收到公开信息或升级提示
- 发送 "找本人" 或 "转接"：应触发 Escalate 决策
- 斜杠命令测试：guest 发送 `/new` 应被拦截
- 检查日志：`ask_me_first/slash_log.json` 和 `queries.json`

### 6. 冒烟测试

```bash
cd ask_me_first
npx tsx tests/smoke.test.ts
# 应输出 ✅ All tests passed
```

## 常见问题

**Q: Hook 未触发？**
A: 检查 hook 目录下是否有 `HOOK.md`，且 frontmatter 中 `openclaw.events` 列表正确。运行 `openclaw hooks status` 查看注册状态。

**Q: Gateway 补丁丢失？**
A: `npm update openclaw` 会覆盖 dist 文件。更新后重新运行 `inject.bat`。

**Q: 状态检测无数据？**
A: 本地检测需要 PowerShell 执行权限。确认 `avatar_state.json` 是否被写入。可暂时在 stateConfig 中设 `enablePresence: false`。

**Q: inject.bat 报错 "补丁已存在"？**
A: 说明补丁已注入。如需重新注入，先从 `.backup` 恢复原文件。
