# Mayalok

*Formerly Namma Space.*

**Turn a smartphone walkthrough into a photorealistic, searchable 3D digital twin of an indoor space, with obstacle-aware walking directions in the browser.**

Live demo: https://mayalok.vercel.app (TBD, pending first deploy)

Mayalok reconstructs a venue from ordinary phone video into a 3D Gaussian Splat (`.spz`), derives a walkable occupancy grid from it, and ships a React + Three.js viewer where you can walk around, search for places, and follow a routed path to them.

## Features

- **Smartphone-only capture.** No LiDAR or CAD. Metric scale comes from the phone-height SOP or printed ArUco markers.
- **Photorealistic splats.** Rendered with [Spark.js](https://github.com/sparkjsdev/spark) on Three.js.
- **Spatial indexing and POI tagging.** Places (rooms, items, amenities) are stored as 3D tags with optional floor-plan zone polygons. Admin mode (`?admin`) adds, edits and draws them, with JSON import/export.
- **Pathfinding.** A* over the occupancy grid in a Web Worker, with path smoothing, turn-by-turn instructions and automatic re-routing when you leave the route.
- **Search UI.** Fuzzy search (Fuse.js) over POIs; picking a result shows its card, a route, and an optional autopilot walk to the destination. Deep link with `?to=<poi id or name>`.
- **Minimap and scene switcher.** Top-down map with player, POIs and route; switch scenes from the top bar or with `?scene=<id>`.

## Quick start

### Web viewer

Requires Node 20+.

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

Controls: `WASD` walk, drag or `L` to look, `N` noclip, `G` route to selected place, `F` toggle autopilot, `X` stop, `M` expand map, `P` all places, `H` help. Add `?admin` to edit places and `?stats` for an FPS panel.

### Pipeline (Python)

Requires Python 3.10+. On Windows, using [uv](https://docs.astral.sh/uv/):

```powershell
cd pipeline
uv venv
.venv\Scripts\activate
uv pip install -e ".[test]"        # add ".[sfm]" for pycolmap
```

Build a scene from video, or from an existing trained splat:

```bash
namma build --input walkthrough.mp4 --work ../work/venue --gsplat-dir /path/to/gsplat \
  --out ../web/public/scenes/my-venue --name "My Venue"

namma process-splat --splat point_cloud.ply --cameras cameras.json \
  --out ../web/public/scenes/my-venue --name "My Venue"

namma synthetic --out ../web/public/scenes/demo-apartment   # procedural test scene
```

PLY to `.spz` conversion uses `splat-transform` via npx (no global install):

```powershell
npx -y @playcanvas/splat-transform input.ply scene.spz
```

Then register the scene in `web/public/scenes/index.json`.

## Deploy to Vercel

Import the repo, then set **Root Directory** = `web` and **Framework Preset** = `Vite`. Build command `npm run build`, output directory `dist` (the defaults). Assets use relative paths (`base: "./"`), so no further config is needed.

## Scenes

| Scene | Description |
| --- | --- |
| `incubation` | Real smartphone capture of an incubation centre (24 Oct 2026), pycolmap SfM + Brush 3DGS. Partial: 65 of 293 keyframes registered. |
| `demo-apartment` | Procedurally generated three-room apartment for development and tests. |

Each scene folder in `web/public/scenes/<id>/` holds `scene.json`, `scene.spz`, `navgrid.json`, `minimap.png`, `pois.json` and `report.json`.

## Repository layout

```
pipeline/namma/   Python pipeline: frames, sfm, align, train, clean, navgrid, export, cli
pipeline/tests/   pytest suite
web/src/engine/   Viewer, player controls, POI and path layers
web/src/lib/      A*, router + path worker, geometry, scene loader, search
web/src/ui/       Search bar, POI card, nav HUD, minimap, admin tools
web/public/scenes/ Packaged scenes and index.json
docs/             SOP, technical abstract, briefs
```

## Testing

```bash
cd web && npm test && npm run build      # vitest (A*, turns, geometry) + typecheck + build
cd pipeline && pytest -m "not slow"
```

## Credits and licences

Code is MIT licensed (see [LICENSE](LICENSE)). Built on [Spark.js](https://github.com/sparkjsdev/spark) (MIT), [Three.js](https://threejs.org) (MIT), [React](https://react.dev) (MIT), [Fuse.js](https://www.fusejs.io) (Apache-2.0), [COLMAP](https://colmap.github.io)/pycolmap (BSD), [Brush](https://github.com/ArthurBrussee/brush) and [gsplat](https://github.com/nerfstudio-project/gsplat) (Apache-2.0), and [splat-transform](https://github.com/playcanvas/splat-transform) (MIT).
