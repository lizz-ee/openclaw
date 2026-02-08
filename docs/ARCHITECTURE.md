# OpenClaw Architecture

> Comprehensive system architecture, capabilities, data flows, and how the Canvas UI presents them.

Last updated: 2026-02-08

---

## 1. What OpenClaw Is

OpenClaw is a self-hosted AI assistant platform that connects a single, persistent agent runtime to every messaging surface you use. It runs on your machine (or a VPS), owns your data, and gives you a unified brain across WhatsApp, Telegram, Slack, Discord, Signal, iMessage, and more — all through one gateway process.

The key insight: **one brain, many surfaces**. Whether you message from WhatsApp, Telegram, or the Control UI, you're talking to the same agent with the same context, memory, and personality.

### Core Capabilities

| Capability | What It Does |
|---|---|
| **Multi-channel messaging** | Send and receive across 11+ channels from one gateway |
| **Persistent agent** | Single agent runtime with workspace, memory, and persona files |
| **Multi-agent routing** | Multiple isolated agents with per-agent workspaces, sessions, and model selection |
| **Model-agnostic** | 15+ LLM providers (Anthropic, OpenAI, Google, Ollama, OpenRouter, xAI, Groq, etc.) |
| **Tiered model routing** | Primary + fallback chain with per-provider auth failover |
| **Session management** | Per-channel, per-peer, or shared sessions with daily/idle reset |
| **Cron automation** | Scheduled agent tasks with cron expressions or intervals |
| **Skills system** | Pluggable tools loaded from workspace, managed, or bundled directories |
| **Hooks** | Event-driven automation for session lifecycle, commands, and gateway events |
| **Exec approvals** | Human-in-the-loop approval for dangerous commands |
| **Device pairing** | Multi-device access with cryptographic pairing and token auth |
| **Canvas Control UI** | Tron-inspired infinite canvas for real-time monitoring and interaction |

---

## 2. System Architecture

```
                    ┌─────────────────────────────────────┐
                    │          MESSAGING CHANNELS          │
                    │  WhatsApp  Telegram  Slack  Discord  │
                    │  Signal  iMessage  Matrix  Line  ... │
                    └──────────────┬──────────────────────┘
                                   │ inbound messages
                                   ▼
┌────────────────────────────────────────────────────────────────┐
│                      GATEWAY (port 18789)                      │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Channel  │  │ Routing  │  │  Agent   │  │   Session    │  │
│  │ Manager  │  │ Engine   │  │  Runner  │  │    Store     │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │              │              │               │          │
│  ┌────┴──────────────┴──────────────┴───────────────┴──────┐  │
│  │                    WebSocket Server                      │  │
│  │  80+ RPC methods  ·  Event broadcasting  ·  Auth/Pairing │  │
│  └──────────┬───────────────────┬───────────────┬──────────┘  │
│             │                   │               │              │
│  ┌──────────┴──┐  ┌────────────┴───┐  ┌───────┴──────────┐  │
│  │ Model       │  │ Skills/Hooks   │  │ Cron / Exec      │  │
│  │ Providers   │  │ System         │  │ Approvals        │  │
│  └─────────────┘  └────────────────┘  └──────────────────┘  │
└─────────────────────────┬──────────────────────────────────────┘
                          │ WebSocket
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ Control  │   │  macOS   │   │   CLI    │
    │ UI       │   │   App    │   │          │
    │ (Canvas) │   │          │   │          │
    └──────────┘   └──────────┘   └──────────┘
```

### 2.1 Gateway

The gateway is the central daemon. It:

- Owns all channel connections (WhatsApp via Baileys, Telegram via grammY, etc.)
- Exposes a typed WebSocket API (requests + responses + server-push events)
- Validates frames against JSON Schema (TypeBox-generated)
- Manages agent lifecycle, sessions, model selection, and tool execution
- Broadcasts events (`agent`, `chat`, `presence`, `health`, `cron`, `exec.approval.*`)

