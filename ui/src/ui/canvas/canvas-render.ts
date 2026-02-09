import { html, nothing, type TemplateResult } from "lit";
import type { AppViewState, ToastEntry } from "../app-view-state";
import { CARD_DEFS, type CardId, type CardState } from "./canvas-types";
import { renderCanvasGeometry, rotatingRing } from "./canvas-geometry";
import {
  handleViewportPointerDown,
  handleViewportPointerMove,
  handleViewportPointerUp,
  handleViewportWheel,
  handleCardHeadPointerDown,
  handleCardHeadPointerMove,
  handleCardHeadPointerUp,
  handleResizePointerDown,
  handleResizePointerMove,
  handleResizePointerUp,
  toggleCard,
  openCard,
  focusCard,
  applyWorkspace,
  snapshotWorkspace,
  getMinimapViewport,
  getMinimapCardRect,
  type CanvasHost,
} from "./canvas-interactions";
import { icons } from "../icons";
import { cycleTheme, THEME_LABELS, type ThemeName } from "../theme";
import type { LogLevel, CronRunLogEntry } from "../types";
import { deleteSession } from "../controllers/sessions";
import { formatAgo, formatDurationMs } from "../format";
import {
  formatPresenceAge,
  formatCronSchedule,
  formatCronState,
} from "../presenter";
import { renderChat } from "../views/chat";
import { renderConfig } from "../views/config";
import {
  updateConfigFormValue,
  loadConfig,
  saveConfig,
  applyConfig,
  runUpdate,
} from "../controllers/config";
import { loadChatHistory } from "../controllers/chat";
import { renderExecApprovalPrompt } from "../views/exec-approval";
import { renderGatewayUrlConfirmation } from "../views/gateway-url-confirmation";
import type { EventLogEntry } from "../app-events";
import { modelDisplayName, loadModels } from "../controllers/models";

// Map card IDs to icon keys
const CARD_ICONS: Record<CardId, keyof typeof icons> = {
  chat: "messageSquare",
  system: "monitor",
  channels: "link",
  sessions: "radio",
  activity: "zap",
  log: "scrollText",
  skills: "puzzle",
  cron: "wrench",
  config: "settings",
  nodes: "globe",
  debug: "bug",
};

function switchSession(state: AppViewState, key: string) {
  state.sessionKey = key;
  state.activeModel = null;
  (state as Record<string, unknown>).chatMessage = "";
  state.chatAttachments = [];
  state.chatStream = null;
  state.chatStreamStartedAt = null;
  state.chatRunId = null;
  state.chatQueue = [];
  state.resetToolStream();
  state.resetChatScroll();
  state.applySettings({
    ...state.settings,
    sessionKey: key,
    lastActiveSessionKey: key,
  });
  void state.loadAssistantIdentity();
  void loadChatHistory(state as unknown as Parameters<typeof loadChatHistory>[0]);
}

export function renderCanvas(state: AppViewState): TemplateResult {
  const host = state as unknown as CanvasHost;
  const panX = state.canvasPanX;
  const panY = state.canvasPanY;
  const scale = state.canvasScale;
  const cards = state.canvasCards;
  const theme = state.theme as ThemeName;

  return html`
    <!-- CRT overlays -->
    <div class="crt-scanlines"></div>
    <div class="crt-vignette"></div>
    <div class="crt-bloom"></div>
    <div class="crt-flicker"></div>

    <!-- HUD top bar -->
    ${renderHudTop(state)}

    <!-- Canvas viewport -->
    <div
      class="canvas-viewport ${state.canvasInteraction === 'panning' ? 'panning' : ''}"
      @pointerdown=${(e: PointerEvent) => handleViewportPointerDown(host, e)}
      @pointermove=${(e: PointerEvent) => handleViewportPointerMove(host, e)}
      @pointerup=${() => handleViewportPointerUp(host)}
      @pointercancel=${() => handleViewportPointerUp(host)}
      @wheel=${(e: WheelEvent) => handleViewportWheel(host, e)}
    >
      <div
        class="canvas-world"
        style="zoom: ${scale}; transform: translate(${panX}px, ${panY}px)"
      >
        <!-- Background geometry -->
        ${renderCanvasGeometry(theme)}
        ${rotatingRing}

        <!-- Cards -->
        ${CARD_DEFS.map((def) => {
          const card = cards[def.id];
          if (!card?.open) return nothing;
          return renderCard(state, def.id, card);
        })}
      </div>
    </div>

    <!-- HUD bottom bar -->
    ${renderHudBottom(state)}

    <!-- Minimap -->
    ${renderMinimap(state)}

    <!-- Dock bar -->
    ${renderDockBar(state)}

    <!-- Modal overlays -->
    ${renderExecApprovalPrompt(state)}
    ${renderGatewayUrlConfirmation(state)}
    ${renderSkillDetailPopup(state)}

    <!-- Toasts -->
    ${renderToasts(state)}
  `;
}

function renderCard(
  state: AppViewState,
  cardId: CardId,
  card: CardState,
): TemplateResult {
  const host = state as unknown as CanvasHost;
  const def = CARD_DEFS.find((d) => d.id === cardId)!;
  const isFocused = state.canvasFocusedCard === cardId;
  const isDragging = state.canvasInteraction === "dragging" && state.canvasFocusedCard === cardId;

  return html`
    <div
      class="card ${isFocused ? 'focused' : ''} ${isDragging ? 'dragging' : ''}"
      data-id=${cardId}
      style="left:${card.x}px; top:${card.y}px; width:${card.w}px; height:${card.h}px; z-index:${card.z}"
    >
      <div class="c-tr"></div>
      <div class="c-bl"></div>
      <div
        class="card-head"
        @pointerdown=${(e: PointerEvent) => handleCardHeadPointerDown(host, cardId, e)}
        @pointermove=${(e: PointerEvent) => handleCardHeadPointerMove(host, e)}
        @pointerup=${() => handleCardHeadPointerUp(host)}
        @pointercancel=${() => handleCardHeadPointerUp(host)}
      >
        <span class="card-title">${def.title}</span>
        <div class="card-btns">
          <div
            class="card-btn"
            @click=${(e: Event) => { e.stopPropagation(); toggleCard(host, cardId); }}
          ></div>
        </div>
      </div>
      <div class="card-body ${cardId === 'chat' ? 'card-body--chat' : ''} ${cardId === 'config' ? 'card-body--config' : ''}">
        ${renderCardContent(state, cardId)}
      </div>
      <div
        class="resize-handle"
        @pointerdown=${(e: PointerEvent) => handleResizePointerDown(host, cardId, e)}
        @pointermove=${(e: PointerEvent) => handleResizePointerMove(host, e)}
        @pointerup=${() => handleResizePointerUp(host)}
        @pointercancel=${() => handleResizePointerUp(host)}
      ></div>
    </div>
  `;
}

