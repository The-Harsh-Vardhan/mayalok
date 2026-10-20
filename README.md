# Namma Space 🌐🧭

> **Turn ordinary smartphone captures into photorealistic, interactive 3D digital twins with indoor navigation and spatial search.**

Namma Space is an end-to-end spatial computing engine designed for large indoor environments (retail stores, malls, corporate offices, campuses, and event centers). It reconstructs spaces from video or photos into lightweight 3D Gaussian Splats (`.spz`), extracts 2D/3D walkable occupancy grids, and delivers an interactive browser-based first-person digital twin with turn-by-turn walking guidance around obstacles.

---

## ✨ Features

- **📱 Smartphone-Only Capture**: Walk through any space with an ordinary smartphone camera. No expensive LiDAR rigs or manual CAD modeling required.
- **⚡ Photorealistic 3D Gaussian Splats**: High-performance rasterization using modern 3DGS (`.spz` compressed format) powered by [Spark.js](https://github.com/sparkjsdev/spark) and Three.js.
- **📐 Metric Scale & Gravity Alignment**: Automatic upright coordinate alignment and metric scale calibration via printed ArUco markers or standard phone capture height SOP.
- **🗺️ Automated NavGrid & Minimap**: Point cloud floor slicing and obstacle detection to produce navigable 2D grids and top-down minimaps.
- **🧭 Intelligent Indoor Pathfinding**: Real-time A* path planning running off-thread in a Web Worker, routing around walls, tables, and partitions with turn-by-turn voice/visual directions.
- **🔍 Spatial POI Search & Admin Mode**: Fast fuzzy search (Fuse.js) across rooms, items, and amenities with interactive 3D tags, zone polygons, and admin editing tools.
- **🚶 Autopilot Walkthrough**: Click any Point of Interest or search result to automatically fly or walk smoothly to the destination.

---

## 🏗️ Architecture

```
                 [ Smartphone Capture (Video/Photos) ]
                                  │
                                  ▼
                     [ Keyframe Extraction (namma.frames) ]
                                  │
                                  ▼
                   [ Structure-from-Motion (COLMAP) ]
                                  │
                                  ▼
             [ Metric Scaling & Gravity Alignment (namma.align) ]
                                  │
                                  ▼
             [ 3D Gaussian Splat Training (gsplat / simple_trainer) ]
                                  │
                                  ▼
           [ Splat Cleaning & Ground Plane Leveling (namma.clean) ]
                                  │
                                  ▼
             [ 2D Occupancy NavGrid & Minimap (namma.navgrid) ]
                                  │
                                  ▼
             [ Web Packaging (.spz + navgrid + scene metadata) ]
                                  │
                                  ▼
             [ Web Client: Three.js + Spark.js + React Viewer ]
```

---

## 📁 Repository Structure

```
.
├── pipeline/                 # Python backend processing pipeline
│   ├── namma/
│   │   ├── align.py          # Gravity alignment & metric scaling (ArUco / SOP)
│   │   ├── clean.py          # Splat outlier cleaning & floor leveling
│   │   ├── cli.py            # CLI entry point (`namma build`, `process-splat`, etc.)
│   │   ├── export.py         # Web bundle exporter & scene manifest writer
│   │   ├── frames.py         # Video keyframe extraction & deduplication
│   │   ├── markers.py        # ArUco marker detection & 3D pose solving
│   │   ├── navgrid.py        # Obstacle slicing, 2D occupancy grid & minimap generator
│   │   ├── pipeline.py       # Multi-stage orchestrator with checkpoint resumption
│   │   ├── report.py         # Build metrics and telemetry logger
│   │   ├── sfm.py            # COLMAP feature extraction, matching & mapping
│   │   ├── splats.py         # PLY reader/writer & format conversion
│   │   ├── synthetic.py      # Procedural apartment generator for offline testing
│   │   └── train.py          # gsplat trainer wrapper
│   ├── pyproject.toml        # Python package configuration
│   └── tests/                # Unit & integration test suite
│
└── web/                      # React + Three.js interactive digital twin viewer
    ├── public/
    │   └── scenes/           # Packaged scenes (includes demo-apartment)
    ├── src/
    │   ├── engine/           # 3DGS viewer, first-person player controls, POI/path layers
    │   ├── lib/              # A* search, geometry math, scene loader, fuzzy search
    │   ├── ui/               # Minimap, Navigation HUD, Search Bar, POI Card, Admin UI
    │   ├── App.tsx           # Main application container
    │   └── main.tsx          # React entry point
    ├── package.json
    └── vite.config.ts
```

---

## 🚀 Getting Started

### 1. Web Application

#### Prerequisites
- Node.js (v18+)
- npm or pnpm

#### Run Locally
```bash
cd web
npm install
npm run dev
```

Visit `http://localhost:5173` to explore the included `demo-apartment` digital twin.

#### Key Controls
- **W / A / S / D**: Walk around
- **Mouse Drag / Pointer Lock**: Look around
- **Space / C**: Ascend / Descend (noclip mode)
- **Search Bar (`/`)**: Find points of interest (e.g., "bed", "kitchen", "sofa")
- **Click on Minimap / Scene**: Set custom navigation waypoint
- **Admin Mode**: Add `?admin` to the URL to tag POIs and draw room boundaries

---

### 2. Reconstruction Pipeline

#### Prerequisites
- Python 3.10+
- [COLMAP](https://colmap.github.io/) installed with CUDA support (or CPU fallback)
- [gsplat](https://github.com/nerfstudio-project/gsplat)

#### Installation
```bash
cd pipeline
pip install -e ".[sfm]"
```

#### Build a Scene from Video
```bash
namma build \
  --input /path/to/walkthrough.mp4 \
  --work /path/to/workdir \
  --gsplat-dir /path/to/gsplat \
  --out ../web/public/scenes/my-venue \
  --name "My Venue"
```

#### Process Existing Splats
If you already have a trained 3DGS PLY file:
```bash
namma process-splat \
  --splat /path/to/point_cloud.ply \
  --cameras /path/to/cameras.json \
  --out ../web/public/scenes/my-venue \
  --name "My Venue"
```

#### Generate Procedural Test Scene
```bash
namma synthetic --out ../web/public/scenes/demo-apartment
```

---

## 🧪 Testing

```bash
# Web tests (A* pathfinding, turn instructions, polygon math)
cd web
npm test

# Pipeline tests
cd pipeline
pytest -m "not slow"
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