**One gateway per host.** It is the single point of control for all messaging, agent runs, and automation.

**Config**: `~/.openclaw/openclaw.json` (JSON5 with JSON Schema validation, live reload on save)

### 2.2 Agent Runtime

OpenClaw runs a single embedded agent runtime derived from **pi-mono**.

Each agent is a fully scoped "brain" with:

- **Workspace** — working directory with bootstrap files (`AGENTS.md`, `SOUL.md`, `TOOLS.md`, `USER.md`, `IDENTITY.md`)
- **Agent directory** — `~/.openclaw/agents/<agentId>/agent` for auth profiles, model registry
- **Session store** — `~/.openclaw/agents/<agentId>/sessions/` for JSONL transcripts and session metadata
- **Skills** — per-agent from `<workspace>/skills/`, shared from `~/.openclaw/skills/`, plus bundled

The agent loop:
1. Receive inbound message (from any channel or UI)
2. Route to agent via bindings (channel + account + peer matching)
3. Resolve session key (DM → main session, group → isolated session)
4. Load session transcript + workspace context
5. Call LLM with tools available
6. Execute tool calls, stream responses
7. Persist transcript, broadcast events to connected clients

### 2.3 Channel System

Channels are messaging surfaces. OpenClaw supports:

| Channel | Transport | Multi-Account |
|---|---|---|
| WhatsApp | Baileys (Web) | Yes (`accountId`) |
| Telegram | grammY | Yes |
| Discord | discord.js | Yes |
| Slack | Bolt | Yes |
| Signal | signal-cli | Yes |
| iMessage | BlueBubbles | No |
| Matrix | matrix-bot-sdk | Yes |
| MS Teams | Bot Framework | Yes |
| Google Chat | googleapis | Yes |
| Nostr | nostr-tools | Yes |
| Line, Zalo, Twitch, Tlon | Extensions | Varies |

**Routing is deterministic**: inbound messages are matched against `bindings` config. Most-specific match wins (peer > guild > team > account > channel > default agent).

**Reply routing**: the agent always replies back to the channel where the message came from. The model does not choose channels.

### 2.4 Model & Provider System

Models are referenced as `provider/model` (e.g., `anthropic/claude-opus-4-5`, `ollama/clu:latest`).

**Built-in providers** (no config needed, just auth):
- OpenAI, Anthropic, OpenAI Code (Codex), OpenCode Zen, Google Gemini/Vertex/Antigravity
- Z.AI (GLM), OpenRouter, xAI, Groq, Cerebras, Mistral, GitHub Copilot, Vercel AI Gateway

**Implicit providers** (auto-discovered when auth found):
- Ollama, MiniMax, Moonshot (Kimi), Qwen Portal, Synthetic, Venice, Xiaomi

**Custom providers** via `models.providers` config — any OpenAI-compatible or Anthropic-compatible endpoint.

**Selection order**:
1. Primary model (`agents.defaults.model.primary`)
2. Fallback chain (`agents.defaults.model.fallbacks`) — tried in order
3. Per-provider auth failover (multiple auth profiles per provider)
4. Image model fallback when primary can't accept images

**Per-agent overrides**: each agent in `agents.list[]` can specify its own `model`, allowing tiered routing (e.g., Opus for deep work, Sonnet for daily chat, Haiku for heartbeat/fallback).

### 2.5 Session Management

Sessions are the context containers for conversations.

**Session keys** follow a hierarchical pattern:
- DMs: `agent:<agentId>:<mainKey>` (all DMs share one session by default)
- Groups: `agent:<agentId>:<channel>:group:<id>`
- Threads: `...:<channel>:channel:<id>:thread:<threadId>`
- Cron: `cron:<jobId>`
- Webhooks: `hook:<uuid>`

**Reset policies**:
- Daily reset at configurable hour (default 4 AM local)
- Idle reset after N minutes of inactivity
- Manual via `/new` or `/reset` commands
- Per-type and per-channel overrides

