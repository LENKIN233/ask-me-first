# 运维监控

## 日志文件

| 文件 | 内容 | 写入时机 |
|------|------|----------|
| `ask_me_first/queries.json` | 消息处理决策记录 | 每次 process() 调用 |
| `ask_me_first/slash_log.json` | 被拒绝的斜杠命令 | 命令被 ACL 拒绝时 |
| `ask_me_first/avatar_state.json` | 最新状态快照 | avatar-state hook 每 10min |

## /status 命令

用户在飞书发送 `/status` 可实时查看状态。读取 `avatar_state.json`，格式化输出可用性、模式、置信度、依据。

## 工具状态

### 日历工具（CalendarTool）
- 检查环境变量：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`
- 无凭证时日志输出 `[CalendarTool] 飞书凭证未配置`
- Token 自动刷新，缓存至过期前 60 秒
- API 超时：5 秒

### 本地检测（PresenceTool）
- 依赖 PowerShell + user32.dll（仅 Windows）
- 检测前台窗口标题和进程名
- 失败时返回 offline / confidence=0

### 项目上下文（ContextTool）
- git 命令超时：3 秒
- VS Code 窗口枚举超时：3 秒
- TODO.md / MEMORY.md 文件读取失败静默跳过

## 指标统计

```ts
const queries = JSON.parse(readFileSync('queries.json', 'utf-8'));
const counts = queries.entries.reduce((acc, e) => {
  acc[e.decisionLevel] = (acc[e.decisionLevel] || 0) + 1;
  return acc;
}, {});
console.log(counts);
```

## 告警规则

| 条件 | 严重度 | 处理 |
|------|--------|------|
| 升级率 > 60% 持续 1h | 高 | 调整 escalationRules.json |
| 置信度 < 0.4 持续 30min | 中 | 检查日历 API、本地检测权限 |
| queries.json 写入失败 | 高 | 检查磁盘空间和文件权限 |
| CalendarTool token 获取失败 | 中 | 检查 FEISHU_APP_ID/SECRET |
| PresenceTool PowerShell 失败 | 低 | 检查执行策略 `Set-ExecutionPolicy` |

## 备份

- `users.json`：关键配置，每日备份
- `MEMORY.md`：persona 数据，定期备份
- `queries.json`：审计日志，可滚动归档（建议保留 7 天）
- `avatar_state.json`：临时数据，无需备份

## 更新与回滚

1. **代码更新**：修改 `src/` 后 hook 会自动加载最新代码（TypeScript 通过 ts-node）
2. **Gateway 补丁**：运行 `inject.bat` 重新注入；回滚恢复 `reply-*.js.backup`
3. **配置热更新**：`escalationRules.json` 通过 `controller.reloadConfig()` 热加载；`users.json` 有 5s 缓存
