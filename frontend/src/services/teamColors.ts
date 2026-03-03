import type { Team } from "./plannerApi";

export type TeamColor = {
  fg: string;
  bg: string;
};

const FALLBACK: TeamColor = { fg: "#111827", bg: "#9ca3af" };

function relativeLuminance(hex: string): number {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length !== 6) return 0.5;
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  const transform = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

function textForBackground(bg: string): string {
  return relativeLuminance(bg) > 0.45 ? "#111827" : "#ffffff";
}

export function teamPalette(team: Team, paletteMap: Record<string, string[]>): TeamColor[] {
  const key = String(team.colors ?? "").trim();
  const values = paletteMap[key];
  if (!Array.isArray(values) || values.length === 0) {
    return [FALLBACK];
  }
  return values.map((bg) => ({ bg, fg: textForBackground(bg) }));
}

export function teamColorAt(team: Team, index: number, paletteMap: Record<string, string[]>): TeamColor {
  const palette = teamPalette(team, paletteMap);
  const safe = ((index % palette.length) + palette.length) % palette.length;
  return palette[safe] ?? FALLBACK;
}

export function teamDefaultColor(team: Team, paletteMap: Record<string, string[]>): TeamColor {
  return teamColorAt(team, 0, paletteMap);
}
