# 调优指南

## 参数调整

### 状态检测

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `stateConfig.cacheTTL` | 状态缓存时间（ms） | 300000-600000（5-10 分钟） |
| `stateConfig.enablePresence` | 本地桌面活跃度检测 | `true`（仅 Windows 桌面端） |
| `stateConfig.enableCalendar` | 飞书日历集成 | `true`（需配置凭证） |
| `stateConfig.calendarLookaheadHours` | 日历查询范围 | 1-2 小时 |

### 飞书日历配置

环境变量：

```
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_CALENDAR_ID=primary   # 可选，默认主日历
```

无凭证时自动降级：日历相关功能返回空结果，不影响其他检测。

### 项目上下文

ContextTool 自动检测：
- **当前任务**：从 `TODO.md`（第一个未完成项）或 `MEMORY.md`（"当前任务" 标题下第一行）读取
- **最近提交**：`git log --oneline -5`
- **打开的文件**：PowerShell 枚举 VS Code 窗口标题

### 升级规则

修改 `config/escalationRules.json`：

- `priority`：数值越大优先级越高。显式升级 ≥ 100，敏感话题 ≥ 90，时间承诺 ≥ 85
- `pattern`：关键词匹配（不区分大小写）
- `condition`：JavaScript 表达式，可访问 `state`、`identity`、`msg` 三个变量
- 新增规则：添加对象到 `rules` 数组即可

### 信任分数

`src/identity/resolver.ts` 中的 `updateTrustScore`：

| 触发条件 | Delta |
|----------|-------|
| 每次交互 | +0.01 |
| 本人确认 | +0.05 |
| 长时间无交互衰减 | -0.01/天（需手动实现定时任务） |

分数范围：0-1，影响升级决策中的 `info_level_mismatch` 规则。

## 模板优化

编辑 `config/templates.json`：

- `answer` 模板：简洁，强调状态和结果
- `partial` 模板：明确建议升级，提供背景
- `escalate` 模板：传达已转交，减少焦虑

模板变量：`{{state}}`、`{{answer}}`、`{{context}}`、`{{topic}}`

## /status 命令

用户在飞书发送 `/status` 可查看当前 Avatar 状态，包括：
- 可用性、工作模式、可打断度、置信度
- 检测依据（evidence）
- 最后更新时间

数据来源：`avatar_state.json`（由 avatar-state hook 每 10 分钟写入）

## 监控指标

| 指标 | 目标 | 说明 |
|------|------|------|
| 升级率 | < 30% | `escalate / total`，过高说明规则过严 |
| 平均置信度 | > 0.8 | `state.confidence` 平均值 |
| 决策延迟 | < 300ms | `process()` 耗时（不含模型生成） |

## 灰度策略

1. 仅对 `infoLevel: internal` 以上用户开启完整决策
2. guest 用户始终 `escalate` 或固定模板
3. 监控 `queries.json` 统计后逐步扩大
