[English](README.md) | [中文](README.zh-CN.md)

# Ask Me First — Digital Work Avatar

> Your work interface, first contact surface — reducing communication cost, protecting flow state.

Ask Me First is a digital proxy that acts as your professional avatar. It intercepts incoming messages to respond autonomously when you're busy or focused, learning your unique communication style over time. By filtering low-risk interruptions and managing expectations based on your real-time availability, it protects your focus while ensuring your contacts receive immediate, context-aware responses.

## What's New in v2.1.x

*   **Persona Learning System**: Automatically observes your real message exchanges to distill your communication style and preferences.
*   **Inbound Claim Interception**: High-performance hook that allows the avatar to "claim" and reply to simple messages (greetings, acknowledgments) before they even reach your main agent.
*   **Conversation-Based Style Learning**: Learns how you interact with specific people to refine its response accuracy.
*   **Per-User Persona**: Support for `persona.json` in the workspace, allowing deep customization of the avatar's personality and rules.

## OpenClaw v2026.3.23 Compatibility

This plugin is fully adapted to the **OpenClaw v2026.3.23 plugin strategy changes**:

*   Uses the `definePluginEntry` SDK entry point (introduced in v2026.3.22).
*   Registers `inbound_claim` hook for autonomous message interception — a core capability enabled by the 3.23-era plugin architecture.
*   Registers `message_sending` hook for passive conversation observation and persona learning.
*   All capabilities are declared in `openclaw.plugin.json` per the new manifest requirements.
*   Published to **ClawHub** as a `code-plugin` (not a skill) per the updated taxonomy.

Minimum SDK version: `>=2026.3.22`. Recommended: `>=2026.3.23`.

## How It Works

### 1. Inbound claim flow
The avatar acts as a high-speed filter for simple interactions.

```
Message → inbound_claim hook → classify → auto-claim low-risk → LLM reply as avatar → { handled: true }
```

### 2. Fallback/complex flow
For nuanced messages, the avatar provides deep context to your main agent.

```
Message → before_prompt_build → Avatar Decision Chain → identity + state + escalation → context injection → reply
```

## Quick Start

### Method 1: ClawHub (Recommended)
Install directly via the ClawHub package manager:
```bash
clawhub package install ask-me-first
```

### Method 2: npm
Install as a dependency and configure manually:
```bash
npm install ask-me-first
```

### Method 3: Git
Clone the repository into your plugins directory:
```bash
git clone https://github.com/LENKIN233/ask-me-first.git
```

## Persona System

The v2.1.x update introduces a sophisticated learning architecture that moves beyond static templates.

*   **Conversation-Based Learning**: The plugin observes outbound messages sent by you. It analyzes the intent and tone to update its internal representation of how you speak.
*   **Editable persona.json**: All learned traits are stored in `persona.json` within your workspace. You can manually edit this file to prune incorrect styles or reinforce specific behaviors.
*   **Maturity Progression**: The avatar tracks its own confidence. It starts in a "learning" phase and progresses to "confident maturity," where it begins to auto-claim more complex categories.
*   **Message Classification**: Every incoming message is sorted into one of 10 categories: `greeting`, `ack`, `scheduling`, `status_check`, `routing`, `faq`, `complaint`, `personal`, `decision`, or `unknown`.
*   **Auto-Claim**: To ensure safety, only low-risk categories (like greetings and acknowledgments) are handled automatically, and only after the avatar has reached sufficient maturity.

## Project Structure

```
ask-me-first/
├── index.ts                       # Plugin entry (hooks, commands, services)
├── openclaw.plugin.json           # Plugin manifest + config schema
├── package.json                   # v2.1.2
├── src/
│   ├── controller.ts              # AvatarController orchestrator
│   ├── decision-chain.ts          # Deterministic decision chain (232 lines)
│   ├── persona/                   # ★ NEW — Persona learning system
│   │   ├── schema.ts              # PersonaProfile types, validation, merge
│   │   ├── classifier.ts          # Rule-based message classifier (10 categories)
│   │   ├── renderer.ts            # System prompt renderer (persona-aware)
│   │   └── learner.ts             # Conversation observer + trait distiller
│   ├── state/                     # State detection (Win32 + calendar)
│   ├── identity/                  # Identity resolution & trust scoring
│   ├── escalation/                # Three-tier escalation engine
│   ├── generation/                # Reply formatting
│   ├── tools/                     # Calendar, presence, context, memory
│   └── utils/
│       └── safe-write.ts          # Atomic file writes
├── config/
│   ├── persona-seed.json          # ★ Default persona template
│   ├── identities.json
│   ├── escalationRules.json
│   └── templates.json
├── prompts/
│   └── persona-system-prompt.md   # Customizable persona template
├── tests/                         # 68 tests, 14 suites
└── docs/
```

## Runtime Workspace

The plugin persists its state in `~/.openclaw/workspace/ask_me_first/`. Key files include:

*   **persona.json**: The distilled personality and rules for your avatar.
*   **persona_events.jsonl**: A log of observed interactions used for learning.
*   **avatar_state.json**: The current availability and evidence used for decision making.
*   **users.json**: Trust scores and identity mappings for your contacts.

## Configuration

Configuration is managed via `openclaw.plugin.json` or your agent's config:

*   **Users & Trust**: Define admin users and track trust scores for guests.
*   **State Detection**: Toggle Windows foreground window detection and Feishu/Lark calendar integration.
*   **Escalation Rules**: Define which categories of messages should trigger an immediate notification versus an avatar reply.
*   **Persona Customization**: Adjust the learning rate and default response templates.

## Key Features

*   **Identity-Aware Responses**: Different behavior for admins, colleagues, and strangers.
*   **Presence Sensing**: Detects when you are in a meeting (via calendar) or focusing (via active window).
*   **Three-Tier Escalation**: Automatically handles simple tasks, gathers info for medium tasks, and escalates urgent ones.
*   **Trust Scoring**: Gradually grants more information access to frequent, high-trust contacts.
*   **Atomic Persistence**: Uses safe-write utilities to prevent data corruption during power loss or crashes.
*   **Command Interface**: Use `/avatar` to check status or `/avatar set <online|busy|focus|offline>` (admin only) to override auto-detection.

## Security

*   **No Environment Access**: The plugin does not read global environment variables; all credentials (like Feishu API keys) must be passed through the gated plugin config.
*   **Safe Evaluation**: Replaced `new Function()` with a safe expression evaluator to prevent arbitrary code execution.
*   **Atomic Writes**: Prevents partial file writes during system interruptions.
*   **Strict Capabilities**: Declares all filesystem, network, and system execution needs in the manifest for transparency.

## API Stability

| Hook / Command | Type | Status | Description |
| :--- | :--- | :--- | :--- |
| `inbound_claim` | Hook | Stable | Intercepts messages before the main agent. |
| `before_prompt_build` | Hook | Stable | Injects avatar context into the LLM prompt. |
| `message_received` | Hook | Stable | Tracks trust and identity for incoming traffic. |
| `message_sending` | Hook | Stable | Observes owner replies for persona learning. |
| `/avatar` | Command | Stable | View or manually override avatar state. |

## Limitations

*   **Platform Support**: State detection (foreground window) is currently Windows-only.
*   **Persona Distillation**: While the system learns from conversations, full LLM-based autonomous persona distillation is planned for a future update and currently relies on rule-based trait extraction.

## License

MIT