function renderCardContent(state: AppViewState, cardId: CardId): TemplateResult {
  switch (cardId) {
    case "system": return renderSystemContent(state);
    case "channels": return renderChannelsContent(state);
    case "sessions": return renderSessionsContent(state);
    case "activity": return renderActivityContent(state);
    case "chat": return renderChatContent(state);
    case "log": return renderLogContent(state);
    case "skills": return renderSkillsContent(state);
    case "cron": return renderCronContent(state);
    case "config": return renderConfigContent(state);
    case "nodes": return renderNodesContent(state);
    case "debug": return renderDebugContent(state);
    default: return html``;
  }
}

// ─── CHAT CARD ───

function renderChatContent(state: AppViewState): TemplateResult {
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;

  return renderChat({
    sessionKey: state.sessionKey,
    onSessionKeyChange: (next) => switchSession(state, next),
    thinkingLevel: state.chatThinkingLevel,
    showThinking,
    loading: state.chatLoading,
    sending: state.chatSending,
    compactionStatus: state.compactionStatus,
    messages: state.chatMessages,
    toolMessages: state.chatToolMessages,
    stream: state.chatStream,
    streamStartedAt: state.chatStreamStartedAt,
    draft: state.chatMessage,
    queue: state.chatQueue,
    connected: state.connected,
    canSend: state.connected,
    disabledReason: state.connected ? null : "Disconnected from gateway.",
    error: state.lastError,
    sessions: state.sessionsResult,
    focusMode: false,
    onRefresh: () => {
      state.resetToolStream();
      void loadChatHistory(state as unknown as Parameters<typeof loadChatHistory>[0]);
    },
    onToggleFocusMode: () => {},
    onChatScroll: (event) => state.handleChatScroll(event),
    onDraftChange: (next) => { state.chatMessage = next; },
    attachments: state.chatAttachments,
    onAttachmentsChange: (next) => { state.chatAttachments = next; },
    onSend: () => { void state.handleSendChat(); },
    canAbort: Boolean(state.chatRunId),
    onAbort: () => { void state.handleAbortChat(); },
    onQueueRemove: (id) => state.removeQueuedMessage(id),
    onNewSession: () => { void state.handleSendChat("/new", { restoreDraft: true }); },
    sidebarOpen: state.sidebarOpen,
    sidebarContent: state.sidebarContent,
    sidebarError: state.sidebarError,
    splitRatio: state.splitRatio,
    onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
    onCloseSidebar: () => state.handleCloseSidebar(),
    onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
  });
}

// ─── CONFIG CARD ───

function renderConfigContent(state: AppViewState): TemplateResult {
  return renderConfig({
    raw: state.configRaw,
    originalRaw: state.configRawOriginal,
    valid: state.configValid,
    issues: state.configIssues,
    loading: state.configLoading,
    saving: state.configSaving,
    applying: state.configApplying,
    updating: state.updateRunning,
    connected: state.connected,
    schema: state.configSchema,
    schemaLoading: state.configSchemaLoading,
    uiHints: state.configUiHints,
    formMode: state.configFormMode,
    formValue: state.configForm,
    originalValue: state.configFormOriginal,
    searchQuery: state.configSearchQuery,
    activeSection: state.configActiveSection,
    activeSubsection: state.configActiveSubsection,
    onRawChange: (next) => { state.configRaw = next; },
    onFormModeChange: (mode) => { state.configFormMode = mode; },
    onFormPatch: (path, value) =>
      updateConfigFormValue(
        state as unknown as Parameters<typeof updateConfigFormValue>[0],
        path,
        value,
      ),
    onSearchChange: (query) => { state.configSearchQuery = query; },
    onSectionChange: (section) => {
      state.configActiveSection = section;
      state.configActiveSubsection = null;
    },
    onSubsectionChange: (section) => { state.configActiveSubsection = section; },
    onReload: () => { void loadConfig(state as unknown as Parameters<typeof loadConfig>[0]); },
    onSave: () => { void saveConfig(state as unknown as Parameters<typeof saveConfig>[0]); },
    onApply: () => { void applyConfig(state as unknown as Parameters<typeof applyConfig>[0]); },
    onUpdate: () => { void runUpdate(state as unknown as Parameters<typeof runUpdate>[0]); },
  });
}

// ─── SYSTEM CARD ───

function renderSystemContent(state: AppViewState): TemplateResult {
  const s = state.debugStatus as Record<string, unknown> | null;
  const sessionCount = s?.sessions != null
    ? typeof s.sessions === "number"
      ? s.sessions
      : typeof s.sessions === "object"
        ? (s.sessions as Record<string, unknown>).active ?? (s.sessions as Record<string, unknown>).total ?? Object.keys(s.sessions as object).length
        : String(s.sessions)
    : "—";
  const statusSessions = s?.sessions as { defaults?: { model?: string | null } } | undefined;
  const systemModel = state.activeModel ?? statusSessions?.defaults?.model ?? "—";
  return html`
    <div class="row"><span class="r-label">Gateway</span><span class="r-val ${state.connected ? 'ok' : ''}">${state.connected ? 'ONLINE' : 'OFFLINE'}</span></div>
    <div class="row"><span class="r-label">Model</span><span class="r-val acc">${systemModel}</span></div>
    <div class="row"><span class="r-label">Sessions</span><span class="r-val">${sessionCount}</span></div>
    <div class="row"><span class="r-label">Uptime</span><span class="r-val">${s?.uptimeFormatted ?? s?.uptime ?? '—'}</span></div>
    <div class="row"><span class="r-label">Ticks</span><span class="r-val">${s?.tickCount ?? '—'}</span></div>
    <div class="row"><span class="r-label">API Calls</span><span class="r-val">${s?.apiCalls ?? '—'}</span></div>
    ${!state.connected && !s ? html`<div class="card-empty">Connect to gateway to see status</div>` : nothing}
    ${renderUsageSection(state)}
    ${renderTtsSection(state)}
  `;
}

function renderUsageSection(state: AppViewState): TemplateResult | typeof nothing {
  const usage = state.usageSummary as Record<string, unknown> | null;
  if (!usage) return nothing;

  const totalTokens = typeof usage.totalTokens === "number" ? usage.totalTokens : null;
  const totalCost = typeof usage.totalCost === "number" ? usage.totalCost : null;
  const providers = usage.providers as Record<string, unknown>[] | undefined;

  if (totalTokens == null && totalCost == null) return nothing;

  const formatTokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return html`
    <div class="card-sub" style="margin-top:8px">USAGE (7D)</div>
    ${totalTokens != null ? html`<div class="row"><span class="r-label">Tokens</span><span class="r-val">${formatTokens(totalTokens)}</span></div>` : nothing}
    ${totalCost != null ? html`<div class="row"><span class="r-label">Cost</span><span class="r-val acc">$${totalCost.toFixed(2)}</span></div>` : nothing}
    ${Array.isArray(providers) ? providers.map((p) => {
      const name = String(p.provider ?? p.name ?? "?");
      const cost = typeof p.cost === "number" ? `$${p.cost.toFixed(2)}` : null;
      const tokens = typeof p.tokens === "number" ? formatTokens(p.tokens) : null;
      return html`<div class="row"><span class="r-label" style="padding-left:8px">${name}</span><span class="r-val">${cost ?? tokens ?? '—'}</span></div>`;
    }) : nothing}
  `;
}

