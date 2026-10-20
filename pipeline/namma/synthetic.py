"""Procedural three-room apartment made of Gaussians, for tests and web development.

This is NOT a capture: it only lets the navgrid/export stages and the web app be
developed and tested before real footage exists. Rooms (metres, +Y up):
  living room x[-3, 2]  z[-2, 2]     bedroom x[2, 5.5] z[-2, 1.5] (door in x = 2 wall)
  kitchen     x[-3, 0.5] z[2, 4.5]   (opening in the z = 2 wall)
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .splats import SH_C0, Splats, write_ply

WALL_H = 2.7
SPACING = 0.03


def _plane(origin, u, v, u_len, v_len, rng, spacing=SPACING):
    """Jittered samples on the rectangle origin + a*u + b*v; returns points and the normal u x v."""
    u, v = np.asarray(u, float), np.asarray(v, float)
    nu, nv = max(1, int(u_len / spacing)), max(1, int(v_len / spacing))
    a = (np.arange(nu)[:, None] + rng.random((nu, nv))) / nu * u_len
    b = (np.arange(nv)[None, :] + rng.random((nu, nv))) / nv * v_len
    pts = np.asarray(origin, float) + a.reshape(-1, 1) * u + b.reshape(-1, 1) * v
    n = np.cross(u, v)
    return pts, np.tile(n / np.linalg.norm(n), (len(pts), 1))


def _box(lo, hi, rng, bottom=False):
    """Five (or six) faces of an axis-aligned box."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    faces = [
        _plane((x0, y1, z0), (0, 0, 1), (1, 0, 0), z1 - z0, x1 - x0, rng),   # top (+y)
        _plane((x0, y0, z0), (1, 0, 0), (0, 1, 0), x1 - x0, y1 - y0, rng),   # -z side
        _plane((x0, y0, z1), (0, 1, 0), (1, 0, 0), y1 - y0, x1 - x0, rng),   # +z side
        _plane((x0, y0, z0), (0, 1, 0), (0, 0, 1), y1 - y0, z1 - z0, rng),   # -x side
        _plane((x1, y0, z0), (0, 0, 1), (0, 1, 0), z1 - z0, y1 - y0, rng),   # +x side
    ]
    if bottom:
        faces.append(_plane((x0, y0, z0), (1, 0, 0), (0, 0, 1), x1 - x0, z1 - z0, rng))
    return faces


def _wall_x(x, z0, z1, rng, gaps=()):
    """Wall in the plane x = const from z0 to z1, with (z_start, z_end, top) openings."""
    parts, z = [], z0
    for gz0, gz1, top in sorted(gaps):
        if gz0 > z:
            parts.append(_plane((x, 0, z), (0, 0, 1), (0, 1, 0), gz0 - z, WALL_H, rng))
        parts.append(_plane((x, top, gz0), (0, 0, 1), (0, 1, 0), gz1 - gz0, WALL_H - top, rng))
        z = gz1
    if z1 > z:
        parts.append(_plane((x, 0, z), (0, 0, 1), (0, 1, 0), z1 - z, WALL_H, rng))
    return parts


def _wall_z(z, x0, x1, rng, gaps=()):
    parts, x = [], x0
    for gx0, gx1, top in sorted(gaps):
        if gx0 > x:
            parts.append(_plane((x, 0, z), (1, 0, 0), (0, 1, 0), gx0 - x, WALL_H, rng))
        parts.append(_plane((gx0, top, z), (1, 0, 0), (0, 1, 0), gx1 - gx0, WALL_H - top, rng))
        x = gx1
    if x1 > x:
        parts.append(_plane((x, 0, z), (1, 0, 0), (0, 1, 0), x1 - x, WALL_H, rng))
    return parts


def _noise(p, scale, amp, seed):
    k = np.array([12.9898, 78.233, 37.719]) * (1 + seed)
    return amp * (np.sin(p @ (k / scale)) * 0.5 + np.sin(p @ (k[::-1] / (scale * 1.7))) * 0.5)


