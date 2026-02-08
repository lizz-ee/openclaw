#!/bin/bash
# Start OpenClaw Control UI in development mode
# Launches Vite dev server + opens browser, ensures gateway is running.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
UI_DIR="$REPO_DIR/ui"
GATEWAY_PORT=18789
VITE_PORT=5173

# ─── Colors ───
cyan='\033[0;36m'
green='\033[0;32m'
yellow='\033[1;33m'
red='\033[0;31m'
dim='\033[0;90m'
reset='\033[0m'

echo -e "${cyan}╔══════════════════════════════════════╗${reset}"
echo -e "${cyan}║       OPENCLAW · CONTROL UI          ║${reset}"
echo -e "${cyan}║          development mode             ║${reset}"
echo -e "${cyan}╚══════════════════════════════════════╝${reset}"
echo ""

# ─── Clean build ───
echo -e "${cyan}Cleaning old build artifacts...${reset}"
rm -rf "$UI_DIR/node_modules/.vite" 2>/dev/null
rm -rf "$REPO_DIR/dist/control-ui" 2>/dev/null
echo -e "${green}✓${reset} Cache cleared"

echo -e "${cyan}Installing dependencies...${reset}"
cd "$UI_DIR" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install
echo -e "${green}✓${reset} Dependencies ready"
echo ""

# ─── Read gateway auth token from config ───
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
GW_TOKEN=""
if [ -f "$OPENCLAW_CONFIG" ]; then
  # Extract gateway.auth.token using python (available on macOS)
  GW_TOKEN=$(python3 -c "
import json, sys
try:
  c = json.load(open('$OPENCLAW_CONFIG'))
  print(c.get('gateway',{}).get('auth',{}).get('token',''))
except: pass
" 2>/dev/null)
  if [ -n "$GW_TOKEN" ]; then
    echo -e "${green}✓${reset} Gateway auth token found"
  else
    echo -e "${dim}No gateway auth token in config (unauthenticated mode)${reset}"
  fi
fi

# ─── Build gateway from dev source ───
echo -e "${cyan}Building gateway from source...${reset}"
cd "$REPO_DIR"
pnpm build 2>&1 | tail -3
echo -e "${green}✓${reset} Gateway built"

# ─── Kill ALL existing gateway processes (dev build, global install, launchd) ───
STALE_PIDS=$(pgrep -f "openclaw.*gateway|openclaw-gateway" 2>/dev/null)
if [ -n "$STALE_PIDS" ]; then
  echo -e "${yellow}⚠${reset} Killing existing gateway processes ${dim}(PIDs: $(echo $STALE_PIDS | tr '\n' ' '))${reset}"
  echo "$STALE_PIDS" | xargs kill 2>/dev/null
  sleep 2
  # Force-kill any survivors
  REMAINING=$(pgrep -f "openclaw.*gateway|openclaw-gateway" 2>/dev/null)
  if [ -n "$REMAINING" ]; then
    echo "$REMAINING" | xargs kill -9 2>/dev/null
    sleep 1
  fi
fi
# Also kill anything still holding the port (e.g. a non-openclaw process)
if lsof -ti:$GATEWAY_PORT >/dev/null 2>&1; then
  OLD_PORT_PID=$(lsof -ti:$GATEWAY_PORT)
  echo -e "${yellow}⚠${reset} Port $GATEWAY_PORT still in use ${dim}(PID $OLD_PORT_PID)${reset} — killing"
  kill -9 $OLD_PORT_PID 2>/dev/null
  sleep 1
fi

echo -e "  Starting gateway from dev build..."
node "$REPO_DIR/dist/index.js" gateway --port $GATEWAY_PORT &
GW_STARTED=$!
sleep 2
if lsof -ti:$GATEWAY_PORT >/dev/null 2>&1; then
  echo -e "${green}✓${reset} Gateway started ${dim}(PID $GW_STARTED, dev build)${reset}"
else
  echo -e "${red}✗${reset} Failed to start gateway. Check build output above."
fi

# ─── Kill stale Vite on same port ───
if lsof -ti:$VITE_PORT >/dev/null 2>&1; then
  echo -e "${yellow}⚠${reset} Port $VITE_PORT in use — killing stale process"
  lsof -ti:$VITE_PORT | xargs kill -9 2>/dev/null
  sleep 1
fi

# ─── Cleanup ───
VITE_PID=""
cleanup() {
  echo ""
  echo -e "${dim}Shutting down Vite dev server...${reset}"
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null
  [ -n "$GW_STARTED" ] && kill "$GW_STARTED" 2>/dev/null
  wait 2>/dev/null
  exit 0
}
trap cleanup INT TERM EXIT

# ─── Start Vite ───
echo ""
echo -e "${cyan}Starting Vite dev server...${reset}"
cd "$UI_DIR"
pnpm dev &
VITE_PID=$!

# Wait for Vite to be ready
for i in $(seq 1 15); do
  if lsof -ti:$VITE_PORT >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if lsof -ti:$VITE_PORT >/dev/null 2>&1; then
  echo ""
  echo -e "${green}✓${reset} Vite dev server running on ${cyan}http://localhost:$VITE_PORT${reset}"
  echo ""
  # Open in browser — fresh start with auth token
  OPEN_URL="http://localhost:$VITE_PORT/?resetSettings=1"
  [ -n "$GW_TOKEN" ] && OPEN_URL="${OPEN_URL}&token=${GW_TOKEN}"
  open "$OPEN_URL"
else
  echo -e "${red}✗${reset} Vite failed to start"
  exit 1
fi

# ─── Launch TUI (foreground, interactive) ───
echo -e "${cyan}Starting OpenClaw TUI...${reset}"
echo -e "${dim}  Ctrl+C to quit TUI and shut down${reset}"
echo ""
openclaw tui

# TUI exited — clean up everything
cleanup
