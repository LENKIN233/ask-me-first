# Gateway Bundle 补丁指南

## 补丁位置

```
%APPDATA%\npm\node_modules\openclaw\dist\reply-Bm8VrLQh.js
```

函数：`handleCommands()`（搜索 `async function handleCommands(params)`）

## 注入位置

在 HANDLERS 数组 `];` 闭合之后、`const resetMatch = ...` 之前。

## 补丁代码

```javascript
/* ── ask_me_first: slash command access control (patched) ────────── */
const __amf = (() => {
    let _cache = null;
    let _cacheTime = 0;
    const _TTL = 5000;
    function _loadUsers(wDir) {
        const now = Date.now();
        if (_cache && (now - _cacheTime) < _TTL) return _cache;
        try {
            const p = require("path").join(wDir, "ask_me_first/users.json");
            if (!require("fs").existsSync(p)) return null;
            _cache = JSON.parse(require("fs").readFileSync(p, "utf-8"));
            _cacheTime = now;
            return _cache;
        } catch { return null; }
    }
    function _logDeny(wDir, entry) {
        try {
            const p = require("path").join(wDir, "ask_me_first/slash_log.json");
            let log = { version: "1.0", createdAt: new Date().toISOString(), entries: [] };
            if (require("fs").existsSync(p)) {
                try { log = JSON.parse(require("fs").readFileSync(p, "utf-8")); } catch {}
            }
            log.entries.push(entry);
            require("fs").writeFileSync(p, JSON.stringify(log, null, 2));
        } catch {}
    }
    return function checkCommand(p) {
        const body = p.command?.commandBodyNormalized;
        if (!body || typeof body !== "string") return null;
        const m = body.trim().match(/^\/([a-zA-Z_][\w-]*)(?:\s|$)/);
        if (!m) return null;
        const cmdName = m[1];
        const wDir = p.workspaceDir;
        const senderId = p.command?.senderId;
        if (!wDir || !senderId) return null;
        const data = _loadUsers(wDir);
        if (!data) return null;
        const uEntry = data.users?.find(u => u.userId === senderId);
        const identity = uEntry?.identity || "guest";
        const iCfg = data.identities?.[identity];
        let slashOk = false;
        if (uEntry?.slashCommandsAllowed !== undefined) slashOk = uEntry.slashCommandsAllowed;
        else if (iCfg) slashOk = iCfg.slashCommands;
        if (!slashOk) {
            const reason = `身份 ${identity} 无斜杠命令权限`;
            _logDeny(wDir, { timestamp: new Date().toISOString(), senderId, commandName: cmdName, identity, allowed: false, reason, messageId: p.ctx?.MessageSid, channelId: p.command?.channel });
            return { shouldContinue: false, reply: { text: `⛔ 无法执行 /${cmdName} — ${reason}\n\n如需使用此命令，请联系管理员获取权限。` } };
        }
        if (uEntry && Array.isArray(uEntry.allowedCommands) && uEntry.allowedCommands.length > 0) {
            const hasWild = uEntry.allowedCommands.includes("*");
            if (!hasWild && !uEntry.allowedCommands.includes(cmdName)) {
                const reason = `身份 ${identity} 不允许使用命令 /${cmdName} (允许: ${uEntry.allowedCommands.join(", ")})`;
                _logDeny(wDir, { timestamp: new Date().toISOString(), senderId, commandName: cmdName, identity, allowed: false, reason, messageId: p.ctx?.MessageSid, channelId: p.command?.channel });
                return { shouldContinue: false, reply: { text: `⛔ 无法执行 /${cmdName} — ${reason}\n\n如需使用此命令，请联系管理员获取权限。` } };
            }
        }
        return null;
    };
})();
const __amfResult = __amf(params);
if (__amfResult) return __amfResult;
/* ── end ask_me_first patch ─────────────────────────────────────── */
```

## 重新注入步骤（npm update 后）

1. 打开 `reply-Bm8VrLQh.js`
2. 搜索 `async function handleCommands(params)`
3. 找到 HANDLERS 数组的 `];` 闭合行
4. 在 `];` 之后、`const resetMatch` 之前插入上面的补丁代码
5. 重启 Gateway：`openclaw gateway restart`

## 如何确认补丁存在

搜索文件中是否包含 `ask_me_first: slash command access control`。

## 补丁依赖

- `workspace/ask_me_first/users.json` 必须存在且格式正确
- 如果 `users.json` 不存在或解析失败，补丁静默跳过（不阻断任何命令）

## Hook 身份注入（配合补丁使用）

除了 bundle 补丁的斜杠命令拦截外，`hooks/ask-me-first/handler.ts` 在 `agent:bootstrap` 阶段为非 admin 用户注入身份提示词：

| 身份 | 注入内容 |
|------|----------|
| admin | 无注入 |
| member、其他非 admin | `user-identity.txt`（用户 ID + 角色） |
| guest 等受限身份 | `user-identity.txt` + `restricted-mode-prompt.txt` |

Hook 无需手动重新注入——它是 workspace 级别文件，不受 `npm update` 影响。
