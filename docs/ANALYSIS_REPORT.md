# ANALYSIS_REPORT — OpenClaw

**Generated:** 2026-02-08
**Project:** OpenClaw (personal AI assistant)
**Repository:** https://github.com/openclaw/openclaw

---

## 1. Repo Overview

**Purpose:**
OpenClaw is a self-hosted, multi-channel personal AI assistant. It provides unified access to AI models (Claude, GPT, local Ollama) across multiple messaging platforms (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Microsoft Teams, Matrix, Zalo, WebChat, etc.). The project includes a CLI, web gateway, macOS/iOS/Android apps, and an extensible plugin architecture.

**Main Components:**
- **Gateway:** Central control plane (WebSocket-based protocol, agent orchestration, channel bridging)
- **CLI:** Command-line interface for users and developers
- **Web UI (Control UI):** Lit.js + Vite-based dashboard for managing agents and settings
- **Electron App:** Standalone macOS app with tray integration and window persistence
- **Mobile Apps:** Native iOS and Android apps (Swift/Kotlin)
- **Channel Providers:** Integrations for messaging platforms (built-in + extensions)
- **Agent System:** Agentic framework using Pi RPC (from @mariozechner) with tool calling and sandbox execution
- **Extensions/Plugins:** Modular architecture under `extensions/*` (channel plugins, tools, integrations)

**Key Stakeholders:**
- End users (self-hosted deployment)
- Developers (extending via plugins, tools, channels)
- AI model providers (Anthropic, OpenAI, local Ollama, Bedrock)

---

## 2. Tech Stack and Dependencies

### Core Stack
- **Language:** TypeScript (ESM)
- **Runtime:** Node.js ≥22.12.0
- **Package Manager:** pnpm (primary), Bun (optional for scripts/dev), npm (supported)
- **Build System:** TypeScript compiler + custom build scripts (canvas bundling, protocol gen, etc.)

### Messaging Channels
- **WhatsApp:** `@whiskeysockets/baileys` (web-based)
- **Telegram:** `grammy` + `@grammyjs/runner`, `@grammyjs/transformer-throttler`
- **Discord:** built-in integration (likely using discord-api-types)
- **Slack:** `@slack/bolt`, `@slack/web-api`
- **Signal:** `signal-utils`
- **iMessage:** native integration (macOS/iOS apps)
- **Microsoft Teams:** msteams extension
- **Google Chat:** implied (channels directory)
- **Matrix:** matrix extension
- **Zalo:** zalo/zalouser extensions

### AI & Agents
- **Agent Framework:** `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`
- **Protocol:** ACP (Agent Communication Protocol) via `@agentclientprotocol/sdk`
- **Model Providers:**
  - Anthropic (API)
  - OpenAI (API)
  - AWS Bedrock (`@aws-sdk/client-bedrock`)
  - Local Ollama (JavaScript SDK)

### UI & Rendering
- **Web UI:** Lit.js (`lit`, `@lit/context`, `@lit-labs/signals`), Vite (bundler)
- **Markdown:** `markdown-it`, `@mozilla/readability`
- **Canvas:** Custom A2UI bundle (rendered in canvas-host)
- **Terminal UI:** Custom TUI using `@clack/prompts`, `osc-progress`
- **Electron:** `electron` (v40.2.1), `@electron-forge/cli` + makers

### Data & Storage
- **SQLite (vector search):** `sqlite-vec`
- **Session/Config Storage:** File-based (YAML, JSON)
- **Credentials:** `~/.openclaw/credentials/`

### Utilities & Middleware
- **CLI:** `commander`, `chalk`, `cli-highlight`
- **HTTP/WS:** `express` (v5.2.1), `ws`, `undici`
- **File Handling:** `file-type`, `sharp` (image processing), `pdfjs-dist`, `jszip`, `tar`
- **Job Scheduling:** `croner`
- **Utilities:** `dotenv`, `yaml`, `zod` (validation), `json5`, `jiti`, `linkedom`, `proper-lockfile`, `qrcode-terminal`
- **Media:** `node-edge-tts` (TTS), `playwright-core` (PDF rendering)

