import { ALL_CARD_IDS, type CardId, type CardState, type SavedWorkspace } from "./canvas-types";

const WORLD_W = 6000;
const WORLD_H = 4000;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3.0;
const MIN_CARD_W = 200;
const MIN_CARD_H = 120;
const ZOOM_IN_FACTOR = 1.08;
const ZOOM_OUT_FACTOR = 0.92;

export type CanvasHost = {
  canvasPanX: number;
  canvasPanY: number;
  canvasScale: number;
  canvasInteraction: "idle" | "panning" | "dragging" | "resizing";
  canvasCards: Record<CardId, CardState>;
  canvasFocusedCard: CardId | null;
  canvasNextZ: number;
  saveCanvasState: () => void;
  onCardOpen?: (cardId: CardId) => void;
};

// ─── PAN ───

let panStartScreenX = 0;
let panStartScreenY = 0;
let panStartPanX = 0;
let panStartPanY = 0;

export function handleViewportPointerDown(host: CanvasHost, e: PointerEvent) {
  // Only pan if we didn't click on a card
  const target = e.target as HTMLElement;
  if (target.closest(".card")) return;

  host.canvasInteraction = "panning";
  panStartScreenX = e.clientX;
  panStartScreenY = e.clientY;
  panStartPanX = host.canvasPanX;
  panStartPanY = host.canvasPanY;

  const viewport = target.closest(".canvas-viewport") as HTMLElement;
  if (viewport) viewport.setPointerCapture(e.pointerId);
}

export function handleViewportPointerMove(host: CanvasHost, e: PointerEvent) {
  if (host.canvasInteraction !== "panning") return;
  // CSS zoom multiplies translate values, so divide mouse delta by scale
  host.canvasPanX = panStartPanX + (e.clientX - panStartScreenX) / host.canvasScale;
  host.canvasPanY = panStartPanY + (e.clientY - panStartScreenY) / host.canvasScale;
}

export function handleViewportPointerUp(host: CanvasHost) {
  if (host.canvasInteraction === "panning") {
    host.canvasInteraction = "idle";
  }
}

// ─── ZOOM ───

export function handleViewportWheel(host: CanvasHost, e: WheelEvent) {
  // Allow normal scrolling inside card bodies
  const target = e.target as HTMLElement;
  if (target.closest(".card-body")) {
    let el: HTMLElement | null = target;
    while (el && !el.classList.contains("canvas-viewport")) {
      if (el.scrollHeight > el.clientHeight + 1) {
        const atTop = el.scrollTop <= 0 && e.deltaY < 0;
        const atBottom =
          el.scrollTop + el.clientHeight >= el.scrollHeight - 1 &&
          e.deltaY > 0;
        if (!atTop && !atBottom) return; // let the card body scroll
      }
      el = el.parentElement as HTMLElement | null;
    }
  }

  e.preventDefault();
  const mx = e.clientX;
  const my = e.clientY;

  // Use getBoundingClientRect to get the actual screen position of the world
  // element — works correctly regardless of how CSS zoom interacts with transform.
  const worldEl = (e.currentTarget as HTMLElement).querySelector(".canvas-world") as HTMLElement;
  if (!worldEl) return;
  const worldRect = worldEl.getBoundingClientRect();

  // World coordinates under cursor before zoom
  const worldX = (mx - worldRect.left) / host.canvasScale;
  const worldY = (my - worldRect.top) / host.canvasScale;

  const oldScale = host.canvasScale;
  const factor = e.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR;
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * factor));
  if (newScale === oldScale) return;
  host.canvasScale = newScale;

  // After zoom the world point must stay at (mx, my).
  // newWorldRect.left = mx - worldX * newScale
  // panX scales with zoom: worldRect.left = panX * scale
  // So: panX_new = (mx - worldX * newScale) / newScale
  host.canvasPanX = (mx - worldX * newScale) / newScale;
  host.canvasPanY = (my - worldY * newScale) / newScale;
}

// ─── CARD DRAG ───

let dragCardId: CardId | null = null;
let dragOffX = 0;
let dragOffY = 0;

export function handleCardHeadPointerDown(host: CanvasHost, cardId: CardId, e: PointerEvent) {
  e.stopPropagation();
  dragCardId = cardId;

  // Focus the card
  focusCard(host, cardId);

  host.canvasInteraction = "dragging";

  // Calculate offset from pointer to card top-left in screen space
  const cardEl = (e.target as HTMLElement).closest(".card") as HTMLElement;
  const worldEl = cardEl?.parentElement;
  if (!cardEl || !worldEl) return;

  const cardRect = cardEl.getBoundingClientRect();
  dragOffX = e.clientX - cardRect.left;
  dragOffY = e.clientY - cardRect.top;

  (e.target as HTMLElement).setPointerCapture(e.pointerId);
}

export function handleCardHeadPointerMove(host: CanvasHost, e: PointerEvent) {
  if (!dragCardId || host.canvasInteraction !== "dragging") return;

  const card = host.canvasCards[dragCardId];
  if (!card) return;

  // Convert screen position to world coordinates
  const worldEl = document.querySelector(".canvas-world");
  if (!worldEl) return;
  const worldRect = worldEl.getBoundingClientRect();

  const newLeft = (e.clientX - worldRect.left - dragOffX) / host.canvasScale;
  const newTop = (e.clientY - worldRect.top - dragOffY) / host.canvasScale;

  host.canvasCards = {
    ...host.canvasCards,
    [dragCardId]: { ...card, x: newLeft, y: newTop },
  };
}

