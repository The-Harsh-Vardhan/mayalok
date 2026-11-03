"""Command line entry point: `namma build`, `namma process-splat`, `namma synthetic`."""

from __future__ import annotations

import argparse
from pathlib import Path


def _scene_options(p: argparse.ArgumentParser) -> None:
    p.add_argument("--out", required=True, help="scene output folder, e.g. web/public/scenes/home")
    p.add_argument("--name", help="display name shown in the web app")
    p.add_argument("--format", default=".spz", choices=[".spz", ".sog", ".compressed.ply"],
                   help="web splat format (default .spz)")
    p.add_argument("--grid-res", type=float, default=0.05, help="navgrid cell size in metres")
    p.add_argument("--agent-radius", type=float, default=0.25, help="keep paths this far from obstacles (m)")
    p.add_argument("--eye-height", type=float, default=1.6, help="walkthrough camera height (m)")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="mayalok", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="videos/photos -> deployable scene (full pipeline)")
    build.add_argument("--input", nargs="+", required=True, help="video files and/or folders")
    build.add_argument("--work", required=True, help="working folder for intermediate data")
    build.add_argument("--gsplat-dir", required=True, help="path to a gsplat clone (for simple_trainer.py)")
    build.add_argument("--fps", type=float, default=2.0, help="keyframes per second of video")
    build.add_argument("--max-side", type=int, default=1600, help="keyframe long side in pixels")
    build.add_argument("--overlap", type=int, default=15, help="sequential matching window")
    build.add_argument("--vocab-tree", type=Path, help="COLMAP vocabulary tree for loop detection")
    build.add_argument("--mapper", default="global", choices=["global", "incremental"])
    build.add_argument("--sfm-device", default="auto", choices=["auto", "cpu", "cuda"])
    build.add_argument("--marker-size", type=float, default=0.15,
                       help="printed ArUco side length in metres (0 disables marker search)")
    build.add_argument("--capture-height", type=float, default=1.35,
                       help="SOP phone height above the floor, used for scale without markers")
    build.add_argument("--scale", type=float, help="manual metres-per-model-unit override")
    build.add_argument("--steps", type=int, default=30_000, help="gsplat training steps")
    build.add_argument("--cap-max", type=int, default=1_500_000, help="maximum number of Gaussians")
    build.add_argument("--test-every", type=int, default=8, help="hold out every Nth frame for PSNR")
    build.add_argument("--force", action="store_true", help="recompute every stage")
    _scene_options(build)

    proc = sub.add_parser("process-splat", help="existing splat PLY -> deployable scene")
    proc.add_argument("--splat", required=True, help="3DGS PLY already in the metric, floor-at-zero frame")
    proc.add_argument("--cameras", help="cameras.json with walked positions (improves the navgrid)")
    proc.add_argument("--anchors", help="anchors.json (AR marker positions)")
    proc.add_argument("--pois", help="pois.json to install into the scene (otherwise an empty one is created)")
    _scene_options(proc)

    synth = sub.add_parser("synthetic", help="write the procedural test apartment (dev/testing only)")
    synth.add_argument("--out", required=True)
    synth.add_argument("--seed", type=int, default=7)

    args = parser.parse_args(argv)
    if args.command == "build":
        from .pipeline import run_build
        if args.marker_size == 0:
            args.marker_size = None
        run_build(args)
    elif args.command == "process-splat":
        from .pipeline import run_process_splat
        run_process_splat(args)
    else:
        from .synthetic import write_synthetic
        write_synthetic(Path(args.out), args.seed)


if __name__ == "__main__":
    main()