### Testing & QA
- **Framework:** Vitest (v4.0.18) with V8 coverage (70% thresholds)
- **Configs:**
  - `vitest.config.ts` (main unit tests)
  - `vitest.e2e.config.ts` (end-to-end)
  - `vitest.live.config.ts` (live API tests)
  - `vitest.gateway.config.ts`, `vitest.extensions.config.ts`, `vitest.unit.config.ts`

### Linting & Formatting
- **Linter:** Oxlint (v1.42.0) with TypeScript support
- **Formatter:** Oxfmt (v0.27.0)
- **Secrets Detection:** `detect-secrets` (`.detect-secrets.cfg`)
- **Pre-commit Hooks:** `.pre-commit-config.yaml`

### Build & Release
- **Bundling:** Rolldown (v1.0.0-rc.2) for canvas bundling
- **Docker:** Dockerfile, docker-compose.yml, Dockerfile.sandbox
- **Packaging:** Mac app via `scripts/package-mac-app.sh`, Electron Forge
- **CI/CD:** GitHub Actions (`.github/workflows/`)
- **Release:** npm dist-tags (`latest`, `beta`, `dev`)

---

## 3. Existing Entrypoints & How to Run

### CLI Entry Point
**File:** `openclaw.mjs`
**Package Bin:** `"openclaw": "openclaw.mjs"`
**Main Script:** `scripts/run-node.mjs`

**Commands:**
```bash
# Interactive onboarding (recommended first step)
openclaw onboard [--install-daemon]

# Start the gateway
openclaw gateway [--port 18789] [--bind loopback] [--verbose] [--reset]

# Send a message
openclaw message send --to <phone> --message "<text>"

# Talk to the agent
openclaw agent --message "<text>" [--thinking high]

# Terminal UI
openclaw tui

# Status/diagnostics
openclaw channels status --probe
openclaw doctor

# Configuration
openclaw config set <key> <value>
openclaw config get <key>
```

### Web UI (Control UI)
**Location:** `ui/` (Vite project, separate pnpm workspace)
**Build:** `pnpm ui:build`
**Dev:** `pnpm ui:dev`
**Output:** `dist/control-ui/`
**Protocol:** Gateway communicates via WebSocket (`ws://localhost:18789`)

### Electron App (macOS)
**Location:** `electron/` + compiled output in `dist/electron/`
**Files:**
  - `electron/main.ts` — app lifecycle, tray, window management
  - `electron/preload.cjs` — preload script
  - `electron/tray.ts` — tray menu
- **Build:** `pnpm electron:compile`
- **Run (Dev):** `pnpm electron:dev`
- **Run (Prod):** `pnpm electron:start`
- **Package:** `pnpm mac:package` → `dist/OpenClaw.app`

### Mobile Apps (iOS / Android)
**iOS:** `apps/ios/` (Swift + Xcode)
- Build: `pnpm ios:build`
- Open Xcode: `pnpm ios:open`

**Android:** `apps/android/` (Kotlin + Gradle)
- Build: `pnpm android:assemble`
- Install: `pnpm android:install`
- Test: `pnpm android:test`

### Gateway (Daemon)
**Protocol:** WebSocket + JSON-RPC for agent communication
**Default Port:** 18789
**Key Classes:** `src/gateway/server/*`, `src/gateway/protocol/*`

### Plugin System
**Extension Directory:** `extensions/*` (pnpm workspace)
- Each extension has its own `package.json`
- Runtime deps must be in `dependencies` (not workspace refs)
- Plugin SDK: `dist/plugin-sdk/index.js`

### Dev Entry Point
**Dev Script:** `pnpm dev`
**Runs:** `node scripts/run-node.mjs` (customizable targets like `--dev gateway`, `--dev tui`)

