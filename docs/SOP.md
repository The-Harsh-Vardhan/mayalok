# Mayalok: Capture SOP (Standard Operating Procedure)

**Goal:** a non-technical person captures an indoor space with only a smartphone, and the pipeline (`namma build`) turns it into a metric-scale 3D Gaussian Splat with a walkable navigation grid.
**Inputs accepted:** videos (`.mp4 .mov .m4v .mkv .3gp ...`) and/or photos (`.jpg .png`) in one folder; many clips of the same space are merged automatically.
**Equipment:** any smartphone, plus (recommended) 3-4 printed ArUco markers. No LiDAR, tripod or other hardware.

## 1. Before you start (10 min)
- [ ] **All lights on**; diffuse daylight is fine. Avoid direct sunlight patches and glare on floors and screens.
- [ ] **Clear clutter from the floor** so the floor stays visible; the floor drives scale and the walkable grid.
- [ ] **Close doors you do not want scanned.** Avoid or cover **mirrors and glass**; reflections create ghost geometry and break pose estimation.
- [ ] Keep people, pets and fans out of the shot. Moving objects become floaters.
- [ ] Clean the lens, charge the phone (>50%), free 5 GB of storage.
- [ ] Record in **portrait or landscape consistently** (do not switch inside one clip). Lock exposure/focus if the camera app allows it; use 1080p or 4K at 30 fps.
- [ ] **Metric scale, option A (preferred): ArUco markers.** Print 3-4 markers (dictionary `DICT_4X4_50`, ids 0-3) at exactly **15 cm** side length (pipeline default `--marker-size 0.15`). Tape them flat on the floor, spread across the space, each visible from several viewpoints.
- [ ] **Metric scale, option B: phone-height SOP.** With no markers, hold the phone at a constant **1.35 m** above the floor (about chest height; pipeline default `--capture-height 1.35`) for the whole capture. Scale is derived from that height, so keep it steady.

## 2. Capture pattern (about 3-5 min per room)
- [ ] **Walk slowly** (about one step per second); never spin in place. Fast turns blur frames and break SfM.
- [ ] **Loop 1, perimeter:** walk the full perimeter, camera facing the opposite walls and the centre.
- [ ] **Loop 2, inner pass:** walk a second loop or lawn-mower pattern through the middle, looking across and slightly down at the floor.
- [ ] **Corner shots:** stand 1-1.5 m from every corner and point the phone into it, sweeping up and down.
- [ ] **Ceiling and floor sweeps:** tilt up to the ceiling edge and down to the floor along each wall.
- [ ] Keep **60-70% overlap** between consecutive views; always keep part of the previous view in frame.
- [ ] Photograph furniture and POI items (reception, signboards, counters) from 2-3 sides as extra close-up photos.
- [ ] Do not film only a blank wall; include edges, corners and objects so SfM has features.

## 3. Doorways and multiple rooms
- [ ] **Small space:** one continuous video through all rooms. Slow down at every doorway; look back into the room just left, then forward into the next, so frames overlap across the threshold.
- [ ] **Large space:** one clip per zone, each starting and ending in an area already covered by a neighbouring clip (about 2 m overlap). Name clips in order (`01_entrance.mp4`, `02_hall.mp4`).
- [ ] Keep doors **fully open and propped**.
- [ ] Walk the **actual routes people will use**: the pipeline treats cells you walked through as free, which repairs gaps on plain floors.

## 4. After capture
- [ ] Put all videos and photos for one site in a single folder.
- [ ] Run `namma build --input <folder> --work <workdir> --gsplat-dir <gsplat> --out <scene> --name "<Site>"`.
- [ ] Check the build report: frames registered, markers found, scale source (`markers` or `camera-height`), PSNR, walkable area.
- [ ] If too few frames register, or the "capture too short or too blurry" error appears, re-record the weak area with more overlap and slower motion.
- [ ] **Alternative route:** capture with Polycam, Luma AI or Scaniverse and export a `.ply` splat. Process it with `namma process-splat --splat <file.ply> --out <scene>` (the splat must already be metric and floor-at-zero; pass `--cameras` if walked positions are available).

## 5. Quick quality gate
| Check | Pass condition |
|---|---|
| Coverage | Every wall, corner, floor area and ceiling edge seen from several viewpoints |
| Sharpness | No blurred stretches (pipeline drops frames below 35% of median sharpness) |
| Lighting | No blown-out windows, no very dark rooms |
| Artifacts | No mirror/glass ghosting; few floaters after cleaning |
| Scale | Markers detected (3+ views each) or constant 1.35 m phone height |
| Output | `scene.spz`, `scene.json` and navgrid load in the web viewer |