export function handleCardHeadPointerUp(host: CanvasHost) {
  if (host.canvasInteraction === "dragging") {
    host.canvasInteraction = "idle";
    host.saveCanvasState();
  }
  dragCardId = null;
}

// ─── CARD RESIZE ───

let resizeCardId: CardId | null = null;
let resizeStartW = 0;
let resizeStartH = 0;
let resizeStartMX = 0;
let resizeStartMY = 0;

export function handleResizePointerDown(host: CanvasHost, cardId: CardId, e: PointerEvent) {
  e.stopPropagation();
  resizeCardId = cardId;

  const card = host.canvasCards[cardId];
  if (!card) return;

  resizeStartW = card.w;
  resizeStartH = card.h;
  resizeStartMX = e.clientX;
  resizeStartMY = e.clientY;

  host.canvasInteraction = "resizing";
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
}

export function handleResizePointerMove(host: CanvasHost, e: PointerEvent) {
  if (!resizeCardId || host.canvasInteraction !== "resizing") return;

  const card = host.canvasCards[resizeCardId];
  if (!card) return;

  const dw = (e.clientX - resizeStartMX) / host.canvasScale;
  const dh = (e.clientY - resizeStartMY) / host.canvasScale;

  host.canvasCards = {
    ...host.canvasCards,
    [resizeCardId]: {
      ...card,
      w: Math.max(MIN_CARD_W, resizeStartW + dw),
      h: Math.max(MIN_CARD_H, resizeStartH + dh),
    },
  };
}

export function handleResizePointerUp(host: CanvasHost) {
  if (host.canvasInteraction === "resizing") {
    host.canvasInteraction = "idle";
    host.saveCanvasState();
  }
  resizeCardId = null;
}

// ─── CARD FOCUS ───

export function focusCard(host: CanvasHost, cardId: CardId) {
  if (host.canvasFocusedCard === cardId) return;
  host.canvasFocusedCard = cardId;

  const card = host.canvasCards[cardId];
  if (!card) return;

  const nextZ = host.canvasNextZ++;
  host.canvasCards = {
    ...host.canvasCards,
    [cardId]: { ...card, z: nextZ },
  };
}

// ─── CARD TOGGLE ───

export function toggleCard(host: CanvasHost, cardId: CardId) {
  const card = host.canvasCards[cardId];
  if (!card) return;

  const wasOpen = card.open;
  host.canvasCards = {
    ...host.canvasCards,
    [cardId]: { ...card, open: !wasOpen },
  };

  if (!wasOpen) {
    // Opening: focus it and load data
    focusCard(host, cardId);
    host.onCardOpen?.(cardId);
  }

  host.saveCanvasState();
}

// ─── MINIMAP ───

const MM_W = 160;
const MM_H = 100;

export function getMinimapViewport(host: CanvasHost) {
  const sx = MM_W / WORLD_W;
  const sy = MM_H / WORLD_H;

  // With zoom: S; transform: translate(panX, panY), screen origin maps to
  // world position -panX (zoom multiplies translate, so screen 0 = panX * S
  // → worldX = 0/S - panX = -panX)
  const vw = window.innerWidth / host.canvasScale;
  const vh = (window.innerHeight - 58) / host.canvasScale; // 34 top + 24 bottom
  const vx = -host.canvasPanX;
  const vy = -host.canvasPanY;

  return {
    left: vx * sx,
    top: vy * sy,
    width: vw * sx,
    height: vh * sy,
  };
}

export function getMinimapCardRect(card: CardState) {
  const sx = MM_W / WORLD_W;
  const sy = MM_H / WORLD_H;
  return {
    left: card.x * sx,
    top: card.y * sy,
    width: card.w * sx,
    height: card.h * sy,
  };
}

// ─── CARD OPEN (without toggle) ───

export function openCard(host: CanvasHost, cardId: CardId) {
  const card = host.canvasCards[cardId];
  if (!card || card.open) return;
  host.canvasCards = {
    ...host.canvasCards,
    [cardId]: { ...card, open: true },
  };
  focusCard(host, cardId);
  host.onCardOpen?.(cardId);
  host.saveCanvasState();
}

// ─── WORKSPACES ───

export function applyWorkspace(host: CanvasHost, workspace: SavedWorkspace) {
  const newlyOpened: CardId[] = [];
  const next = { ...host.canvasCards };
  for (const id of ALL_CARD_IDS) {
    const saved = workspace.cards[id];
    if (!saved) continue;
    const wasOpen = next[id]?.open ?? false;
    next[id] = { ...saved };
    if (saved.open && !wasOpen) newlyOpened.push(id);
  }
  host.canvasCards = next;
  host.canvasPanX = workspace.panX;
  host.canvasPanY = workspace.panY;
  host.canvasScale = workspace.scale;
  for (const id of newlyOpened) {
    host.onCardOpen?.(id);
  }
  host.saveCanvasState();
}

export function snapshotWorkspace(host: CanvasHost, label: string): SavedWorkspace {
  return {
    id: crypto.randomUUID(),
    label,
    cards: { ...host.canvasCards },
    panX: host.canvasPanX,
    panY: host.canvasPanY,
    scale: host.canvasScale,
  };
}
