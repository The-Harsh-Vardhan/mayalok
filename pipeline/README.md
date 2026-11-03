<p align="center">
  <img src="https://raw.githubusercontent.com/The-Harsh-Vardhan/mayalok/main/docs/Mayalok%20Neon%20Portal%20Banner.png" alt="Mayalok" width="100%">
</p>

# mayalok

**Turn ordinary smartphone video of an indoor space into a photorealistic, navigable 3D digital twin.**

`mayalok` is the reconstruction pipeline behind [Mayalok](https://mayalok.vercel.app): it takes a phone walkthrough
(video and/or photos) and produces a web-ready scene bundle — a compressed 3D Gaussian Splat (`.spz`), a walkable
occupancy grid for obstacle-aware pathfinding, a top-down minimap, POIs and a QC report — that the Mayalok browser
viewer loads for first-person walkthroughs, place search and turn-by-turn indoor navigation.

- **Live viewer:** https://mayalok.vercel.app
- **Docs:** https://the-harsh-vardhan.github.io/mayalok/
- **Source:** https://github.com/The-Harsh-Vardhan/mayalok

## Install

```bash
pip install "mayalok[sfm]"     # includes pycolmap for Structure-from-Motion
mayalok --help
```

The `.spz` export uses [`@playcanvas/splat-transform`](https://www.npmjs.com/package/@playcanvas/splat-transform)
(Node.js 18+; fetched automatically with `npx` if not installed). Training needs a 3DGS trainer such as
[gsplat](https://github.com/nerfstudio-project/gsplat) or [Brush](https://github.com/ArthurBrussee/brush).

## Usage

```bash
# Full pipeline from a walkthrough video
mayalok build --input walkthrough.mp4 --work ./work --out ./scenes/my-venue --name "My Venue"

# Package an already-trained splat for the web viewer
mayalok process-splat --splat point_cloud.ply --cameras cameras.json --out ./scenes/my-venue --name "My Venue"

# Procedural test apartment (no capture needed)
mayalok synthetic --out ./scenes/demo-apartment
```

## How it works

![System context](https://raw.githubusercontent.com/The-Harsh-Vardhan/mayalok/main/docs/diagrams/system-context.png)

| Stage | What it does | Output |
|---|---|---|
| frames | sharpest-frame keyframe extraction (~2 fps) | `images/` |
| sfm | COLMAP / pycolmap features, sequential matching, mapping | `sparse/` |
| align | gravity + metric scale from ArUco markers or phone-height SOP | `cameras.json` |
| train | 3D Gaussian Splatting (gsplat; Brush fallback) | `point_cloud.ply` |
| clean | drop transparent/oversized/isolated splats, level floor | cleaned `.ply` |
| navgrid | 5 cm walkable occupancy grid + minimap | `navgrid.json`, `minimap.png` |
| export | compress splat, write manifest | `scene.spz`, `scene.json` |

![Pipeline stages](https://raw.githubusercontent.com/The-Harsh-Vardhan/mayalok/main/docs/diagrams/pipeline-stages.png)

### Scene bundle

![Scene bundle](https://raw.githubusercontent.com/The-Harsh-Vardhan/mayalok/main/docs/diagrams/scene-bundle.png)

### Data model

![Data model](https://raw.githubusercontent.com/The-Harsh-Vardhan/mayalok/main/docs/diagrams/data-model.png)

## Credits

Built by Team QWERTY (Ajay Yadav, Hitesh Bhatiwal, Harsh Vardhan) for the Techfest 2026-27 (IIT Bombay) Namma Space challenge.
Builds on 3D Gaussian Splatting (Kerbl et al., 2023), COLMAP, Three.js and Spark.js. MIT licence.
