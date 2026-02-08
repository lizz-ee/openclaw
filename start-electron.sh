#!/bin/bash
# Start OpenClaw desktop app (Electron)
# The Electron app now auto-starts the gateway if it's not running.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

# Find the Electron binary (Homebrew or local node_modules)
if [ -x /opt/homebrew/bin/electron ]; then
  ELECTRON_BIN=/opt/homebrew/bin/electron
elif [ -x "$REPO_DIR/node_modules/.bin/electron" ]; then
  ELECTRON_BIN="$REPO_DIR/node_modules/.bin/electron"
else
  echo "Error: electron not found. Install via: brew install --cask electron"
  exit 1
fi

ELECTRON_PID=""

cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$ELECTRON_PID" ] && kill "$ELECTRON_PID" 2>/dev/null
  wait 2>/dev/null
  exit 0
}
trap cleanup INT TERM EXIT

# Compile Electron app
echo "Compiling Electron app..."
cd "$REPO_DIR"
pnpm electron:compile || { echo "Compile failed."; exit 1; }

echo "Launching OpenClaw desktop app..."
echo "  (Gateway will auto-start if not running)"
echo "  Global shortcut: Cmd+Shift+O to toggle window"
echo ""

# Clean environment: strip ELECTRON_RUN_AS_NODE (set by VSCode) and any
# vars that interfere with Chromium's GPU/network subprocesses on macOS 26.
env -i \
  HOME="$HOME" \
  PATH="/usr/bin:/usr/local/bin:/opt/homebrew/bin:$REPO_DIR/node_modules/.bin" \
  TMPDIR="${TMPDIR:-/tmp}" \
  "$ELECTRON_BIN" \
    --disable-gpu \
    --in-process-gpu \
    --no-sandbox \
    --disable-software-rasterizer \
    "$REPO_DIR/dist/electron/main.js" &
ELECTRON_PID=$!

sleep 4
if ! kill -0 "$ELECTRON_PID" 2>/dev/null; then
  echo "Electron failed to start. Check the logs above."
  exit 1
fi

echo "OpenClaw is running."
echo "  Electron PID: $ELECTRON_PID"
echo ""

# Launch the TUI in the foreground (interactive)
echo "Starting OpenClaw TUI..."
echo "  (Ctrl+C to quit TUI and shut down Electron)"
echo ""
openclaw tui

# TUI exited — clean up everything
cleanup
