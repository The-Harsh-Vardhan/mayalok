"""Indoor route planning over a Mayalok navgrid.

Pure numpy + heapq, deliberately independent of the reconstruction stack (no scipy/cv2), so it
can run inside the lightweight MCP server. It mirrors the browser router in
``web/src/lib/navgrid.ts`` / ``astar.ts``: same base64 decoding, 8-connected A* with no corner
cutting, an octile heuristic, a clearance penalty that keeps paths off walls, then string-pulling.
"""

from __future__ import annotations

import base64
import heapq
import math
from dataclasses import dataclass

import numpy as np

SQRT2 = math.sqrt(2.0)
# (d_row, d_col, base step cost), same order as astar.ts.
_DIRS = (
    (-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0),
    (-1, -1, SQRT2), (-1, 1, SQRT2), (1, -1, SQRT2), (1, 1, SQRT2),
)


@dataclass
class Grid:
    """Decoded navgrid. Rows run along +z, columns along +x; ``origin`` is cell (0, 0)'s corner."""

    origin: tuple[float, float]
    resolution: float
    walkable: np.ndarray    # (rows, cols) bool
    clearance: np.ndarray   # (rows, cols) float metres to the nearest blocked cell

    @property
    def rows(self) -> int:
        return self.walkable.shape[0]

    @property
    def cols(self) -> int:
        return self.walkable.shape[1]

    def cell(self, x: float, z: float) -> tuple[int, int]:
        return (math.floor((z - self.origin[1]) / self.resolution),
                math.floor((x - self.origin[0]) / self.resolution))

    def center(self, row: int, col: int) -> tuple[float, float]:
        return (self.origin[0] + (col + 0.5) * self.resolution,
                self.origin[1] + (row + 0.5) * self.resolution)

    def is_walkable_cell(self, row: int, col: int) -> bool:
        return 0 <= row < self.rows and 0 <= col < self.cols and bool(self.walkable[row, col])

    def is_walkable(self, x: float, z: float) -> bool:
        return self.is_walkable_cell(*self.cell(x, z))

    def nearest_walkable(self, x: float, z: float) -> tuple[float, float] | None:
        """Centre of the walkable cell closest to (x, z), or None when nothing is walkable."""
        rows, cols = np.nonzero(self.walkable)
        if len(rows) == 0:
            return None
        r, c = self.cell(x, z)
        best = int(np.argmin((rows - r) ** 2 + (cols - c) ** 2))
        return self.center(int(rows[best]), int(cols[best]))

    def line_walkable(self, ax: float, az: float, bx: float, bz: float) -> bool:
        length = math.hypot(bx - ax, bz - az)
        steps = max(1, math.ceil(length / (self.resolution * 0.5)))
        return all(self.is_walkable(ax + (bx - ax) * i / steps, az + (bz - az) * i / steps)
                   for i in range(steps + 1))


def grid_from_json(d: dict) -> Grid:
    """Decode a ``navgrid.json`` dict (``base64-uint8-rowmajor``) exactly like navgrid.ts."""
    if d.get("encoding", "base64-uint8-rowmajor") != "base64-uint8-rowmajor":
        raise ValueError(f"unsupported navgrid encoding: {d.get('encoding')!r}")
    rows, cols = int(d["rows"]), int(d["cols"])
    walk = np.frombuffer(base64.b64decode(d["walkable"]), dtype=np.uint8)
    clear = np.frombuffer(base64.b64decode(d["clearanceCm"]), dtype=np.uint8)
    if walk.size != rows * cols or clear.size != rows * cols:
        raise ValueError(f"navgrid data size does not match {rows}x{cols} cells")
    return Grid((float(d["origin"][0]), float(d["origin"][1])), float(d["resolution"]),
                walk.reshape(rows, cols) == 1, clear.reshape(rows, cols).astype(np.float32) / 100.0)


