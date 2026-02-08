# OpenClaw Control UI — Design System

## Overview

Tron-inspired infinite canvas control panel for managing the OpenClaw gateway,
channels, sessions, skills, and CLU agent. Built as a Lit.js web app running
inside an Electron shell.

---

## Themes

Three selectable color themes. Default: **The Grid**.

### The Grid (default)
Inspired by the Tron Legacy Grid — cold cyan on black, CLU's orange for AI.

| Token           | Hex        | Usage                          |
|-----------------|------------|--------------------------------|
| `--pri`         | `#00fce8`  | Primary text, borders, UI      |
| `--pri-bright`  | `#70fffa`  | Highlighted/active elements    |
| `--pri-mid`     | `#00d4c0`  | Secondary text                 |
| `--pri-dim`     | `#00897a`  | Dim/muted text, labels         |
| `--pri-border`  | `rgba(0,252,232,0.22)` | Panel borders        |
| `--pri-glow`    | `rgba(0,252,232,0.55)` | Text-shadow, box-shadow |
| `--acc`         | `#ffaa20`  | CLU voice, model badge         |
| `--acc-bright`  | `#ffcc66`  | CLU text body                  |
| `--acc-glow`    | `rgba(255,170,32,0.5)` | CLU glow effects      |
| `--green`       | `#00ff88`  | Status OK, tool output         |
| `--red`         | `#ff4466`  | Status error, offline          |
| `--bg`          | `#000000`  | Background                     |
| `--panel`       | `rgba(0,4,4,0.88)` | Card background          |
| `--text-bright` | `#e0fffc`  | User input text                |

### The Outlands
Inspired by Flynn's Arcade + CLU's throne room — phosphor green + bronze gold.

| Token           | Hex        | Usage                          |
|-----------------|------------|--------------------------------|
| `--pri`         | `#33ff66`  | Primary text, borders, UI      |
| `--pri-bright`  | `#88ffaa`  | Highlighted/active             |
| `--pri-dim`     | `#0a7a30`  | Dim text                       |
| `--acc`         | `#d4a030`  | CLU voice (bronze/gold)        |
| `--acc-bright`  | `#f0c860`  | CLU text body                  |
| `--bg`          | `#000a00`  | Background (deep green-black)  |

### End of Line
Inspired by the End of Line Club — electric violet + acid lime + hot white.

| Token           | Hex        | Usage                          |
|-----------------|------------|--------------------------------|
| `--pri`         | `#c470ff`  | Primary text, borders, UI      |
| `--pri-bright`  | `#e0a0ff`  | Highlighted/active             |
| `--pri-dim`     | `#6030a0`  | Dim text                       |
| `--acc`         | `#b0ff40`  | CLU voice (acid lime)          |
| `--acc-bright`  | `#d0ff80`  | CLU text body                  |
| `--white`       | `#f0eeff`  | User input (hot white)         |
| `--bg`          | `#06000c`  | Background (deep violet-black) |

---

## Canvas System

Infinite pannable/zoomable workspace.

- **Pan**: Click-drag on empty canvas
- **Zoom**: Scroll wheel (0.2x–3.0x range)
- **Minimap**: Bottom-right, shows viewport + card positions
- **Coordinates**: Bottom HUD bar shows `x: y:` and zoom `%`
- **Card positions persisted**: Save/restore layout per user (localStorage)

---

## Card (Panel) System

Every piece of UI is a **card** — a floating, draggable, resizable panel.

### Card anatomy
```
┌──────────────────────────────────┐  ← corner bracket (2px, --pri, glow)
│ TITLE              badge  □  □   │  ← header (drag handle)
│──────────────────────────────────│  ← 1px border
│                                  │
│  body content                    │  ← scrollable body
│                                  │
│                               ◢  │  ← resize handle (bottom-right)
└──────────────────────────────────┘  ← corner bracket
```

### Card features
- **Drag**: Grab header to reposition on canvas
- **Resize**: Bottom-right corner handle
- **Focus**: Click to bring to front (z-index)
- **Close**: Hide panel (removable from canvas)
- **Open**: Toolbar button to restore closed panels
- **Corner brackets**: Glowing `┌ ┐ └ ┘` in theme primary color

### Card types (panels)

| Panel       | Card ID      | Default Size | Content                                  |
|-------------|-------------|--------------|------------------------------------------|
| Chat        | `chat`      | 520×580      | Terminal — CLU. Main interaction point    |
| System      | `system`    | 280×400      | Gateway status, model, metrics, ASCII bars|
| Channels    | `channels`  | 260×200      | Channel list with online/offline dots     |
| Sessions    | `sessions`  | 260×170      | Active sessions with pulse indicators     |
| Activity    | `activity`  | 280×260      | Recent event feed with timestamps         |
| Log         | `log`       | 340×230      | Live gateway log tail                     |
| Skills      | `skills`    | 220×190      | Skill modules with active/inactive status |
| Cron        | `cron`      | 220×140      | Scheduled jobs with next-run times        |
| Config      | `config`    | (TBD)        | Gateway config editor                     |
| Nodes       | `nodes`     | (TBD)        | Paired devices / node management          |
| Debug       | `debug`     | (TBD)        | Manual RPC calls, health snapshots        |

---

## HUD (Heads-Up Display)

Fixed elements that don't move with the canvas.

### Top bar (34px)
- Brand ring + "OPENCLAW" wordmark
- Status dots: Gateway, Ollama, Channels (with count), offline channels
- Model badge: `CLU:LATEST` in accent color with border
- Live clock `HH:MM:SS`
- Glow line accent underneath

