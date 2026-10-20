import type { Instruction, Route, TurnKind, Vec2 } from "../types";
import { cumulativeLengths } from "./geometry";
import type { NavGrid } from "./navgrid";

export interface PlanOptions {
  /** Paths prefer cells with at least this much clearance (m)... */
  preferredClearance?: number;
  /** ...paying up to (1 + wallPenalty) x the distance when hugging obstacles. */
  wallPenalty?: number;
}

/** Binary min-heap of grid cell indices keyed by f-score. */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.vals.length;
  }

  push(key: number, val: number): void {
    const keys = this.keys;
    const vals = this.vals;
    let i = vals.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      vals[i] = vals[parent];
      i = parent;
    }
    keys[i] = key;
    vals[i] = val;
  }

  pop(): number {
    const keys = this.keys;
    const vals = this.vals;
    const top = vals[0];
    const lastKey = keys.pop()!;
    const lastVal = vals.pop()!;
    const n = vals.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && keys[child + 1] < keys[child]) child++;
        if (keys[child] >= lastKey) break;
        keys[i] = keys[child];
        vals[i] = vals[child];
        i = child;
      }
      keys[i] = lastKey;
      vals[i] = lastVal;
    }
    return top;
  }
}

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
  [-1, -1, SQRT2], [-1, 1, SQRT2], [1, -1, SQRT2], [1, 1, SQRT2],
];

/**
 * A* over walkable cells (8-connected, no corner cutting). Step cost grows near
 * obstacles so routes run down the middle of corridors and doorways.
 * Returns world-space cell centres from start to goal, or null if unreachable.
 */
export function findGridPath(grid: NavGrid, start: Vec2, goal: Vec2, opts: PlanOptions = {}): Vec2[] | null {
  const prefer = opts.preferredClearance ?? 0.6;
  const penalty = opts.wallPenalty ?? 2.0;
  const s = grid.nearestWalkable(start[0], start[1]);
  const g = grid.nearestWalkable(goal[0], goal[1]);
  if (!s || !g) return null;
  const { cols, rows } = grid;
  const sr = grid.row(s[1]);
  const sc = grid.col(s[0]);
  const gr = grid.row(g[1]);
  const gc = grid.col(g[0]);
  const startIdx = sr * cols + sc;
  const goalIdx = gr * cols + gc;

  const n = cols * rows;
  const gScore = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heuristic = (r: number, c: number) => {
    const dr = Math.abs(r - gr);
    const dc = Math.abs(c - gc);
    return dr + dc + (SQRT2 - 2) * Math.min(dr, dc);
  };

  const heap = new MinHeap();
  gScore[startIdx] = 0;
  heap.push(heuristic(sr, sc), startIdx);
  let found = false;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === goalIdx) {
      found = true;
      break;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const r = (cur / cols) | 0;
    const c = cur - r * cols;
    for (const [dr, dc, base] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!grid.isWalkableCell(nr, nc)) continue;
      if (dr !== 0 && dc !== 0 && (!grid.isWalkableCell(r + dr, c) || !grid.isWalkableCell(r, c + dc))) continue;
      const ni = nr * cols + nc;
      if (closed[ni]) continue;
      const clearance = grid.clearanceCell(nr, nc);
      const cost = base * (1 + penalty * Math.max(0, 1 - clearance / prefer));
      const tentative = gScore[cur] + cost;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        came[ni] = cur;
        heap.push(tentative + heuristic(nr, nc), ni);
      }
    }
  }
  if (!found) return null;

  const cells: Vec2[] = [];
  for (let i = goalIdx; i !== -1; i = came[i]) {
    const r = (i / cols) | 0;
    cells.push(grid.center(r, i - r * cols));
  }
  cells.reverse();
  return cells;
}

/** String-pulling: drop intermediate points while the straight line stays walkable. */
export function smoothPath(grid: NavGrid, pts: Vec2[]): Vec2[] {
  if (pts.length <= 2) return pts.slice();
  const out: Vec2[] = [pts[0]];
  let anchor = 0;
  while (anchor < pts.length - 1) {
    let j = anchor + 1;
    while (j + 1 < pts.length && grid.lineWalkable(pts[anchor][0], pts[anchor][1], pts[j + 1][0], pts[j + 1][1])) j++;
    out.push(pts[j]);
    anchor = j;
  }
  return out;
}

/** Signed turn angle (radians) from heading a to heading b; positive = left (with +Y up). */
export function turnAngle(a: Vec2, b: Vec2): number {
  const cross = a[1] * b[0] - a[0] * b[1];
  const dot = a[0] * b[0] + a[1] * b[1];
  return Math.atan2(cross, dot);
}

export function classifyTurn(angleRad: number): TurnKind {
  const deg = (angleRad * 180) / Math.PI;
  const mag = Math.abs(deg);
  if (mag < 20) return "straight";
  if (mag > 135) return "u-turn";
  const side = deg > 0 ? "left" : "right";
  return mag < 50 ? (`slight-${side}` as TurnKind) : (side as TurnKind);
}

export function buildInstructions(points: Vec2[]): Instruction[] {
  const cum = cumulativeLengths(points);
  const out: Instruction[] = [{ kind: "start", at: 0, point: points[0] }];
  for (let i = 1; i < points.length - 1; i++) {
    const a: Vec2 = [points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]];
    const b: Vec2 = [points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]];
    const kind = classifyTurn(turnAngle(a, b));
    if (kind !== "straight") out.push({ kind, at: cum[i], point: points[i] });
  }
  out.push({ kind: "arrive", at: cum[cum.length - 1], point: points[points.length - 1] });
  return out;
}

export function planRoute(grid: NavGrid, start: Vec2, goal: Vec2, opts?: PlanOptions): Route | null {
  const cells = findGridPath(grid, start, goal, opts);
  if (!cells) return null;
  // Begin exactly where the user stands when that spot is walkable.
  if (grid.isWalkable(start[0], start[1])) cells[0] = [start[0], start[1]];
  const points = smoothPath(grid, cells);
  const cum = cumulativeLengths(points);
  return { points, length: cum[cum.length - 1], instructions: buildInstructions(points) };
}
