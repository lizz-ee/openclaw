import { loadConfig, loadConfigSchema } from "./controllers/config";
import { loadCronJobs, loadCronStatus } from "./controllers/cron";
import { loadChannels } from "./controllers/channels";
import { loadDebug } from "./controllers/debug";
import { loadLogs } from "./controllers/logs";
import { loadDevices } from "./controllers/devices";
import { loadNodes } from "./controllers/nodes";
import { loadExecApprovals } from "./controllers/exec-approvals";
import { loadPresence } from "./controllers/presence";
import { loadSessions } from "./controllers/sessions";
import { loadSkills } from "./controllers/skills";
import {
  inferBasePathFromPathname,
  normalizeBasePath,
  normalizePath,
  pathForTab,
  tabFromPath,
  type Tab,
} from "./navigation";
import { saveSettings, type UiSettings } from "./storage";
import { type ThemeName } from "./theme";
import { startThemeTransition, type ThemeTransitionContext } from "./theme-transition";
import { scheduleChatScroll } from "./app-scroll";
import { refreshChat } from "./app-chat";
import type { OpenClawApp } from "./app";
import type { CardId, CardState } from "./canvas/canvas-types";

type SettingsHost = {
  settings: UiSettings;
  theme: ThemeName;
  themeResolved: string;
  applySessionKey: string;
  sessionKey: string;
  tab: Tab;
  connected: boolean;
  chatHasAutoScrolled: boolean;
  logsAtBottom: boolean;
  eventLog: unknown[];
  eventLogBuffer: unknown[];
  basePath: string;
  pendingGatewayUrl?: string | null;
  canvasCards?: Record<CardId, CardState>;
};

export function applySettings(host: SettingsHost, next: UiSettings) {
  const normalized = {
    ...next,
    lastActiveSessionKey: next.lastActiveSessionKey?.trim() || next.sessionKey.trim() || "main",
  };
  host.settings = normalized;
  saveSettings(normalized);
  if (next.theme !== host.theme) {
    host.theme = next.theme;
    applyTheme(host, next.theme);
  }
  host.applySessionKey = host.settings.lastActiveSessionKey;
}

export function setLastActiveSessionKey(host: SettingsHost, next: string) {
  const trimmed = next.trim();
  if (!trimmed) return;
  if (host.settings.lastActiveSessionKey === trimmed) return;
  applySettings(host, { ...host.settings, lastActiveSessionKey: trimmed });
}

export function applySettingsFromUrl(host: SettingsHost) {
  if (!window.location.search) return;
  const params = new URLSearchParams(window.location.search);
  const tokenRaw = params.get("token");
  const passwordRaw = params.get("password");
  const sessionRaw = params.get("session");
  const gatewayUrlRaw = params.get("gatewayUrl");
  let shouldCleanUrl = false;

  if (tokenRaw != null) {
    const token = tokenRaw.trim();
    if (token && token !== host.settings.token) {
      applySettings(host, { ...host.settings, token });
    }
    params.delete("token");
    shouldCleanUrl = true;
  }

  if (passwordRaw != null) {
    const password = passwordRaw.trim();
    if (password) {
      (host as unknown as { password: string }).password = password;
    }
    params.delete("password");
    shouldCleanUrl = true;
  }

  if (sessionRaw != null) {
    const session = sessionRaw.trim();
    if (session) {
      host.sessionKey = session;
      applySettings(host, {
        ...host.settings,
        sessionKey: session,
        lastActiveSessionKey: session,
      });
    }
  }

  if (gatewayUrlRaw != null) {
    const gatewayUrl = gatewayUrlRaw.trim();
    if (gatewayUrl && gatewayUrl !== host.settings.gatewayUrl) {
      host.pendingGatewayUrl = gatewayUrl;
    }
    params.delete("gatewayUrl");
    shouldCleanUrl = true;
  }

  if (!shouldCleanUrl) return;
  const url = new URL(window.location.href);
  url.search = params.toString();
  window.history.replaceState({}, "", url.toString());
}

export function setTheme(host: SettingsHost, next: ThemeName, context?: ThemeTransitionContext) {
  const apply = () => {
    host.theme = next;
    applySettings(host, { ...host.settings, theme: next });
    applyTheme(host, next);
  };
  startThemeTransition({
    nextTheme: next,
    applyTheme: apply,
    context,
    currentTheme: host.theme,
  });
}

