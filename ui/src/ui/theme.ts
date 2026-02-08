export type ThemeName = "grid" | "outlands" | "endofline";

export const THEME_NAMES: ThemeName[] = ["grid", "outlands", "endofline"];

export const THEME_LABELS: Record<ThemeName, string> = {
  grid: "The Grid",
  outlands: "The Outlands",
  endofline: "End of Line",
};

export const DEFAULT_THEME: ThemeName = "grid";

export function cycleTheme(current: ThemeName): ThemeName {
  const idx = THEME_NAMES.indexOf(current);
  return THEME_NAMES[(idx + 1) % THEME_NAMES.length];
}
