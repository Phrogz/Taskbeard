import type { Team } from "./plannerApi";

export type TeamColor = {
  fg: string;
  bg: string;
};

const FALLBACK: TeamColor = { fg: "#111827", bg: "#9ca3af" };

export function teamPalette(team: Team): TeamColor[] {
  if (!Array.isArray(team.colors) || team.colors.length === 0) {
    return [FALLBACK];
  }
  return team.colors;
}

export function teamColorAt(team: Team, index: number): TeamColor {
  const palette = teamPalette(team);
  const safe = ((index % palette.length) + palette.length) % palette.length;
  return palette[safe] ?? FALLBACK;
}

export function teamDefaultColor(team: Team): TeamColor {
  return teamColorAt(team, 0);
}