export async function refreshActiveTab(host: SettingsHost) {
  if (!host.canvasCards) return;
  const open = Object.entries(host.canvasCards)
    .filter(([, c]) => c?.open)
    .map(([id]) => id as CardId);
  if (open.length === 0) return;
  const loads: Promise<unknown>[] = [];
  const app = host as unknown as OpenClawApp;
  for (const id of open) {
    if (id === "chat") {
      loads.push(
        refreshChat(app as unknown as Parameters<typeof refreshChat>[0]).then(() => {
          scheduleChatScroll(
            app as unknown as Parameters<typeof scheduleChatScroll>[0],
            !host.chatHasAutoScrolled,
          );
        }),
      );
    }
    if (id === "system" || id === "debug") {
      loads.push(loadDebug(app));
      host.eventLog = host.eventLogBuffer;
    }
    if (id === "channels") loads.push(loadChannels(app, false));
    if (id === "sessions") loads.push(loadSessions(app));
    if (id === "skills") loads.push(loadSkills(app));
    if (id === "cron") loads.push(loadCronStatus(app), loadCronJobs(app));
    if (id === "config") loads.push(loadConfigSchema(app), loadConfig(app));
    if (id === "nodes") {
      loads.push(loadPresence(app), loadNodes(app), loadDevices(app), loadExecApprovals(app));
    }
    if (id === "log") {
      host.logsAtBottom = true;
      loads.push(loadLogs(app, { reset: true }));
    }
  }
  await Promise.all(loads);
}

export function inferBasePath() {
  if (typeof window === "undefined") return "";
  const configured = window.__OPENCLAW_CONTROL_UI_BASE_PATH__;
  if (typeof configured === "string" && configured.trim()) {
    return normalizeBasePath(configured);
  }
  return inferBasePathFromPathname(window.location.pathname);
}

export function syncThemeWithSettings(host: SettingsHost) {
  const theme = host.settings.theme ?? "grid";
  host.theme = theme as ThemeName;
  applyTheme(host, host.theme);
}

export function applyTheme(host: SettingsHost, theme: ThemeName) {
  host.themeResolved = theme;
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = "dark";

  // Apply CRT toggle
  if (host.settings.crtEffects === false) {
    root.classList.add("crt-off");
  } else {
    root.classList.remove("crt-off");
  }
}

export function syncTabWithLocation(host: SettingsHost, replace: boolean) {
  if (typeof window === "undefined") return;
  const resolved = tabFromPath(window.location.pathname, host.basePath) ?? "chat";
  setTabFromRoute(host, resolved);
  syncUrlWithTab(host, resolved, replace);
}

export function onPopState(host: SettingsHost) {
  if (typeof window === "undefined") return;
  const resolved = tabFromPath(window.location.pathname, host.basePath);
  if (!resolved) return;

  const url = new URL(window.location.href);
  const session = url.searchParams.get("session")?.trim();
  if (session) {
    host.sessionKey = session;
    applySettings(host, {
      ...host.settings,
      sessionKey: session,
      lastActiveSessionKey: session,
    });
  }

  setTabFromRoute(host, resolved);
}

export function setTabFromRoute(host: SettingsHost, next: Tab) {
  if (host.tab !== next) host.tab = next;
  if (next === "chat") host.chatHasAutoScrolled = false;
  if (host.connected) void refreshActiveTab(host);
}

export function syncUrlWithTab(host: SettingsHost, tab: Tab, replace: boolean) {
  if (typeof window === "undefined") return;
  const targetPath = normalizePath(pathForTab(tab, host.basePath));
  const currentPath = normalizePath(window.location.pathname);
  const url = new URL(window.location.href);

  if (tab === "chat" && host.sessionKey) {
    url.searchParams.set("session", host.sessionKey);
  } else {
    url.searchParams.delete("session");
  }

  if (currentPath !== targetPath) {
    url.pathname = targetPath;
  }

  if (replace) {
    window.history.replaceState({}, "", url.toString());
  } else {
    window.history.pushState({}, "", url.toString());
  }
}

export function syncUrlWithSessionKey(host: SettingsHost, sessionKey: string, replace: boolean) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionKey);
  if (replace) window.history.replaceState({}, "", url.toString());
  else window.history.pushState({}, "", url.toString());
}

export async function loadCron(host: SettingsHost) {
  await Promise.all([
    loadChannels(host as unknown as OpenClawApp, false),
    loadCronStatus(host as unknown as OpenClawApp),
    loadCronJobs(host as unknown as OpenClawApp),
  ]);
}
