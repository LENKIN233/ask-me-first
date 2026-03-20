# Ask Me First — Personal Work Avatar System

> 让别人先接触我的分身，而不是先打断我本人。

A production-ready personal work avatar system for [OpenClaw](https://github.com/openclaw). It creates a digital proxy that handles colleague inquiries with identity-aware, state-sensing three-tier escalation.

## What It Does

When someone messages you, they talk to your avatar first. The avatar:

1. **Identifies** who's asking (admin / member / guest)
2. **Detects** your current state (coding / in meeting / idle)
3. **Decides** how to respond:
   - ✅ **Answer directly** — routine questions, public info
   - ⚠️ **Partial answer** — sensitive topics, filtered by identity
   - 🔺 **Escalate to you** — urgent/complex matters only

## Architecture

```
Message → OpenClaw Gateway → AvatarController → Decision Engine → Reply

AvatarController:
├── StateDetector     — Local presence (foreground window) + calendar
├── IdentityResolver  — User identity + trust score system
├── EscalationRouter  — Rule-based escalation engine
└── ReplyFormatter    — Template-based reply generation
```

## Quick Start

### Prerequisites

- [OpenClaw](https://github.com/openclaw) installed and running
- Windows (state detection uses Win32 APIs)
- Feishu/Lark channel configured

### Installation (npm — recommended)

```bash
# Install via npm
npm install ask-me-first

# Or via OpenClaw CLI (uses npm under the hood)
openclaw plugins install ask-me-first
```

### Installation (GitHub)

```bash
# Install directly from GitHub
openclaw plugins install LENKIN233/ask-me-first
```

### Installation (Manual)

1. **Clone** into your OpenClaw extensions directory:
   ```bash
   cd ~/.openclaw/extensions
   git clone https://github.com/LENKIN233/ask-me-first.git
   ```

2. **Configure your identity** — edit `users.json`:
   - Replace `ou_your_admin_id_here` with your Feishu userId
   - Adjust member/guest entries as needed

3. **Personalize prompts** — edit `prompts/avatar-system-prompt.txt`:
   - Replace `[Name]` with your actual name

4. **Restart OpenClaw Gateway**

### First Startup

On first load, the plugin automatically:
- Creates `~/.openclaw/workspace/ask_me_first/` and `ask_me_first/config/` directories
- Copies template files (`users.json`, `restricted-mode-prompt.txt`, escalation rules, etc.) to the workspace if they don't already exist
- Never overwrites your existing configuration

### Verify

```bash
# Check plugin is loaded
openclaw plugins list

# Run smoke tests
npx tsx ask-me-first/tests/smoke.test.ts
```

## Project Structure

```
ask-me-first/
├── index.ts                      # Plugin entry point (hooks, commands, services — all in one)
├── openclaw.plugin.json          # Plugin manifest (config schema, UI hints)
├── package.json                  # npm metadata + OpenClaw extension declaration
├── users.json                    # User identity mapping template (edit & copy to workspace)
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
│   └── avatar-system-prompt.txt  # System prompt template
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
- **Explicit override** via `/status set <state>` command

### Escalation Rules

Configure in `config/escalationRules.json`:
- Keyword-based triggers
- Identity-based routing
- State-aware decisions (e.g., always escalate during deep work)

## Key Features

- **Native plugin architecture** — all functionality in a single `index.ts`, no external hooks/ directory needed
- **Identity-aware message handling** — `message_received` hook tracks trust and maps session identity
- **Agent bootstrap injection** — identity + restricted-mode prompt injected via `agent:bootstrap` hook
- **Configurable paths** — `usersJsonPath` and `trustDecayRate` are runtime-configurable via plugin settings
- **5-second in-memory cache** — avoids disk reads on every message
- **Trust score decay** — inactive users lose access gradually (configurable rate)
- **Explicit state override** — admin can force state via `/status set`
- **Template-based replies** — consistent, configurable response format
- **Escalation notifications** — queued for owner review

> ⚠️ Slash command access control (blocking unauthorized `/commands` at the gateway layer) is **not possible** via the plugin API alone. This would require a pre-command interception hook that OpenClaw does not yet provide.

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
