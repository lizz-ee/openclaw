import { describe, expect, it } from "vitest";

import type { Tab } from "./navigation";
import { setTabFromRoute } from "./app-settings";

type SettingsHost = Parameters<typeof setTabFromRoute>[0];

const createHost = (tab: Tab): SettingsHost => ({
  settings: {
    gatewayUrl: "",
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "grid",
    crtEffects: true,
    chatShowThinking: true,
    canvasCards: null,
    workspaces: [],
  },
  theme: "grid",
  themeResolved: "grid",
  applySessionKey: "main",
  sessionKey: "main",
  tab,
  connected: false,
  chatHasAutoScrolled: false,
  logsAtBottom: false,
  eventLog: [],
  eventLogBuffer: [],
  basePath: "",
});

describe("setTabFromRoute", () => {
  it("updates the tab property", () => {
    const host = createHost("chat");
    setTabFromRoute(host, "logs");
    expect(host.tab).toBe("logs");
  });

  it("resets chatHasAutoScrolled when switching to chat", () => {
    const host = createHost("logs");
    host.chatHasAutoScrolled = true;
    setTabFromRoute(host, "chat");
    expect(host.chatHasAutoScrolled).toBe(false);
  });

  it("does not reset chatHasAutoScrolled for non-chat tabs", () => {
    const host = createHost("chat");
    host.chatHasAutoScrolled = true;
    setTabFromRoute(host, "logs");
    expect(host.chatHasAutoScrolled).toBe(true);
  });
});
