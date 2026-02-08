import { app, Tray, Menu, nativeImage, type BrowserWindow } from "electron";
import path from "node:path";

let tray: Tray | null = null;
let currentWindow: BrowserWindow | null = null;

export function setupTray(mainWindow: BrowserWindow) {
  currentWindow = mainWindow;

  // Use a template image for macOS menu bar (16x16)
  const iconPath = path.join(
    __dirname,
    "..",
    "assets",
    "chrome-extension",
    "icons",
    "icon16.png"
  );
  const icon = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 16, height: 16 });
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("OpenClaw");

  updateTrayMenu();

  tray.on("click", () => {
    if (currentWindow) {
      if (currentWindow.isVisible()) {
        currentWindow.focus();
      } else {
        currentWindow.show();
        currentWindow.focus();
      }
    }
  });
}

export function updateTrayMenu() {
  if (!tray || !currentWindow) return;

  const win = currentWindow;
  const isVisible = win.isVisible();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isVisible ? "Hide OpenClaw" : "Show OpenClaw",
      click: () => {
        if (win.isVisible()) {
          win.hide();
        } else {
          win.show();
          win.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "New Chat Session",
      click: () => {
        win.show();
        win.focus();
        win.webContents.executeJavaScript(
          `document.querySelector("openclaw-app")?.shadowRoot?.querySelector('[data-tab="chat"]')?.click()`
        );
      },
    },
    {
      label: "Open Dashboard",
      click: () => {
        win.show();
        win.focus();
        win.webContents.executeJavaScript(
          `document.querySelector("openclaw-app")?.shadowRoot?.querySelector('[data-tab="overview"]')?.click()`
        );
      },
    },
    { type: "separator" },
    {
      label: "Toggle Shortcut: Cmd+Shift+O",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Quit OpenClaw",
      accelerator: "CommandOrControl+Q",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
  currentWindow = null;
}
