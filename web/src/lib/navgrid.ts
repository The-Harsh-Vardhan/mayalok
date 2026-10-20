import type { NavGridData, Vec2 } from "../types";

function decodeBase64(data: string): Uint8Array {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Walkable-floor grid produced by the pipeline. Rows run along +Z, columns along +X;
 * cell (0, 0) has its corner at `origin`.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly res: number;
  readonly ox: number;
  readonly oz: number;
  readonly agentRadius: number;
  /** 1 where the router may walk (keeps agentRadius clearance). */
  readonly walkable: Uint8Array;
  /** Distance to the nearest wall/obstacle in centimetres (0 = blocked, saturates at 255). */
  readonly clearance: Uint8Array;

  constructor(cols: number, rows: number, res: number, origin: Vec2, agentRadius: number,
              walkable: Uint8Array, clearance: Uint8Array) {
    this.cols = cols;
    this.rows = rows;
    this.res = res;
    this.ox = origin[0];
    this.oz = origin[1];
    this.agentRadius = agentRadius;
    this.walkable = walkable;
    this.clearance = clearance;
  }

  static fromJSON(d: NavGridData): NavGrid {
    return new NavGrid(d.cols, d.rows, d.resolution, d.origin, d.agentRadius,
      decodeBase64(d.walkable), decodeBase64(d.clearanceCm));
  }

  col(x: number): number {
    return Math.floor((x - this.ox) / this.res);
  }

  row(z: number): number {
    return Math.floor((z - this.oz) / this.res);
  }

  inside(r: number, c: number): boolean {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  center(r: number, c: number): Vec2 {
    return [this.ox + (c + 0.5) * this.res, this.oz + (r + 0.5) * this.res];
  }

  isWalkableCell(r: number, c: number): boolean {
    return this.inside(r, c) && this.walkable[r * this.cols + c] === 1;
  }

  isWalkable(x: number, z: number): boolean {
    return this.isWalkableCell(this.row(z), this.col(x));
  }

  /** Metres of free space around (x, z); 0 outside the grid or on obstacles. */
  clearanceAt(x: number, z: number): number {
    const r = this.row(z);
    const c = this.col(x);
    return this.inside(r, c) ? this.clearance[r * this.cols + c] / 100 : 0;
  }

  clearanceCell(r: number, c: number): number {
    return this.inside(r, c) ? this.clearance[r * this.cols + c] / 100 : 0;
  }

  /** Closest walkable cell centre, searching outwards ring by ring. */
  nearestWalkable(x: number, z: number, maxRadiusM = 50): Vec2 | null {
    const r0 = this.row(z);
    const c0 = this.col(x);
    if (this.isWalkableCell(r0, c0)) return this.center(r0, c0);
    const maxRing = Math.ceil(maxRadiusM / this.res);
    for (let ring = 1; ring <= maxRing; ring++) {
      let best: Vec2 | null = null;
      let bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          if (!this.isWalkableCell(r0 + dr, c0 + dc)) continue;
          const d = dr * dr + dc * dc;
          if (d < bestD) {
            bestD = d;
            best = this.center(r0 + dr, c0 + dc);
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** True if every sample along the segment lies on a walkable cell. */
  lineWalkable(ax: number, az: number, bx: number, bz: number): boolean {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / (this.res * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /**
   * True if the segment stays in free space (clearance > 0), used for line of sight.
   * The last `ignoreEnd` metres are not checked, so an object does not hide itself.
   */
  lineFree(ax: number, az: number, bx: number, bz: number, ignoreEnd = 0): boolean {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / (this.res * 0.5)));
    const last = len > 0 ? Math.max(0, 1 - ignoreEnd / len) : 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (t > last) break;
      if (this.clearanceAt(ax + (bx - ax) * t, az + (bz - az) * t) <= 0) return false;
    }
    return true;
  }

  /**
   * A good place to stand when looking at `target`: walkable, roughly `ideal` metres
   * away, with an unobstructed view, and as open as possible.
   */
  viewpointFor(target: Vec2, from: Vec2, ideal = 1.8, minD = 0.9, maxD = 3.5): Vec2 | null {
    const goal = this.nearestWalkable(target[0], target[1], 5);
    let best: Vec2 | null = null;
    let bestScore = -Infinity;
    const step = Math.max(1, Math.round(0.15 / this.res));
    const ring = Math.ceil(maxD / this.res);
    const r0 = this.row(target[1]);
    const c0 = this.col(target[0]);
    for (let dr = -ring; dr <= ring; dr += step) {
      for (let dc = -ring; dc <= ring; dc += step) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (!this.isWalkableCell(r, c)) continue;
        const [x, z] = this.center(r, c);
        const d = Math.hypot(x - target[0], z - target[1]);
        if (d < minD || d > maxD) continue;
        const aim = goal ?? target;
        if (!this.lineFree(x, z, aim[0], aim[1])) continue;
        const score = -Math.abs(d - ideal) + 0.5 * Math.min(this.clearanceCell(r, c), 1)
          - 0.05 * Math.hypot(x - from[0], z - from[1]);
        if (score > bestScore) {
          bestScore = score;
          best = [x, z];
        }
      }
    }
    return best ?? goal;
  }
}
