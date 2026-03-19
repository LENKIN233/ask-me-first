---
name: avatar-state
description: "Periodic state refresh — detects local presence (foreground window, processes) and updates avatar_state.json every 10 minutes"
metadata:
  openclaw:
    emoji: "👁️"
    events: ["agent:bootstrap"]
    requires:
      config: ["workspace.dir"]
    os: ["win32"]
---

# Avatar State — Periodic State Refresh

每 10 分钟刷新一次头像状态（availability、current_mode、confidence），供 AvatarController 使用。

## 检测方式

- **Windows**: PowerShell P/Invoke `GetForegroundWindow()` + `GetWindowText()`
- 检测前台窗口标题判断当前活动（coding / meeting / writing）
- 结果写入 `ask_me_first/avatar_state.json`

## 触发

- `agent:bootstrap`：启动定时器（setInterval 10min）
- 首次启动立即刷新一次
