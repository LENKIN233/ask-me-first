# Ask My Avatar First - 实现方案

> 基于现有 `ask_me_first` 框架，升级为完整的个人工作接口系统

---

## 一、总体架构

```
飞书消息 → OpenClaw Channel → Gateway → AvatarController → 决策层 → 模型 → 返回飞书

核心层：
┌─────────────────────────────────────────────────────────────┐
│                     AvatarController                        │
├─────────────┬─────────────┬─────────────┬─────────────────┤
│   State     │ Identity &  │ Escalation  │   Generation    │
│  Detector   │ Relationship│   Router    │   Formatter     │
└─────────────┴─────────────┴─────────────┴─────────────────┘

支持工具层：
- Calendar（飞书日历）
- Presence（本地活跃度）
- Context（项目上下文）
- Memory（长期记忆）
```

---

## 二、扩展目录结构

```
ask_me_first/
├── users.json                    # 用户身份映射（扩展字段）
├── identities.json               # 身份定义（权限策略）
├── escalationRules.json          # 升级规则配置
├── templates.json                # 回复模板库
├── queries.json                  # 查询日志（已有）
├── slash_log.json                # 审计日志（已有）
├── restricted-mode-prompt.txt   # guest 兜底提示（已有，扩展）
│
├── src/
│   ├── controller.ts            # AvatarController 主类
│   │
│   ├── state/
│   │   ├── detector.ts          # 状态检测器
│   │   ├── state.ts             # 状态模型
│   │   └── cache.ts             # 状态缓存
│   │
│   ├── identity/
│   │   ├── resolver.ts          # 身份解析
│   │   ├── relationship.ts      # 关系计算
│   │   └── permissions.ts       # 可见性策略
│   │
│   ├── escalation/
│   │   ├── router.ts            # 升级路由器
│   │   ├── rules.ts             # 规则引擎
│   │   └── triggers.ts          # 触发器
│   │
│   ├── generation/
│   │   └── formatter.ts         # 回复格式化
│   │
│   └── tools/
│       ├── calendar.ts          # 飞书日历
│       ├── presence.ts          # 本地活跃度
│       ├── context.ts           # 项目上下文
│       └── memory.ts            # MEMORY.md 读取
│
├── hooks/
│   ├── ask-me-first/
│   │   ├── handler.ts           # agent:bootstrap 注入
│   │   └── message-received.ts  # 记录交互历史
│   │
│   └── avatar-state/
│       └── updater.ts           # 定时状态更新（每 10min）
│
├── gateway-patch/
│   ├── ask-me-first-patch.js    # Gateway 补丁（拦截 + 校验）
│   └── inject.bat               # 自动注入脚本
│
├── prompts/
│   ├── restricted-mode-prompt.txt  # 已有（扩展）
│   └── avatar-system-prompt.txt    # 核心系统提示词模板
│
├── tests/
│   ├── smoke.test.ts            # 冒烟测试
│   └── fixtures/
│       └── sample-messages.json
│
└── docs/
    ├── deployment.md            # 部署步骤
    ├── tuning.md                # 调优指南
    └── ops.md                   # 运维监控
```

---

## 三、核心模块设计

### 3.1 AvatarController（controller.ts）

```typescript
class AvatarController {
  private stateDetector: StateDetector;
  private identityResolver: IdentityResolver;
  private escalationRouter: EscalationRouter;
  private replyFormatter: ReplyFormatter;

  async process(inbound: InboundMessage): Promise<Reply> {
    // 1. 身份（Gateway 已校验，此处读取）
    const identity = this.identityResolver.resolve(inbound.senderId);

    // 2. 当前状态
    const state = await this.stateDetector.getState();

    // 3. 升级决策
    const decision = this.escalationRouter.decide(inbound, identity, state);

    // 4. 信息可见性过滤
    const visible = this.permissions.filter(inbound.text, identity.infoLevel);

    // 5. 生成回复
    const reply = await this.replyFormatter.format(decision, state, identity, visible);

    return reply;
  }
}
```

---

### 3.2 状态检测器（state/detector.ts）

**输入源**：
- 本地：`Get-Process`、active window、idle time
- 飞书：calendar events（未来 1h）、status
- 显式：`/status` 命令

**状态模型**：
```typescript
interface AppState {
  availability: 'online' | 'busy' | 'focus' | 'offline';
  interruptibility: number;      // 0-1，可打断度
  current_mode: string;          // coding/meeting/writing/...
  confidence: number;            // 0-1，置信度
  evidence: Evidence[];          // 状态依据（用于解释）
}
```

**冲突消解**：
- 多源冲突 → confidence 降低
- 显式声明优先级最高

---

### 3.3 身份与关系（identity/）

**users.json 扩展**：
```json
{
  "version": "1.1",
  "users": [
    {
      "userId": "ou_xxx",
      "identity": "member",
      "infoLevel": "internal",
      "relationship": {
        "team": "backend",
        "project": ["avatar"],
        "role": "peer",
        "trustScore": 0.7,
        "lastInteraction": "2026-03-19T20:00:00Z"
      }
    }
  ]
}
```

信任分数动态调整：
- 本人后续确认 → +0.05
- 长时间无交互 → -0.01/天

---

### 3.4 升级路由器（escalation/router.ts）