---

## 4. Notable Modules and Responsibilities

### Source Tree (`src/`)

| Module | Purpose |
|--------|---------|
| `src/acp/` | Agent Communication Protocol (ACP) integration |
| `src/agents/` | Agent orchestration, Pi framework integration, tools, sandbox, skills |
| `src/auto-reply/` | Automatic reply system for channels |
| `src/browser/` | Browser-based UI routes and handlers |
| `src/canvas-host/` | Canvas rendering system (A2UI bundle) |
| `src/channels/` | Channel abstraction, routing, allowlists, plugin loading |
| `src/cli/` | CLI program structure, daemon, gateway, TUI runners |
| `src/commands/` | User-facing commands (agent, channels, gateway-status, onboarding) |
| `src/compat/` | Compatibility layers |
| `src/config/` | Configuration management (YAML, JSON parsing, sessions) |
| `src/cron/` | Background job scheduling (Pi-based agents) |
| `src/daemon/` | Daemon service lifecycle |
| `src/discord/` | Discord channel integration + monitor |
| `src/docs/` | Documentation generation/helpers |
| `src/gateway/` | WebSocket gateway, protocol handlers, server methods |
| `src/hooks/` | User-defined hook system (bundled hooks, plugin interface) |
| `src/imessage/` | iMessage integration (macOS/iOS monitor) |
| `src/infra/` | Network, outbound HTTP, infrastructure utilities |
| `src/link-understanding/` | URL/link extraction and analysis |
| `src/logging/` | Logging system (tslog) |
| `src/macos/` | macOS-specific features |
| `src/media/` | Media processing (images, videos, audio, PDF extraction) |
| `src/media-understanding/` | Vision model integration for media analysis |
| `src/memory/` | Memory/knowledge storage system |
| `src/node-host/` | Node.js host environment for sandboxed code |
| `src/pairing/` | QR-based pairing for channels |
| `src/plugins/` | Plugin system and SDK |
| `src/process/` | Process management (isolation, cleanup) |
| `src/provider-*` | Model provider implementations (web, Anthropic, OpenAI, Ollama, Bedrock) |
| `src/routing/` | Message routing across channels |
| `src/security/` | Security utilities (validation, sanitization) |
| `src/sessions/` | Session persistence and management |
| `src/shared/` | Shared utilities and types |
| `src/signal/` | Signal channel integration |
| `src/slack/` | Slack integration + monitor |
| `src/telegram/` | Telegram integration (Grammy framework) |
| `src/terminal/` | Terminal UI utilities (table, progress, palette) |
| `src/tui/` | Terminal user interface (Pi TUI wrapper) |
| `src/tts/` | Text-to-speech integration (Edge TTS) |
| `src/utils/` | General utilities (strings, types, async) |
| `src/web/` | Web provider (WhatsApp web via Baileys) |
| `src/whatsapp/` | WhatsApp channel orchestration |
| `src/wizard/` | Onboarding wizard UI |

### Build & Scripts

| File | Purpose |
|------|---------|
| `scripts/run-node.mjs` | Dev runner with watch/hot-reload |
| `scripts/watch-node.mjs` | Watch mode for individual modules |
| `scripts/test-parallel.mjs` | Parallel test runner |
| `scripts/build-docs-list.mjs` | Generate docs index |
| `scripts/canvas-a2ui-copy.ts` | Copy canvas bundle after build |
| `scripts/copy-hook-metadata.ts` | Extract hook metadata |
| `scripts/write-build-info.ts` | Write build info file |
| `scripts/sync-plugin-versions.ts` | Keep plugin versions in sync |
| `scripts/protocol-gen.ts` | Generate protocol schema |
| `scripts/ui.js` | UI build/dev orchestrator |
| `scripts/bundle-a2ui.sh` | Canvas bundle build script |

---

## 5. Existing Docs and Trustworthiness

