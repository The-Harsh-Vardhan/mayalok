"""Package a processed scene for the web app.

Output folder (copied to web/public/scenes/<id>/):
  scene.spz      compressed splat (PlayCanvas splat-transform, PLY -> SPZ)
  navgrid.json   walkable grid + clearance (see navgrid.py)
  minimap.png    top-down floor plan
  scene.json     manifest: frame convention, bounds, spawn, AR anchors, QC stats
  pois.json      points of interest (created empty; edited in the web admin mode)
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np

from .splats import Splats


def find_splat_transform() -> list[str]:
    exe = shutil.which("splat-transform")
    if exe:
        return [exe]
    if shutil.which("npx"):
        return ["npx", "--yes", "@playcanvas/splat-transform@3.10.1"]
    raise FileNotFoundError("splat-transform not found: npm install -g @playcanvas/splat-transform@3.10.1")


def convert_splat(src_ply: Path, dst: Path, sh_bands: int | None = None) -> None:
    """PLY -> .spz / .sog / .compressed.ply (format chosen from the extension)."""
    cmd = find_splat_transform() + ["-w", str(src_ply)]
    if sh_bands is not None:
        cmd += ["-H", str(sh_bands)]
    cmd += [str(dst)]
    if str(dst).endswith(".spz"):
        # splat-transform defaults to SPZ v4 (no gzip wrapper); Spark 2.3 reads only v2/v3.
        cmd += ["--spz-version", "3"]
    print("[export]", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def spawn_pose(grid, cam_positions: np.ndarray, cam_forwards: np.ndarray) -> dict:
    if len(cam_positions):
        x, z = grid.nearest_walkable(float(cam_positions[0, 0]), float(cam_positions[0, 2]))
        fwd = cam_forwards[0]
        # three.js cameras look down -Z, so yaw 0 faces -Z.
        yaw = float(np.arctan2(-fwd[0], -fwd[2]))
    else:
        rows, cols = np.nonzero(grid.walkable)
        x, z = grid.nearest_walkable(*grid.cell_center(int(np.median(rows)), int(np.median(cols))))
        yaw = 0.0
    return {"position": [round(x, 3), 0.0, round(z, 3)], "yaw": round(yaw, 4)}


def write_scene(out_dir: Path, scene_id: str, name: str, splat_file: str, splats: Splats, grid,
                cam_positions: np.ndarray, cam_forwards: np.ndarray, anchors: list[dict],
                eye_height: float, stats: dict) -> dict:
    out_dir = Path(out_dir)
    m = splats.means
    lo = np.percentile(m, 1, axis=0)
    hi = np.percentile(m, 99, axis=0)
    manifest = {
        "id": scene_id,
        "name": name,
        "version": 1,
        "frame": {"units": "meters", "up": "+y", "floorY": 0.0},
        "files": {"splat": splat_file, "navgrid": "navgrid.json", "minimap": "minimap.png", "pois": "pois.json"},
        "bounds": {"min": lo.round(3).tolist(), "max": hi.round(3).tolist()},
        "minimap": {
            "origin": [round(grid.origin[0], 4), round(grid.origin[1], 4)],
            "metersPerPixel": grid.resolution / 2,  # render_minimap uses 2 px per cell
        },
        "eyeHeight": eye_height,
        "spawn": spawn_pose(grid, cam_positions, cam_forwards),
        "anchors": anchors,
        "trajectory": cam_positions[:, [0, 2]][:: max(1, len(cam_positions) // 200)].round(3).tolist()
        if len(cam_positions) else [],
        "stats": stats,
    }
    (out_dir / "scene.json").write_text(json.dumps(manifest, indent=2))
    pois = out_dir / "pois.json"
    if not pois.exists():
        pois.write_text(json.dumps({"version": 1, "pois": []}, indent=2))
    return manifest