**DM scoping** (`session.dmScope`):
- `main` (default) — all DMs share one session for continuity
- `per-peer` — isolate by sender
- `per-channel-peer` — isolate by channel + sender
- `per-account-channel-peer` — full isolation

**Lifecycle**: sessions are stored as JSONL transcripts. Context pruning trims old tool results in-memory before LLM calls. Auto-compaction summarizes older context when the window fills up.

### 2.6 Skills System

Skills are agent-callable tools loaded from three locations (workspace wins on name conflict):

1. **Workspace skills**: `<workspace>/skills/` (per-agent, highest precedence)
2. **Managed skills**: `~/.openclaw/skills/` (user-installed, shared)
3. **Bundled skills**: shipped with OpenClaw

Each skill is a directory with a `SKILL.md` (metadata + instructions) and an optional handler. Skills can define tools, require specific binaries/env vars, and be gated by config.

### 2.7 Hooks System

Hooks are event-driven automation scripts that run inside the gateway:

| Hook | Event | Purpose |
|---|---|---|
| `session-memory` | `command:new` | Save session context to workspace memory |
| `command-logger` | `command` | Audit trail of all commands to JSONL |
| `boot-md` | `gateway:startup` | Run `BOOT.md` instructions on start |
| `soul-evil` | `agent:bootstrap` | Swap SOUL.md with SOUL_EVIL.md (fun) |

Hooks are discovered from workspace, managed, and bundled directories. Custom hooks can listen for `command:new`, `command:reset`, `command:stop`, `agent:bootstrap`, `gateway:startup`, and future session/message lifecycle events.

### 2.8 Cron System

Scheduled agent tasks:

- Jobs defined via config or UI with cron expressions, intervals, or one-shot timestamps
- Each run creates an isolated session (`cron:<jobId>`)
- Jobs can target specific agents and channels for output
- Run logs track execution history, status, and errors
- Gateway broadcasts `cron` events when jobs execute

### 2.9 Exec Approvals

Human-in-the-loop safety for dangerous commands:

- Agent tool calls flagged as requiring approval are intercepted
- The gateway broadcasts `exec.approval.requested` with a timeout
- Connected UI clients show an overlay with the command details
- Operator can Allow Once, Allow Always, or Deny
- `exec.approval.resolved` event broadcasts the decision
- Configurable allowlists, deny lists, and on-miss behavior per agent

### 2.10 Device Pairing

Multi-device access to the gateway:

- All WebSocket clients include a device identity on `connect`
- New device IDs require pairing approval (gateway issues a device token)
- Local connects (loopback) can be auto-approved
- Non-local connects must sign a challenge nonce
- Device tokens persist across restarts
- Presence system tracks connected clients (TTL: 5 min, max: 200 entries)

---

## 3. Data Flow

### 3.1 Inbound Message Flow

```
Channel (WhatsApp/Telegram/...)
  │
  ▼
Channel Connector (Baileys/grammY/...)
  │
  ▼
Routing Engine
  ├─ Match bindings: channel → accountId → peer → agentId
  ├─ Resolve session key (DM/group/thread scoping)
  └─ Check allowlists, mention gating (groups)
  │
  ▼
Agent Runner
  ├─ Load session transcript + workspace context
  ├─ Inject bootstrap files (AGENTS.md, SOUL.md, etc.)
  ├─ Call LLM with available tools
  ├─ Execute tool calls (with exec approval gating)
  ├─ Stream responses via WebSocket events
  └─ Persist transcript to JSONL
  │
  ▼
Reply Routing
  └─ Send reply back to originating channel
```

### 3.2 WebSocket Event Flow

```
Gateway                              UI Client
  │                                      │
  │◄──── req:connect ────────────────────│
  │───── res:hello-ok (snapshot) ───────►│
  │                                      │
  │───── event:presence ────────────────►│
  │───── event:agent (streaming) ───────►│
  │───── event:chat (state changes) ────►│
  │───── event:cron ────────────────────►│
  │───── event:exec.approval.requested ─►│
  │                                      │
  │◄──── req:chat.send ─────────────────│
  │───── res:chat.send (accepted) ──────►│
  │───── event:chat (streaming) ────────►│
  │───── event:chat (final) ────────────►│
```