def find_grid_path(grid: Grid, start: tuple[float, float], goal: tuple[float, float],
                   preferred_clearance: float = 0.6, wall_penalty: float = 2.0
                   ) -> list[tuple[float, float]] | None:
    """A* over walkable cells; returns cell centres from start to goal, or None if unreachable.

    Start and goal are snapped to the nearest walkable cell. Step cost grows near obstacles
    so routes run down the middle of corridors and doorways.
    """
    s = grid.nearest_walkable(*start)
    g = grid.nearest_walkable(*goal)
    if s is None or g is None:
        return None
    sr, sc = grid.cell(*s)
    gr, gc = grid.cell(*g)
    rows, cols = grid.rows, grid.cols
    walk, clear = grid.walkable, grid.clearance

    def heuristic(r: int, c: int) -> float:
        dr, dc = abs(r - gr), abs(c - gc)
        return dr + dc + (SQRT2 - 2.0) * min(dr, dc)

    start_idx, goal_idx = sr * cols + sc, gr * cols + gc
    g_score = {start_idx: 0.0}
    came: dict[int, int] = {}
    closed: set[int] = set()
    heap = [(heuristic(sr, sc), start_idx)]
    found = False
    while heap:
        _, cur = heapq.heappop(heap)
        if cur == goal_idx:
            found = True
            break
        if cur in closed:
            continue
        closed.add(cur)
        r, c = divmod(cur, cols)
        for dr, dc, base in _DIRS:
            nr, nc = r + dr, c + dc
            if not (0 <= nr < rows and 0 <= nc < cols) or not walk[nr, nc]:
                continue
            if dr and dc and not (walk[r + dr, c] and walk[r, c + dc]):
                continue  # no corner cutting
            ni = nr * cols + nc
            if ni in closed:
                continue
            cost = base * (1.0 + wall_penalty * max(0.0, 1.0 - float(clear[nr, nc]) / preferred_clearance))
            tentative = g_score[cur] + cost
            if tentative < g_score.get(ni, math.inf):
                g_score[ni] = tentative
                came[ni] = cur
                heapq.heappush(heap, (tentative + heuristic(nr, nc), ni))
    if not found:
        return None
    cells: list[tuple[float, float]] = []
    i = goal_idx
    while True:
        cells.append(grid.center(*divmod(i, cols)))
        if i == start_idx:
            break
        i = came[i]
    cells.reverse()
    return cells


def smooth_path(grid: Grid, pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """String-pulling: drop intermediate points while the straight line stays walkable."""
    if len(pts) <= 2:
        return list(pts)
    out = [pts[0]]
    anchor = 0
    while anchor < len(pts) - 1:
        j = anchor + 1
        while j + 1 < len(pts) and grid.line_walkable(*pts[anchor], *pts[j + 1]):
            j += 1
        out.append(pts[j])
        anchor = j
    return out


def path_length(points: list[tuple[float, float]]) -> float:
    return sum(math.dist(a, b) for a, b in zip(points, points[1:]))


def turn_kind(angle_rad: float) -> str:
    """Classify a signed turn (positive = left, +y up) like astar.ts ``classifyTurn``."""
    deg = math.degrees(angle_rad)
    mag = abs(deg)
    if mag < 20:
        return "straight"
    if mag > 135:
        return "u-turn"
    side = "left" if deg > 0 else "right"
    return f"slight-{side}" if mag < 50 else side


def build_instructions(points: list[tuple[float, float]]) -> list[dict]:
    """Steps: start, one entry per real turn, arrive. ``at`` is metres along the route."""
    cum = [0.0]
    for a, b in zip(points, points[1:]):
        cum.append(cum[-1] + math.dist(a, b))
    steps = [{"kind": "start", "at": 0.0, "point": points[0]}]
    for i in range(1, len(points) - 1):
        ax, az = points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]
        bx, bz = points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]
        kind = turn_kind(math.atan2(az * bx - ax * bz, ax * bx + az * bz))
        if kind != "straight":
            steps.append({"kind": kind, "at": cum[i], "point": points[i]})
    steps.append({"kind": "arrive", "at": cum[-1], "point": points[-1]})
    return steps


def plan_route(grid: Grid, start: tuple[float, float], goal: tuple[float, float]) -> dict | None:
    """Plan start -> goal (world x, z in metres). Returns ``{points, length, instructions}`` or None."""
    cells = find_grid_path(grid, start, goal)
    if cells is None:
        return None
    if grid.is_walkable(*start):  # begin exactly where the user stands
        cells[0] = (float(start[0]), float(start[1]))
    points = smooth_path(grid, cells)
    return {"points": points, "length": path_length(points), "instructions": build_instructions(points)}


_TURN_TEXT = {
    "slight-left": "Bear slightly left", "slight-right": "Bear slightly right",
    "left": "Turn left", "right": "Turn right", "u-turn": "Turn around",
}


def describe(instructions: list[dict], destination: str = "your destination") -> list[str]:
    """Plain-language directions from ``build_instructions`` output."""
    lines: list[str] = []
    for cur, nxt in zip(instructions, instructions[1:]):
        leg = nxt["at"] - cur["at"]
        if cur["kind"] == "start":
            lines.append(f"Start walking for {leg:.1f} m")
        else:
            lines.append(f"{_TURN_TEXT.get(cur['kind'], 'Continue')} and walk {leg:.1f} m")
    lines.append(f"Arrive at {destination}.")
    return lines
