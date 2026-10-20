import type { Instruction, TurnKind } from "../types";

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return "–";
  if (m < 1) return "less than 1 m";
  if (m < 100) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 1000 ? 2 : 1)} km`;
}

/** Walking time at a relaxed indoor pace (1.2 m/s). */
export function formatEta(m: number): string {
  const s = Math.max(1, Math.round(m / 1.2));
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}

export const TURN_TEXT: Record<TurnKind, string> = {
  start: "Head along the highlighted path",
  straight: "Continue straight",
  "slight-left": "Bear left",
  "slight-right": "Bear right",
  left: "Turn left",
  right: "Turn right",
  "u-turn": "Turn around",
  arrive: "Arrive at your destination",
};

export const TURN_ARROW: Record<TurnKind, string> = {
  start: "↑",
  straight: "↑",
  "slight-left": "↖",
  "slight-right": "↗",
  left: "←",
  right: "→",
  "u-turn": "↶",
  arrive: "◎",
};

export function instructionText(step: Instruction, distanceTo: number): string {
  if (step.kind === "arrive") {
    return distanceTo < 2 ? "You are almost there" : `Destination in ${formatDistance(distanceTo)}`;
  }
  if (distanceTo < 1.5) return `${TURN_TEXT[step.kind]} now`;
  return `${TURN_TEXT[step.kind]} in ${formatDistance(distanceTo)}`;
}