function renderTtsSection(state: AppViewState): TemplateResult | typeof nothing {
  const tts = state.ttsStatus;
  if (!tts && state.ttsProviders.length === 0) return nothing;

  const enabled = tts?.enabled ?? false;
  const provider = tts?.provider ?? null;
  const voice = tts?.voice ?? null;
  const providers = state.ttsProviders;
  const busy = state.ttsBusy;

  return html`
    <div class="card-sub" style="margin-top:8px">TTS</div>
    <div class="row">
      <span class="r-label">Status</span>
      <span
        class="tts-toggle ${enabled ? 'tts-toggle--on' : ''} ${busy ? 'tts-toggle--busy' : ''}"
        @click=${() => { if (!busy) void state.handleTtsToggle(!enabled); }}
      >${enabled ? 'ON' : 'OFF'}</span>
      ${provider ? html`<span class="r-val acc" style="margin-left:6px">${provider}</span>` : nothing}
      ${voice ? html`<span class="tts-voice">${voice}</span>` : nothing}
    </div>
    ${providers.length > 0 ? html`
      <div class="row" style="flex-wrap:wrap;gap:4px">
        <span class="r-label">Providers</span>
        ${providers.map(p => html`
          <span
            class="tts-provider ${p.name === provider ? 'tts-provider--active' : ''} ${!p.configured ? 'tts-provider--off' : ''}"
            title="${p.configured ? 'Click to switch' : 'Not configured'}"
            @click=${() => { if (p.configured && !busy) void state.handleTtsSetProvider(p.name); }}
          >${p.name}</span>
        `)}
      </div>
    ` : nothing}
  `;
}

// ─── CHANNELS CARD ───

function renderChannelsContent(state: AppViewState): TemplateResult {
  const snap = state.channelsSnapshot;
  if (!snap) return html`<div class="card-empty">${state.channelsLoading ? 'Loading...' : 'No channel data'}</div>`;

  const order = snap.channelMeta?.map(m => m.id) ?? snap.channelOrder ?? [];

  return html`
    ${order.map(chId => {
      const label = snap.channelLabels?.[chId] ?? chId;
      const accounts = snap.channelAccounts?.[chId] ?? [];
      const hasRunning = accounts.some(a => a.running);
      const hasConnected = accounts.some(a => a.connected);
      const statusClass = hasConnected ? 'ok' : hasRunning ? 'warn' : 'off';
      const statusText = hasConnected ? 'Connected' : hasRunning ? 'Running' : 'Off';
      const showAccounts = accounts.length > 1 ||
        accounts.some(a => a.lastError || (a.configured !== false && a.connected === false && a.running) || (a.reconnectAttempts ?? 0) > 0);

      return html`
        <div class="ch-row">
          <div class="ch-dot ${statusClass}"></div>
          <span class="ch-name">${label}</span>
          <span class="ch-status">${statusText}</span>
          ${accounts.length > 1 ? html`<span class="ch-count">${accounts.length}</span>` : nothing}
        </div>
        ${showAccounts ? accounts.map(a => {
          const aName = a.name ?? a.accountId;
          const aStatus = a.connected ? 'ok' : a.running ? 'warn' : 'off';
          const lastActivity = a.lastInboundAt ?? a.lastOutboundAt ?? a.lastConnectedAt;
          const reconnects = a.reconnectAttempts ?? 0;
          return html`
            <div class="ch-account">
              <div class="ch-dot ch-dot--sm ${aStatus}"></div>
              <span class="ch-account-name">${aName}</span>
              ${lastActivity ? html`<span class="ch-account-age">${formatAgo(lastActivity)}</span>` : nothing}
              ${reconnects > 0 ? html`<span class="ch-reconnect">↻${reconnects}</span>` : nothing}
              ${a.lastError ? html`<div class="ch-error">${a.lastError.length > 40 ? a.lastError.slice(0, 37) + '...' : a.lastError}</div>` : nothing}
            </div>
          `;
        }) : nothing}
      `;
    })}
    ${order.length === 0 ? html`<div class="card-empty">No channels configured</div>` : nothing}
  `;
}

// ─── SESSIONS CARD ───

function formatTokensCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function renderSessionsContent(state: AppViewState): TemplateResult {
  const result = state.sessionsResult;
  if (!result) return html`<div class="card-empty">${state.sessionsLoading ? 'Loading...' : 'No session data'}</div>`;

  const sessions = result.sessions;
  const currentKey = state.sessionKey;
  return html`
    <div class="card-sub">${sessions.length} session${sessions.length !== 1 ? 's' : ''}</div>
    ${sessions.slice(0, 50).map(row => html`
      <div
        class="sess-row ${row.key === currentKey ? 'sess-row--active' : ''}"
        @click=${() => {
          switchSession(state, row.key);
          const host = state as unknown as CanvasHost;
          if (!state.canvasCards.chat?.open) {
            openCard(host, "chat");
          } else {
            focusCard(host, "chat");
          }
        }}
        title="Switch chat to ${row.key}"
      >
        <span class="sess-key">${row.key}</span>
        <span class="sess-label">${row.displayName ?? row.label ?? ''}</span>
        <span class="sess-kind">${row.kind}</span>
        ${row.totalTokens != null ? html`<span class="sess-tokens">${formatTokensCompact(row.totalTokens)} tok</span>` : nothing}
        ${row.model ? html`<span class="sess-model">${row.model}</span>` : nothing}
        <span class="sess-time">${row.updatedAt ? formatAgo(row.updatedAt) : '—'}</span>
        <span
          class="sess-delete"
          title="Delete session"
          @click=${(e: Event) => {
            e.stopPropagation();
            void deleteSession(state as unknown as Parameters<typeof deleteSession>[0], row.key);
          }}
        >×</span>
      </div>
    `)}
  `;
}

// ─── ACTIVITY CARD ───

const EVENT_CATEGORIES: Record<string, { label: string; cls: string }> = {
  chat: { label: "CHAT", cls: "acc" },
  agent: { label: "AGENT", cls: "acc" },
  cron: { label: "CRON", cls: "pri" },
  presence: { label: "NODE", cls: "pri" },
  "exec.approval.requested": { label: "EXEC", cls: "warn" },
  "exec.approval.resolved": { label: "EXEC", cls: "ok" },
  "device.pair.requested": { label: "PAIR", cls: "pri" },
  "device.pair.resolved": { label: "PAIR", cls: "ok" },
};