### 3.3 Gateway RPC Methods (Major Categories)

| Category | Methods | Purpose |
|---|---|---|
| **System** | `health`, `status`, `system-presence`, `system-event` | Health checks, presence, client beacons |
| **Agent** | `agent`, `agent.list`, `agent.stop` | Run agent, list agents, abort runs |
| **Chat** | `chat.send`, `chat.abort`, `chat.history` | Send messages, abort streaming, load history |
| **Sessions** | `sessions.list`, `sessions.patch`, `sessions.delete` | Manage session store |
| **Channels** | `channels.status`, `channels.start`, `channels.stop` | Channel lifecycle |
| **Models** | `models.list`, `models.set`, `models.active` | Model discovery and selection |
| **Cron** | `cron.list`, `cron.add`, `cron.remove`, `cron.run`, `cron.status` | Job management |
| **Skills** | `skills.list`, `skills.install`, `skills.toggle` | Skill lifecycle |
| **Config** | `config.get`, `config.set`, `config.schema`, `config.apply` | Live config editing |
| **Devices** | `device.list`, `device.pair.approve`, `device.pair.deny` | Device pairing |
| **Exec** | `exec-approvals.list`, `exec-approvals.decide` | Approval queue management |
| **Nodes** | `node.list`, `node.command` | Remote device control |
| **Logs** | `logs.tail`, `logs.file` | Gateway log retrieval |

---

## 4. File System Layout

```
~/.openclaw/
├── openclaw.json              # Main config (JSON5)
├── credentials/               # Channel credentials (WhatsApp auth, etc.)
│   └── whatsapp/
│       └── <accountId>/
├── agents/
│   └── <agentId>/
│       ├── agent/
│       │   ├── auth-profiles.json   # Per-agent LLM auth
│       │   └── models.json          # Per-agent model registry
│       └── sessions/
│           ├── sessions.json        # Session store (key → metadata)
│           └── <sessionId>.jsonl    # Transcript files
├── workspace/                 # Default agent workspace
│   ├── AGENTS.md              # Operating instructions + memory
│   ├── SOUL.md                # Persona, boundaries, tone
│   ├── TOOLS.md               # User tool notes
│   ├── USER.md                # User profile
│   ├── IDENTITY.md            # Agent name/vibe/emoji
│   ├── BOOT.md                # One-time first-run ritual
│   ├── skills/                # Per-agent skills
│   ├── hooks/                 # Per-agent hooks
│   └── memory/                # Session memory snapshots
├── skills/                    # Managed (shared) skills
├── hooks/                     # Managed (shared) hooks
└── logs/
    └── commands.log           # Command audit log (if hook enabled)
```

---

## 5. Canvas UI Architecture

The Control UI is a Tron-inspired infinite canvas for real-time monitoring, interaction, and configuration. It connects to the gateway over WebSocket and presents every subsystem as a draggable, resizable card on an infinite pannable workspace.

### 5.1 Technical Stack

| Layer | Technology |
|---|---|
| Framework | Lit.js 3.x (Web Components, light DOM) |
| Build | Vite 7.x |
| Shell | Electron (embedded local HTTP server) or standalone browser |
| Gateway | WebSocket to `ws://hostname:18789` |
| State | Lit `@state()` decorators (90+ reactive properties) |
| Persistence | localStorage for canvas layout, settings, theme |
| Styling | CSS custom properties (theme tokens), scoped component styles |

### 5.2 Component Architecture

