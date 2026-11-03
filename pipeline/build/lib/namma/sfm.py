"""Keyframes -> camera poses + sparse point cloud (COLMAP 4.x via pycolmap).

Video frames are matched sequentially (each frame against its next `overlap`
neighbours, plus quadratic long-range jumps for loop closure), then mapped with
COLMAP's global mapper (GLOMAP). If the global mapper registers too few frames
we fall back to incremental mapping, which is slower but more forgiving.
"""

from __future__ import annotations

import shutil
from pathlib import Path


def _device(pycolmap, use_gpu: str):
    return {"auto": pycolmap.Device.auto, "cpu": pycolmap.Device.cpu, "cuda": pycolmap.Device.cuda}[use_gpu]


def extract_and_match(
    images_dir: Path,
    database: Path,
    camera_model: str = "SIMPLE_RADIAL",
    max_image_size: int = 1600,
    max_features: int = 8192,
    overlap: int = 15,
    vocab_tree: Path | None = None,
    use_gpu: str = "auto",
) -> None:
    import pycolmap

    database = Path(database)
    if database.exists():
        database.unlink()
    database.parent.mkdir(parents=True, exist_ok=True)
    device = _device(pycolmap, use_gpu)

    reader = pycolmap.ImageReaderOptions()
    reader.camera_model = camera_model
    extraction = pycolmap.FeatureExtractionOptions()
    extraction.max_image_size = max_image_size
    extraction.sift.max_num_features = max_features
    pycolmap.extract_features(
        database, images_dir,
        camera_mode=pycolmap.CameraMode.PER_FOLDER,  # one intrinsics set per clip
        reader_options=reader, extraction_options=extraction, device=device,
    )

    pairing = pycolmap.SequentialPairingOptions()
    pairing.overlap = overlap
    pairing.quadratic_overlap = True
    if vocab_tree:
        pairing.loop_detection = True
        pairing.vocab_tree_path = str(vocab_tree)
    pycolmap.match_sequential(database, pairing_options=pairing, device=device)


def map_poses(images_dir: Path, database: Path, out_dir: Path, mapper: str = "global",
              min_registered_ratio: float = 0.7):
    """Run the mapper; returns (best reconstruction, mapper actually used)."""
    import pycolmap

    num_images = len([p for p in Path(images_dir).rglob("*") if p.is_file()])
    attempts = ["global", "incremental"] if mapper == "global" else ["incremental"]
    best, used = None, None
    for attempt in attempts:
        raw = Path(out_dir) / f"raw_{attempt}"
        shutil.rmtree(raw, ignore_errors=True)
        raw.mkdir(parents=True)
        if attempt == "global":
            recs = pycolmap.global_mapping(database, images_dir, raw)
        else:
            recs = pycolmap.incremental_mapping(database, images_dir, raw)
        if recs:
            candidate = max(recs.values(), key=lambda r: r.num_reg_images())
            ratio = candidate.num_reg_images() / max(num_images, 1)
            print(f"[sfm] {attempt} mapper registered {candidate.num_reg_images()}/{num_images} frames "
                  f"({ratio:.0%}) in {len(recs)} model(s)")
            if best is None or candidate.num_reg_images() > best.num_reg_images():
                best, used = candidate, attempt
            if ratio >= min_registered_ratio:
                break
        else:
            print(f"[sfm] {attempt} mapper produced no model")
    if best is None:
        raise RuntimeError("SfM failed: no reconstruction. Check the capture against the SOP "
                           "(texture, overlap, motion blur).")
    return best, used


def reconstruction_stats(rec, num_images: int) -> dict:
    return {
        "frames_total": num_images,
        "frames_registered": rec.num_reg_images(),
        "registered_ratio": round(rec.num_reg_images() / max(num_images, 1), 4),
        "points3d": rec.num_points3D(),
        "mean_reprojection_error_px": round(rec.compute_mean_reprojection_error(), 4),
        "mean_track_length": round(rec.compute_mean_track_length(), 3),
        "cameras": rec.num_cameras(),
    }


def undistort(sparse_dir: Path, images_dir: Path, dataset_dir: Path) -> None:
    """Write a PINHOLE dataset (images/ + sparse/) that gsplat can train on directly."""
    import pycolmap

    dataset_dir = Path(dataset_dir)
    shutil.rmtree(dataset_dir, ignore_errors=True)
    dataset_dir.mkdir(parents=True)
    pycolmap.undistort_images(dataset_dir, sparse_dir, images_dir, output_type="COLMAP")
