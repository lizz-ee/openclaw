# ARCHITECTURE_AND_BUILD — OpenClaw

**Generated:** 2026-02-08
**Project:** OpenClaw (personal AI assistant)

---

## 1. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MESSAGING ECOSYSTEM (11+ channels)                 │
│  WhatsApp  Telegram  Slack  Discord  Signal  iMessage  Teams  Matrix  Zalo  │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ inbound/outbound messages
                                     │ (polling, webhooks, streaming)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OPENCLAW GATEWAY (WebSocket Server)                    │
│                            Port 18789 (local)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐ │
│  │  Channel Manager     │  │  Message Router      │  │  Agent Runtime    │ │
│  │  & Lifecycle         │  │  & Allowlists        │  │  (Pi Framework)   │ │
│  │                      │  │                      │  │                   │ │
│  │  • Inbound polling   │  │  • Channel binding   │  │  • Workspace      │ │
│  │  • Outbound delivery │  │  • Account routing   │  │  • Sessions       │ │
│  │  • Auth & pairing    │  │  • Rate limiting     │  │  • Model selection│ │
│  └──────────┬───────────┘  └──────────┬───────────┘  └─────────┬─────────┘ │
│             │                         │                         │           │
│  ┌──────────┴─────────────────────────┴─────────────────────────┴────────┐  │
│  │               RPC Layer (WebSocket + JSON Schema validation)           │  │
│  │                    80+ typed RPC methods + events                      │  │
│  └──────┬────────────────────────────┬────────────────────────┬───────────┘  │
│         │                            │                        │               │
│  ┌──────┴──────────┐  ┌──────────────┴───┐  ┌────────────────┴──────────┐   │
│  │ Model Providers │  │ Skills/Hooks      │  │ Cron & Exec Approvals   │   │
│  │                 │  │ System            │  │                         │   │
│  │ • Anthropic     │  │ • Tool execution  │  │ • Scheduled tasks       │   │
│  │ • OpenAI        │  │ • Event handlers  │  │ • Human-in-the-loop    │   │
│  │ • Ollama        │  │ • Plugin loading  │  │ • Approval workflows    │   │
│  │ • Bedrock       │  │                   │  │                         │   │
│  │ + 10+ more      │  │                   │  │                         │   │
│  └─────────────────┘  └───────────────────┘  └─────────────────────────┘   │
│                                                                             │
└─────────────────────────┬───────────────────┬────────────────┬──────────────┘
                          │                   │                │
                          ▼                   ▼                ▼
                    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
                    │  Control UI  │  │  macOS/iOS   │  │  CLI         │
                    │  (Lit.js +   │  │  Native Apps │  │              │
                    │  Vite Canvas)│  │ (Swift/Kotlin)  │              │
                    └──────────────┘  └──────────────┘  └──────────────┘
                    (real-time monitoring & interaction)
