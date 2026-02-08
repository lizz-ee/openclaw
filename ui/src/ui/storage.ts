const KEY = "openclaw.control.settings.v1";

import type { ThemeName } from "./theme";
import type { CardId, CardState, SavedWorkspace } from "./canvas/canvas-types";

export type UiSettings = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
  lastActiveSessionKey: string;
  theme: ThemeName;
  crtEffects: boolean;
  chatShowThinking: boolean;
  canvasCards: Record<string, CardState> | null;
  workspaces: SavedWorkspace[];
};

export function loadSettings(): UiSettings {
  // start.sh passes ?resetSettings=1 to clear stale data on fresh launch
  if (typeof location !== "undefined") {
    const params = new URLSearchParams(location.search);
    if (params.get("resetSettings") === "1") {
      localStorage.removeItem(KEY);
      // Clean the URL so reloads don't keep resetting
      params.delete("resetSettings");
      const clean = params.toString();
      const newUrl = location.pathname + (clean ? `?${clean}` : "") + location.hash;
      history.replaceState(null, "", newUrl);
    }
  }

  const defaultUrl = (() => {
    // Electron file:// has no host; fall back to localhost gateway
    if (location.protocol === "file:" || !location.host) {
      return "ws://127.0.0.1:18789";
    }
    // Vite dev server runs on a non-gateway port; connect to gateway directly
    const port = location.port;
    if (port && port !== "18789") {
      return `ws://${location.hostname}:18789`;
    }
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}`;
  })();

  const defaults: UiSettings = {
    gatewayUrl: defaultUrl,
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "grid",
    crtEffects: true,
    chatShowThinking: true,
    canvasCards: null,
    workspaces: [],
  };

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return {
      gatewayUrl: (() => {
        const saved = typeof parsed.gatewayUrl === "string" ? parsed.gatewayUrl.trim() : "";
        if (!saved) return defaultUrl;
        // If saved URL points at the current page's host:port (auto-detected, not gateway),
        // override with the correct gateway URL to avoid stale dev-server URLs
        try {
          const u = new URL(saved.replace(/^ws/, "http"));
          if (u.hostname === location.hostname && u.port === location.port && u.port !== "18789") {
            return defaultUrl;
          }
        } catch { /* keep saved */ }
        return saved;
      })(),
      token: typeof parsed.token === "string" ? parsed.token : defaults.token,
      sessionKey:
        typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()
          ? parsed.sessionKey.trim()
          : defaults.sessionKey,
      lastActiveSessionKey:
        typeof parsed.lastActiveSessionKey === "string" && parsed.lastActiveSessionKey.trim()
          ? parsed.lastActiveSessionKey.trim()
          : (typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()) ||
            defaults.lastActiveSessionKey,
      theme:
        parsed.theme === "grid" || parsed.theme === "outlands" || parsed.theme === "endofline"
          ? parsed.theme
          : defaults.theme,
      crtEffects:
        typeof parsed.crtEffects === "boolean" ? parsed.crtEffects : defaults.crtEffects,
      chatShowThinking:
        typeof parsed.chatShowThinking === "boolean"
          ? parsed.chatShowThinking
          : defaults.chatShowThinking,
      canvasCards:
        typeof parsed.canvasCards === "object" && parsed.canvasCards !== null
          ? parsed.canvasCards
          : defaults.canvasCards,
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : defaults.workspaces,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(next: UiSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
}
