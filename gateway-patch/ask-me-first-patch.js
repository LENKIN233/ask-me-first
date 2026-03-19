/**
 * Gateway Bundle Patch — Ask Me First
 * Canonical source. Re-run inject.bat to apply after editing.
 *
 * Features:
 * 1. /status command — returns avatar state from avatar_state.json
 * 2. Slash command access control (identity-based)
 * 3. Allowlist enforcement (per-user allowedCommands)
 * 4. Audit logging to slash_log.json
 * 5. 5s in-memory cache for users.json
 */

// ===== BEGIN PATCH BLOCK (copy between markers) =====
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
	if (cmdName === "status") {
		const sp = require("path").join(wDir, "ask_me_first/avatar_state.json");
		// /status set <state> — admin-only write
		const setMatch = body.trim().match(/^\/status\s+set\s+(online|busy|focus|offline)\s*$/i);
		if (setMatch) {
			const data = _loadUsers(wDir);
			const uEntry = data && data.users && data.users.find(u => u.userId === senderId);
			if (!uEntry || uEntry.identity !== "admin") {
				return { shouldContinue: false, reply: { text: "⛔ 仅管理员可设定显式状态。" } };
			}
			const newAvail = setMatch[1].toLowerCase();
			const intrMap = { online: 0.9, busy: 0.2, focus: 0.3, offline: 0 };
			try {
				const explicit = {
					availability: newAvail,
					interruptibility: intrMap[newAvail] || 0,
					current_mode: "manual",
					confidence: 1.0,
					explicit: true,
					explicitSetAt: new Date().toISOString(),
					evidence: [{ type: "manual", description: `管理员手动设定: ${newAvail}`, timestamp: new Date().toISOString(), source: "command" }],
					updatedAt: new Date().toISOString()
				};
				require("fs").writeFileSync(sp, JSON.stringify(explicit, null, 2));
				const avMap = { online: "🟢 在线", busy: "🔴 忙碌", focus: "🟡 专注", offline: "⚫ 离线" };
				return { shouldContinue: false, reply: { text: `✅ 已手动设定状态: ${avMap[newAvail]}\n\n此状态将持续 4 小时，之后恢复自动检测。\n使用 /status set online 可随时切换。` } };
			} catch (e) {
				return { shouldContinue: false, reply: { text: `❌ 设定失败: ${e.message}` } };
			}
		}
		// /status — read current state
		try {
			if (require("fs").existsSync(sp)) {
				const st = JSON.parse(require("fs").readFileSync(sp, "utf-8"));
				const avMap = { online: "🟢 在线", busy: "🔴 忙碌", focus: "🟡 专注", offline: "⚫ 离线" };
				const av = avMap[st.availability] || st.availability;
				const mode = st.current_mode !== "unknown" ? st.current_mode : "未知";
				const conf = Math.round((st.confidence || 0) * 100);
				const intr = Math.round((st.interruptibility || 0) * 100);
				const upd = st.updatedAt ? new Date(st.updatedAt).toLocaleString("zh-CN") : "未知";
				let ev = "";
				if (st.evidence && st.evidence.length > 0) {
					ev = "\n\n依据:\n" + st.evidence.map(e => `• ${e.description}`).join("\n");
				}
				const explicitTag = st.explicit ? " (手动设定)" : "";
				const txt = `📊 Avatar 状态${explicitTag}\n\n状态: ${av}\n模式: ${mode}\n可打断度: ${intr}%\n置信度: ${conf}%\n更新时间: ${upd}${ev}`;
				return { shouldContinue: false, reply: { text: txt } };
			}
			return { shouldContinue: false, reply: { text: "📊 暂无状态数据。avatar_state.json 尚未生成，请等待状态检测器运行。" } };
		} catch (e) {
			return { shouldContinue: false, reply: { text: `📊 状态读取失败: ${e.message}` } };
		}
	}
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
// ===== END PATCH BLOCK =====