```

**Key Architectural Principles:**
1. **Single Gateway:** One control plane process per host managing all channels
2. **Multi-channel Abstraction:** Unified interface above 11+ messaging platforms
3. **Stateful Agent:** Persistent runtime with sessions, memory, and personality
4. **Event-Driven:** WebSocket broadcasts for all state changes (agents, channels, cron, approvals)
5. **Extensible:** Plugin system for channels, tools, and hooks
6. **Local-First:** All data stored locally; no cloud dependency

---

## 2. Core Modules & Responsibilities

### 2.1 Gateway (Core Daemon)
**Location:** `src/gateway/`

| Component | Responsibility |
|-----------|-----------------|
| `server/` | WebSocket server, frame validation, RPC dispatch |
| `protocol/` | Message types, TypeBox schemas, event definitions |
| `server-methods/` | RPC method implementations (80+ methods) |
| Channel Managers | Per-channel: inbound polling, outbound delivery, auth |
| Router | Determine which agent/session receives a message |
| Session Store | Persistent session JSONL (in `~/.openclaw/agents/<id>/sessions/`) |

### 2.2 Agent Runtime
**Location:** `src/agents/` + `src/cron/`

| Component | Responsibility |
|-----------|-----------------|
| `pi-embedded-runner/` | Pi agent lifecycle, message routing |
| `tools/` | Tool definitions (TypeBox schemas) + handlers |
| `skills/` | Loadable skill plugins (workspace + shared + bundled) |
| `sandbox/` | Code execution isolation (node-llama-cpp) |
| `auth-profiles/` | Per-agent OAuth/API key management |
| Cron Service | Background job scheduling (croner) |

### 2.3 Channel Providers
**Location:** `src/<channel>/` + `extensions/<channel>*`

| Channel | Provider | Transport |
|---------|----------|-----------|
| **WhatsApp** | Baileys | Web-based (polling) |
| **Telegram** | Grammy | Bot API (webhook/polling) |
| **Slack** | Slack Bolt | Events API (webhook) |
| **Discord** | Discord.js-like | Bot intents (WebSocket) |
| **Signal** | signal-utils | Signal protocol (library) |
| **iMessage** | Native | macOS/iOS frameworks |
| **Teams** | Extension | Microsoft Teams API |
| **Matrix** | Extension | Matrix federation |
| **Zalo** | Extension | Zalo API |
| **WebChat** | Built-in | Browser (gateway iframe) |

### 2.4 Control UI (Web Dashboard)
**Location:** `ui/` (separate workspace)

| Layer | Technology |
|-------|------------|
| Framework | Lit.js (lightweight Web Components) |
| Bundler | Vite (dev server, production build) |
| State Mgmt | Lit signals + context |
| Canvas | Custom A2UI rendering (Tron-inspired) |
| Communication | WebSocket (direct to gateway) |

### 2.5 Native Applications
**iOS:** `apps/ios/` (Swift + SwiftUI)
**macOS:** `apps/macos/` (Swift + SwiftUI) — also Electron app under `electron/`
**Android:** `apps/android/` (Kotlin + Compose)

### 2.6 Model Providers
**Location:** `src/provider-*.ts` (Anthropic, OpenAI, Ollama, Bedrock, etc.)

| Provider | Transport | Auth |
|----------|-----------|------|
| Anthropic | HTTPS REST | API Key (env var or config) |
| OpenAI | HTTPS REST | API Key (env var or config) |
| Ollama | HTTP (localhost) | None (local) |
| Bedrock | HTTPS REST | AWS SDK (credentials) |
| Custom | Protocol-dependent | Per-provider |

---

## 3. Data Flow & Key Integration Points

### 3.1 Inbound Message Flow
```
Channel (WhatsApp/Telegram/etc.)
  ↓
Channel Manager (polling or webhook)
  ↓
Message Router → lookup agent + session key
  ↓
Agent Session (load from JSONL)
  ↓
Model Provider (invoke LLM)
  ↓
Tool Execution (if agent calls tools)
  ↓
Response Generation
  ↓
Outbound to Channel
```

### 3.2 Control UI Updates
```
Gateway state change (agent response, channel event, cron completion)
  ↓
WebSocket broadcast event
  ↓
Control UI receives event
  ↓
Lit signal state update
  ↓
Canvas re-render
```

### 3.3 Plugin/Skill Resolution
```
Agent startup
  ↓
Load workspace skills (`<workspace>/skills/*.js`)
  ↓
Load shared skills (`~/.openclaw/skills/*.js`)
  ↓
Load bundled skills (built-in)
  ↓
Merge into agent tool registry
```

---

## 4. Environments & Configuration

### 4.1 Development Environment
- **Where:** Your machine (`localhost`)
- **Gateway:** `http://localhost:18789` (WebSocket)
- **UI Dev Server:** `http://localhost:5173` (Vite)
- **Config:** `~/.openclaw/openclaw.json` (JSON5, live reload)
- **Credentials:** `~/.openclaw/credentials/` (OAuth tokens, API keys)
- **Sessions:** `~/.openclaw/agents/<agentId>/sessions/*.jsonl`

