import { formatDistance, formatEta, instructionText, TURN_ARROW } from "../lib/format";
import type { Instruction } from "../types";

export interface NavView {
  destination: string;
  next: Instruction;
  distanceToNext: number;
  remaining: number;
  arrived: boolean;
  replanning: boolean;
}

interface Props {
  nav: NavView;
  autopiloting: boolean;
  onAutopilot: () => void;
  onStop: () => void;
}

export function NavHud({ nav, autopiloting, onAutopilot, onStop }: Props) {
  if (nav.arrived) {
    return (
      <div className="nav-hud is-arrived" role="status">
        <div className="nav-arrow">◎</div>
        <div className="nav-text">
          <strong>You have arrived</strong>
          <span>{nav.destination}</span>
        </div>
        <button type="button" className="btn" onClick={onStop}>Done</button>
      </div>
    );
  }
  return (
    <div className="nav-hud" role="status" aria-live="polite">
      <div className="nav-arrow" aria-hidden>{TURN_ARROW[nav.next.kind]}</div>
      <div className="nav-text">
        <strong>{instructionText(nav.next, nav.distanceToNext)}</strong>
        <span>
          {nav.destination} · {formatDistance(nav.remaining)} · {formatEta(nav.remaining)}
          {nav.replanning ? " · re-routing…" : ""}
        </span>
      </div>
      <div className="nav-actions">
        <button type="button" className="btn btn-primary" onClick={onAutopilot} title="Walk the route automatically (F)">
          {autopiloting ? "Pause" : "Auto-walk"}
        </button>
        <button type="button" className="btn" onClick={onStop} title="End navigation (X)">End</button>
      </div>
    </div>
  );
}