**决策**：
```typescript
enum EscalateLevel { Answer, Partial, Escalate }

interface Decision {
  level: EscalateLevel;
  reason: string;
  suggestedAction: 'reply' | 'notify_owner' | 'wait_for_owner';
}
```

**规则示例**：
- 显式 `/upgrade` 或 "找本人" → Escalate
- 敏感意图（budget/personnel/legal/commitment） → Escalate
- `requiredInfoLevel > user.infoLevel` → Partial/Escalate
- `state.confidence < 0.6` → Partial
- 时间承诺（"什么时候完成"）→ Escalate（除非在 known_tasks）

---

### 3.5 回复格式化（generation/formatter.ts）

使用模板，减少模型自由发挥：
```typescript
const templates = {
  [EscalateLevel.Answer]: [
    "根据当前状态（{{state}}），{{answer}}",
    "可以直接回答：{{answer}}（我{{state}}）"
  ],
  [EscalateLevel.Partial]: [
    "当前：{{stateSummary}}。关于{{topic}}，仅能提供背景：{{context}}。建议@我本人确认。",
    "我{{state}}。{{context}}。这个问题需要我进一步确认，稍后回复。"
  ],
  [EscalateLevel.Escalate]: [
    "已升级给本人，他将尽快回复。",
    "需要本人处理，已转交。"
  ]
};
```

---

## 四、实施里程碑

### Phase 1：骨架搭建（1周）
- 创建 `src/` 结构，实现各模块 empty class
- 定义所有接口和类型
- 实现最简单的 `detector.ts`（只返回 online）
- 实现 `resolver.ts` 读取 `users.json`
- 实现 `router.ts` 最小规则集（3条）
- 实现 `formatter.ts` 模板替换

### Phase 2：工具集成（1周）
- `tools/calendar.ts`：读取飞书日历事件（使用 `feishu_doc` 或 API）
- `tools/presence.ts`：本地活跃度检测（Windows: Get-Process、Get-ForegroundWindow）
- `tools/context.ts`：加载当前项目上下文（最近 git commits、open files）
- 状态缓存（state/cache.ts）

### Phase 3：Hook 与补丁（1周）
- 更新 `hooks/ask-me-first/handler.ts`，注入 AvatarController
- 新增 `hooks/avatar-state/updater.ts`（定时刷新状态，每 10min）
- 更新 Gateway 补丁（`gateway-patch/ask-me-first-patch.js`）
- 编写 `gateway-patch/inject.bat` 自动化注入
- 扩展 `restricted-mode-prompt.txt` 为 `avatar-system-prompt.txt`

### Phase 4：测试调优（1周）
- `tests/smoke.test.ts`：模拟消息流，验证决策链路
- 灰度：指定 2-3 个用户测试
- 监控 `queries.json`，调整规则权重
- 优化模板语言

---

## 五、关键配置

**config/identities.json**：
```json
{
  "identities": {
    "admin": {
      "slashCommands": true,
      "allowedCommands": ["*"],
      "escalation": "none",
      "infoLevel": "owner_only"
    },
    "member": {
      "slashCommands": true,
      "allowedCommands": ["/new", "/status", "/help"],
      "escalation": "partial",
      "infoLevel": "internal"
    },
    "guest": {
      "slashCommands": false,
      "escalation": "auto",
      "infoLevel": "public"
    }
  }
}
```

**config/escalationRules.json**：
```json
{
  "rules": [
    { "id": "explicit_upgrade", "pattern": ["/upgrade", "找本人", "转接"], "action": "escalate", "priority": 100 },
    { "id": "sensitive_topics", "intents": ["budget", "personnel", "legal", "commitment"], "action": "escalate", "priority": 90 },
    { "id": "low_confidence_state", "condition": "state.confidence < 0.6", "action": "partial", "priority": 80 }
  ]
}
```

**config/templates.json**：
```json
{
  "answer": [
    "根据当前状态（{{state}}），{{answer}}",
    "可以直接回答：{{answer}}（我{{state}}）"
  ],
  "partial": [
    "当前：{{state}}。关于{{topic}}，仅能提供背景：{{context}}。建议@我本人确认。",
    "我{{state}}。{{context}}。这个问题需要我进一步确认，稍后回复。"
  ],
  "escalate": [
    "已升级给本人，他将尽快回复。",
    "需要本人处理，已转交。"
  ]
}
```

---

## 六、风险与缓解

| 风险 | 缓解 |
|------|------|
| 状态检测不准 | 置信度 < 0.6 自动 Partial/Escalate |
| 信息泄露 | 使用 formatter 模板，`owner_only` 内容绝不注入 |
| 升级风暴 | 调整规则阈值，先用 Partial 试水 |
| Gateway 补丁冲突 | 提供 inject.bat 一键重打 |

---

## 七、验收标准（MVP）

- [ ] 身份识别准确
- [ ] 状态感知（日历 + 本地活跃度）
- [ ] 升级判断规则生效
- [ ] 回复模板化，包含状态摘要
- [ ] 决策日志记录到 `queries.json`
- [ ] `/status` 斜杠命令返回当前状态
- [ ] 无信息泄露（guest 看不到 internal 内容）
- [ ] 延迟 < 300ms（不含模型生成）

---

## 八、下一步

确认后开始创建 `src/` 下的具体实现文件。
