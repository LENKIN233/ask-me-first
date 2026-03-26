# 调优指南 (v2.1.0)

## 人格调优 (Persona Tuning)

`persona.json` 是分身的核心大脑，您可以手动编辑其中的字段来微调分身的表现。修改后，请将对应字段名添加到 `learning.locked_fields` 中，以防止后续的自动学习将其覆盖。

### 1. 语气与风格 (Voice)

| 字段 | 可选值 | 说明 |
|------|--------|------|
| `voice.formality` | `low` \| `medium` \| `high` | 正式程度。`low` 会使用更多口语，`high` 则偏向商务。 |
| `voice.verbosity` | `terse` \| `brief` \| `moderate` \| `detailed` | 回复长度偏好。 |
| `voice.emoji` | `never` \| `rare` \| `moderate` \| `frequent` | 表情符号的使用频率。 |
| `voice.signature_phrases` | `string[]` | 您的常用短语（如 "收到"、"这就来"）。 |

### 2. 决策边界 (Judgment)

| 字段 | 说明 |
|------|------|
| `judgment.autonomous_when` | 分身可以**自主应答**的场景描述（如 "闲聊"、"询问进度"）。 |
| `judgment.escalate_when` | **必须升级**给本人的场景（如 "涉及金钱"、"敏感决策"）。 |
| `judgment.annoyances` | 您讨厌的话题，分身会自动识别并进行礼貌回避或重定向。 |

### 3. 学习状态 (Learning)

- **maturity**: 设为 `stable` 可降低自动学习的权重，设为 `seed` 则会积极吸收新的对话风格。
- **locked_fields**: 填入您不希望被自动更正的路径（如 `["voice.tone", "judgment.escalate_when"]`）。

---

## 插件配置调优

飞书凭证通过 OpenClaw 的插件设置界面配置即可，不再需要设置系统环境变量。

### 状态检测参数

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `stateRefreshIntervalMs` | 状态刷新频率 | 600000 (10 分钟) |
| `enablePresence` | 桌面活跃度检测 | Windows 环境建议开启 |
| `enableCalendar` | 飞书日历集成 | 建议开启以准确判定会议状态 |
| `calendarLookaheadHours` | 日历查询范围 | 1 小时 |
| `trustDecayRate` | 信任度每日衰减率 | 0.01 |

---

## 规则与决策优化

### 升级规则 (Escalation Rules)

修改 `ask_me_first/config/escalationRules.json`：
- **priority**: 数值越大优先级越高。
- **condition**: 安全的逻辑表达式，可访问 `state`、`identity`、`msg` 变量。
- **原子化写入**: v2.1.0 使用原子化工具更新规则，确保在高并发下配置不损坏。

---

## 性能与质量指标

| 指标 | 目标 | 说明 |
|------|------|------|
| 自动化测试通过数 | 68 / 68 | 运行 `npm test` 验证。 |
| 自动认领率 (Claim Rate) | > 40% | 通过 `inbound_claim` 处理的消息比例。 |
| 升级率 | < 30% | `escalate / total`，过高说明规则过严。 |
| 状态置信度 | > 0.8 | `state.confidence` 平均值。 |

---

## 最佳实践

1. **先观察再锁定**: 初始阶段（Seed 阶段）让分身多观察您的回复，待其生成的 `persona.json` 比较理想后，再锁定核心字段。
2. **信任分冷启动**: 建议手动在 `users.json` 中为核心协作成员设置较高的初始 `trustScore`。
3. **Restricted Mode**: 对于不认识的用户（Guest），分身会自动切换到受限模式，不提供任何敏感的项目上下文。