```
OpenClawApp (@customElement)
  │
  ├── @state() properties (90+)     ← All reactive state lives here
  ├── Lifecycle hooks                ← connectedCallback, updated, disconnected
  ├── Event handlers                 ← 40+ handler methods on AppViewState
  │
  ├── Gateway Client                 ← WebSocket connection + RPC
  │     └── Event routing            ← app-gateway.ts dispatches to controllers
  │
  ├── Controllers (16 modules)       ← Each manages one domain's state + RPC
  │     ├── chat.ts                  ← Chat history, send, stream
  │     ├── agents.ts                ← Agent list, selection
  │     ├── sessions.ts              ← Session list, patch, delete
  │     ├── channels.ts              ← Channel status, config
  │     ├── models.ts                ← Model list, active model
  │     ├── cron.ts                  ← Cron jobs, status, runs
  │     ├── skills.ts                ← Skill list, install, toggle
  │     ├── config.ts                ← Config load, save, apply
  │     ├── logs.ts                  ← Log tail, parse, filter
  │     ├── debug.ts                 ← Status, health, RPC explorer
  │     ├── devices.ts               ← Device pairing list
  │     ├── nodes.ts                 ← Node list, commands
  │     ├── presence.ts              ← Instance presence
  │     ├── exec-approval.ts         ← Live approval queue (events)
  │     ├── exec-approvals.ts        ← Approval config editor
  │     └── assistant-identity.ts    ← Name, avatar, agent ID
  │
  ├── Canvas Renderer                ← canvas-render.ts (880 lines)
  │     ├── renderCanvas()           ← Main entry, composes all layers
  │     ├── renderHudTop()           ← Fixed top bar (status, model, clock)
  │     ├── renderHudBottom()        ← Fixed bottom bar (coords, zoom)
  │     ├── renderMinimap()          ← Card position overview
  │     ├── renderDockBar()          ← Panel toggle toolbar
  │     ├── renderCard()             ← Generic card wrapper
  │     ├── renderModelPicker()      ← Model selection dropdown
  │     └── CRT overlays             ← Scanlines, vignette, bloom
  │
  ├── Views (25+ modules)            ← Pure render functions per card body
  │     ├── chat.ts                  ← Chat terminal with streaming
  │     ├── channels.ts + variants   ← Per-channel status + config
  │     ├── config-form.ts           ← JSON Schema-driven config editor
  │     ├── sessions.ts              ← Session list with metadata
  │     ├── exec-approval.ts         ← Approval prompt overlay
  │     └── ...                      ← One view per card type
  │
  ├── Canvas Interactions            ← canvas-interactions.ts
  │     ├── Pan (pointer drag)
  │     ├── Zoom (wheel, 0.2x–3.0x)
  │     ├── Card drag (pointer capture)
  │     ├── Card resize (pointer capture)
  │     └── Focus management (z-index)
  │
  └── Styles
        ├── base.css                 ← Reset, keyframes, shared vars
        ├── canvas.css               ← Canvas, cards, HUD, dock, minimap
        ├── components.css           ← View-specific component styles
        └── Theme tokens (CSS vars)  ← --pri, --acc, --bg, etc.
```

### 5.3 Canvas Card System

Every piece of UI is a **card** — a floating, draggable, resizable panel on the infinite canvas.

| Card | ID | Default Size | What It Shows | Data Source |
|---|---|---|---|---|
| **Chat** | `chat` | 520 x 580 | Terminal — CLU. Main interaction | `chat.send` / `chat.history` RPC |
| **System** | `system` | 280 x 400 | Gateway status, model, metrics | `status` RPC, `debugStatus` |
| **Channels** | `channels` | 260 x 200 | Channel list with online/offline dots | `channels.status` RPC |
| **Sessions** | `sessions` | 260 x 170 | Active sessions with pulse indicators | `sessions.list` RPC |
| **Activity** | `activity` | 280 x 260 | Recent gateway event feed | `eventLogBuffer` (live) |
| **Log** | `log` | 340 x 230 | Live gateway log tail | `logs.tail` RPC (2s poll) |
| **Skills** | `skills` | 220 x 190 | Skill modules with status | `skills.list` RPC |
| **Cron** | `cron` | 220 x 140 | Scheduled jobs, next-run times | `cron.list` / `cron.status` RPC |
| **Config** | `config` | flexible | Gateway config editor (form + raw) | `config.get` / `config.schema` RPC |
| **Nodes** | `nodes` | flexible | Paired devices, node management | `node.list` RPC (5s poll) |
| **Debug** | `debug` | flexible | Manual RPC calls, health snapshots | `status` / custom RPC (3s poll) |