**Key Env Vars:**
```bash
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
OLLAMA_BASE_URL=http://127.0.0.1:11434
OPENCLAW_PROFILE=dev|prod
```

### 4.2 Production Environment
- **Deployment:** VPS or self-hosted machine
- **Service:** Systemd user service or launchd agent
- **Gateway:** `http://<hostname>:18789`
- **Config:** Same (`~/.openclaw/openclaw.json`)
- **Data Persistence:** All stored locally (no cloud dependency)

### 4.3 Docker Deployment
- **Dockerfile:** Single container for gateway
- **Volumes:** Mount `~/.openclaw/` to persist state across restarts
- **Network:** Expose port 18789 (or reverse proxy)
- **See:** `docs/install/docker`

---

## 5. Build & Run Instructions

### 5.1 Prerequisites
- **Node.js:** ≥22.12.0 (for ES modules and modern features)
- **Package Manager:** pnpm (recommended) or npm or bun
- **macOS (optional):** For native apps (Electron, iOS, macOS), Xcode is required

### 5.2 Install Dependencies

```bash
# Using pnpm (recommended)
pnpm install

# Using npm
npm install

# Using bun
bun install
```

**First Run Note:** The `postinstall` script runs `ui/` dependency install automatically.

### 5.3 Build (TypeScript → JavaScript)

```bash
# Full build (TypeScript + UI + canvas bundling)
pnpm build

# Just TypeScript compilation
tsc -p tsconfig.json --noEmit false

# Watch mode (rebuild on file change)
pnpm dev

# Watch single module
pnpm gateway:watch
```

**Output:** Compiled code goes to `dist/` (source maps + declarations)

### 5.4 Run (Development)

```bash
# Full dev loop (opens browser, starts TUI, gateway)
./start.sh

# Just the gateway
pnpm gateway:dev [--reset]

# Just the CLI
pnpm openclaw <command> [args...]

# Terminal UI
pnpm tui:dev

# Web UI (Vite dev server)
pnpm ui:dev

# Electron app (macOS)
pnpm electron:dev
```

### 5.5 Run (Production)

```bash
# Install globally
npm install -g openclaw@latest

# Run onboarding (installs daemon)
openclaw onboard --install-daemon

# Start the gateway daemon
openclaw gateway --port 18789 --bind loopback --verbose

# Send a message
openclaw message send --to +1234567890 --message "Hello"

# Talk to agent
openclaw agent --message "Ship checklist" --thinking high

# Check health
openclaw channels status --probe
openclaw doctor
```

### 5.6 Test

```bash
# Run all unit tests (Vitest)
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch

# End-to-end tests
pnpm test:e2e

# Live tests (with real API keys)
CLAWDBOT_LIVE_TEST=1 pnpm test:live

# Docker-based e2e
pnpm test:docker:live-gateway

# Test specific file
pnpm test src/gateway/server.test.ts
```

### 5.7 Lint & Format

```bash
# Check (Oxlint)
pnpm lint

# Fix formatting (Oxfmt)
pnpm format:fix

# Fix both linting + formatting
pnpm lint:fix

# Swift files (iOS/macOS)
pnpm format:swift
```

### 5.8 Package & Deploy

**macOS App:**
```bash
pnpm build          # Full build
pnpm mac:package    # Creates dist/OpenClaw.app
```

**Electron:**
```bash
pnpm electron:start # Run production build
```

**Docker:**
```bash
docker build -t openclaw .
docker run -v ~/.openclaw:/root/.openclaw -p 18789:18789 openclaw
```

**iOS (requires Xcode):**
```bash
pnpm ios:build
# or open in Xcode:
pnpm ios:open
```

**Android (requires Android Studio):**
```bash
pnpm android:assemble
pnpm android:install
```

---

## 6. Environment Variables & Configuration

### 6.1 Essential Env Vars