function renderActivityContent(state: AppViewState): TemplateResult {
  const events = state.eventLog;
  if (events.length === 0) return html`<div class="card-empty">No activity yet</div>`;

  return html`
    <div class="card-sub">${events.length} event${events.length !== 1 ? 's' : ''}</div>
    ${events.slice(0, 50).map((evt) => {
      const cat = EVENT_CATEGORIES[evt.event] ?? { label: evt.event.toUpperCase().slice(0, 6), cls: "dim" };
      const detail = formatEventDetail(evt);
      return html`
        <div class="act-row">
          <div class="act-time">${formatTimeAgo(evt.ts)}</div>
          <span class="act-tag act-tag--${cat.cls}">${cat.label}</span>
          <div class="act-text">${detail}</div>
        </div>
      `;
    })}
  `;
}

function formatEventDetail(evt: EventLogEntry): string {
  const p = evt.payload as Record<string, unknown> | undefined;
  if (!p) return "";
  if (evt.event === "chat") {
    const s = p.state as string | undefined;
    const sk = p.sessionKey as string | undefined;
    return `${s ?? ""} ${sk ? `· ${sk}` : ""}`;
  }
  if (evt.event === "agent") return String(p.method ?? p.type ?? "");
  if (evt.event === "cron") return String(p.jobId ?? p.name ?? "");
  if (evt.event === "exec.approval.requested") return String(p.command ?? p.tool ?? "pending");
  if (evt.event === "exec.approval.resolved") return String(p.decision ?? "resolved");
  return String(p.method ?? p.type ?? "");
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return "NOW";
  if (secs < 60) return `${secs}S`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}M`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}H`;
}

// ─── LOG CARD ───

function renderLogContent(state: AppViewState): TemplateResult {
  const entries = state.logsEntries;
  const filters = state.logsLevelFilters;
  const needle = state.logsFilterText.toLowerCase();

  const filtered = entries.filter(e => {
    if (e.level && !filters[e.level]) return false;
    if (needle && !(
      e.message?.toLowerCase().includes(needle) ||
      e.subsystem?.toLowerCase().includes(needle) ||
      e.raw?.toLowerCase().includes(needle)
    )) return false;
    return true;
  });

  return html`
    <div class="log-filter">
      <input class="log-search" type="text" placeholder="Filter..."
        .value=${state.logsFilterText}
        @input=${(e: Event) => state.handleLogsFilterChange((e.target as HTMLInputElement).value)} />
      <div class="log-levels">
        ${(["info", "warn", "error", "debug"] as LogLevel[]).map(level => html`
          <span class="log-chip ${filters[level] ? 'on' : ''} ${level}"
            @click=${() => state.handleLogsLevelFilterToggle(level)}>${level}</span>
        `)}
      </div>
    </div>
    <div class="log-stream">
      ${filtered.slice(-200).map(e => html`
        <div class="log-row">
          <span class="log-time">${e.time ? formatLogTime(e.time) : ''}</span>
          <span class="log-level ${e.level ?? ''}">${e.level ?? ''}</span>
          <span class="log-sub">${e.subsystem ?? ''}</span>
          <span class="log-msg">${e.message ?? e.raw}</span>
        </div>
      `)}
      ${filtered.length === 0 ? html`<div class="card-empty">${entries.length === 0 ? 'No log entries' : 'No matches'}</div>` : nothing}
    </div>
  `;
}

function formatLogTime(value: string): string {
  try {
    const d = new Date(value);
    return d.toLocaleTimeString([], { hour12: false });
  } catch {
    return value;
  }
}

// ─── SKILLS CARD ───

function renderSkillsContent(state: AppViewState): TemplateResult {
  const report = state.skillsReport;
  if (!report) return html`<div class="card-empty">${state.skillsLoading ? 'Loading...' : 'No skill data'}</div>`;

  const skills = report.skills;
  const needle = state.skillsFilter.toLowerCase();
  const filtered = needle
    ? skills.filter(s => s.name.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle))
    : skills;
  const eligible = skills.filter(s => s.eligible).length;
  const busyKey = state.skillsBusyKey;

  const handleChipClick = (skill: typeof skills[0], e: Event) => {
    e.stopPropagation();
    if (busyKey) return; // already busy
    if (skill.eligible) {
      // ON → disable
      void state.handleToggleSkillEnabled(skill.skillKey, false);
    } else if (skill.disabled) {
      // OFF → enable
      void state.handleToggleSkillEnabled(skill.skillKey, true);
    } else if (skill.install.length > 0 && skill.missing.bins.length > 0) {
      // NEED → install
      void state.handleInstallSkill(skill.skillKey);
    }
  };

  const chipLabel = (skill: typeof skills[0]) => {
    if (busyKey === skill.skillKey) return '···';
    if (skill.eligible) return 'ON';
    if (skill.disabled) return 'OFF';
    return 'NEED';
  };

  const chipClass = (skill: typeof skills[0]) => {
    if (busyKey === skill.skillKey) return 'busy';
    if (skill.eligible) return 'ok';
    if (skill.disabled) return 'off';
    return 'warn';
  };

  const isClickable = (skill: typeof skills[0]) =>
    !busyKey && (skill.eligible || skill.disabled || (skill.install.length > 0 && skill.missing.bins.length > 0));

  const truncDesc = (desc: string, max = 60) =>
    desc.length > max ? desc.slice(0, max) + '…' : desc;

  return html`
    <div class="card-sub">${eligible}/${skills.length} eligible</div>
    <input class="card-search" type="text" placeholder="Filter skills..."
      .value=${state.skillsFilter}
      @input=${(e: Event) => { (state as Record<string, unknown>).skillsFilter = (e.target as HTMLInputElement).value; }} />
    ${filtered.map(skill => html`
      <div class="skill-row clickable" title="${skill.description}"
        @click=${() => { (state as Record<string, unknown>).skillDetailKey = skill.skillKey; }}>
        <span class="skill-emoji">${skill.emoji ?? ''}</span>
        <div class="skill-info">
          <span class="skill-name">${skill.name}</span>
          ${skill.description ? html`<span class="skill-desc">${truncDesc(skill.description)}</span>` : nothing}
        </div>
        <span class="chip skill-chip ${chipClass(skill)} ${isClickable(skill) ? 'clickable' : ''}"
          @click=${(e: Event) => handleChipClick(skill, e)}>${chipLabel(skill)}</span>
      </div>
    `)}
  `;
}

// ─── SKILL DETAIL POPUP ───