**Card features**:
- Drag via header (pointer capture for smooth tracking)
- Resize via bottom-right handle
- Click to focus (z-index management)
- Close/open via dock bar
- Layout persisted to localStorage per workspace

**Polling behavior**: only polls when the relevant card is open (`canvasCards.{cardId}.open`), saving resources when panels are closed.

### 5.4 HUD (Heads-Up Display)

Fixed elements that don't move with the canvas:

**Top bar** (34px):
- Brand ring + "OPENCLAW" wordmark
- Status dots: Gateway (green/red), Ollama (derived from `debugStatus.primaryModel`), Channel count
- Active model badge (e.g., `CLU:LATEST`) in accent color
- Live clock (HH:MM:SS, ticking every second via `@state() hudClockTime`)

**Bottom bar** (24px):
- Canvas coordinates (`x: Y:`)
- Zoom percentage
- Keyboard shortcut hints

**Minimap** (bottom-right):
- Shows full canvas with card rectangles
- Viewport highlight rectangle
- Corner bracket accents

### 5.5 Dock Bar

Floating bottom-center toolbar for panel management:

| Group | Cards |
|---|---|
| **Command** | Chat, System |
| **Control** | Channels, Sessions, Activity, Log |
| **Agent** | Skills, Cron, Nodes |
| **Settings** | Config, Debug |
| **Theme** | Theme cycler (Grid → Outlands → End of Line) |

Each icon shows an active dot when its card is open. Click toggles open/close.

### 5.6 Themes

Three selectable color themes, all using CSS custom properties:

| Theme | Primary | Accent | Inspiration |
|---|---|---|---|
| **The Grid** (default) | `#00fce8` (cyan) | `#ffaa20` (orange) | Tron Legacy Grid |
| **The Outlands** | `#33ff66` (green) | `#d4a030` (bronze) | Flynn's Arcade |
| **End of Line** | `#c470ff` (violet) | `#b0ff40` (lime) | End of Line Club |

CRT effects layer on top: scanlines, vignette, bloom, and per-theme flicker.

### 5.7 Data Flow: UI ↔ Gateway

```
User Action (click/type)
  │
  ▼
App handler method
  │
  ▼
Controller function (e.g., loadSessions)
  │
  ▼
GatewayBrowserClient.request("sessions.list", params)
  │
  ▼
WebSocket → Gateway → Response
  │
  ▼
Controller updates @state() properties
  │
  ▼
Lit reactive update → re-render affected card(s)
```

For real-time events (chat streaming, agent events, exec approvals):

```
Gateway broadcasts event
  │
  ▼
GatewayBrowserClient.onEvent callback
  │
  ▼
handleGatewayEvent() in app-gateway.ts
  │
  ├─ "agent" → handleAgentEvent() (tool stream updates)
  ├─ "chat" → handleChatEvent() (message state machine)
  ├─ "presence" → update presenceEntries
  ├─ "cron" → reload cron (if card open)
  ├─ "exec.approval.requested" → add to approval queue
  ├─ "exec.approval.resolved" → remove from queue
  └─ Always: buffer to eventLogBuffer → sync to eventLog (if card open)
```

---

## 6. Security Model

### 6.1 Authentication Layers

1. **Gateway auth** (`gateway.auth.token`) — token required on WebSocket connect
2. **Device pairing** — new devices must be approved before access
3. **Channel allowlists** — per-channel DM policy (`allowlist`, `allowAll`, etc.)
4. **Exec approvals** — human approval for dangerous tool calls
5. **Tool allow/deny** — per-agent tool restrictions
6. **Sandboxing** — optional Docker containers for agent execution

### 6.2 Exec Approval Flow

