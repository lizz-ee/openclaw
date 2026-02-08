import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  globalShortcut,
  Notification,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { setupTray, destroyTray, updateTrayMenu } from "./tray";

// Workaround for GPU/network process crashes on macOS 26+
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("no-sandbox");

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let gatewayProcess: ChildProcess | null = null;
let localServer: http.Server | null = null;
let localServerPort = 0;

// ─── Window state persistence ──────────────────────────────────────
const STATE_FILE = path.join(
  os.homedir(),
  ".openclaw",
  "electron-window-state.json"
);

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { width: 1200, height: 800, isMaximized: false };
  }
}

function saveWindowState() {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: mainWindow.isMaximized(),
  };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Silently ignore write errors
  }
}

// ─── Single-instance lock ──────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ─── OpenClaw config reader ────────────────────────────────────────
function readOpenClawConfig(): { port: number; token: string } {
  const defaults = { port: 18789, token: "" };
  try {
    const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    const cfg = JSON.parse(raw);
    return {
      port: cfg?.gateway?.port ?? defaults.port,
      token: cfg?.gateway?.auth?.token ?? defaults.token,
    };
  } catch {
    return defaults;
  }
}

// ─── Gateway management ────────────────────────────────────────────
function isGatewayRunning(port: number): boolean {
  try {
    execSync(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}`, {
      timeout: 3000,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

function startGateway(port: number): ChildProcess | null {
  // Find openclaw binary
  const candidates = [
    "/opt/homebrew/bin/openclaw",
    "/usr/local/bin/openclaw",
    path.join(os.homedir(), ".local", "bin", "openclaw"),
  ];
  let openclawBin = "";
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      openclawBin = c;
      break;
    }
  }
  if (!openclawBin) {
    try {
      openclawBin = execSync("which openclaw", { encoding: "utf-8" }).trim();
    } catch {
      return null;
    }
  }

  const child = spawn(openclawBin, ["gateway"], {
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      OPENCLAW_GATEWAY_PORT: String(port),
    },
  });
  child.unref();
  return child;
}

async function ensureGateway(port: number): Promise<boolean> {
  if (isGatewayRunning(port)) return true;

  gatewayProcess = startGateway(port);
  if (!gatewayProcess) return false;

  // Wait up to 15 seconds for gateway to become ready
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (isGatewayRunning(port)) return true;
  }
  return false;
}

// ─── Local static server (avoids file:// origin issues) ────────────
function startLocalServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const uiDir = path.join(__dirname, "..", "control-ui");
    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".map": "application/json",
    };

    localServer = http.createServer((req, res) => {
      const urlPath = (req.url || "/").split("?")[0];
      let filePath = path.join(uiDir, urlPath === "/" ? "index.html" : urlPath);
      // Security: prevent path traversal
      if (!filePath.startsWith(uiDir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const ext = path.extname(filePath);
      const contentType = mimeTypes[ext] || "application/octet-stream";

      fs.readFile(filePath, (err, data) => {
        if (err) {
          // SPA fallback: serve index.html for non-file routes
          if (err.code === "ENOENT") {
            fs.readFile(path.join(uiDir, "index.html"), (err2, data2) => {
              if (err2) {
                res.writeHead(404);
                res.end("Not found");
              } else {
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(data2);
              }
            });
          } else {
            res.writeHead(500);
            res.end("Server error");
          }
          return;
        }
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
      });
    });

    localServer.listen(0, "127.0.0.1", () => {
      const addr = localServer!.address();
      if (typeof addr === "object" && addr) {
        resolve(addr.port);
      } else {
        reject(new Error("Failed to bind local server"));
      }
    });
  });
}

// ─── IPC handlers ──────────────────────────────────────────────────
function registerIpcHandlers() {
  ipcMain.on("window:minimize", () => mainWindow?.minimize());
  ipcMain.on("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on("window:close", () => mainWindow?.close());
  ipcMain.on("window:toggle-fullscreen", () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  // Notification from renderer
  ipcMain.on("notification:show", (_event, data: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: data.title,
        body: data.body,
        silent: false,
      });
      notif.on("click", () => {
        mainWindow?.show();
        mainWindow?.focus();
      });
      notif.show();
    }
  });

  // Get config from main process
  ipcMain.handle("config:get", () => {
    return readOpenClawConfig();
  });

  // Terminal spawn for embedded terminal
  ipcMain.handle("terminal:spawn", (_event, args: { cols: number; rows: number }) => {
    // We'll use a WebSocket-based approach instead of node-pty for security
    // The terminal connects to the TUI via the gateway
    return { supported: false, reason: "Use gateway TUI session" };
  });
}

// ─── Window creation ───────────────────────────────────────────────
function createWindow() {
  const config = readOpenClawConfig();
  const isDev = process.env.OPENCLAW_ELECTRON_DEV === "1";
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 800,
    minHeight: 600,
    title: "OpenClaw",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#0a0a0f",
    show: false, // Show after ready-to-show for smoother launch
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Show window once content is ready (avoids white flash)
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Pass gateway info to renderer via URL query params
  const gatewayUrl = `ws://127.0.0.1:${config.port}`;

  if (isDev) {
    const devUrl = new URL("http://localhost:5173");
    devUrl.searchParams.set("gatewayUrl", gatewayUrl);
    if (config.token) devUrl.searchParams.set("token", config.token);
    mainWindow.loadURL(devUrl.toString());
  } else {
    // Load from local HTTP server — gives us http://127.0.0.1 origin
    // which the gateway accepts without file:// hacks
    const url = new URL(`http://127.0.0.1:${localServerPort}/`);
    url.searchParams.set("gatewayUrl", gatewayUrl);
    if (config.token) url.searchParams.set("token", config.token);
    mainWindow.loadURL(url.toString());
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Save window state on resize/move (debounced)
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveWindowState, 500);
  };
  mainWindow.on("resize", debouncedSave);
  mainWindow.on("move", debouncedSave);

  mainWindow.on("close", (event) => {
    saveWindowState();
    // Minimize to tray on close (macOS style)
    if (process.platform === "darwin" && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  setupTray(mainWindow);
}

// ─── Global keyboard shortcut ──────────────────────────────────────
function registerGlobalShortcut() {
  // Cmd+Shift+O to toggle OpenClaw window (like Spotlight)
  const shortcut = process.platform === "darwin" ? "CommandOrControl+Shift+O" : "CommandOrControl+Shift+O";
  globalShortcut.register(shortcut, () => {
    if (!mainWindow) {
      createWindow();
      return;
    }
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ─── App lifecycle ─────────────────────────────────────────────────
app.on("before-quit", () => {
  isQuitting = true;
  saveWindowState();
});

app.whenReady().then(async () => {
  registerIpcHandlers();

  // Start local HTTP server for the Control UI (avoids file:// origin issues)
  try {
    localServerPort = await startLocalServer();
    console.log(`Control UI server listening on http://127.0.0.1:${localServerPort}`);
  } catch (err) {
    console.error("Failed to start local UI server:", err);
  }

  // Auto-start gateway if not running
  const config = readOpenClawConfig();
  const gatewayReady = await ensureGateway(config.port);
  if (!gatewayReady) {
    console.warn("Could not start gateway — app will launch but may not connect.");
  }

  createWindow();
  registerGlobalShortcut();

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    destroyTray();
    app.quit();
  }
});

export { mainWindow };
