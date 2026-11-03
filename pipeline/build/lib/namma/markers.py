"""Printed ArUco markers lying on the floor -> metric scale and AR anchor points.

SfM recovers the scene only up to an unknown scale. The SOP places two printed
markers of known side length on the floor; we detect their corners in the
registered frames, triangulate them, and compare the triangulated side length
with the printed one. The same markers are later used as AR anchors.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

ARUCO_DICT = cv2.aruco.DICT_4X4_50


def detect_markers(image: np.ndarray) -> dict[int, np.ndarray]:
    """Marker id -> (4, 2) pixel corners, in ArUco's clockwise order from top-left."""
    dictionary = cv2.aruco.getPredefinedDictionary(ARUCO_DICT)
    params = cv2.aruco.DetectorParameters()
    params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    detector = cv2.aruco.ArucoDetector(dictionary, params)
    corners, ids, _ = detector.detectMarkers(image)
    if ids is None:
        return {}
    return {int(i): c.reshape(4, 2).astype(np.float64) for i, c in zip(ids.ravel(), corners)}


def triangulate_dlt(projections: list[np.ndarray], points: list[np.ndarray]) -> np.ndarray:
    """Linear multi-view triangulation from normalized image points and 3x4 [R|t] matrices."""
    rows = []
    for P, (x, y) in zip(projections, points):
        rows.append(x * P[2] - P[0])
        rows.append(y * P[2] - P[1])
    _, _, vt = np.linalg.svd(np.asarray(rows))
    X = vt[-1]
    return X[:3] / X[3]


def _reprojection_errors(X: np.ndarray, projections: list[np.ndarray], points: list[np.ndarray]) -> np.ndarray:
    errs = []
    for P, p in zip(projections, points):
        cam = P @ np.append(X, 1.0)
        if cam[2] <= 0:
            errs.append(np.inf)
        else:
            errs.append(np.linalg.norm(cam[:2] / cam[2] - p))
    return np.asarray(errs)


def triangulate_markers(rec, images_dir: Path, min_views: int = 3, max_norm_error: float = 0.01,
                        max_images: int = 400) -> list[dict]:
    """Detect and triangulate floor markers in a pycolmap Reconstruction (its current frame)."""
    images_dir = Path(images_dir)
    observations: dict[int, list[tuple[np.ndarray, np.ndarray]]] = {}
    image_ids = sorted(rec.reg_image_ids())
    step = max(1, len(image_ids) // max_images)
    for image_id in image_ids[::step]:
        image = rec.images[image_id]
        pixels = cv2.imread(str(images_dir / image.name), cv2.IMREAD_GRAYSCALE)
        if pixels is None:
            continue
        found = detect_markers(pixels)
        if not found:
            continue
        pose = image.cam_from_world()
        P = np.hstack([pose.rotation.matrix(), pose.translation.reshape(3, 1)])
        camera = rec.cameras[image.camera_id]
        for marker_id, corners in found.items():
            observations.setdefault(marker_id, []).append((P, camera.cam_from_img(corners)))

    markers = []
    for marker_id, obs in sorted(observations.items()):
        if len(obs) < min_views:
            continue
        projections = [P for P, _ in obs]
        corners3d, errors = [], []
        for k in range(4):
            pts = [norm[k] for _, norm in obs]
            X = triangulate_dlt(projections, pts)
            corners3d.append(X)
            errors.append(np.median(_reprojection_errors(X, projections, pts)))
        if max(errors) > max_norm_error:
            print(f"[markers] marker {marker_id}: rejected (reprojection error {max(errors):.4f})")
            continue
        c = np.asarray(corners3d)
        side = float(np.mean([np.linalg.norm(c[(k + 1) % 4] - c[k]) for k in range(4)]))
        normal = np.cross(c[1] - c[0], c[3] - c[0])
        normal /= np.linalg.norm(normal)
        markers.append({
            "id": marker_id,
            "corners": c,
            "center": c.mean(axis=0),
            "normal": normal,
            "side": side,
            "views": len(obs),
            "error": float(max(errors)),
        })
        print(f"[markers] marker {marker_id}: {len(obs)} views, side {side:.4f} model units")
    return markers


def scale_from_markers(markers: list[dict], marker_size_m: float) -> float | None:
    sides = [m["side"] for m in markers if m["side"] > 0]
    if not sides:
        return None
    return marker_size_m / float(np.median(sides))
