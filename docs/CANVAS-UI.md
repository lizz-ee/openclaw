# Canvas UI — Technical Architecture

> How the Tron-inspired infinite canvas Control UI works internally.
> For the visual design system, see [DESIGN-SYSTEM.md](/mockups/DESIGN-SYSTEM.md).
> For the full system architecture, see [ARCHITECTURE.md](/docs/ARCHITECTURE.md).

Last updated: 2026-02-08

---

## 1. Overview

The Control UI is a single Lit.js web component (`<openclaw-app>`) that renders an infinite pannable canvas with draggable, resizable cards. Each card represents one subsystem of the OpenClaw gateway. The UI connects over WebSocket and streams events in real time.

**Key design decisions:**
- **Lit.js 3.x** with light DOM (no Shadow DOM) for CSS inheritance
- **CSS `zoom`** for canvas scaling (not `transform: scale()`) — crisp rendering, simpler coordinate math
- **Pointer capture** for drag/resize — smooth tracking even when cursor leaves element
- **Event buffering** — gateway events buffer to `eventLogBuffer`, sync to `eventLog` only when a card needs them
- **Polling guards** — interval fetches check `canvasCards.{cardId}.open` before requesting data

---

## 2. File Map

```
ui/src/
├── ui/
│   ├── app.ts                    # Main component (541 lines, 90+ @state)
│   ├── app-gateway.ts            # Gateway connection + event routing
│   ├── app-lifecycle.ts          # Connected/disconnected/updated hooks
│   ├── app-polling.ts            # Interval-based data fetching
│   ├── app-settings.ts           # Settings persistence + URL sync
│   ├── app-chat.ts               # Chat queue + message dispatch
│   ├── app-scroll.ts             # Auto-scroll for chat + logs
│   ├── app-tool-stream.ts        # Tool execution streaming
│   ├── app-events.ts             # EventLogEntry type
│   ├── app-view-state.ts         # AppViewState (passed to renderers)
│   ├── gateway.ts                # GatewayBrowserClient (WS protocol)
│   ├── storage.ts                # UiSettings + localStorage
│   ├── navigation.ts             # Tab/URL routing
│   ├── theme.ts                  # Theme definitions
│   ├── theme-transition.ts       # Animated theme switching
│   ├── format.ts                 # Number/date formatting
│   │
│   ├── canvas/
│   │   ├── canvas-render.ts      # Main renderer (880 lines)
│   │   ├── canvas-interactions.ts # Pan/zoom/drag/resize handlers
│   │   ├── canvas-types.ts       # CardId, CardState, CanvasInteraction
│   │   └── canvas-defaults.ts    # Default card positions + sizes
│   │
│   ├── controllers/              # State management per domain
│   │   ├── agents.ts             # Agent list RPC
│   │   ├── assistant-identity.ts # Agent name/avatar
│   │   ├── channels.ts           # Channel status
│   │   ├── chat.ts               # Chat history + event handling
│   │   ├── config.ts             # Config load/save/apply
│   │   ├── cron.ts               # Cron jobs + runs
│   │   ├── debug.ts              # Debug status + health
│   │   ├── devices.ts            # Device pairing
│   │   ├── exec-approval.ts      # Live approval queue (events)
│   │   ├── exec-approvals.ts     # Approval config editor
│   │   ├── logs.ts               # Gateway log parsing
│   │   ├── models.ts             # Model list + active model
│   │   ├── nodes.ts              # Node list
│   │   ├── presence.ts           # Instance presence
│   │   ├── sessions.ts           # Session list + patch
│   │   └── skills.ts             # Skill list + management
│   │
│   ├── views/                    # Pure render functions
│   │   ├── chat.ts               # Chat terminal renderer
│   │   ├── channels.ts           # Channel list + per-channel views
│   │   ├── channels.*.ts         # Per-channel config (WhatsApp, Telegram, etc.)
│   │   ├── config-form.ts        # Schema-driven config editor
│   │   ├── config-form.*.ts      # Config form subsections
│   │   ├── exec-approval.ts      # Approval prompt overlay
│   │   ├── gateway-url-confirmation.ts  # URL change overlay
│   │   └── ...
│   │
│   └── chat/
│       ├── grouped-render.ts     # Message grouping + formatting
│       └── markdown.ts           # Markdown → HTML rendering
│
└── styles/
    ├── base.css                  # Reset, keyframes, shared variables
    ├── canvas.css                # Canvas viewport, cards, HUD, dock, minimap
    └── components.css            # View-specific component styles
```