def _tiles(p, base, grout, tile=0.6):
    u, v = p[:, 0] / tile, p[:, 2] / tile
    line = (np.abs(u - np.round(u)) < 0.012 / tile) | (np.abs(v - np.round(v)) < 0.012 / tile)
    col = np.tile(base, (len(p), 1)) + _noise(p, 0.4, 0.03, 1)[:, None]
    col[line] = grout
    return col


def _planks(p, base):
    plank = np.floor(p[:, 2] / 0.18)
    shade = 0.06 * np.sin(plank * 12.1) + 0.03 * np.sin(p[:, 0] * 9 + plank * 3)
    return np.tile(base, (len(p), 1)) + shade[:, None]


def build_apartment(seed: int = 7) -> tuple[Splats, np.ndarray, np.ndarray, list[dict]]:
    """Returns (splats, camera positions, camera forward vectors, ground-truth rooms)."""
    rng = np.random.default_rng(seed)
    parts: list[tuple[np.ndarray, np.ndarray, np.ndarray]] = []

    def add(surfaces, color_fn):
        for pts, normals in surfaces:
            parts.append((pts, normals, np.clip(color_fn(pts), 0, 1)))

    solid = lambda rgb, amp=0.03: (lambda p: np.tile(rgb, (len(p), 1)) + _noise(p, 0.3, amp, 2)[:, None])

    # Floors: tiles in living room and kitchen, wooden planks in the bedroom.
    add([_plane((-3, 0, -2), (0, 0, 1), (1, 0, 0), 4.0, 5.0, rng)], lambda p: _tiles(p, [0.86, 0.84, 0.80], [0.6, 0.58, 0.55]))
    add([_plane((-3, 0, 2), (0, 0, 1), (1, 0, 0), 2.5, 3.5, rng)], lambda p: _tiles(p, [0.78, 0.80, 0.82], [0.5, 0.52, 0.55], 0.3))
    add([_plane((2, 0, -2), (0, 0, 1), (1, 0, 0), 3.5, 3.5, rng)], lambda p: _planks(p, [0.62, 0.45, 0.30]))

    # Walls (with a 0.9 m door to the bedroom and a 1.0 m opening to the kitchen).
    living_wall = solid([0.93, 0.90, 0.82], 0.02)
    add(_wall_x(-3, -2, 2, rng) + _wall_z(-2, -3, 2, rng) + _wall_z(2, -3, 2, rng, gaps=[(-1.6, -0.6, 2.1)]), living_wall)
    add(_wall_x(2, -2, 2, rng, gaps=[(-0.2, 0.7, 2.1)]), solid([0.80, 0.86, 0.92], 0.02))
    add(_wall_x(5.5, -2, 1.5, rng) + _wall_z(-2, 2, 5.5, rng) + _wall_z(1.5, 2, 5.5, rng), solid([0.78, 0.84, 0.92], 0.02))
    add(_wall_x(-3, 2, 4.5, rng) + _wall_x(0.5, 2, 4.5, rng) + _wall_z(4.5, -3, 0.5, rng), solid([0.95, 0.93, 0.86], 0.02))

    # Ceilings.
    for x0, x1, z0, z1 in [(-3, 2, -2, 2), (2, 5.5, -2, 1.5), (-3, 0.5, 2, 4.5)]:
        add([_plane((x0, WALL_H, z0), (1, 0, 0), (0, 0, 1), x1 - x0, z1 - z0, rng)], solid([0.97, 0.97, 0.95], 0.01))

    # Furniture (obstacles the router must avoid).
    add(_box((-2.95, 0, -1.2), (-2.1, 0.45, 0.8), rng) + _box((-2.95, 0, -1.2), (-2.75, 0.9, 0.8), rng), solid([0.25, 0.35, 0.55]))  # 3-seater sofa
    add(_box((-1.9, 0.38, -0.7), (-1.3, 0.45, 0.3), rng), solid([0.45, 0.30, 0.18]))  # coffee table top
    for lx, lz in [(-1.85, -0.65), (-1.35, -0.65), (-1.85, 0.25), (-1.35, 0.25)]:
        add(_box((lx - 0.03, 0, lz - 0.03), (lx + 0.03, 0.38, lz + 0.03), rng), solid([0.3, 0.2, 0.12]))
    add([_plane((-2.0, 0.005, -1.0), (0, 0, 1), (1, 0, 0), 1.6, 1.2, rng)], lambda p: np.where(
        (np.sin(p[:, [0]] * 18) * np.sin(p[:, [2]] * 18)) > 0, [0.65, 0.2, 0.2], [0.85, 0.7, 0.45]))  # rug
    add(_box((-0.5, 0, -1.95), (1.5, 0.5, -1.55), rng), solid([0.2, 0.2, 0.22]))  # TV unit
    add([_plane((-0.2, 0.9, -1.98), (1, 0, 0), (0, 1, 0), 1.4, 0.8, rng)], solid([0.05, 0.05, 0.08], 0.01))  # TV
    add(_box((3.4, 0, -1.95), (5.45, 0.55, -0.1), rng), solid([0.9, 0.9, 0.95]))  # bed
    add(_box((4.6, 0, 0.75), (5.45, 2.0, 1.45), rng), solid([0.55, 0.38, 0.25]))  # wardrobe
    add(_box((-2.95, 0, 2.05), (-2.35, 0.9, 4.45), rng), solid([0.35, 0.36, 0.38]))  # kitchen counter
    add(_box((-1.6, 0.72, 2.9), (-0.6, 0.76, 3.7), rng), solid([0.7, 0.55, 0.35]))  # dining table top
    for lx, lz in [(-1.55, 2.95), (-0.65, 2.95), (-1.55, 3.65), (-0.65, 3.65)]:
        add(_box((lx - 0.03, 0, lz - 0.03), (lx + 0.03, 0.72, lz + 0.03), rng), solid([0.4, 0.3, 0.2]))
    add(_box((1.55, 0, 1.55), (1.9, 1.1, 1.9), rng), solid([0.2, 0.5, 0.25], 0.08))  # plant

    pts = np.vstack([p for p, _, _ in parts]).astype(np.float32)
    normals = np.vstack([n for _, n, _ in parts])
    rgb = np.vstack([c for _, _, c in parts])

    # Soft baked lighting: brighter under the room centres, darker near the floor/corners.
    light = 0.82 + 0.18 * np.clip(pts[:, 1] / WALL_H, 0, 1)
    rgb = np.clip(rgb * light[:, None], 0, 1)

    # Disc-shaped Gaussians lying in each surface: tiny extent along the normal.
    n = len(pts)
    scales = np.log(np.tile([SPACING * 0.6, SPACING * 0.6, 0.004], (n, 1))).astype(np.float32)
    z = np.array([0.0, 0.0, 1.0])
    w = 1.0 + normals @ z
    xyz = np.cross(np.tile(z, (n, 1)), normals)
    quats = np.column_stack([w, xyz])
    flipped = w < 1e-6
    quats[flipped] = [0.0, 1.0, 0.0, 0.0]
    quats /= np.linalg.norm(quats, axis=1, keepdims=True)
    splats = Splats(
        means=pts,
        scales=scales,
        quats=quats.astype(np.float32),
        opacities=np.full(n, np.log(0.97 / 0.03), np.float32),
        sh0=((rgb - 0.5) / SH_C0).astype(np.float32),
        shN=np.zeros((n, 0), np.float32),
    )

    # A walk through all three rooms at chest height (stands in for SfM camera centres).
    waypoints = np.array([[-0.8, -1.2], [0.8, -0.8], [1.5, 0.25], [2.6, 0.25], [3.0, 0.9],
                          [2.6, 0.25], [1.0, 0.6], [-1.1, 1.2], [-1.1, 2.5], [0.0, 3.0],
                          [0.0, 4.0], [-1.1, 4.1], [-1.9, 3.3], [-1.9, 2.5], [-1.1, 2.4],
                          [-1.1, 1.2], [-0.8, -1.2]])
    walk = []
    for a, b in zip(waypoints[:-1], waypoints[1:]):
        steps = max(2, int(np.linalg.norm(b - a) / 0.15))
        walk.extend(a + (b - a) * t for t in np.linspace(0, 1, steps, endpoint=False))
    walk = np.array(walk)
    cam_positions = np.column_stack([walk[:, 0], np.full(len(walk), 1.35), walk[:, 1]])
    # Forward differences: consecutive samples are always distinct, so headings never vanish
    # (central differences cancel out where the walk turns back on itself).
    heading = np.diff(walk, axis=0, append=walk[-1:] + (walk[-1:] - walk[-2:-1]))
    heading /= np.linalg.norm(heading, axis=1, keepdims=True)
    cam_forwards = np.column_stack([heading[:, 0], np.zeros(len(walk)), heading[:, 1]])

    rooms = [
        {"name": "Living Room", "category": "room", "center": [-0.5, 0.0], "polygon": [[-3, -2], [2, -2], [2, 2], [-3, 2]]},
        {"name": "Bedroom", "category": "room", "center": [3.75, -0.25], "polygon": [[2, -2], [5.5, -2], [5.5, 1.5], [2, 1.5]]},
        {"name": "Kitchen", "category": "room", "center": [-1.25, 3.25], "polygon": [[-3, 2], [0.5, 2], [0.5, 4.5], [-3, 4.5]]},
        {"name": "3-Seater Sofa", "category": "furniture", "center": [-2.5, -0.2], "tags": ["couch", "sofa", "seating"]},
        {"name": "Coffee Table", "category": "furniture", "center": [-1.6, -0.2], "tags": ["table"]},
        {"name": "TV", "category": "electronics", "center": [0.5, -1.75], "tags": ["television", "screen"]},
        {"name": "Bed", "category": "furniture", "center": [4.4, -1.0], "tags": ["sleep"]},
        {"name": "Wardrobe", "category": "furniture", "center": [5.0, 1.1], "tags": ["closet", "cupboard"]},
        {"name": "Dining Table", "category": "furniture", "center": [-1.1, 3.3], "tags": ["table", "eat"]},
        {"name": "Kitchen Counter", "category": "furniture", "center": [-2.65, 3.25], "tags": ["stove", "sink"]},
    ]
    return splats, cam_positions, cam_forwards, rooms


def rooms_to_pois(rooms: list[dict]) -> dict:
    """Ground-truth places of the test apartment in the web app's pois.json format."""
    pois = []
    for room in rooms:
        slug = room["name"].lower().replace(" ", "-")
        is_zone = "polygon" in room
        pois.append({
            "id": slug,
            "name": room["name"],
            "category": room["category"],
            "tags": room.get("tags", []),
            "position": [room["center"][0], 1.9 if is_zone else 1.1, room["center"][1]],
            "zone": room.get("polygon"),
        })
    return {"version": 1, "pois": pois}


def write_synthetic(out_dir: Path, seed: int = 7) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    splats, cams, fwds, rooms = build_apartment(seed)
    write_ply(out_dir / "splat.ply", splats)
    (out_dir / "cameras.json").write_text(json.dumps({
        "positions": cams.round(4).tolist(), "forwards": fwds.round(4).tolist(),
    }))
    (out_dir / "pois.json").write_text(json.dumps(rooms_to_pois(rooms), indent=2))
    print(f"[synthetic] {len(splats)} Gaussians, {len(cams)} camera poses -> {out_dir}")
    return out_dir
