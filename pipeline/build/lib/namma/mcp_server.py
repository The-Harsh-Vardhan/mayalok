"""Mayalok MCP server: let an AI agent explore scene bundles, find places and plan indoor routes.

Run with ``mayalok-mcp`` (stdio transport). Needs the optional extra: ``pip install "mayalok[mcp]"``.

The tool functions below are plain, typed Python so they can be imported and tested without the
``mcp`` package; ``build_server()`` registers them on a FastMCP instance. Every tool validates its
inputs and returns ``{"error": "..."}`` instead of raising.
"""

# Note: no `from __future__ import annotations` here, so FastMCP can read the real annotations.

import difflib
import functools
import json
import os
import sys
from contextlib import redirect_stdout
from pathlib import Path
from typing import Optional

from . import __version__
from .route import describe, grid_from_json, plan_route as _plan_route

SCENE_FILES = ("scene.json", "navgrid.json", "pois.json", "report.json", "minimap.png")


class ToolError(Exception):
    """A user-facing problem (bad path, unknown place, ...) reported as {"error": message}."""


def _safe(fn):
    """Turn exceptions into {"error": ...} so a tool call never produces a traceback."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ToolError as exc:
            return {"error": str(exc)}
        except Exception as exc:  # noqa: BLE001 - last line of defence for an agent-facing API
            return {"error": f"{type(exc).__name__}: {exc}"}

    return wrapper


def _dir(path: str, what: str) -> Path:
    p = Path(str(path)).expanduser()
    if not p.exists():
        raise ToolError(f"{what} not found: {p}")
    if not p.is_dir():
        raise ToolError(f"{what} is not a folder: {p}")
    return p


def _scene(scene_dir: str) -> Path:
    p = _dir(scene_dir, "Scene folder")
    if not (p / "scene.json").is_file():
        hint = " It looks like a scenes folder; use list_scenes first." if any(
            (c / "scene.json").is_file() for c in p.iterdir() if c.is_dir()) else ""
        raise ToolError(f"No scene.json in {p}; not a Mayalok scene bundle.{hint}")
    return p


def _load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ToolError(f"{path.name} is not valid JSON: {exc}") from exc


def _pois(scene: Path) -> list[dict]:
    f = scene / "pois.json"
    if not f.is_file():
        raise ToolError(f"{scene.name} has no pois.json, so there are no places to search.")
    return _load(f).get("pois", [])


# ---------------------------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------------------------

@_safe
def list_scenes(scenes_dir: str) -> dict:
    """List the Mayalok scenes in a folder (e.g. web/public/scenes).

    Uses ``index.json`` when present, otherwise every sub-folder that holds a ``scene.json``.
    Returns ``{"scenes": [{"id", "name", "description", "path"}]}``.
    """
    root = _dir(scenes_dir, "Scenes folder")
    scenes: list[dict] = []
    index = root / "index.json"
    if index.is_file():
        for e in _load(index).get("scenes", []):
            sid = e.get("id", "")
            scenes.append({"id": sid, "name": e.get("name", sid), "description": e.get("description", ""),
                           "path": str(root / sid), "available": (root / sid / "scene.json").is_file()})
    else:
        for sub in sorted(p for p in root.iterdir() if (p / "scene.json").is_file()):
            m = _load(sub / "scene.json")
            scenes.append({"id": m.get("id", sub.name), "name": m.get("name", sub.name), "description": "",
                           "path": str(sub), "available": True})
    if not scenes:
        raise ToolError(f"No scenes found in {root} (no index.json and no sub-folder with scene.json).")
    return {"scenes": scenes}


@_safe
def scene_info(scene_dir: str) -> dict:
    """Summarise one scene bundle: manifest facts plus QC metrics from report.json.

    Includes bounds, spawn point, eye height, counts of POIs/anchors, gaussians, splat size in MB,
    walkable area in m2 and navgrid size. Metrics fall back to ``scene.json`` stats if there is no report.
    """
    scene = _scene(scene_dir)
    m = _load(scene / "scene.json")
    report = _load(scene / "report.json") if (scene / "report.json").is_file() else {}
    metrics = report.get("metrics") or m.get("stats") or {}
    nav = metrics.get("navgrid", {})
    exp = metrics.get("export", {})
    n_pois = len(_pois(scene)) if (scene / "pois.json").is_file() else 0
    return {
        "id": m.get("id"), "name": m.get("name"), "path": str(scene),
        "bounds": m.get("bounds"), "spawn": m.get("spawn"), "eye_height_m": m.get("eyeHeight"),
        "units": m.get("frame", {}).get("units", "meters"),
        "poi_count": n_pois, "anchor_count": len(m.get("anchors", [])),
        "gaussians": exp.get("gaussians"), "splat_mb": exp.get("splat_mb"),
        "walkable_area_m2": nav.get("walkable_area_m2"),
        "grid": {"rows": nav.get("rows"), "cols": nav.get("cols"), "resolution_m": nav.get("resolution_m")},
        "files": {name: (scene / name).is_file() for name in SCENE_FILES},
        "processing_seconds": report.get("total_seconds"),
    }


def _field_score(query: str, text: str) -> float:
    """0..1 similarity of a query to one field: substring wins, else best fuzzy word match."""
    text = text.lower()
    if not text:
        return 0.0
    if query == text:
        return 1.0
    if query in text:
        return 0.9 + 0.1 * len(query) / len(text)
    candidates = [text, *text.replace("-", " ").split()]
    return max(difflib.SequenceMatcher(None, query, c).ratio() for c in candidates)


def _rank(pois: list[dict], query: str, min_score: float = 0.6) -> list[tuple[float, dict]]:
    q = query.strip().lower()
    if not q:
        return [(0.0, p) for p in pois]
    ranked = []
    for p in pois:
        fields = [(1.0, p.get("name", "")), (0.9, p.get("id", "")), (0.7, p.get("category", "")),
                  (0.05, p.get("description", ""))]
        fields += [(0.8, t) for t in p.get("tags", [])]
        best = max((_field_score(q, text) * w for w, text in fields), default=0.0)
        if best >= min_score:
            ranked.append((best, p))
    ranked.sort(key=lambda sp: (-sp[0], len(sp[1].get("name", ""))))
    return ranked


def _poi_summary(score: float, p: dict) -> dict:
    return {"id": p.get("id"), "name": p.get("name"), "category": p.get("category"),
            "tags": p.get("tags", []), "position": p.get("position"), "score": round(score, 3)}


@_safe
def find_places(scene_dir: str, query: str, limit: int = 5) -> dict:
    """Fuzzy-search a scene's places (POIs) by name, tag, category or description.

    Typo tolerant (e.g. "kichen" finds "Kitchen"). Returns up to ``limit`` matches, best first, each with
    id, name, category, tags and world position [x, y, z] in metres.
    """
    scene = _scene(scene_dir)
    if limit < 1:
        raise ToolError("limit must be at least 1.")
    matches = _rank(_pois(scene), query)[:limit]
    return {"query": query, "matches": [_poi_summary(s, p) for s, p in matches]}


def _resolve_poi(pois: list[dict], text: str) -> tuple[dict, list[tuple[float, dict]]]:
    t = text.strip().lower()
    for key in ("id", "name"):
        for p in pois:
            if str(p.get(key, "")).lower() == t:
                return p, _rank(pois, text)[:4]
    ranked = _rank(pois, text)
    if not ranked:
        names = ", ".join(p.get("name", "?") for p in pois[:12])
        raise ToolError(f'No place matches "{text}". Known places: {names}. Try find_places.')
    return ranked[0][1], ranked[:4]


@_safe
def plan_route(scene_dir: str, to_poi: str, from_xyz: Optional[list[float]] = None) -> dict:
    """Plan a walking route inside a scene to a place, avoiding walls and furniture.

    ``to_poi`` is a place id or name (fuzzy matched, see find_places). ``from_xyz`` is the start as
    [x, y, z] or [x, z] in metres; it defaults to the scene's spawn point. Start and goal snap to the
    nearest walkable floor. Returns waypoints [[x, z], ...] in metres, length_m, and turn-by-turn text.
    """
    scene = _scene(scene_dir)
    manifest = _load(scene / "scene.json")
    nav_file = scene / manifest.get("files", {}).get("navgrid", "navgrid.json")
    if not nav_file.is_file():
        raise ToolError(f"Missing {nav_file.name} in {scene}; the scene has no walkable grid.")
    grid = grid_from_json(_load(nav_file))

    poi, ranked = _resolve_poi(_pois(scene), to_poi)
    goal = (float(poi["position"][0]), float(poi["position"][2]))

    if from_xyz is None:
        pos = manifest.get("spawn", {}).get("position")
        if not pos:
            raise ToolError("Scene has no spawn point; pass from_xyz.")
        start = (float(pos[0]), float(pos[2]))
    elif len(from_xyz) in (2, 3):
        start = (float(from_xyz[0]), float(from_xyz[-1]))
    else:
        raise ToolError("from_xyz must be [x, z] or [x, y, z] in metres.")

    route = _plan_route(grid, start, goal)
    if route is None:
        raise ToolError(f"No walkable route from {start} to {poi.get('name')}; the areas are not connected.")

    points = route["points"]
    snapped_goal = grid.nearest_walkable(*goal)
    steps = describe(route["instructions"], poi.get("name", "the destination"))
    if route["length"] < 0.3:
        steps = [f"You are already at {poi.get('name', 'the destination')}."]
    return {
        "destination": _poi_summary(1.0, poi),
        "start": [round(start[0], 2), round(start[1], 2)],
        "start_on_walkable_floor": grid.is_walkable(*start),
        "goal_snapped_to": [round(snapped_goal[0], 2), round(snapped_goal[1], 2)],
        "length_m": round(route["length"], 2),
        "waypoints": [[round(x, 2), round(z, 2)] for x, z in points],
        "directions": steps,
        "turns": [{"kind": s["kind"], "at_m": round(s["at"], 2), "point": [round(s["point"][0], 2), round(s["point"][1], 2)]}
                  for s in route["instructions"]],
        "other_matches": [_poi_summary(s, p)["name"] for s, p in ranked if p is not poi],
    }


def _run_cli(argv: list[str]) -> None:
    """Run the in-process CLI with stdout diverted to stderr (stdout carries the MCP protocol)."""
    from .cli import main as cli_main

    with redirect_stdout(sys.stderr):
        try:
            cli_main(argv)
        except SystemExit as exc:  # argparse rejects bad arguments with SystemExit
            if exc.code not in (0, None):
                raise ToolError(f"mayalok {argv[0]} rejected its arguments (exit code {exc.code}).") from exc


def _bundle_summary(out: Path) -> dict:
    report = _load(out / "report.json") if (out / "report.json").is_file() else {}
    files = {n: str(out / n) for n in sorted(os.listdir(out)) if (out / n).is_file()}
    return {"scene_dir": str(out), "files": files, "metrics": report.get("metrics", {}),
            "total_seconds": report.get("total_seconds")}


@_safe
def process_splat(splat_ply: str, out_dir: str, name: Optional[str] = None, cameras_json: Optional[str] = None,
                  anchors_json: Optional[str] = None, pois_json: Optional[str] = None,
                  splat_format: str = ".spz", grid_res: float = 0.05, agent_radius: float = 0.25,
                  eye_height: float = 1.6) -> dict:
    """Turn an existing 3D Gaussian Splat PLY into a deployable Mayalok scene bundle.

    The PLY must already be in the metric, floor-at-zero frame (+y up). Optionally pass the walked
    camera positions (cameras_json), AR anchors and a pois.json. Runs clean -> navgrid -> minimap ->
    export (the .spz export needs Node.js 18+). Returns the output files and the QC report metrics.
    """
    ply = Path(splat_ply).expanduser()
    if not ply.is_file():
        raise ToolError(f"Splat file not found: {ply}")
    for label, value in (("cameras_json", cameras_json), ("anchors_json", anchors_json), ("pois_json", pois_json)):
        if value and not Path(value).expanduser().is_file():
            raise ToolError(f"{label} file not found: {value}")
    if splat_format not in (".spz", ".sog", ".compressed.ply"):
        raise ToolError("splat_format must be one of .spz, .sog, .compressed.ply")
    argv = ["process-splat", "--splat", str(ply), "--out", str(Path(out_dir).expanduser()),
            "--format", splat_format, "--grid-res", str(grid_res), "--agent-radius", str(agent_radius),
            "--eye-height", str(eye_height)]
    for flag, value in (("--name", name), ("--cameras", cameras_json), ("--anchors", anchors_json), ("--pois", pois_json)):
        if value:
            argv += [flag, str(value)]
    _run_cli(argv)
    return _bundle_summary(Path(out_dir).expanduser())


@_safe
def make_synthetic_scene(out_dir: str, seed: int = 7) -> dict:
    """Generate the procedural three-room test apartment and process it into a full scene bundle.

    Dev/testing only. Source files (splat.ply, cameras.json, pois.json) go to a sibling folder named
    ``<out_dir>_source``; the finished bundle (scene.json, navgrid.json, ...) goes to ``out_dir``.
    """
    out = Path(out_dir).expanduser()
    if out.exists() and not out.is_dir():
        raise ToolError(f"out_dir exists and is not a folder: {out}")
    source = out.with_name(out.name + "_source")
    _run_cli(["synthetic", "--out", str(source), "--seed", str(seed)])
    return process_splat(str(source / "splat.ply"), str(out), name=out.name,
                         cameras_json=str(source / "cameras.json"), pois_json=str(source / "pois.json"))


TOOLS = (list_scenes, scene_info, find_places, plan_route, process_splat, make_synthetic_scene)


# ---------------------------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------------------------

def build_server():
    """Create the MCP server (FastMCP on mcp 1.x, MCPServer on 2.x) with all tools registered."""
    try:
        try:  # mcp 2.x renamed FastMCP to MCPServer
            from mcp.server.mcpserver import MCPServer as FastMCP
        except ImportError:  # mcp 1.x
            from mcp.server.fastmcp import FastMCP
    except ImportError as exc:
        raise SystemExit(
            'The MCP server needs the optional "mcp" package. Install it with:\n'
            '    pip install "mayalok[mcp]"      (or: uvx --from "mayalok[mcp]" mayalok-mcp)'
        ) from exc
    server = FastMCP(
        "mayalok",
        instructions=(
            "Mayalok turns phone video into navigable 3D indoor scenes. Typical flow: list_scenes -> "
            "scene_info -> find_places -> plan_route. Coordinates are metres in the scene frame "
            "(+y up; floor plan is the x/z plane)."
        ),
    )
    for tool in TOOLS:
        server.tool()(tool)
    return server


def _reserve_stdout_for_protocol() -> None:
    """Point fd 1 at stderr and keep a private handle on the real stdout for the MCP stream.

    Stray prints (or child processes such as the splat exporter) then cannot corrupt the protocol.
    """
    sys.stdout.flush()
    real = os.dup(1)
    os.dup2(2, 1)
    sys.stdout = open(real, "w", encoding="utf-8", newline="\n", closefd=True)  # noqa: SIM115


def main() -> None:
    """Entry point for ``mayalok-mcp`` (stdio transport)."""
    if "--version" in sys.argv[1:]:
        print(f"mayalok-mcp {__version__}")
        return
    server = build_server()
    _reserve_stdout_for_protocol()
    server.run(transport="stdio")


if __name__ == "__main__":
    main()
