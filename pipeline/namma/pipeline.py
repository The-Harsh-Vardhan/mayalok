"""Stage orchestration for `namma build` and `namma process-splat`.

Every stage writes its outputs into the work directory and is skipped on the
next run if they already exist (pass --force to redo), so a Colab session that
disconnects mid-training resumes where it stopped.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np

from .report import Report


def _done(*paths: Path) -> bool:
    return all(Path(p).exists() for p in paths)


def _save_cameras(path: Path, positions: np.ndarray, forwards: np.ndarray) -> None:
    path.write_text(json.dumps({"positions": np.round(positions, 4).tolist(),
                                "forwards": np.round(forwards, 4).tolist()}))


def load_cameras(path: Path | None) -> tuple[np.ndarray, np.ndarray]:
    if not path or not Path(path).exists():
        return np.zeros((0, 3)), np.zeros((0, 3))
    data = json.loads(Path(path).read_text())
    return np.asarray(data["positions"], float).reshape(-1, 3), np.asarray(data["forwards"], float).reshape(-1, 3)


def run_build(args) -> Path:
    work = Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    report = Report(work / "report.json")
    images = work / "images"

    if args.force or not _done(work / "frames.json"):
        from .frames import extract_frames
        with report.stage("frames"):
            report.update(extract_frames([Path(p) for p in args.input], images, target_fps=args.fps,
                                         max_side=args.max_side))

    aligned = work / "sparse_aligned"
    if args.force or not _done(aligned / "images.bin", work / "cameras.json"):
        from .align import align_reconstruction
        from .sfm import extract_and_match, map_poses, reconstruction_stats
        with report.stage("sfm"):
            db = work / "sfm" / "database.db"
            extract_and_match(images, db, max_image_size=args.max_side, overlap=args.overlap,
                              vocab_tree=args.vocab_tree, use_gpu=args.sfm_device)
            rec, mapper = map_poses(images, db, work / "sfm", mapper=args.mapper)
            num_images = len(json.loads((work / "frames.json").read_text()))
            report.update({"sfm": {**reconstruction_stats(rec, num_images), "mapper": mapper}})
        with report.stage("align"):
            alignment, anchors = align_reconstruction(rec, images, marker_size_m=args.marker_size,
                                                      capture_height_m=args.capture_height,
                                                      manual_scale=args.scale)
            aligned.mkdir(parents=True, exist_ok=True)
            rec.write(aligned)
            regs = [rec.images[i] for i in sorted(rec.reg_image_ids(), key=lambda i: rec.images[i].name)]
            positions = np.array([im.projection_center() for im in regs])
            forwards = np.array([im.cam_from_world().rotation.matrix()[2] for im in regs])
            _save_cameras(work / "cameras.json", positions, forwards)
            (work / "anchors.json").write_text(json.dumps(anchors, indent=2))
            (work / "alignment.json").write_text(json.dumps({
                "matrix": alignment.matrix().round(8).tolist(), "scale": alignment.scale,
                "scale_source": alignment.scale_source, "floor_source": alignment.floor_source,
                **alignment.info}, indent=2))
            report.update({"align": {"scale_source": alignment.scale_source,
                                     "floor_source": alignment.floor_source,
                                     "markers_found": alignment.info.get("markers_found", 0),
                                     "camera_height_m": round(alignment.info["camera_height_m"], 3)}})

    dataset = work / "dataset"
    if args.force or not _done(dataset / "sparse"):
        from .sfm import undistort
        with report.stage("undistort"):
            undistort(aligned, images, dataset)

    train_dir = work / "train"
    trained = sorted((train_dir / "ply").glob("*.ply")) if (train_dir / "ply").exists() else []
    if args.force or not trained:
        from .train import train_gsplat
        with report.stage("train"):
            stats = train_gsplat(dataset, train_dir, Path(args.gsplat_dir), steps=args.steps,
                                 cap_max=args.cap_max, test_every=args.test_every)
            report.update({"train": stats})
        trained = sorted((train_dir / "ply").glob("*.ply"))
    splat_ply = max(trained, key=lambda p: p.stat().st_mtime)

    anchors = json.loads((work / "anchors.json").read_text()) if (work / "anchors.json").exists() else []
    return finish_scene(splat_ply, work / "cameras.json", anchors, Path(args.out), args, report)


def finish_scene(splat_ply: Path, cameras_json: Path | None, anchors: list[dict], out: Path, args,
                 report: Report) -> Path:
    """Shared tail of both commands: clean -> navgrid -> minimap -> export."""
    from .clean import clean_splats, refine_floor_offset
    from .export import convert_splat, write_scene
    from .navgrid import build_navgrid, render_minimap, save_navgrid
    from .splats import read_ply, write_ply

    out.mkdir(parents=True, exist_ok=True)
    positions, forwards = load_cameras(cameras_json)

    with report.stage("clean"):
        splats = read_ply(splat_ply)
        splats, clean_stats = clean_splats(splats, positions)
        offset = refine_floor_offset(splats)
        splats.means[:, 1] -= offset
        if len(positions):
            positions[:, 1] -= offset
        for a in anchors:
            a["position"][1] = round(a["position"][1] - offset, 4)
        clean_stats["floor_offset_m"] = round(offset, 4)
        report.update({"clean": clean_stats})
        cleaned = out.parent / f".{out.name}.cleaned.ply"
        write_ply(cleaned, splats)

    with report.stage("navgrid"):
        grid, nav_stats = build_navgrid(splats, positions, resolution=args.grid_res,
                                        agent_radius=args.agent_radius)
        save_navgrid(grid, out / "navgrid.json")
        render_minimap(grid, splats, out / "minimap.png")
        report.update({"navgrid": nav_stats})

    with report.stage("export"):
        splat_name = f"scene{args.format}"
        convert_splat(cleaned, out / splat_name)
        sizes = {"splat_mb": round((out / splat_name).stat().st_size / 1e6, 2),
                 "navgrid_kb": round((out / "navgrid.json").stat().st_size / 1e3, 1),
                 "gaussians": len(splats)}
        report.update({"export": sizes})
        stats = {k: report.data["metrics"].get(k) for k in ("sfm", "align", "train", "clean", "navgrid", "export")}
        stats["processing_seconds"] = report.total_seconds()
        write_scene(out, out.name, args.name or out.name, splat_name, splats, grid, positions, forwards,
                    anchors, args.eye_height, {k: v for k, v in stats.items() if v is not None})
        cleaned.unlink(missing_ok=True)
    shutil.copy2(report.path, out / "report.json")
    print(f"\nScene ready: {out}  (total {report.total_seconds():.0f}s)")
    return out


def run_process_splat(args) -> Path:
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if args.pois:
        shutil.copy2(args.pois, out / "pois.json")
    report = Report(out.parent / f".{out.name}.report.json")
    anchors = json.loads(Path(args.anchors).read_text()) if args.anchors else []
    result = finish_scene(Path(args.splat), Path(args.cameras) if args.cameras else None, anchors, out, args, report)
    report.path.unlink(missing_ok=True)
    return result