```
Agent wants to run: rm -rf /tmp/old
  │
  ▼
Gateway checks approval config
  ├─ Allowlist match? → Execute immediately
  ├─ Deny match? → Block
  └─ No match (on-miss=ask)? → Queue for approval
        │
        ▼
  Broadcast exec.approval.requested
        │
        ▼
  UI shows overlay with command + timeout
        │
        ▼
  Operator: Allow Once / Allow Always / Deny
        │
        ▼
  Broadcast exec.approval.resolved
```

---

## 7. Vision: How the Canvas Should Work

The canvas is a **mission control surface**. It should feel like you're operating a space station — every subsystem has its own monitor, and you can arrange them to match your workflow.

### 7.1 Design Principles

1. **Glanceable** — Status dots and badges give instant health overview without reading text
2. **Progressive disclosure** — Cards start minimal; open them for detail
3. **Spatial memory** — Cards stay where you put them; layouts persist per workspace
4. **Real-time by default** — Events stream live; no manual refresh needed
5. **Non-blocking** — Overlays (exec approval, gateway URL) float above everything
6. **Tron aesthetic** — Terminal-first, monospace, phosphor glow, CRT overlays

### 7.2 Ideal Workflow

**Daily monitoring layout:**
- Chat card (center, large) — primary interaction with CLU
- System card (top-left) — gateway status at a glance
- Channels card (top-right) — channel health dots
- Activity card (bottom-left) — event stream for awareness

**Deep debugging layout:**
- Debug card (center) — manual RPC calls
- Log card (large, right) — live log tail with filters
- System card (left) — health metrics
- Sessions card (bottom) — active session inspection

**Configuration session:**
- Config card (center, large) — schema-driven form editor
- Skills card (left) — enable/disable skills
- Cron card (bottom) — schedule management
- System card (top) — verify changes take effect

### 7.3 Workspace Presets

Saved canvas layouts ("workspaces") let you switch between these modes instantly. Each workspace stores:
- Card positions (x, y, width, height)
- Which cards are open/closed
- Z-order (focus stack)
- Pan position and zoom level

### 7.4 Future Canvas Enhancements

| Enhancement | Description |
|---|---|
| **Card linking** | Visual connection lines between related cards (e.g., session → chat) |
| **Notification badges** | Unread count badges on dock icons for background events |
| **Card presets** | Quick-switch between monitoring, debugging, and config layouts |
| **Snap-to-grid** | Optional grid snapping for tidy arrangements |
| **Card groups** | Collapse multiple cards into a single stack |
| **Multi-monitor** | Pop cards out into separate windows (Electron) |

---

## 8. Extension Points

OpenClaw is designed to be extended without modifying core code:

| Extension | Location | Discovery |
|---|---|---|
| **Skills** | `<workspace>/skills/`, `~/.openclaw/skills/` | Automatic (SKILL.md) |
| **Hooks** | `<workspace>/hooks/`, `~/.openclaw/hooks/` | Automatic (HOOK.md) |
| **Plugins** | `extensions/*` | Package-level, enable via CLI |
| **Channel extensions** | `extensions/*` (e.g., msteams, matrix, zalo) | Plugin system |
| **Custom providers** | `models.providers` in config | Config-based |
| **Webhook hooks** | Config + HTTP endpoint | Config-based |

---

## 9. Cross-References

For detailed documentation on specific subsystems:

- [Gateway Protocol](/concepts/architecture)
- [Agent Runtime](/concepts/agent)
- [Session Management](/concepts/session)
- [Channel Routing](/concepts/channel-routing)
- [Model Providers](/concepts/model-providers)
- [Model Selection](/concepts/models)
- [Multi-Agent Routing](/concepts/multi-agent)
- [Hooks](/hooks)
- [Presence](/concepts/presence)
- [Streaming](/concepts/streaming)
- [Compaction](/concepts/compaction)
- [Design System](/mockups/DESIGN-SYSTEM.md)
- [Gateway Configuration](/gateway/configuration)