function renderSkillDetailPopup(state: AppViewState): TemplateResult | typeof nothing {
  const key = state.skillDetailKey;
  if (!key) return nothing;
  const skill = state.skillsReport?.skills.find(s => s.skillKey === key);
  if (!skill) return nothing;

  const busy = state.skillsBusyKey === key;
  const message = state.skillMessages[key] ?? null;
  const apiKeyDraft = state.skillEdits[key] ?? "";
  const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;
  const missing = [
    ...skill.missing.bins.map(b => `bin: ${b}`),
    ...skill.missing.env.map(e => `env: ${e}`),
    ...skill.missing.config.map(c => `config: ${c}`),
    ...skill.missing.os.map(o => `os: ${o}`),
  ];

  const close = () => { (state as Record<string, unknown>).skillDetailKey = null; };

  return html`
    <div class="skill-popup-overlay" @click=${close}>
      <div class="skill-popup" @click=${(e: Event) => e.stopPropagation()}>
        <div class="skill-popup-header">
          <div class="skill-popup-title">
            ${skill.emoji ? html`<span class="skill-popup-emoji">${skill.emoji}</span>` : nothing}
            ${skill.name}
          </div>
          <button class="skill-popup-close" @click=${close}>×</button>
        </div>

        <div class="skill-popup-desc">${skill.description}</div>

        <div class="skill-popup-chips">
          <span class="chip">${skill.source}</span>
          <span class="chip ${skill.eligible ? 'ok' : 'warn'}">${skill.eligible ? 'eligible' : 'blocked'}</span>
          ${skill.disabled ? html`<span class="chip off">disabled</span>` : nothing}
          ${skill.blockedByAllowlist ? html`<span class="chip warn">allowlisted</span>` : nothing}
        </div>

        ${missing.length > 0 ? html`
          <div class="skill-popup-section">
            <div class="skill-popup-label">Missing requirements</div>
            <div class="skill-popup-missing">
              ${missing.map(m => html`<span class="chip warn">${m}</span>`)}
            </div>
          </div>
        ` : nothing}

        ${message ? html`
          <div class="skill-popup-message ${message.kind}">${message.message}</div>
        ` : nothing}

        <div class="skill-popup-actions">
          <button class="skill-popup-btn ${skill.disabled ? 'primary' : ''}"
            ?disabled=${busy}
            @click=${() => void state.handleToggleSkillEnabled(skill.skillKey, skill.disabled)}>
            ${busy ? '···' : skill.disabled ? 'Enable' : 'Disable'}
          </button>
          ${canInstall ? html`
            <button class="skill-popup-btn primary"
              ?disabled=${busy}
              @click=${() => void state.handleInstallSkill(skill.skillKey)}>
              ${busy ? 'Installing...' : skill.install[0].label}
            </button>
          ` : nothing}
          ${skill.install.length > 1 ? skill.install.slice(1).map(opt => html`
            <button class="skill-popup-btn"
              ?disabled=${busy}
              @click=${() => {
                if (!state.client || busy) return;
                state.skillsBusyKey = skill.skillKey;
                void state.client.request("skills.install", {
                  name: skill.name, installId: opt.id, timeoutMs: 120000,
                }).then(() => void state.handleLoadSkills())
                  .finally(() => { (state as Record<string, unknown>).skillsBusyKey = null; });
              }}>
              ${opt.label}
            </button>
          `) : nothing}
        </div>

        ${skill.primaryEnv ? html`
          <div class="skill-popup-section">
            <div class="skill-popup-label">API Key <span class="skill-popup-env">${skill.primaryEnv}</span></div>
            <div class="skill-popup-key-row">
              <input class="skill-popup-input" type="password"
                placeholder="Enter API key..."
                .value=${apiKeyDraft}
                @input=${(e: Event) => state.handleUpdateSkillEdit(skill.skillKey, (e.target as HTMLInputElement).value)} />
              <button class="skill-popup-btn primary"
                ?disabled=${busy || !apiKeyDraft.trim()}
                @click=${() => void state.handleSaveSkillApiKey(skill.skillKey, apiKeyDraft)}>
                Save
              </button>
            </div>
          </div>
        ` : nothing}

        ${skill.homepage ? html`
          <div class="skill-popup-footer">
            <a class="skill-popup-link" href="${skill.homepage}" target="_blank" rel="noopener">Documentation →</a>
          </div>
        ` : nothing}
      </div>
    </div>
  `;
}

// ─── CRON CARD ───

function renderCronContent(state: AppViewState): TemplateResult {
  const status = state.cronStatus;
  const jobs = state.cronJobs;

  if (!status && jobs.length === 0) return html`<div class="card-empty">${state.cronLoading ? 'Loading...' : 'No cron data'}</div>`;

  return html`
    <div class="card-sub">${status?.enabled ? 'ACTIVE' : 'PAUSED'} · ${jobs.length} job${jobs.length !== 1 ? 's' : ''}</div>
    ${jobs.map(job => {
      const nextMs = job.state?.nextRunAtMs;
      const nextIn = nextMs && nextMs > Date.now() && nextMs - Date.now() < 3_600_000
        ? `in ${formatDurationMs(nextMs - Date.now())}`
        : null;
      const isExpanded = state.cronRunsJobId === job.id;
      return html`
        <div class="cron-row">
          <div class="cron-top">
            <span class="cron-name">${job.name}</span>
            <div class="cron-actions">
              ${nextIn ? html`<span class="cron-next">${nextIn}</span>` : nothing}
              <span class="chip ${job.enabled ? 'ok' : 'off'}">${job.enabled ? 'ON' : 'OFF'}</span>
              <button class="cron-run-btn" title="Run now" @click=${(e: Event) => {
                e.stopPropagation();
                void state.handleCronRun(job.id);
              }}>▶</button>
              <button class="cron-run-btn" title="${isExpanded ? 'Collapse' : 'History'}" @click=${(e: Event) => {
                e.stopPropagation();
                if (isExpanded) {
                  (state as Record<string, unknown>).cronRunsJobId = null;
                  (state as Record<string, unknown>).cronRuns = [];
                } else {
                  void state.handleCronRunsLoad(job.id);
                }
              }}>${isExpanded ? '▾' : '▸'}</button>
            </div>
          </div>
          <div class="cron-sched">${formatCronSchedule(job)}</div>
          ${job.state ? html`<div class="cron-state">${formatCronState(job)}</div>` : nothing}
          ${job.state?.lastError ? html`<div class="cron-run-error">${job.state.lastError.length > 60 ? job.state.lastError.slice(0, 57) + '...' : job.state.lastError}</div>` : nothing}
          ${isExpanded ? renderCronRuns(state.cronRuns) : nothing}
        </div>
      `;
    })}
  `;
}

function renderCronRuns(runs: CronRunLogEntry[]): TemplateResult {
  if (runs.length === 0) return html`<div class="card-empty" style="font-size:10px">No run history</div>`;
  return html`
    <div class="cron-runs">
      ${runs.slice(0, 10).map(run => {
        const dotClass = run.status === "ok" ? "ok" : run.status === "error" ? "err" : "dim";
        return html`
          <div class="cron-run-row">
            <span class="cron-run-dot ${dotClass}"></span>
            <span class="cron-run-status">${run.status}</span>
            ${run.durationMs != null ? html`<span class="cron-run-dur">${formatDurationMs(run.durationMs)}</span>` : nothing}
            <span class="cron-run-age">${formatAgo(run.ts)}</span>
            ${run.error ? html`<span class="cron-run-error">${run.error.length > 40 ? run.error.slice(0, 37) + '...' : run.error}</span>` : nothing}
          </div>
        `;
      })}
    </div>
  `;
}