### Documentation Files

| File | Topic | Status |
|------|-------|--------|
| `README.md` | Overview, quick start, development channels | ✓ Current |
| `CLAUDE.md` → `AGENTS.md` | Developer guidelines, coding standards, release process | ✓ Comprehensive, **linked from README** |
| `docs/ARCHITECTURE.md` | System architecture overview | ✓ Present (~30KB) |
| `docs/CANVAS-UI.md` | Canvas rendering system | ✓ Present (15KB) |
| `docs/CHANGELOG.md` | Full release history | ✓ Maintained |
| `docs/channels/*` | Per-channel setup (Telegram, Discord, Slack, etc.) | ✓ Extensive |
| `docs/cli/*` | Command reference and tutorials | ✓ Extensive (43 files) |
| `docs/concepts/*` | Models, failover, auth, etc. | ✓ Extensive (32 files) |
| `docs/gateway/*` | Gateway deployment, protocols, doctor tool | ✓ Extensive (30 files) |
| `docs/install/*` | Installation, updating, Docker, Nix | ✓ Extensive |
| `docs/automation/*` | Hooks, workflows, task automation | ✓ Extensive |
| `docs/testing.md` | Testing strategy and commands | ✓ Present |
| `docs.acp.md` | ACP (Agent Communication Protocol) | ✓ Present |
| `.github/workflows/` | CI/CD definitions | ✓ In place |

**Trustworthiness:**
- **High confidence:** README, AGENTS.md, ARCHITECTURE.md all appear accurate and maintained
- **Known gaps:** Some docs may lag behind rapidly moving features; use code as source of truth for critical paths
- **Recommendation:** `AGENTS.md` is the primary developer reference; follow it explicitly

---

## 6. Open Questions / Uncertainties

1. **UI Workspace Independence:** The `ui/` folder appears to be a separate pnpm workspace with its own `package.json`. Exactly how it integrates with the main build (especially for production bundles) needs clarification.

2. **Canvas A2UI Bundle:** The canvas rendering uses a bundle (`src/canvas-host/a2ui/.bundle.hash`). The bundling process (`scripts/bundle-a2ui.sh`) is complex and the artifact management is not fully documented.

3. **Electron App Stability:** The Electron app has been enhanced (tray, HTTP server, auto-start gateway) but stability on various macOS versions is unknown.

4. **Multi-workspace Plugin Versioning:** Plugins under `extensions/*` have their own versions. The sync process (`scripts/sync-plugin-versions.ts`) suggests version drift is a known issue; process for pinning/releasing versions is unclear.

5. **Live Test Coverage:** Tests with real API keys (`test:live`, `test:docker:*`) are documented but their frequency/coverage scope is unclear.

6. **Performance Baseline:** No clear SLA or performance targets for response times, concurrency limits, or gateway throughput.

7. **Sandbox Security:** The agent sandbox system (`src/agents/sandbox/`) uses `node-llama-cpp` and custom process isolation. Full security audit status unknown.

8. **Mobile App Release Cadence:** iOS/Android apps (Swift/Kotlin) are in the repo but release process and signing/notary flow are not in this repo (external tooling).

---

## Summary

**OpenClaw** is a **large, multi-platform personal AI assistant** with:
- 70+ source modules covering agents, channels, UI, and infrastructure
- Complex build system (TypeScript, Vite, Rolldown, Electron Forge, native mobile)
- Extensive test suite (Vitest, live tests, Docker-based e2e)
- Strong documentation (README, AGENTS.md, extensive docs/)
- Production-ready (versioned releases, CI/CD, multi-channel support)

**Build Status:** Project uses pnpm monorepo with separate UI workspace. All core dependencies are vendored or installed via package manager. No obvious missing dependencies flagged.

**Recommended Next Step:** Phase 2 (create ARCHITECTURE_AND_BUILD.md with clean, current system architecture + confirmed build/run commands).