| Variable | Purpose | Example |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API | `sk-ant-...` |
| `OPENAI_API_KEY` | OpenAI API | `sk-...` |
| `OLLAMA_BASE_URL` | Local Ollama | `http://127.0.0.1:11434` |
| `OPENCLAW_PROFILE` | dev or prod | `dev` |
| `OPENCLAW_SKIP_CHANNELS` | Skip channels on startup | `1` |
| `OPENCLAW_ELECTRON_DEV` | Electron dev mode | `1` |

### 6.2 Configuration File (`~/.openclaw/openclaw.json`)

**Schema:** JSON5 with live reload (file watch)
**Key Sections:**
- `gateway` — port, bind address, auth token, mode
- `models.providers` — model provider config (Anthropic, OpenAI, Ollama, etc.)
- `agents` — agent defaults, model routing, concurrency
- `channels` — per-channel enable/disable, allowlists, credentials
- `hooks` — hook definitions and auto-run policies
- `sessions` — session isolation, reset policies

**Example:**
```json5
{
  "gateway": {
    "port": 18789,
    "mode": "local",
    "auth": { "token": "AUTO_GENERATED" }
  },
  "models": {
    "providers": {
      "anthropic": {
        "baseUrl": "https://api.anthropic.com",
        "api": "anthropic-messages",
        "models": [
          { "name": "claude-opus-4-5-20250929", "provider": "anthropic" }
        ]
      },
      "ollama": {
        "baseUrl": "http://127.0.0.1:11434/v1",
        "api": "openai-completions",
        "models": []
      }
    }
  },
  "agents": {
    "defaults": {
      "model": "anthropic/claude-opus-4-5-20250929",
      "maxConcurrent": 4
    }
  },
  "channels": {
    "whatsapp": { "enabled": true },
    "telegram": { "enabled": true }
  }
}
```

---

## 7. Known Gaps & Inconsistencies

| Issue | Impact | Workaround / Status |
|-------|--------|---------------------|
| **UI Workspace Coupling** | UI build is separate but tightly coupled to main build | `pnpm ui:build` runs as part of `pnpm build` |
| **Canvas Bundle Hash** | `src/canvas-host/a2ui/.bundle.hash` is auto-generated; unexpected diffs on rebuild | Regenerate via `pnpm canvas:a2ui:bundle` if needed |
| **Multi-workspace Plugin Versioning** | Extensions have independent versions; drift possible | `pnpm plugins:sync` keeps versions in sync |
| **Electron GPU Crashes (macOS)** | GPU rendering sometimes crashes on newer macOS | Pass `--disable-gpu --no-sandbox` as CLI flags (already done in main.ts) |
| **Bash 3.2 Limitations (macOS)** | Native bash on macOS is 3.2 (old); some scripts require 4.3+ | Avoid `wait -n`; use explicit polling instead |
| **Live Test Coverage** | Tests with real API keys are run separately and documented but not always in CI | Manual triggers via `pnpm test:live` or Docker |
| **Mobile App Signing** | iOS/Android signing/notary keys are external (not in repo) | Follow internal release docs for app signing |
| **Sandbox Security Audit** | Agent sandbox uses custom process isolation; security status unknown | Code review needed for critical deployments |

---

## Summary

**OpenClaw** is a **modular, self-hosted personal AI assistant** with:
- **Single gateway daemon** managing 11+ messaging channels
- **Persistent agent runtime** with sessions, memory, and skill plugins
- **Web/Desktop/Mobile UIs** (Control UI, Electron, native apps)
- **16+ model providers** with failover and auth fallbacks
- **Event-driven architecture** (WebSocket broadcasts)
- **Local-first data storage** (no cloud dependency)

**Build is straightforward:** `pnpm install && pnpm build && pnpm start` (or `./start.sh` for full dev environment).

**Recommended Next Step:** Phase 3A (create IMPLEMENTATION_PLAN.md with task breakdown for ensuring all documented commands work and identifying any gaps).
