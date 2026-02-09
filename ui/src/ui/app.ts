import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway";
import { resolveInjectedAssistantIdentity } from "./assistant-identity";
import { loadSettings, saveSettings, type UiSettings } from "./storage";
import { renderCanvas, DOCK_GROUPS } from "./canvas/canvas-render";
import { toggleCard, openCard, focusCard, type CanvasHost } from "./canvas/canvas-interactions";
import type { Tab } from "./navigation";
import type { ThemeName } from "./theme";
import { type CardId, type CardState, type CanvasInteraction, type SavedWorkspace, getDefaultCardStates } from "./canvas/canvas-types";
import type {
  AgentsListResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types";
import type { EventLogEntry } from "./app-events";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals";
import type { DevicePairingList } from "./controllers/devices";
import type { ExecApprovalRequest } from "./controllers/exec-approval";
import type { SkillMessage } from "./controllers/skills";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
} from "./app-tool-stream";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
} from "./app-scroll";
import { connectGateway as connectGatewayInternal } from "./app-gateway";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
} from "./app-settings";
import {
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
} from "./app-chat";
import {
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity";
import { loadDebug as loadDebugInternal, loadUsage as loadUsageInternal } from "./controllers/debug";
import {
  loadTtsStatus as loadTtsStatusInternal,
  loadTtsProviders as loadTtsProvidersInternal,
  toggleTts as toggleTtsInternal,
  setTtsProvider as setTtsProviderInternal,
  type TtsStatusResult,
  type TtsProviderEntry,
} from "./controllers/tts";
import { loadLogs as loadLogsInternal } from "./controllers/logs";
import { loadSessions as loadSessionsInternal } from "./controllers/sessions";
import {
  loadSkills as loadSkillsInternal,
  updateSkillEnabled as updateSkillEnabledInternal,
  installSkill as installSkillInternal,
  updateSkillEdit as updateSkillEditInternal,
  saveSkillApiKey as saveSkillApiKeyInternal,
} from "./controllers/skills";
import { loadPresence as loadPresenceInternal } from "./controllers/presence";
import { loadNodes as loadNodesInternal } from "./controllers/nodes";
import { loadChatHistory as loadChatHistoryInternal } from "./controllers/chat";
import { loadConfig as loadConfigInternal } from "./controllers/config";
import { loadLinkedModels as loadLinkedModelsInternal, type ModelEntry } from "./controllers/models";

declare global {
  interface Window {
    __OPENCLAW_CONTROL_UI_BASE_PATH__?: string;
  }
}

const injectedAssistantIdentity = resolveInjectedAssistantIdentity();

function resolveOnboardingMode(): boolean {
  if (!window.location.search) return false;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("openclaw-app")
export class OpenClawApp extends LitElement {
  @state() settings: UiSettings = loadSettings();
  @state() password = "";
  @state() tab: Tab = "chat";
  @state() onboarding = resolveOnboardingMode();
  @state() connected = false;
  @state() theme: ThemeName = (this.settings.theme as ThemeName) ?? "grid";
  @state() themeResolved = "grid";
  @state() hello: GatewayHelloOk | null = null;
  @state() lastError: string | null = null;
  @state() eventLog: EventLogEntry[] = [];
  private eventLogBuffer: EventLogEntry[] = [];
  private toolStreamSyncTimer: number | null = null;
  private sidebarCloseTimer: number | null = null;

  // Canvas state
  @state() canvasPanX = -1600;
  @state() canvasPanY = -600;
  @state() canvasScale = 1;
  @state() canvasInteraction: CanvasInteraction = "idle";
  @state() canvasCards: Record<CardId, CardState> = this.settings.canvasCards as Record<CardId, CardState> ?? getDefaultCardStates();
  @state() canvasFocusedCard: CardId | null = null;
  @state() canvasNextZ = 100;
  @state() hudClockTime = Date.now();
  @state() availableModels: ModelEntry[] = [];
  @state() quickModels: string[] = [];
  @state() modelPickerOpen = false;
  @state() quickPickerOpen = false;
  @state() activeModel: string | null = null;
  @state() ollamaOk: boolean | null = null;
  @state() lmstudioOk: boolean | null = null;
  @state() workspaces: SavedWorkspace[] = this.settings.workspaces ?? [];
  @state() activeWorkspaceId: string | null = null;
  @state() workspaceNaming = false;
  @state() workspaceNameDraft = "";
  private clockInterval: number | null = null;

  @state() assistantName = injectedAssistantIdentity.name;
  @state() assistantAvatar = injectedAssistantIdentity.avatar;
  @state() assistantAgentId = injectedAssistantIdentity.agentId ?? null;

  @state() sessionKey = this.settings.sessionKey;
  @state() chatLoading = false;
  @state() chatSending = false;
  @state() chatMessage = "";
  @state() chatMessages: unknown[] = [];
  @state() chatToolMessages: unknown[] = [];
  @state() chatStream: string | null = null;
  @state() chatStreamStartedAt: number | null = null;
  @state() chatRunId: string | null = null;
  @state() compactionStatus: import("./app-tool-stream").CompactionStatus | null = null;
  @state() chatThinkingLevel: string | null = null;
  @state() chatQueue: ChatQueueItem[] = [];
  @state() chatAttachments: ChatAttachment[] = [];
  // Sidebar state for tool output viewing
  @state() sidebarOpen = false;
  @state() sidebarContent: string | null = null;
  @state() sidebarError: string | null = null;
  @state() splitRatio = 0.55;

  @state() nodesLoading = false;
  @state() nodes: Array<Record<string, unknown>> = [];
  @state() devicesLoading = false;
  @state() devicesError: string | null = null;
  @state() devicesList: DevicePairingList | null = null;
  @state() execApprovalsLoading = false;
  @state() execApprovalsSaving = false;
  @state() execApprovalsDirty = false;
  @state() execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  @state() execApprovalsForm: ExecApprovalsFile | null = null;
  @state() execApprovalsSelectedAgent: string | null = null;
  @state() execApprovalsTarget: "gateway" | "node" = "gateway";
  @state() execApprovalsTargetNodeId: string | null = null;
  @state() execApprovalQueue: ExecApprovalRequest[] = [];
  @state() execApprovalBusy = false;
  @state() execApprovalError: string | null = null;
  @state() pendingGatewayUrl: string | null = null;

  @state() configLoading = false;
  @state() configRaw = "{\n}\n";
  @state() configRawOriginal = "";
  @state() configValid: boolean | null = null;
  @state() configIssues: unknown[] = [];
  @state() configSaving = false;
  @state() configApplying = false;
  @state() updateRunning = false;
  @state() applySessionKey = this.settings.lastActiveSessionKey;
  @state() configSnapshot: ConfigSnapshot | null = null;
  @state() configSchema: unknown | null = null;
  @state() configSchemaVersion: string | null = null;
  @state() configSchemaLoading = false;
  @state() configUiHints: ConfigUiHints = {};
  @state() configForm: Record<string, unknown> | null = null;
  @state() configFormOriginal: Record<string, unknown> | null = null;
  @state() configFormDirty = false;
  @state() configFormMode: "form" | "raw" = "form";
  @state() configSearchQuery = "";
  @state() configActiveSection: string | null = null;
  @state() configActiveSubsection: string | null = null;

  @state() channelsLoading = false;
  @state() channelsSnapshot: ChannelsStatusSnapshot | null = null;
  @state() channelsError: string | null = null;
  @state() channelsLastSuccess: number | null = null;
  @state() whatsappLoginMessage: string | null = null;
  @state() whatsappLoginQrDataUrl: string | null = null;
  @state() whatsappLoginConnected: boolean | null = null;
  @state() whatsappBusy = false;
  @state() nostrProfileFormState: NostrProfileFormState | null = null;
  @state() nostrProfileAccountId: string | null = null;

  @state() presenceLoading = false;
  @state() presenceEntries: PresenceEntry[] = [];
  @state() presenceError: string | null = null;
  @state() presenceStatus: string | null = null;

  @state() agentsLoading = false;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentsError: string | null = null;

  @state() sessionsLoading = false;
  @state() sessionsResult: SessionsListResult | null = null;
  @state() sessionsError: string | null = null;
  @state() sessionsFilterActive = "";
  @state() sessionsFilterLimit = "120";
  @state() sessionsIncludeGlobal = true;
  @state() sessionsIncludeUnknown = false;

  @state() cronLoading = false;
  @state() cronJobs: CronJob[] = [];
  @state() cronStatus: CronStatus | null = null;
  @state() cronError: string | null = null;
  @state() cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  @state() cronRunsJobId: string | null = null;
  @state() cronRuns: CronRunLogEntry[] = [];
  @state() cronBusy = false;

  @state() skillsLoading = false;
  @state() skillsReport: SkillStatusReport | null = null;
  @state() skillsError: string | null = null;
  @state() skillsFilter = "";
  @state() skillEdits: Record<string, string> = {};
  @state() skillsBusyKey: string | null = null;
  @state() skillDetailKey: string | null = null;
  @state() skillMessages: Record<string, SkillMessage> = {};

  @state() debugLoading = false;
  @state() debugStatus: StatusSummary | null = null;
  @state() debugHealth: HealthSnapshot | null = null;
  @state() debugModels: unknown[] = [];
  @state() debugHeartbeat: unknown | null = null;
  @state() debugCallMethod = "";
  @state() debugCallParams = "{}";
  @state() debugCallResult: string | null = null;
  @state() debugCallError: string | null = null;
  @state() usageSummary: unknown | null = null;
  @state() toasts: import("./app-view-state").ToastEntry[] = [];
  private toastCounter = 0;
  @state() ttsStatus: TtsStatusResult | null = null;
  @state() ttsProviders: TtsProviderEntry[] = [];
  @state() ttsBusy = false;

  @state() logsLoading = false;
  @state() logsError: string | null = null;
  @state() logsFile: string | null = null;
  @state() logsEntries: LogEntry[] = [];
  @state() logsFilterText = "";
  @state() logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  @state() logsAutoFollow = true;
  @state() logsTruncated = false;
  @state() logsCursor: number | null = null;
  @state() logsLastFetchAt: number | null = null;
  @state() logsLimit = 500;
  @state() logsMaxBytes = 250_000;
  @state() logsAtBottom = true;

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  private nodesPollInterval: number | null = null;
  private logsPollInterval: number | null = null;
  private debugPollInterval: number | null = null;
  private localDiscoveryInterval: number | null = null;
  private logsScrollFrame: number | null = null;
  private toolStreamById = new Map<string, ToolStreamEntry>();
  private toolStreamOrder: string[] = [];
  refreshSessionsAfterChat = new Set<string>();
  basePath = "";
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  private topbarObserver: ResizeObserver | null = null;
  private _boundKeydown = this._handleGlobalKeydown.bind(this);

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
    this.clockInterval = window.setInterval(() => {
      this.hudClockTime = Date.now();
    }, 1000);
    // Re-probe Ollama + LM Studio every 15s so dots update live
    this.localDiscoveryInterval = window.setInterval(() => {
      if (this.connected) {
        void loadLinkedModelsInternal(this as unknown as Parameters<typeof loadLinkedModelsInternal>[0]);
      }
    }, 15_000);
    document.addEventListener("keydown", this._boundKeydown);
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
  }

  disconnectedCallback() {
    document.removeEventListener("keydown", this._boundKeydown);
    if (this.clockInterval != null) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
    if (this.localDiscoveryInterval != null) {
      clearInterval(this.localDiscoveryInterval);
      this.localDiscoveryInterval = null;
    }
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
  }

  setTheme(next: ThemeName, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      messageOverride,
      opts,
    );
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.execApprovalQueue[0];
    if (!active || !this.client || this.execApprovalBusy) return;
    this.execApprovalBusy = true;
    this.execApprovalError = null;
    try {
      await this.client.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      this.execApprovalQueue = this.execApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.execApprovalError = `Exec approval failed: ${String(err)}`;
    } finally {
      this.execApprovalBusy = false;
    }
  }

  handleGatewayUrlConfirm() {
    const nextGatewayUrl = this.pendingGatewayUrl;
    if (!nextGatewayUrl) return;
    this.pendingGatewayUrl = null;
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], {
      ...this.settings,
      gatewayUrl: nextGatewayUrl,
    });
    this.connect();
  }

  handleGatewayUrlCancel() {
    this.pendingGatewayUrl = null;
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarContent = content;
    this.sidebarError = null;
    this.sidebarOpen = true;
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
    // Clear content after transition
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = window.setTimeout(() => {
      if (this.sidebarOpen) return;
      this.sidebarContent = null;
      this.sidebarError = null;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  handleSplitRatioChange(ratio: number) {
    this.splitRatio = Math.max(0.4, Math.min(0.7, ratio));
  }

  pushToast(severity: import("./app-view-state").ToastEntry["severity"], title: string, message: string) {
    const id = `toast-${++this.toastCounter}-${Date.now()}`;
    const entry: import("./app-view-state").ToastEntry = { id, ts: Date.now(), severity, title, message };
    this.toasts = [entry, ...this.toasts].slice(0, 8);
    window.setTimeout(() => this.dismissToast(id), 5000);
  }

  dismissToast(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  async handleTtsToggle(enabled: boolean) {
    await toggleTtsInternal(this as unknown as Parameters<typeof toggleTtsInternal>[0], enabled);
  }

  async handleTtsSetProvider(provider: string) {
    await setTtsProviderInternal(this as unknown as Parameters<typeof setTtsProviderInternal>[0], provider);
  }

  // ─── Skill handlers ───

  async handleLoadSkills() {
    await loadSkillsInternal(this as unknown as Parameters<typeof loadSkillsInternal>[0]);
  }

  async handleToggleSkillEnabled(key: string, enabled: boolean) {
    await updateSkillEnabledInternal(this as unknown as Parameters<typeof updateSkillEnabledInternal>[0], key, enabled);
  }

  async handleInstallSkill(key: string) {
    const skill = this.skillsReport?.skills.find((s) => s.skillKey === key);
    if (!skill || skill.install.length === 0) return;
    const opt = skill.install[0];
    await installSkillInternal(
      this as unknown as Parameters<typeof installSkillInternal>[0],
      key, skill.name, opt.id,
    );
  }

  async handleUpdateSkill(_key: string) {
    await loadSkillsInternal(this as unknown as Parameters<typeof loadSkillsInternal>[0]);
  }

  handleUpdateSkillEdit(key: string, value: string) {
    updateSkillEditInternal(this as unknown as Parameters<typeof updateSkillEditInternal>[0], key, value);
  }

  async handleSaveSkillApiKey(key: string, _apiKey: string) {
    await saveSkillApiKeyInternal(this as unknown as Parameters<typeof saveSkillApiKeyInternal>[0], key);
  }

  saveCanvasState() {
    this.applySettings({
      ...this.settings,
      canvasCards: { ...this.canvasCards },
    });
  }

  onCardOpen(cardId: string) {
    switch (cardId) {
      case "chat":
        loadChatHistoryInternal(this as unknown as Parameters<typeof loadChatHistoryInternal>[0]);
        loadSessionsInternal(this as unknown as Parameters<typeof loadSessionsInternal>[0]);
        break;
      case "system":
        loadDebugInternal(this as unknown as Parameters<typeof loadDebugInternal>[0]);
        loadUsageInternal(this as unknown as Parameters<typeof loadUsageInternal>[0]);
        loadTtsStatusInternal(this as unknown as Parameters<typeof loadTtsStatusInternal>[0]);
        loadTtsProvidersInternal(this as unknown as Parameters<typeof loadTtsProvidersInternal>[0]);
        break;
      case "debug":
        loadDebugInternal(this as unknown as Parameters<typeof loadDebugInternal>[0]);
        break;
      case "channels":
        this.handleChannelConfigReload();
        break;
      case "sessions":
        loadSessionsInternal(this as unknown as Parameters<typeof loadSessionsInternal>[0]);
        break;
      case "activity":
        this.eventLog = this.eventLogBuffer;
        break;
      case "log":
        loadLogsInternal(this as unknown as Parameters<typeof loadLogsInternal>[0]);
        break;
      case "skills":
        loadSkillsInternal(this as unknown as Parameters<typeof loadSkillsInternal>[0]);
        break;
      case "cron":
        this.loadCron();
        break;
      case "config":
        loadConfigInternal(this as unknown as Parameters<typeof loadConfigInternal>[0]);
        break;
      case "nodes":
        loadPresenceInternal(this as unknown as Parameters<typeof loadPresenceInternal>[0]);
        loadNodesInternal(this as unknown as Parameters<typeof loadNodesInternal>[0]);
        break;
    }
  }

  private _handleGlobalKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if ((e.target as HTMLElement)?.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const host = this as unknown as CanvasHost;

    // 1-9: toggle dock cards
    const digit = parseInt(e.key, 10);
    if (digit >= 1 && digit <= 9) {
      const flatCards = DOCK_GROUPS.flatMap((g) => g.cards);
      const cardId = flatCards[digit - 1];
      if (cardId) {
        e.preventDefault();
        toggleCard(host, cardId as CardId);
      }
      return;
    }

    // /: focus chat input
    if (e.key === "/") {
      e.preventDefault();
      if (!this.canvasCards.chat?.open) {
        openCard(host, "chat" as CardId);
      } else {
        focusCard(host, "chat" as CardId);
      }
      requestAnimationFrame(() => {
        const textarea = document.querySelector(".card-body--chat textarea") as HTMLTextAreaElement | null;
        textarea?.focus();
      });
      return;
    }

    // Escape: close focused card
    if (e.key === "Escape" && this.canvasFocusedCard) {
      e.preventDefault();
      toggleCard(host, this.canvasFocusedCard);
      return;
    }
  }

  render() {
    return renderCanvas(this as unknown as Parameters<typeof renderCanvas>[0]);
  }
}