---

## 3. State Architecture

### 3.1 The Single-Component Model

All state lives on `OpenClawApp` as `@state()` properties. There is no separate store (Redux, MobX, etc.). When a property changes, Lit's reactive update cycle re-renders only the affected template parts.

This works because:
- The canvas is **one component** with one render tree
- State changes are **infrequent** (gateway events, user actions)
- Lit's dirty-checking is efficient for flat property changes

### 3.2 AppViewState

The `AppViewState` type is the **read interface** passed to all render functions. It contains:

- **Connection state**: `connected`, `hello`, `lastError`, `client`
- **Canvas state**: `canvasPanX/Y`, `canvasScale`, `canvasCards`, `canvasFocusedCard`, `canvasNextZ`
- **Chat state**: `chatMessages`, `chatStream`, `chatRunId`, `chatQueue`, `chatSending`
- **Per-domain state**: `nodes`, `cronJobs`, `sessionsResult`, `channelsSnapshot`, `skillsReport`, etc.
- **Handler functions**: `handleSendChat()`, `handleAbortChat()`, `handleConfigSave()`, etc. (40+)

Controllers and views never write state directly — they mutate `@state()` properties on the host, and Lit handles the rest.

### 3.3 Card State

Each card's state is tracked in `canvasCards: Record<CardId, CardState>`:

```typescript
type CardId = "chat" | "system" | "channels" | "sessions" | "activity"
  | "log" | "skills" | "cron" | "config" | "nodes" | "debug";

type CardState = {
  open: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};
```

Canvas layout is persisted to localStorage on every drag/resize completion (pointerUp event, not per-pixel during drag).

---

## 4. Canvas Rendering

### 4.1 Coordinate System

The canvas uses CSS `zoom` on the viewport element:

```css
.canvas-viewport {
  zoom: var(--canvas-zoom);  /* 0.2 to 3.0 */
}
```

Cards are positioned with absolute `left`/`top` inside a `.canvas-world` container that the viewport pans via `transform: translate()`.

**Why `zoom` instead of `transform: scale()`**: CSS `zoom` keeps text crisp at all scale levels and simplifies pointer coordinate math (no manual transform inversion needed).

### 4.2 Render Pipeline

```
renderCanvas(state: AppViewState)
  │
  ├── CRT overlays (scanlines, vignette, bloom, flicker)
  │     └── pointer-events: none, z-index: 99996-99999
  │
  ├── HUD Top Bar (fixed, z-index: 10000)
  │     ├── Brand ring + wordmark
  │     ├── Status dots (gateway, ollama, channels)
  │     ├── Model badge
  │     └── Live clock
  │
  ├── Canvas viewport (pannable, zoomable)
  │     ├── Canvas world (translated by panX/panY)
  │     │   ├── Background pattern (grid/dot per theme)
  │     │   └── Cards (one per open panel)
  │     │       ├── Card header (drag handle)
  │     │       ├── Card body (scrollable, view-specific content)
  │     │       └── Resize handle (bottom-right)
  │     │
  │     └── Event listeners (pointerdown/move/up for pan)
  │
  ├── Minimap (fixed, bottom-right, z-index: 10000)
  │     ├── Card rectangles (proportional)
  │     └── Viewport rectangle (highlighted)
  │
  ├── Dock Bar (fixed, bottom-center, z-index: 10000)
  │     └── Icon buttons with active dots
  │
  ├── Model Picker (fixed overlay, z-index: 10010-10011)
  │     └── Dropdown list with search
  │
  ├── Exec Approval Overlay (fixed, z-index: 10100)
  │     └── Command display + Allow/Deny buttons
  │
  └── Gateway URL Confirmation (fixed overlay)

HUD Bottom Bar (fixed, z-index: 10000)
  ├── Canvas coordinates
  ├── Zoom percentage
  └── Shortcuts
```