// ─── NODES CARD ───

function formatIdleBadge(seconds: number | null | undefined): { text: string; cls: string } {
  if (seconds == null) return { text: "—", cls: "" };
  if (seconds < 120) return { text: "active", cls: "node-idle--active" };
  if (seconds < 900) {
    const m = Math.round(seconds / 60);
    return { text: `idle ${m}m`, cls: "node-idle--warn" };
  }
  const h = Math.round(seconds / 3600);
  if (h > 0) return { text: `idle ${h}h`, cls: "node-idle--stale" };
  const m = Math.round(seconds / 60);
  return { text: `idle ${m}m`, cls: "node-idle--stale" };
}

function renderNodesContent(state: AppViewState): TemplateResult {
  const nodes = state.nodes;
  const entries = state.presenceEntries;

  // Prefer node.list if available (richer data), fallback to presence
  if (nodes.length > 0) {
    return html`
      <div class="card-sub">${nodes.length} node${nodes.length !== 1 ? 's' : ''}</div>
      ${nodes.map(n => {
        const nodeId = String(n.nodeId ?? n.displayName ?? "unknown");
        const displayName = String(n.displayName ?? n.nodeId ?? "unknown");
        const connected = Boolean(n.connected);
        const paired = Boolean(n.paired);
        const caps = Array.isArray(n.caps) ? n.caps : [];
        const platform = n.platform ? String(n.platform) : null;
        const version = n.version ? String(n.version) : null;
        const ip = n.remoteIp ? String(n.remoteIp) : null;
        const connectedAtMs = typeof n.connectedAtMs === "number" ? n.connectedAtMs : null;
        const connectedDur = connected && connectedAtMs ? formatDurationMs(Date.now() - connectedAtMs) : null;
        // Match presence entry for idle data
        const presence = entries.find(e => e.host === displayName || e.instanceId === nodeId);
        const idle = formatIdleBadge(presence?.lastInputSeconds);

        return html`
          <div class="node-row">
            <div class="node-top">
              <div class="ch-dot ${connected ? 'ok' : 'off'}"></div>
              <span class="node-host">${displayName}</span>
              ${paired ? html`<span class="chip ok">PAIRED</span>` : html`<span class="chip off">UNPAIRED</span>`}
              ${caps.length > 0 ? html`<span class="node-caps">${caps.length} caps</span>` : nothing}
              ${connectedDur ? html`<span class="node-connected-dur">↑${connectedDur}</span>` : nothing}
            </div>
            <div class="node-detail">
              ${platform ? html`<span class="chip">${platform}</span>` : nothing}
              ${version ? html`<span class="chip">${version}</span>` : nothing}
              ${ip ? html`<span class="node-ip">${ip}</span>` : nothing}
              <span class="node-idle ${idle.cls}">${idle.text}</span>
            </div>
          </div>
        `;
      })}
    `;
  }

  // Fallback to presence entries
  if (entries.length === 0) return html`<div class="card-empty">${state.presenceLoading ? 'Loading...' : 'No nodes online'}</div>`;

  return html`
    <div class="card-sub">${entries.length} node${entries.length !== 1 ? 's' : ''}</div>
    ${entries.map(entry => {
      const idle = formatIdleBadge(entry.lastInputSeconds);
      return html`
        <div class="node-row">
          <div class="node-top">
            <div class="ch-dot ok"></div>
            <span class="node-host">${entry.host ?? 'unknown'}</span>
          </div>
          <div class="node-detail">
            ${entry.platform ? html`<span class="chip">${entry.platform}</span>` : nothing}
            ${entry.version ? html`<span class="chip">${entry.version}</span>` : nothing}
            <span class="node-idle ${idle.cls}">${idle.text}</span>
          </div>
          <div class="node-age">${formatPresenceAge(entry)}</div>
        </div>
      `;
    })}
  `;
}

// ─── DEBUG CARD ───

function renderDebugContent(state: AppViewState): TemplateResult {
  const status = state.debugStatus;
  const health = state.debugHealth;

  return html`
    <div class="debug-section">
      <div class="card-sub">STATUS</div>
      ${status ? html`<pre class="json-block">${JSON.stringify(status, null, 2)}</pre>` : html`<div class="card-empty">Not loaded</div>`}
    </div>
    <div class="debug-section">
      <div class="card-sub">HEALTH</div>
      ${health ? html`<pre class="json-block">${JSON.stringify(health, null, 2)}</pre>` : html`<div class="card-empty">Not loaded</div>`}
    </div>
    <div class="debug-section">
      <div class="card-sub">RPC CALL</div>
      <div class="rpc-form">
        <input class="rpc-input" type="text" placeholder="method"
          .value=${state.debugCallMethod}
          @input=${(e: Event) => { (state as Record<string, unknown>).debugCallMethod = (e.target as HTMLInputElement).value; }} />
        <textarea class="rpc-input" placeholder='{"key": "value"}' rows="3"
          .value=${state.debugCallParams}
          @input=${(e: Event) => { (state as Record<string, unknown>).debugCallParams = (e.target as HTMLTextAreaElement).value; }}></textarea>
        <button class="rpc-btn" @click=${() => state.handleDebugCall()}>CALL</button>
      </div>
      ${state.debugCallResult ? html`<pre class="json-block ok">${state.debugCallResult}</pre>` : nothing}
      ${state.debugCallError ? html`<pre class="json-block err">${state.debugCallError}</pre>` : nothing}
    </div>
  `;
}

// ─── HUD ───

