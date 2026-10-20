import type { Vec2 } from "../types";

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const cross = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    a += cross;
    cx += (poly[j][0] + poly[i][0]) * cross;
    cz += (poly[j][1] + poly[i][1]) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

export function polygonArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(a) / 2;
}

export function cumulativeLengths(points: Vec2[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  return out;
}

/** Closest point of a polyline to p: distance along the line and distance off it. */
export function projectOnPolyline(points: Vec2[], cumulative: number[], p: Vec2): { along: number; offset: number } {
  let best = { along: 0, offset: Infinity };
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / len2)) : 0;
    const qx = ax + t * dx;
    const qz = az + t * dz;
    const offset = Math.hypot(p[0] - qx, p[1] - qz);
    if (offset < best.offset) best = { along: cumulative[i - 1] + t * Math.sqrt(len2), offset };
  }
  return best;
}

/** Point at distance `along` on the polyline. */
export function pointAlong(points: Vec2[], cumulative: number[], along: number): Vec2 {
  if (along <= 0) return points[0];
  for (let i = 1; i < points.length; i++) {
    if (cumulative[i] >= along) {
      const seg = cumulative[i] - cumulative[i - 1];
      const t = seg > 0 ? (along - cumulative[i - 1]) / seg : 0;
      return [points[i - 1][0] + t * (points[i][0] - points[i - 1][0]),
        points[i - 1][1] + t * (points[i][1] - points[i - 1][1])];
    }
  }
  return points[points.length - 1];
}
