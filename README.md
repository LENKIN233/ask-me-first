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

### Installation (Plugin)

```bash
# Install from GitHub
openclaw plugins install LENKIN233/ask-me-first

# Enable the plugin
openclaw plugins enable ask-me-first

# Restart OpenClaw Gateway
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

4. **(Optional) Inject gateway patch** for slash command access control:
   ```bash
   cd ask-me-first/gateway-patch
   ./inject.bat
   ```
   > Note: The `/status` command is registered via plugin API and does not require the gateway patch. The patch is only needed for blocking unauthorized slash commands at the gateway level.

5. **Restart OpenClaw Gateway**

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
├── index.ts                      # Plugin entry point (register hooks, commands, services)
├── openclaw.plugin.json          # Plugin manifest (config schema, UI hints)
├── package.json                  # npm metadata + OpenClaw extension declaration
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
├── hooks/
│   ├── ask-me-first/             # Message handler hook
│   │   ├── HOOK.md
│   │   └── handler.ts
│   └── avatar-state/             # State refresh hook (10min interval)
│       ├── HOOK.md
│       └── updater.ts
├── gateway-patch/
│   ├── ask-me-first-patch.js     # Gateway bundle patch
│   └── inject.bat                # Auto-injection script
├── prompts/
│   └── avatar-system-prompt.txt  # System prompt template
├── tests/
│   ├── smoke.test.ts             # Smoke tests
│   └── fixtures/
├── docs/
│   ├── PITCH.md                  # Full project pitch (Chinese)
│   ├── deployment.md             # Deployment guide
│   ├── ops.md                    # Operations guide
│   └── tuning.md                 # Tuning guide
├── users.json                    # User identity mapping (edit this!)
├── query.ts                      # Query handler
├── slash-command-guard.ts        # Slash command authorization
├── restricted-mode.ts            # Guest restricted mode
├── IMPLEMENTATION.md             # Technical implementation details
├── INTEGRATION.md                # Integration guide
├── SETUP.md                      # Setup instructions
└── SKILL.md                      # OpenClaw skill description
```

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

The avatar-state hook detects your current activity every 10 minutes:
- **Foreground window** analysis (VS Code → coding, Teams → meeting, etc.)
- **Calendar** integration for scheduled events
- **Explicit override** via `/status set <state>` command

### Escalation Rules

Configure in `config/escalationRules.json`:
- Keyword-based triggers
- Identity-based routing
- State-aware decisions (e.g., always escalate during deep work)

## Key Features

- **Gateway-level slash command guard** — unauthorized commands blocked before reaching the agent
- **5-second in-memory cache** — avoids disk reads on every message
- **Trust score decay** — inactive users lose access gradually
- **Explicit state override** — admin can force state via `/status set`
- **Template-based replies** — consistent, configurable response format
- **Escalation notifications** — queued for owner review

## Docs

- [PITCH.md](docs/PITCH.md) — Full project pitch and design rationale (Chinese)
- [IMPLEMENTATION.md](IMPLEMENTATION.md) — Technical architecture details
- [INTEGRATION.md](INTEGRATION.md) — Integration with OpenClaw Gateway
- [SETUP.md](SETUP.md) — Step-by-step setup guide
- [deployment.md](docs/deployment.md) — Production deployment
- [ops.md](docs/ops.md) — Operations runbook
- [tuning.md](docs/tuning.md) — Performance tuning

## License

MIT

## Note

> ⚠️ Gateway patch (`gateway-patch/inject.bat`) is only needed for slash command access control. It will be overwritten by `npm update openclaw` — re-run after updates.

> ⚠️ The `/status` command is registered via plugin API and works without the gateway patch.

> ⚠️ State detection currently supports **Windows only** (uses Win32 `GetForegroundWindow`).