function renderHudTop(state: AppViewState): TemplateResult {
  const connected = state.connected;
  const debug = state.debugStatus as Record<string, unknown> | null;
  const sessions = (debug as Record<string, unknown> | null)?.sessions as
    | { defaults?: { model?: string | null } }
    | undefined;
  const defaultModel = sessions?.defaults?.model ?? null;
  const displayModel = state.activeModel ?? defaultModel ?? "—";
  // Ollama dot: use live probe result (ollamaOk is null when no Ollama configured)
  const ollamaDot = state.ollamaOk === true ? "ok" : state.ollamaOk === false ? "warn" : "off";
  const channelCount = state.channelsSnapshot?.channelOrder?.length ?? 0;
  const presenceTotal = state.presenceEntries.length;
  const idleCount = state.presenceEntries.filter(e => e.lastInputSeconds != null && e.lastInputSeconds >= 120).length;
  const clock = new Date(state.hudClockTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const hasRun = Boolean(state.chatRunId);
  const queueDepth = state.chatQueue.length;
  const uptime = debug?.uptimeFormatted ?? debug?.uptime ?? null;
  const pickerOpen = state.modelPickerOpen;
  const quickOpen = state.quickPickerOpen;
  const models = state.availableModels;
  const quickModels = state.quickModels;

  // Group models by provider for display
  const grouped = new Map<string, typeof models>();
  for (const m of models) {
    const key = m.provider ?? "other";
    const list = grouped.get(key);
    if (list) list.push(m);
    else grouped.set(key, [m]);
  }

  const togglePicker = () => {
    const opening = !state.modelPickerOpen;
    state.modelPickerOpen = opening;
    state.quickPickerOpen = false;
    if (opening) {
      // Re-fetch models each time picker opens
      void loadModels(state as unknown as Parameters<typeof loadModels>[0]);
    }
  };
  const closePicker = () => { state.modelPickerOpen = false; };
  const toggleQuickPicker = () => {
    state.quickPickerOpen = !state.quickPickerOpen;
    state.modelPickerOpen = false;
  };
  const closeQuickPicker = () => { state.quickPickerOpen = false; };
  const applyModel = (name: string) => {
    state.activeModel = name;
    state.modelPickerOpen = false;
    state.quickPickerOpen = false;
    // Use /model directive — the gateway's own mechanism that properly
    // persists the override to the session store and affects future runs.
    void state.handleSendChat(`/model ${name}`, { restoreDraft: true });
  };
  const selectModel = (m: typeof models[number]) => applyModel(modelDisplayName(m));
  const selectQuickModel = (name: string) => applyModel(name);

  const renderModelItem = (m: typeof models[number]) => {
    const name = modelDisplayName(m);
    const active = name === displayModel;
    return html`
      <div class="model-picker-item ${active ? 'active' : ''}"
           @click=${() => selectModel(m)}>
        <span class="model-picker-name">${name}</span>
        ${active ? html`<span class="model-picker-check">●</span>` : nothing}
      </div>
    `;
  };

  // Shorten a model name for the quick picker label (strip provider prefix)
  const shortModelName = (name: string) => {
    const slash = name.indexOf("/");
    return slash >= 0 ? name.slice(slash + 1) : name;
  };

  return html`
    <div class="hud-top">
      <span class="hud-brand">OpenClaw</span>
      <div class="hud-sep"></div>
      <div class="hud-item">
        <div class="hud-dot ${connected ? 'ok' : 'off'}"></div>
        Gateway
      </div>
      <div class="hud-item">
        <div class="hud-dot ${ollamaDot}"></div>
        Ollama
      </div>
      <div class="hud-item">
        <div class="hud-dot ${state.lmstudioOk === true ? 'ok' : state.lmstudioOk === false ? 'warn' : 'off'}"></div>
        LM Studio
      </div>
      <div class="hud-item">
        <div class="hud-dot ${channelCount > 0 ? 'ok' : 'off'}"></div>
        ${channelCount} Ch
      </div>
      ${idleCount > 0 && presenceTotal >= 2 ? html`
        <div class="hud-item">
          <div class="hud-dot warn"></div>
          ${idleCount} idle
        </div>
      ` : nothing}
      ${hasRun ? html`
        <div class="hud-item">
          <div class="hud-dot ok hud-dot--pulse"></div>
          Run
        </div>
      ` : nothing}
      ${queueDepth > 0 ? html`
        <div class="hud-item hud-item--acc">${queueDepth} queued</div>
      ` : nothing}
      <div class="hud-spacer"></div>
      ${uptime != null ? html`<div class="hud-item hud-uptime">UP ${uptime}</div>` : nothing}
      ${quickModels.length > 0 ? html`
        <div class="hud-model-wrap">
          <div class="hud-quick-model" @click=${toggleQuickPicker}>
            <span class="hud-quick-label">Linked</span> ▾
          </div>
          ${quickOpen ? html`
            <div class="model-picker-backdrop" @click=${closeQuickPicker}></div>
            <div class="model-picker quick-picker">
              <div class="model-picker-header">LINKED MODELS</div>
              ${(() => {
                // Group quick models by provider prefix
                const qGrouped = new Map<string, string[]>();
                for (const name of quickModels) {
                  const slash = name.indexOf("/");
                  const provider = slash >= 0 ? name.slice(0, slash) : "other";
                  const list = qGrouped.get(provider);
                  if (list) list.push(name);
                  else qGrouped.set(provider, [name]);
                }
                return Array.from(qGrouped.entries()).map(([provider, names]) => html`
                  <div class="model-picker-divider">
                    <span class="model-picker-divider-text">${provider.toUpperCase()}</span>
                  </div>
                  ${names.map(name => {
                    const active = name === displayModel;
                    return html`
                      <div class="model-picker-item ${active ? 'active' : ''}"
                           @click=${() => selectQuickModel(name)}>
                        <span class="model-picker-name">${shortModelName(name)}</span>
                        ${active ? html`<span class="model-picker-check">●</span>` : nothing}
                      </div>
                    `;
                  })}
                `);
              })()}
            </div>
          ` : nothing}
        </div>
      ` : nothing}
      <div class="hud-model-wrap">
        <div class="hud-model" @click=${togglePicker}>${displayModel} ▾</div>
        ${pickerOpen ? html`
          <div class="model-picker-backdrop" @click=${closePicker}></div>
          <div class="model-picker">
            <div class="model-picker-header">ALL MODELS</div>
            ${models.length === 0
              ? html`<div class="model-picker-empty">No models available</div>`
              : nothing}
            ${Array.from(grouped.entries()).map(([provider, items]) => html`
              <div class="model-picker-divider">
                <span class="model-picker-divider-text">${provider.toUpperCase()}</span>
              </div>
              ${items.map(renderModelItem)}
            `)}
          </div>
        ` : nothing}
      </div>
      <div class="hud-sep"></div>
      <span class="hud-clock">${clock}</span>
    </div>
  `;
}

function renderHudBottom(state: AppViewState): TemplateResult {
  const x = Math.round(-state.canvasPanX);
  const y = Math.round(-state.canvasPanY);
  const zoom = Math.round(state.canvasScale * 100);
  const error = state.lastError;

  return html`
    <div class="hud-bottom">
      <span class="hud-coord">x: ${x}  y: ${y}</span>
      <div style="width:1px;height:10px;background:var(--pri-border)"></div>
      <span class="hud-zoom">${zoom}%</span>
      ${error ? html`
        <div style="width:1px;height:10px;background:var(--pri-border)"></div>
        <span class="hud-error">${error}</span>
      ` : nothing}
      <div style="flex:1"></div>
      <span class="hud-hint">drag to pan · scroll to zoom · drag headers to move cards</span>
      <div style="width:1px;height:10px;background:var(--pri-border)"></div>
      <span style="color:var(--pri-dim)">⌘⇧O toggle</span>
    </div>
  `;
}

// ─── MINIMAP ───

function renderMinimap(state: AppViewState): TemplateResult {
  const host = state as unknown as CanvasHost;
  const vp = getMinimapViewport(host);
  const cards = state.canvasCards;

  return html`
    <div class="minimap">
      <span class="minimap-label">Map</span>
      <div
        class="minimap-viewport"
        style="left:${vp.left}px; top:${vp.top}px; width:${vp.width}px; height:${vp.height}px"
      ></div>
      ${CARD_DEFS.map((def) => {
        const card = cards[def.id];
        if (!card?.open) return nothing;
        const r = getMinimapCardRect(card);
        return html`
          <div
            class="minimap-card"
            style="left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${r.height}px"
          ></div>
        `;
      })}
    </div>
  `;
}

// ─── DOCK BAR ───

function countBadge(state: AppViewState, cardId: string): number {
  switch (cardId) {
    case "channels": {
      const snap = state.channelsSnapshot;
      if (!snap?.channelAccounts) return 0;
      let count = 0;
      for (const accounts of Object.values(snap.channelAccounts)) {
        for (const a of accounts) {
          if (a.configured !== false && a.connected === false && a.running) count++;
        }
      }
      return count;
    }
    case "cron": {
      return state.cronJobs.filter((j) => j.state?.lastStatus === "error").length;
    }
    case "system":
      return state.execApprovalQueue.length;
    default:
      return 0;
  }
}

type DockGroup = { cards: CardId[]; label: string };

export const DOCK_GROUPS: DockGroup[] = [
  { cards: ["chat", "system"], label: "Command" },
  { cards: ["channels", "sessions", "activity", "log"], label: "Control" },
  { cards: ["skills", "cron", "nodes"], label: "Agent" },
  { cards: ["config", "debug"], label: "Settings" },
];

function renderDockBar(state: AppViewState): TemplateResult {
  const host = state as unknown as CanvasHost;
  const cards = state.canvasCards;
  const theme = state.theme as ThemeName;
  const hasRun = Boolean(state.chatRunId);
  const hasApproval = state.execApprovalQueue.length > 0;
  const workspaces = state.workspaces;

  const loadWorkspace = (ws: typeof workspaces[number]) => {
    applyWorkspace(host, ws);
    state.activeWorkspaceId = ws.id;
  };
  const deleteWorkspace = (e: Event, id: string) => {
    e.stopPropagation();
    state.workspaces = workspaces.filter(w => w.id !== id);
    if (state.activeWorkspaceId === id) state.activeWorkspaceId = null;
    state.applySettings({ ...state.settings, workspaces: state.workspaces });
  };
  const startNaming = () => {
    state.workspaceNaming = true;
    state.workspaceNameDraft = "";
  };
  const commitWorkspace = () => {
    if (!state.workspaceNaming) return; // guard against Enter + blur double-commit
    const label = state.workspaceNameDraft.trim().toUpperCase().slice(0, 6) || "WS";
    const ws = snapshotWorkspace(host, label);
    state.workspaces = [...workspaces, ws];
    state.activeWorkspaceId = ws.id;
    state.workspaceNaming = false;
    state.workspaceNameDraft = "";
    state.applySettings({ ...state.settings, workspaces: state.workspaces });
  };
  const cancelNaming = () => {
    state.workspaceNaming = false;
    state.workspaceNameDraft = "";
  };

  return html`
    <div class="dock-bar">
      <!-- Saved workspaces -->
      ${workspaces.map(ws => html`
        <div
          class="dock-item dock-item--ws ${state.activeWorkspaceId === ws.id ? 'active' : ''}"
          @click=${() => loadWorkspace(ws)}
        >
          <span class="dock-tooltip">${ws.label}</span>
          <span class="dock-ws-label">${ws.label}</span>
          <span class="dock-ws-delete" @click=${(e: Event) => deleteWorkspace(e, ws.id)}>×</span>
        </div>
      `)}
      ${state.workspaceNaming ? html`
        <div class="dock-item dock-item--ws dock-ws-input-wrap">
          <input
            class="dock-ws-input"
            type="text"
            maxlength="6"
            placeholder="NAME"
            .value=${state.workspaceNameDraft}
            @input=${(e: Event) => { state.workspaceNameDraft = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") commitWorkspace();
              if (e.key === "Escape") cancelNaming();
            }}
            @blur=${() => { if (state.workspaceNameDraft.trim()) commitWorkspace(); else cancelNaming(); }}
          />
        </div>
      ` : workspaces.length < 6 ? html`
        <div class="dock-item dock-item--ws dock-ws-add" @click=${startNaming}>
          <span class="dock-tooltip">Save workspace</span>
          <span class="dock-ws-label">+</span>
        </div>
      ` : nothing}
      ${workspaces.length > 0 || state.workspaceNaming ? html`<div class="dock-sep"></div>` : nothing}
      <!-- Card toggles -->
      ${DOCK_GROUPS.map((group, gi) => html`
        ${group.cards.map((cardId) => {
          const card = cards[cardId as CardId];
          const def = CARD_DEFS.find((d) => d.id === cardId)!;
          const isOpen = card?.open ?? false;
          const iconKey = CARD_ICONS[cardId as CardId];
          const pulse = (cardId === "chat" && !isOpen && hasRun) ||
                        (cardId === "system" && !isOpen && hasApproval);
          const badge = countBadge(state, cardId);
          return html`
            <div
              class="dock-item ${isOpen ? 'active' : ''} ${pulse ? 'dock-item--pulse' : ''}"
              @click=${() => toggleCard(host, cardId as CardId)}
            >
              <span class="dock-tooltip">${def.title}</span>
              ${icons[iconKey]}
              ${badge > 0 ? html`<span class="dock-badge">${badge > 9 ? '9+' : badge}</span>` : nothing}
            </div>
          `;
        })}
        ${gi < DOCK_GROUPS.length - 1 ? html`<div class="dock-sep"></div>` : nothing}
      `)}
      <div class="dock-sep"></div>
      <div
        class="dock-item"
        @click=${() => {
          const next = cycleTheme(theme);
          state.setTheme(next as any);
        }}
      >
        <span class="dock-tooltip">${THEME_LABELS[theme]}</span>
        ${icons.monitor}
      </div>
    </div>
  `;
}

// ─── TOASTS ───

const TOAST_SEVERITY_CLS: Record<ToastEntry["severity"], string> = {
  info: "toast--info",
  warn: "toast--warn",
  error: "toast--error",
  ok: "toast--ok",
};

function renderToasts(state: AppViewState): TemplateResult | typeof nothing {
  if (state.toasts.length === 0) return nothing;
  return html`
    <div class="toast-container">
      ${state.toasts.map(t => html`
        <div class="toast ${TOAST_SEVERITY_CLS[t.severity]}">
          <div class="toast-title">${t.title}</div>
          <div class="toast-msg">${t.message}</div>
          <span class="toast-close" @click=${() => state.dismissToast(t.id)}>×</span>
        </div>
      `)}
    </div>
  `;
}
