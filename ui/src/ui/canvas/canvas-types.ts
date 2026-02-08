export type CardId =
  | "chat"
  | "system"
  | "channels"
  | "sessions"
  | "activity"
  | "log"
  | "skills"
  | "cron"
  | "config"
  | "nodes"
  | "debug";

export const ALL_CARD_IDS: CardId[] = [
  "chat",
  "system",
  "channels",
  "sessions",
  "activity",
  "log",
  "skills",
  "cron",
  "config",
  "nodes",
  "debug",
];

export type CardState = {
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
  z: number;
};

export type DockGroup = "command" | "control" | "agent" | "settings";

export type CardDef = {
  id: CardId;
  title: string;
  icon: string;
  defaultPos: { x: number; y: number };
  defaultSize: { w: number; h: number };
  group: DockGroup;
};

export const CARD_DEFS: CardDef[] = [
  {
    id: "chat",
    title: "CHAT",
    icon: "message-square",
    defaultPos: { x: 1800, y: 800 },
    defaultSize: { w: 520, h: 580 },
    group: "command",
  },
  {
    id: "system",
    title: "SYSTEM",
    icon: "monitor",
    defaultPos: { x: 1400, y: 800 },
    defaultSize: { w: 280, h: 400 },
    group: "command",
  },
  {
    id: "channels",
    title: "CHANNELS",
    icon: "link",
    defaultPos: { x: 2440, y: 800 },
    defaultSize: { w: 260, h: 200 },
    group: "control",
  },
  {
    id: "sessions",
    title: "SESSIONS",
    icon: "users",
    defaultPos: { x: 2440, y: 1060 },
    defaultSize: { w: 260, h: 180 },
    group: "control",
  },
  {
    id: "activity",
    title: "ACTIVITY",
    icon: "activity",
    defaultPos: { x: 1400, y: 1260 },
    defaultSize: { w: 280, h: 260 },
    group: "control",
  },
  {
    id: "log",
    title: "LOG",
    icon: "file-text",
    defaultPos: { x: 2440, y: 1300 },
    defaultSize: { w: 340, h: 240 },
    group: "control",
  },
  {
    id: "skills",
    title: "SKILLS",
    icon: "zap",
    defaultPos: { x: 2810, y: 800 },
    defaultSize: { w: 220, h: 200 },
    group: "agent",
  },
  {
    id: "cron",
    title: "CRON",
    icon: "clock",
    defaultPos: { x: 2810, y: 1060 },
    defaultSize: { w: 220, h: 150 },
    group: "agent",
  },
  {
    id: "config",
    title: "CONFIG",
    icon: "settings",
    defaultPos: { x: 1800, y: 1440 },
    defaultSize: { w: 500, h: 450 },
    group: "settings",
  },
  {
    id: "nodes",
    title: "NODES",
    icon: "server",
    defaultPos: { x: 2810, y: 1280 },
    defaultSize: { w: 260, h: 200 },
    group: "agent",
  },
  {
    id: "debug",
    title: "DEBUG",
    icon: "terminal",
    defaultPos: { x: 2360, y: 1580 },
    defaultSize: { w: 340, h: 260 },
    group: "settings",
  },
];

export type CanvasInteraction = "idle" | "panning" | "dragging" | "resizing";

export type SavedWorkspace = {
  id: string;
  label: string;
  cards: Record<CardId, CardState>;
  panX: number;
  panY: number;
  scale: number;
};

export function getDefaultCardStates(): Record<CardId, CardState> {
  const states = {} as Record<CardId, CardState>;
  let z = 10;
  for (const def of CARD_DEFS) {
    states[def.id] = {
      x: def.defaultPos.x,
      y: def.defaultPos.y,
      w: def.defaultSize.w,
      h: def.defaultSize.h,
      open: def.id === "chat" || def.id === "system" || def.id === "channels" || def.id === "sessions",
      z: z++,
    };
  }
  return states;
}
