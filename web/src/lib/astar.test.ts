import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { NavGridData, Vec2 } from "../types";
import { buildInstructions, classifyTurn, findGridPath, planRoute, turnAngle } from "./astar";
import { cumulativeLengths, pointInPolygon, projectOnPolyline } from "./geometry";
import { NavGrid } from "./navgrid";

/** Grid from an ASCII map ('.' walkable, '#' blocked), 1 m cells, origin at (0, 0). */
function gridFrom(map: string[]): NavGrid {
  const rows = map.length;
  const cols = map[0].length;
  const walkable = new Uint8Array(rows * cols);
  const clearance = new Uint8Array(rows * cols);
  map.forEach((line, r) => [...line].forEach((ch, c) => {
    walkable[r * cols + c] = ch === "." ? 1 : 0;
    clearance[r * cols + c] = ch === "." ? 100 : 0;
  }));
  return new NavGrid(cols, rows, 1, [0, 0], 0.25, walkable, clearance);
}

function routeStaysWalkable(grid: NavGrid, points: Vec2[]): boolean {
  return points.every((p, i) => i === 0 || grid.lineWalkable(points[i - 1][0], points[i - 1][1], p[0], p[1]));
}

describe("A* route planning", () => {
  it("goes straight across open floor", () => {
    const grid = gridFrom(["..........", "..........", ".........."]);
    const route = planRoute(grid, [0.5, 1.5], [9.5, 1.5])!;
    expect(route.points).toHaveLength(2);
    expect(route.length).toBeCloseTo(9, 5);
  });

  it("routes around a wall through its only gap", () => {
    const grid = gridFrom([
      ".....#.....",
      ".....#.....",
      ".....#.....",
      "...........",
      ".....#.....",
    ]);
    const route = planRoute(grid, [1.5, 0.5], [9.5, 0.5])!;
    expect(route).not.toBeNull();
    expect(routeStaysWalkable(grid, route.points)).toBe(true);
    // Shortest walkable route: down to the gap row and back up.
    const crossesGap = route.points.some((p) => p[1] > 3 && p[1] < 4);
    expect(crossesGap).toBe(true);
    expect(route.length).toBeLessThan(13);
  });

  it("finds the optimal grid distance", () => {
    // Open floor: octile distance (two diagonal steps + two straight steps).
    const open = gridFrom([".....", ".....", "....."]);
    const diagonal = findGridPath(open, [0.5, 0.5], [4.5, 2.5], { wallPenalty: 0 })!;
    expect(cumulativeLengths(diagonal).at(-1)!).toBeCloseTo(2 * Math.SQRT2 + 2, 5);
    // Around a block, diagonals that would clip its corners are not allowed: 6 straight steps.
    const block = gridFrom([".....", ".###.", "....."]);
    const around = findGridPath(block, [0.5, 0.5], [4.5, 2.5], { wallPenalty: 0 })!;
    expect(cumulativeLengths(around).at(-1)!).toBeCloseTo(6, 5);
  });

  it("returns null when the goal is walled off", () => {
    const grid = gridFrom(["..#..", "..#..", "..#.."]);
    expect(findGridPath(grid, [0.5, 1.5], [4.5, 1.5])).toBeNull();
  });

  it("never cuts diagonally between two blocked cells", () => {
    const grid = gridFrom(["..#", ".#.", "..."]);
    const cells = findGridPath(grid, [0.5, 0.5], [2.5, 2.5], { wallPenalty: 0 })!;
    for (let i = 1; i < cells.length; i++) {
      const [ax, az] = cells[i - 1];
      const [bx, bz] = cells[i];
      if (ax !== bx && az !== bz) {
        expect(grid.isWalkable(bx, az) && grid.isWalkable(ax, bz)).toBe(true);
      }
    }
  });
});

describe("turn instructions", () => {
  it("names left and right turns with +Y up", () => {
    // Facing +X, the +Z direction is on the walker's right.
    expect(classifyTurn(turnAngle([1, 0], [0, 1]))).toBe("right");
    expect(classifyTurn(turnAngle([1, 0], [0, -1]))).toBe("left");
    expect(classifyTurn(turnAngle([1, 0], [1, 0.1]))).toBe("straight");
    expect(classifyTurn(turnAngle([1, 0], [-1, 0.05]))).toBe("u-turn");
  });

  it("produces start, turn and arrive steps at the right distances", () => {
    const steps = buildInstructions([[0, 0], [4, 0], [4, 3]]);
    expect(steps.map((s) => s.kind)).toEqual(["start", "right", "arrive"]);
    expect(steps[1].at).toBeCloseTo(4);
    expect(steps[2].at).toBeCloseTo(7);
  });
});

describe("geometry helpers", () => {
  it("projects onto a polyline", () => {
    const pts: Vec2[] = [[0, 0], [10, 0]];
    const p = projectOnPolyline(pts, cumulativeLengths(pts), [3, 2]);
    expect(p.along).toBeCloseTo(3);
    expect(p.offset).toBeCloseTo(2);
  });

  it("tests point-in-polygon", () => {
    const square: Vec2[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(pointInPolygon([1, 1], square)).toBe(true);
    expect(pointInPolygon([3, 1], square)).toBe(false);
  });
});

describe("demo apartment navgrid (pipeline output)", () => {
  const data = JSON.parse(
    readFileSync(new URL("../../public/scenes/demo-apartment/navgrid.json", import.meta.url), "utf8"),
  ) as NavGridData;
  const grid = NavGrid.fromJSON(data);

  it("routes from the living room into the bedroom through the door", () => {
    const route = planRoute(grid, [-0.5, 0.0], [3.5, 0.9])!;
    expect(route).not.toBeNull();
    expect(routeStaysWalkable(grid, route.points)).toBe(true);
    // The x = 2 wall is solid except for the door at z in [-0.2, 0.7].
    for (let i = 1; i < route.points.length; i++) {
      const [ax, az] = route.points[i - 1];
      const [bx, bz] = route.points[i];
      if ((ax - 2) * (bx - 2) < 0) {
        const zCross = az + ((2 - ax) / (bx - ax)) * (bz - az);
        expect(zCross).toBeGreaterThan(-0.2);
        expect(zCross).toBeLessThan(0.7);
      }
    }
  });

  it("reaches the kitchen without walking through the dining table", () => {
    const route = planRoute(grid, [-0.5, 0.0], [-1.1, 4.1])!;
    expect(route).not.toBeNull();
    const table: Vec2[] = [[-1.6, 2.9], [-0.6, 2.9], [-0.6, 3.7], [-1.6, 3.7]];
    const cum = cumulativeLengths(route.points);
    for (let d = 0; d < route.length; d += 0.05) {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const t = (d - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-9);
      const p: Vec2 = [route.points[i - 1][0] + t * (route.points[i][0] - route.points[i - 1][0]),
        route.points[i - 1][1] + t * (route.points[i][1] - route.points[i - 1][1])];
      expect(pointInPolygon(p, table)).toBe(false);
    }
  });
});
