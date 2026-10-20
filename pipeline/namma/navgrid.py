"""Walkable-floor occupancy grid: the single spatial index behind collision, pathfinding and AR.

Every cell is 5 cm x 5 cm of floor (x/z plane). A cell is walkable when:
  * the floor was actually reconstructed there (splats near y = 0), and
  * nothing solid exists between ankle and head height (0.12 m - 1.9 m), and
  * it is at least `agent_radius` away from anything blocked.
Cells the capture walked through are known to be free: the person holding the
phone stood there, which repairs gaps on texture-poor floors.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage

from .splats import Splats


@dataclass
class NavGrid:
    origin: tuple[float, float]  # world (x, z) of the corner of cell (row 0, col 0)
    resolution: float
    walkable: np.ndarray         # (rows = z, cols = x) bool
    clearance: np.ndarray        # metres to the nearest blocked cell, float32
    observed: np.ndarray         # floor or obstacle evidence exists (for the minimap)
    agent_radius: float

    @property
    def shape(self) -> tuple[int, int]:
        return self.walkable.shape

    def to_cell(self, x: np.ndarray, z: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        col = np.floor((np.asarray(x) - self.origin[0]) / self.resolution).astype(int)
        row = np.floor((np.asarray(z) - self.origin[1]) / self.resolution).astype(int)
        return row, col

    def cell_center(self, row: int, col: int) -> tuple[float, float]:
        return (self.origin[0] + (col + 0.5) * self.resolution,
                self.origin[1] + (row + 0.5) * self.resolution)

    def nearest_walkable(self, x: float, z: float) -> tuple[float, float]:
        rows, cols = np.nonzero(self.walkable)
        if len(rows) == 0:
            raise RuntimeError("Navigation grid has no walkable cells.")
        r, c = self.to_cell(x, z)
        best = int(np.argmin((rows - r) ** 2 + (cols - c) ** 2))
        return self.cell_center(int(rows[best]), int(cols[best]))

    def to_json(self) -> dict:
        def b64(a: np.ndarray) -> str:
            return base64.b64encode(np.ascontiguousarray(a, dtype=np.uint8).tobytes()).decode("ascii")

        return {
            "version": 1,
            "resolution": self.resolution,
            "origin": [round(self.origin[0], 4), round(self.origin[1], 4)],
            "cols": int(self.shape[1]),
            "rows": int(self.shape[0]),
            "agentRadius": self.agent_radius,
            "encoding": "base64-uint8-rowmajor",
            "walkable": b64(self.walkable),
            # Clearance in centimetres, saturating at 2.55 m; used to keep paths off walls.
            "clearanceCm": b64(np.minimum(np.round(self.clearance * 100), 255)),
        }


def _disk(radius_cells: int) -> np.ndarray:
    r = max(1, radius_cells)
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    return (xx ** 2 + yy ** 2) <= r ** 2


def build_navgrid(splats: Splats, cam_positions: np.ndarray, resolution: float = 0.05,
                  agent_radius: float = 0.25, obstacle_band: tuple[float, float] = (0.12, 1.9),
                  floor_band: float = 0.08, min_alpha: float = 0.2, min_obstacle_weight: float = 1.5,
                  min_obstacle_cells: int = 4, path_free_radius: float = 0.3) -> tuple[NavGrid, dict]:
    m = splats.means
    alpha = splats.alpha()
    solid = alpha > min_alpha

    # Grid bounds from the bulk of the scene (percentiles ignore stray floaters).
    cam_positions = np.asarray(cam_positions, dtype=float).reshape(-1, 3)
    relevant = solid & (m[:, 1] > -0.2) & (m[:, 1] < 2.2)
    xz = np.vstack([m[relevant][:, [0, 2]], cam_positions[:, [0, 2]]])
    lo = np.percentile(xz, 0.5, axis=0) - 0.5
    hi = np.percentile(xz, 99.5, axis=0) + 0.5
    cols = int(np.ceil((hi[0] - lo[0]) / resolution))
    rows = int(np.ceil((hi[1] - lo[1]) / resolution))
    grid = NavGrid((float(lo[0]), float(lo[1])), resolution, np.zeros((rows, cols), bool),
                   np.zeros((rows, cols), np.float32), np.zeros((rows, cols), bool), agent_radius)

    def accumulate(mask: np.ndarray, weights: np.ndarray) -> np.ndarray:
        r, c = grid.to_cell(m[mask, 0], m[mask, 2])
        ok = (r >= 0) & (r < rows) & (c >= 0) & (c < cols)
        out = np.zeros(rows * cols)
        np.add.at(out, r[ok] * cols + c[ok], weights[ok])
        return out.reshape(rows, cols)

    y = m[:, 1]
    in_band = solid & (y > obstacle_band[0]) & (y < obstacle_band[1])
    obstacle = accumulate(in_band, alpha[in_band]) >= min_obstacle_weight
    # Drop lone specks (floaters) but keep thin walls: a morphological opening would
    # erase one-cell-thick walls, so remove small connected blobs instead.
    labels, n = ndimage.label(obstacle, structure=np.ones((3, 3)))
    if n:
        sizes = ndimage.sum(obstacle, labels, index=np.arange(1, n + 1))
        obstacle = np.isin(labels, 1 + np.flatnonzero(sizes >= min_obstacle_cells))

    on_floor = solid & (np.abs(y) < floor_band)
    floor = accumulate(on_floor, alpha[on_floor]) >= 1.0
    floor = ndimage.binary_closing(floor, structure=_disk(2))  # bridge small texture gaps

    # Where the phone travelled is free space, whatever the splats say.
    walked = np.zeros((rows, cols), bool)
    r, c = grid.to_cell(cam_positions[:, 0], cam_positions[:, 2])
    ok = (r >= 0) & (r < rows) & (c >= 0) & (c < cols)
    walked[r[ok], c[ok]] = True
    path_cells = ndimage.binary_dilation(walked, structure=_disk(1))
    walked_free = ndimage.binary_dilation(walked, structure=_disk(int(round(path_free_radius / resolution))))

    free = (floor & ~obstacle) | walked_free

    # Keep only free space connected to where the capture actually walked
    # (or, for splats without camera poses, the largest free region).
    labels, n = ndimage.label(free, structure=np.ones((3, 3)))
    reached = np.unique(labels[walked & free])
    reached = reached[reached > 0]
    if len(reached) == 0 and n > 0:
        reached = [1 + int(np.argmax(ndimage.sum(free, labels, index=np.arange(1, n + 1))))]
    free = np.isin(labels, reached)

    clearance = ndimage.distance_transform_edt(free).astype(np.float32) * resolution
    walkable = (clearance >= agent_radius) | (path_cells & free)
    labels, n = ndimage.label(walkable, structure=np.ones((3, 3)))
    if n > 1:
        sizes = ndimage.sum(walkable, labels, index=np.arange(1, n + 1))
        walkable = labels == (1 + int(np.argmax(sizes)))

    grid.walkable = walkable
    grid.clearance = clearance
    grid.observed = floor | obstacle | walked_free
    stats = {
        "rows": rows, "cols": cols, "resolution_m": resolution,
        "walkable_area_m2": round(float(walkable.sum()) * resolution ** 2, 2),
        "obstacle_cells": int(obstacle.sum()),
        "floor_cells": int(floor.sum()),
    }
    return grid, stats


def render_minimap(grid: NavGrid, splats: Splats, path: Path, px_per_cell: int = 2) -> None:
    """Top-down RGBA floor plan: walkable floor in its real colour, obstacles dark, unknown transparent."""
    rows, cols = grid.shape
    m = splats.means
    mask = (splats.alpha() > 0.3) & (m[:, 1] > -0.1) & (m[:, 1] < 1.2)
    r, c = grid.to_cell(m[mask, 0], m[mask, 2])
    ok = (r >= 0) & (r < rows) & (c >= 0) & (c < cols)
    flat = r[ok] * cols + c[ok]
    rgb = splats.rgb()[mask][ok]
    color = np.zeros((rows * cols, 3))
    count = np.zeros(rows * cols)
    for ch in range(3):
        np.add.at(color[:, ch], flat, rgb[:, ch])
    np.add.at(count, flat, 1.0)
    color = (color / np.maximum(count, 1)[:, None]).reshape(rows, cols, 3)

    img = np.zeros((rows, cols, 4), np.float32)
    floor = grid.clearance > 0                 # free floor, including the wall-clearance margin
    walk = grid.walkable
    margin = floor & ~walk
    img[walk, :3] = 0.55 * color[walk] + 0.45  # lightened real floor colour
    img[margin, :3] = 0.5 * color[margin] + 0.33
    blocked = grid.observed & ~floor           # walls and furniture
    img[blocked, :3] = 0.25 * color[blocked] + np.array([0.16, 0.18, 0.22])
    img[walk | margin | blocked, 3] = 1.0

    out = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    out = cv2.resize(out, (cols * px_per_cell, rows * px_per_cell), interpolation=cv2.INTER_NEAREST)
    cv2.imwrite(str(path), cv2.cvtColor(out, cv2.COLOR_RGBA2BGRA))


def save_navgrid(grid: NavGrid, path: Path) -> None:
    Path(path).write_text(json.dumps(grid.to_json()))