### Bottom bar (24px)
- Canvas coordinates `x: Y:`
- Zoom percentage
- Keyboard shortcut hints
- `⌘⇧O` toggle shortcut

### Minimap (160×100, bottom-right)
- Shows full canvas with card rectangles
- Viewport highlight rectangle
- Corner bracket accents

---

## CRT Effects

Layered overlays (pointer-events: none):

1. **Scanlines** (z: 99999) — 1–2px repeating horizontal lines
2. **Vignette** (z: 99998) — radial gradient darkening edges
3. **Bloom** (z: 99997) — inset box-shadow in theme primary
4. **Flicker** (z: 99996) — subtle animated color shift (End of Line only)

---

## Background Layers

1. **Grid/Dot pattern** — CSS background on canvas-world
   - Grid: dot grid (48px + 12px)
   - Outlands: dot grid (green phosphor)
   - End of Line: crosshatch + lime dot intersections
2. **SVG geometry** — gmunk-inspired decorative elements
   - Concentric rings, hexagons, or diamonds (per theme)
   - Angular connector lines with data dots
   - Corner flourishes
3. **Rotating ring** — very slow (180s) rotation, dashed circle

---

## Typography

- **Primary**: `Share Tech Mono` (monospace) — all body text, data, logs
- **Fallback**: `Courier New`, `monospace`
- **Sizes**: 8–12px range (dense terminal aesthetic)
- **Letter-spacing**: 1–4px on labels/titles (uppercase)
- **Text-shadow**: All text has subtle phosphor glow in theme primary

---

## Chat Terminal

Terminal-style interaction with CLU agent.

### Prompt format
```
user@grid ~$  [user input in --text-bright]
[tool] tool.name
    [indented tool output in --pri-dim, left-border]
CLU ›
[CLU response in --acc-bright, multi-line]
```

### Features
- Blinking block cursor (7×12px, 1s step animation)
- Horizontal separator between exchanges
- Connection header on load (version, gateway, model)
- Auto-scroll to bottom on new messages

---

## Dock Bar (Toolbar)

Floating bottom-center dock for panel management. macOS dock-inspired.

### Layout
```
                ┌─────────────────────────────────────────────┐
                │  💬  🖥  🔗  🕐  │  📈  📄  │  ⚡  ⏱  │  ⚙  🐛  │  ☀  │
                └─────────────────────────────────────────────┘
                         ·    ·   ·   ·     ·   ·                    ← active dots
```

### Anatomy
- **Container**: Floating bar, `bottom: 12px`, horizontally centered
- **Background**: `--panel` with `--pri-border`, `border-radius: 6px`
- **Top edge**: Glow line gradient (`--pri-glow`)
- **Items**: 34×34px icon buttons, `border-radius: 4px`
- **Separators**: 1px × 20px vertical lines between groups

### Icon groups (left to right)
1. **Command**: Chat, System
2. **Control**: Channels, Sessions, Activity, Log
3. **Agent**: Skills, Cron, Nodes
4. **Settings**: Config, Debug
5. **Theme**: Theme switcher (cycles Grid → Outlands → End of Line)

### States
| State    | Visual                                               |
|----------|------------------------------------------------------|
| Default  | Icon in `--text-dim`, transparent background         |
| Hover    | Icon brightens to `--cyan`, subtle bg highlight      |
| Active   | Icon `--cyan` with glow, 4×2px dot underneath       |
| Inactive | Icon `--text-dim`, no dot (panel is closed)          |

### Behavior
- Click toggles panel open/close on canvas
- Opening a closed panel places it at a default position near center
- Closing removes the card from canvas (position remembered for reopening)
- Hover shows tooltip label above the icon
- Dock auto-hides when not hovered (optional setting)
- Dock respects theme colors automatically via CSS variables

### Mockup reference
`mockups/concept-taskbars.html` — Concept 1

---

## Technical Stack

- **Framework**: Lit.js 3.x (Web Components)
- **Build**: Vite 7.x
- **Shell**: Electron (with embedded local HTTP server)
- **Gateway**: WebSocket to OpenClaw gateway :18789
- **State**: Lit `@state()` decorators + localStorage persistence
- **Styling**: CSS custom properties (theme tokens), scoped component styles

---

## Decisions Log

| Decision                  | Choice               | Date       |
|---------------------------|----------------------|------------|
| Layout model              | Infinite canvas      | 2026-02-07 |
| Default theme             | The Grid (cyan)      | 2026-02-07 |
| Toolbar style             | Dock Bar (bottom)    | 2026-02-07 |
| Theme count               | 3 (Grid/Outlands/EOL)| 2026-02-07 |

---

## File References

- **Design doc**: `mockups/DESIGN-SYSTEM.md` (this file)
- **Canvas mockups**: `concept-f-canvas.html` (Grid), `concept-g-outlands.html` (Outlands), `concept-h-endofline.html` (End of Line)
- **Taskbar mockups**: `concept-taskbars.html` (3 concepts, Dock Bar selected)
- **Earlier explorations**: `concept-a` through `concept-e2` (archived, informed final direction)
- **Current UI source**: `ui/src/` (Lit.js components, to be rebuilt)
- **Electron shell**: `electron/main.ts`, `electron/tray.ts`, `electron/preload.cjs`
- **Gateway config**: `~/.openclaw/openclaw.json`
