# 运维监控 (v2.1.x)

## 日志与数据文件

| 文件 | 内容 | 写入时机 |
|------|------|----------|
| `ask_me_first/persona.json` | 核心人格配置文件 | 每次人格蒸馏 (Distill) 时原子化更新 |
| `ask_me_first/persona_events.jsonl` | 对话事件流 (Learning Source) | 每次交互观察 (Observe) 时追加 |
| `ask_me_first/users.json` | 用户身份与信任评分 | 交互更新或信任分衰减时 |
| `ask_me_first/avatar_state.json` | 最新状态快照 | 后台服务每 10min 更新 |
| `ask_me_first/queries.json` | 消息处理决策记录 | 每次决策链执行时 |

## 状态监控与控制

### /avatar 命令

本人（Admin）在飞书发送 `/avatar` 可实时查看分身状态。
- **查看**: 现实可用性、工作模式、置信度及判定依据。
- **设置**: `/avatar set <online|busy|focus|offline>` 显式覆盖自动检测，有效期 4 小时。

### 人格学习监控

通过 `persona.json` 的 `learning` 字段监控分身进化状态：
- **maturity**: 当前成熟度等级（seed → learning → stable）。
- **observed_messages**: 已观察到的对话消息总数。
- **confidence**: 语气、判断力、边界识别的置信度评分（0-1）。
- **locked_fields**: 被管理员锁定、不参与自动学习的字段列表。

## 工具集成状态

### 日历集成 (CalendarTool)
- **配置**: 通过 OpenClaw 插件配置界面填入 `feishuAppId` 和 `feishuAppSecret`。
- **状态**: 若未配置，日志输出 `[CalendarTool] 飞书凭证未配置`，日历检测将被跳过。
- **性能**: Token 自动刷新并缓存，API 超时时间 5 秒。

### 本地检测 (PresenceTool)
- **依赖**: PowerShell + user32.dll（仅限 Windows 环境）。
- **权限**: 需确保 OpenClaw 运行环境具有执行 PowerShell 的权限（`Set-ExecutionPolicy`）。
- **降级**: 若检测失败，系统将自动回退至 `offline` 状态，并将置信度设为 0。

## 告警与异常处理

| 条件 | 严重度 | 处理措施 |
|------|--------|----------|
| 升级率 > 60% 持续 1h | 高 | 检查 `persona.json` 中的 `judgment.escalate_when` 规则是否过于严苛。 |
| 置信度 < 0.4 持续 30min | 中 | 检查日历 API 通信及本地检测权限。 |
| 原子化写入失败 | 高 | 检查 `ask_me_first/` 目录的写入权限及磁盘剩余空间。 |
| 人格蒸馏 (Distill) 异常 | 中 | 查看 `persona_events.jsonl` 是否损坏，必要时手动清理。 |

## 备份策略

- **核心人格 (`persona.json`)**: 极其关键，记录了分身的进化成果，建议每日备份。
- **用户映射 (`users.json`)**: 包含信任评分，建议每日备份。
- **事件流 (`persona_events.jsonl`)**: 原始数据，建议定期归档（保留最近 30 天）。
- **提示词 (`prompts/`)**: 自定义提示词模板，随版本控制备份。

## 更新与回滚

1. **更新**: 使用 `clawhub package install ask-me-first` 获取最新版本。
2. **热更新**: 修改 `persona.json` 或 `users.json` 后，系统在下次交互时会自动重新加载。
3. **回滚**: 若新版本出现问题，可将 `persona.json` 回退至备份版本，或暂时停用插件。
