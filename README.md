[English](README.md) | [中文](README.zh-CN.md)

# Ask Me First — Digital Work Avatar System

> Your digital proxy and first contact surface — let them talk to my avatar first.

A production-ready digital work avatar system for [OpenClaw](https://github.com/openclaw). It creates a digital proxy that handles colleague inquiries with identity-aware, state-sensing three-tier escalation. Every interaction is processed through a deterministic decision chain to ensure appropriate context sharing and interruption management.

## What It Does

When someone messages you, they talk to your avatar first. The avatar:

1. **Identifies** the sender from `users.json` or session history
2. **Detects** your current state (coding, in meeting, or deep work)
3. **Decides** the optimal response via the **Avatar Decision Chain**:
   - ✅ **Answer directly** — routine questions using rich persona context
   - ⚠️ **Partial answer** — provides filtered info based on identity and trust
   - 🔺 **Escalate to you** — logs urgent matters to `escalations.json` for manual review

## Architecture (v1.1.0)

```
Message → OpenClaw (before_prompt_build) → Avatar Decision Chain → Final Prompt → Reply

Avatar Decision Chain (v1.1.0):
├── 1. Load Persona        — Injects customizable prompts/persona-system-prompt.md
├── 2. Resolve Identity    — Maps sender to Admin/Member/Guest levels
├── 3. Sense State         — Reads current availability and interruptibility
├── 4. Escalation Routing  — Determines if current query requires human intervention
└── 5. Context Injection   — Mixes project context (git/TODO) with user memory (MEMORY.md)
```

## Quick Start

### Prerequisites

- [OpenClaw](https://github.com/openclaw) installed and running
- Windows (state detection uses Win32 APIs)
- Feishu/Lark channel configured

### Installation

```bash
openclaw plugins install ask-me-first
```

### Manual Installation

1. **Clone** into your OpenClaw extensions directory:
   ```bash
   cd ~/.openclaw/extensions
   git clone https://github.com/LENKIN233/ask-me-first.git
   ```

2. **Configure your identity** (optional — the first message sender is auto-registered as admin):
   - To set up manually: edit `users.json` and replace `ou_your_admin_id_here` with your Feishu userId
   - Adjust member/guest entries as needed

3. **Restart OpenClaw Gateway**

### First Startup

On first load, the plugin automatically:
- Creates `~/.openclaw/workspace/ask_me_first/` and `ask_me_first/config/` directories
- Copies template files (`users.json`, `restricted-mode-prompt.txt`, escalation rules, etc.) to the workspace if they don't already exist
- Never overwrites your existing configuration

**Zero-config admin setup**: The first person to send a message after installation is automatically registered as admin. No manual `users.json` editing needed — the plugin detects the template placeholder `userId` and replaces it with the real sender's Feishu userId. Subsequent users are resolved normally (member/guest based on `users.json` entries).

### Verify

```bash
openclaw plugins list          # should show ask-me-first
openclaw plugins doctor        # should report no errors
```

After restarting the gateway, send any message to your bot. The first sender is auto-registered as admin. Then try:

```
/avatar set coding
```

The bot should reply with a confirmation like `✅ State overridden to: coding`.

## Project Structure

```
ask-me-first/
├── index.ts                      # Plugin entry point (hooks, commands, services)
├── openclaw.plugin.json          # Plugin manifest
├── package.json                  # npm metadata
├── users.json                    # User identity mapping template
├── restricted-mode-prompt.txt    # Guest restricted-mode prompt template
├── src/                          # Core TypeScript source
│   ├── controller.ts             # AvatarController orchestrator
│   ├── state/                    # State detection (detector, cache)
│   ├── identity/                 # Identity resolution & trust
│   ├── escalation/               # Escalation rules engine
│   ├── generation/               # Reply formatting
│   └── tools/                    # Calendar, presence, context, memory
├── config/
│   ├── identities.json           # Identity level definitions
│   ├── escalationRules.json      # Escalation rule configuration
│   └── templates.json            # Reply templates
├── prompts/
│   ├── persona-system-prompt.md  # Main customizable persona template (v1.1.0)
│   └── avatar-system-prompt.txt  # Core system prompt components
├── tests/
│   ├── plugin.test.ts            # Plugin unit tests
│   ├── smoke.test.ts             # Smoke tests
│   └── fixtures/
├── docs/
│   ├── PITCH.md                  # Full project pitch (Chinese)
│   ├── deployment.md             # Deployment guide
│   ├── ops.md                    # Operations guide
│   └── tuning.md                 # Tuning guide
├── IMPLEMENTATION.md             # Original design doc (historical reference)
└── SKILL.md                      # OpenClaw skill description
```

### Directory Model

**Repo source** (this repository / npm package) contains templates and code.
**Runtime workspace** (`~/.openclaw/workspace/ask_me_first/`) is where the plugin reads/writes at runtime:
- `users.json` — active user identity data
- `avatar_state.json` — auto-generated state snapshots
- `config/escalationRules.json` — active escalation rules
- `restricted-mode-prompt.txt` — active restricted-mode prompt

On first startup, the plugin automatically copies template files from the package into your workspace's `ask_me_first/` directory (only if they don't already exist).

## Configuration

### users.json

The main configuration file. Define who can access what:

| Identity | Info Level | Slash Commands | Escalation |
|----------|-----------|----------------|------------|
| `admin`  | owner_only | All (`*`)     | None       |
| `member` | internal   | Limited set   | Partial    |
| `guest`  | public     | None          | Auto       |

### Trust Score System

- Trust scores range from 0.0 to 1.0
- Decay: -0.01/day since last interaction
- Boost: +0.05 per confirmed reply
- Higher trust = deeper context access

### State Detection

The background service detects your current activity every 10 minutes:
- **Foreground window** analysis (VS Code → coding, Teams → meeting, etc.)
- **Calendar** integration for scheduled events
- **Explicit override** via `/avatar set <state>` command

### Escalation Rules

Configure in `config/escalationRules.json`:
- Keyword-based triggers
- Identity-based routing
- State-aware decisions (e.g., always escalate during deep work)

## Key Features (v1.1.0)

- **Avatar Decision Chain** — Every prompt is built dynamically via the `before_prompt_build` hook, ensuring identity-aware context injection.
- **Customizable Persona** — Define your avatar's personality and rules in `prompts/persona-system-prompt.md`.
- **Identity-aware context sharing** — Admins get full project context (git logs, open files, TODOs) + personal memory from `MEMORY.md`.
- **Escalation Logging** — All hand-offs and critical requests are logged to `escalations.json` for manual follow-up.
- **Native plugin architecture** — Built for the standard OpenClaw plugin lifecycle, no external hacks required.
- **Trust score system** — Tracks interaction quality; high trust enables deeper context access for regular users.
- **State sensing** — Automatic detection of coding/meeting/busy states via Windows API and calendar integration.
- **Explicit state override** — Override your status at any time using the `/avatar` command.

> ⚠️ Slash command access control (blocking unauthorized `/commands` at the gateway layer) is **not possible** via the plugin API alone. This would require a pre-command interception hook that OpenClaw does not yet provide.

## Limitations & API Stability

| Feature | Hook / API | Stability |
|---------|-----------|-----------|
| `/avatar` command | `registerCommand` | ✅ Stable — core plugin API |
| First-startup init | `register()` lifecycle | ✅ Stable — runs on plugin load |
| Identity injection | `before_prompt_build` | ✅ Stable — deterministic prompt building |
| Avatar Decision Chain | `before_prompt_build` | ✅ Stable — v1.1.0 core logic |
| Trust tracking | `message_received` event | ⚠️ **Experimental** — depends on gateway hook availability |
| Auto-register admin | `message_received` event | ⚠️ **Experimental** — same dependency as above |
| State detection service | `registerService` | ✅ Stable — core plugin API |

**If `message_received` is unavailable**: Trust scores will not update automatically, and auto-admin registration will not trigger. Workaround: manually edit `users.json` to set the admin userId, and trust scores will remain at their initial values until the hook is supported.

## Docs

- [PITCH.md](docs/PITCH.md) — Full project pitch and design rationale (Chinese)
- [IMPLEMENTATION.md](IMPLEMENTATION.md) — Original design doc (historical reference)
- [deployment.md](docs/deployment.md) — Production deployment
- [ops.md](docs/ops.md) — Operations runbook
- [tuning.md](docs/tuning.md) — Performance tuning

## License

MIT

## Note

> ⚠️ State detection currently supports **Windows only** (uses Win32 `GetForegroundWindow`).
