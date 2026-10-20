"""Capture -> keyframes.

Videos are sampled at `oversample` x the target rate and only the sharpest
frame of each window is kept (variance of the Laplacian), which removes most
motion blur from handheld walking footage. Each video gets its own subfolder
(`images/v00`, `images/v01`, ...) so SfM can give every clip its own camera
intrinsics (COLMAP's PER_FOLDER camera mode).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np

VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".3gp"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def sharpness(path: Path, work_width: int = 640) -> float:
    """Variance of the Laplacian on a downscaled grayscale copy (higher = sharper)."""
    img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return 0.0
    h, w = img.shape
    if w > work_width:
        img = cv2.resize(img, (work_width, round(h * work_width / w)), interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(img, cv2.CV_64F).var())


def select_sharpest(scores: list[float], window: int, min_rel_sharpness: float) -> list[int]:
    """Index of the sharpest frame in each window, dropping windows that are all blur."""
    if not scores:
        return []
    floor = min_rel_sharpness * float(np.median(scores))
    kept = []
    for start in range(0, len(scores), window):
        best = max(range(start, min(start + window, len(scores))), key=scores.__getitem__)
        if scores[best] >= floor:
            kept.append(best)
    return kept


def probe_duration(video: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(video)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def _ffmpeg_extract(video: Path, out_dir: Path, fps: float, max_side: int) -> list[Path]:
    # Limit the long side to max_side for both landscape and portrait clips; -2 keeps
    # the aspect ratio with an even dimension. ffmpeg applies the phone's rotation flag.
    scale = (f"scale='if(gte(iw,ih),min(iw,{max_side}),-2)'"
             f":'if(gte(iw,ih),-2,min(ih,{max_side}))'")
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video),
         "-vf", f"fps={fps},{scale}", "-q:v", "2", str(out_dir / "%06d.jpg")],
        check=True,
    )
    return sorted(out_dir.glob("*.jpg"))


def collect_inputs(inputs: list[Path]) -> list[Path]:
    """Expand folders into their video files; image folders are kept as one input."""
    expanded: list[Path] = []
    for item in inputs:
        item = Path(item)
        if item.is_dir():
            videos = sorted(p for p in item.iterdir() if p.suffix.lower() in VIDEO_EXTS)
            images = [p for p in item.iterdir() if p.suffix.lower() in IMAGE_EXTS]
            if videos:
                expanded.extend(videos)
            if images:
                expanded.append(item)
            if not videos and not images:
                raise FileNotFoundError(f"No videos or images found in {item}")
        elif item.suffix.lower() in VIDEO_EXTS:
            expanded.append(item)
        else:
            raise ValueError(f"Unsupported input {item} (expected a video or a folder)")
    return expanded


def extract_frames(
    inputs: list[Path],
    images_dir: Path,
    target_fps: float = 2.0,
    oversample: int = 3,
    max_side: int = 1600,
    min_rel_sharpness: float = 0.35,
) -> dict:
    """Write keyframes to images_dir/<clip>/NNNNNN.jpg and return extraction stats."""
    images_dir = Path(images_dir)
    if images_dir.exists():
        shutil.rmtree(images_dir)
    images_dir.mkdir(parents=True)

    manifest = []
    clips = []
    for clip_idx, source in enumerate(collect_inputs(inputs)):
        clip = f"v{clip_idx:02d}" if source.is_file() else f"p{clip_idx:02d}"
        clip_dir = images_dir / clip
        clip_dir.mkdir()
        with tempfile.TemporaryDirectory() as tmp:
            if source.is_file():
                candidates = _ffmpeg_extract(source, Path(tmp), target_fps * oversample, max_side)
                window = oversample
            else:
                candidates = sorted(p for p in source.iterdir() if p.suffix.lower() in IMAGE_EXTS)
                window = 1  # photos are already deliberate shots; only drop blurry ones
            scores = [sharpness(p) for p in candidates]
            kept = select_sharpest(scores, window, min_rel_sharpness)
            for n, idx in enumerate(kept):
                name = f"{n:06d}.jpg"
                src = candidates[idx]
                if src.suffix.lower() in {".jpg", ".jpeg"}:
                    shutil.copy2(src, clip_dir / name)
                else:
                    cv2.imwrite(str(clip_dir / name), cv2.imread(str(src)), [cv2.IMWRITE_JPEG_QUALITY, 95])
                manifest.append({
                    "name": f"{clip}/{name}",
                    "source": source.name,
                    "time_s": round(idx / (target_fps * oversample), 3) if source.is_file() else None,
                    "sharpness": round(scores[idx], 2),
                })
        clips.append({
            "clip": clip,
            "source": str(source),
            "duration_s": round(probe_duration(source), 2) if source.is_file() else None,
            "candidates": len(candidates),
            "kept": len(kept),
        })
        print(f"[frames] {source.name}: kept {len(kept)} of {len(candidates)} candidates")

    total = sum(c["kept"] for c in clips)
    if total < 20:
        raise RuntimeError(f"Only {total} usable frames; capture is too short or too blurry.")
    # Written last: its presence marks the stage as complete for resumed runs.
    (images_dir.parent / "frames.json").write_text(json.dumps(manifest, indent=1))
    return {"clips": clips, "frames_kept": total}