### 4.3 Z-Index Stack

| Layer | Z-Index | Content |
|---|---|---|
| CRT overlays | 99996–99999 | Scanlines, vignette, bloom, flicker |
| Exec approval | 10100 | Approval prompt (above everything) |
| Model picker backdrop | 10011 | Click-to-close backdrop |
| Model picker dropdown | 10010 | Model selection list |
| HUD / Minimap / Dock | 10000 | Fixed UI elements |
| Dragged card | 1000 | Card being actively dragged |
| Focused card | `canvasNextZ` | Most recently clicked card |
| Default cards | 1–100 | Initial card z-order |

---

## 5. Interaction System

### 5.1 Pan (Canvas Drag)

```
pointerdown on viewport (not on card/dock/HUD)
  → canvasInteraction = "panning"
  → setPointerCapture()
  → track delta on pointermove
  → update canvasPanX/canvasPanY
  → pointerup/pointercancel → release
```

### 5.2 Zoom (Scroll Wheel)

```
wheel on viewport
  → calculate new zoom (0.2–3.0 range)
  → zoom toward cursor position
  → update canvasScale
```

### 5.3 Card Drag

```
pointerdown on .card-head
  → canvasInteraction = "dragging"
  → setPointerCapture()
  → track delta, update card x/y in canvasCards
  → bump card to top z-index
  → pointerup/pointercancel → save layout to localStorage
```

### 5.4 Card Resize

```
pointerdown on .resize-handle
  → canvasInteraction = "resizing"
  → setPointerCapture()
  → track delta, update card w/h in canvasCards
  → pointerup/pointercancel → save layout to localStorage
```

All interactions use `setPointerCapture()` for reliable tracking even when the cursor moves outside the element bounds. `pointercancel` handlers ensure clean state recovery when the OS interrupts the gesture.

---

## 6. Event Routing

### 6.1 Gateway Events → UI Updates

When the gateway sends an event, `app-gateway.ts:handleGatewayEvent()` routes it:

| Event | Handler | Updates |
|---|---|---|
| `agent` | `handleAgentEvent()` | Tool stream, chat tool messages |
| `chat` | `handleChatEvent()` | Chat messages, stream, run state |
| `presence` | Direct assignment | `presenceEntries` |
| `cron` | `loadCron()` (if card open) | `cronJobs`, `cronStatus` |
| `device.pair.*` | `loadDevices()` | `devicesList` |
| `exec.approval.requested` | `addExecApproval()` | `execApprovalQueue` + auto-expire timer |
| `exec.approval.resolved` | `removeExecApproval()` | `execApprovalQueue` |

All events are buffered to `eventLogBuffer` (max 250). When `activity`, `debug`, or `system` cards are open, the buffer syncs to `eventLog` for display.

### 6.2 onCardOpen Handler

When a card opens via the dock bar, `onCardOpen(cardId)` triggers an initial data load:

| Card | On Open |
|---|---|
| `chat` | Load chat history + scroll to bottom |
| `system` | Load debug status |
| `channels` | Load channel status |
| `sessions` | Load session list |
| `activity` | Sync eventLogBuffer → eventLog |
| `log` | Load logs (polling starts) |
| `skills` | Load skill list |
| `cron` | Load cron jobs + status |
| `config` | Load config + schema |
| `nodes` | Load node list |
| `debug` | Load debug status + health |

---

## 7. Polling System

Three polling intervals run continuously but guard against unnecessary requests:

| Interval | Period | Guard | Fetches |
|---|---|---|---|
| Nodes | 5 seconds | Always (lightweight) | `node.list` |
| Logs | 2 seconds | `canvasCards.log.open` | `logs.tail` (incremental) |
| Debug | 3 seconds | `canvasCards.debug.open` | `status` |

Polling starts in `handleConnected()` and stops in `handleDisconnected()`. Each poller checks its guard condition before making any RPC call.

---

## 8. Chat System

### 8.1 Message Flow

```
User types in chat input → setChatMessage()
User presses Enter → handleSendChat()
  │
  ├─ If chatRunId is active → queue message (steer/followup)
  └─ If idle → send via chat.send RPC
       │
       ▼
  Gateway accepts → chatRunId set, chatSending = true
       │
       ▼
  Gateway streams event:chat
       ├─ status: "streaming" → chatStream updates
       ├─ status: "tool_use" → tool messages appear
       └─ status: "final"/"error"/"aborted"
            ├─ resetToolStream()
            ├─ flushChatQueue() (send next queued message)
            └─ refresh sessions (if flagged)
```

### 8.2 Chat Queue

When the agent is busy, incoming messages queue via `chatQueue`. On run completion, `flushChatQueueForEvent()` sends the next queued message, creating a chain of turns.

### 8.3 Chat Rendering

Messages are grouped and formatted in `chat/grouped-render.ts`:
- User messages: `user@grid ~$` prefix in `--text-bright`
- Tool outputs: indented with left border in `--pri-dim`
- CLU responses: `CLU >` prefix in `--acc-bright`
- Footer shows sender label ("CLU" in orange / "User" in light blue) + timestamp
- Markdown rendered to HTML (fenced code blocks, links, emphasis)
- Auto-scroll to bottom on new messages (with scroll-position awareness)

---

## 9. Theme System

### 9.1 CSS Custom Properties

All colors flow through CSS custom properties. Themes swap values on the root element:

```css
/* The Grid (default) */
:root {
  --pri: #00fce8;
  --pri-bright: #70fffa;
  --pri-dim: #00897a;
  --acc: #ffaa20;
  --acc-bright: #ffcc66;
  --bg: #000000;
  --panel: rgba(0,4,4,0.88);
  /* ... */
}
```

### 9.2 Theme Switching

Theme changes via the dock bar cycler or keyboard shortcut:
1. `setTheme()` updates `@state() theme`
2. CSS class on root element swaps (`theme-grid`, `theme-outlands`, `theme-endofline`)
3. Optional animated transition via `theme-transition.ts`
4. Theme persisted to `UiSettings` → localStorage

---

## 10. Connection Lifecycle

```
Browser loads
  │
  ▼
connectedCallback()
  ├─ inferBasePath()
  ├─ applySettingsFromUrl() (token, gateway URL from URL params)
  ├─ syncTabWithLocation()
  ├─ syncThemeWithSettings()
  ├─ Start polling intervals (nodes/logs/debug)
  ├─ Start HUD clock (setInterval every 1s)
  └─ connectGateway()
       │
       ▼
  GatewayBrowserClient.start()
       ├─ WebSocket connect to settings.gatewayUrl
       ├─ Send req:connect (with token/password)
       ├─ onHello → applySnapshot(), load initial data
       │    ├─ loadAssistantIdentity()
       │    ├─ loadAgents()
       │    ├─ loadModels() + initActiveModel()
       │    ├─ loadNodes()
       │    ├─ loadDevices()
       │    └─ refreshActiveTab()
       │
       ├─ onEvent → handleGatewayEvent() (continuous)
       ├─ onClose → set disconnected state
       └─ onGap → show refresh warning
```

On disconnect, the client auto-reconnects. On reconnect, all initial data is reloaded and orphaned chat run state is cleared.
