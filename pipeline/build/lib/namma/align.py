"""Put the reconstruction into the world frame every later stage relies on.

World convention (navgrid, web viewer and AR all assume it):
  * units are metres
  * +Y is up and the floor is the plane y = 0
  * X and Z follow the dominant wall directions (Manhattan alignment), so the
    minimap and the navigation grid are axis-aligned
  * the origin is the centre of the area the capture walked through

Steps: gravity from camera orientations -> floor plane from the sparse points
-> metric scale (floor markers, else the SOP's fixed camera height) -> yaw from
wall directions -> one similarity transform applied to cameras and points.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.ndimage import gaussian_filter1d

E_Y = np.array([0.0, 1.0, 0.0])


def normalize(v: np.ndarray) -> np.ndarray:
    return v / np.linalg.norm(v)


def rotation_between(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Smallest rotation taking unit vector a onto unit vector b (Rodrigues)."""
    a, b = normalize(a), normalize(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9:
        if c > 0:
            return np.eye(3)
        # 180 degrees: rotate about any axis perpendicular to a.
        axis = normalize(np.cross(a, [1.0, 0.0, 0.0] if abs(a[0]) < 0.9 else [0.0, 0.0, 1.0]))
        return 2.0 * np.outer(axis, axis) - np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1.0 / (1.0 + c))


def rotation_y(angle_rad: float) -> np.ndarray:
    c, s = np.cos(angle_rad), np.sin(angle_rad)
    return np.array([[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]])


def up_from_cameras(cam_from_world_rotations: np.ndarray) -> np.ndarray:
    """Average 'up' of handheld cameras.

    Row 1 of a world->camera rotation is the image's downward axis expressed in
    world coordinates. Walking full loops makes forward/backward tilt cancel out.
    """
    downs = np.asarray(cam_from_world_rotations)[:, 1, :]
    return normalize(-downs.mean(axis=0))


def fit_floor(points: np.ndarray, cam_centers: np.ndarray, up: np.ndarray,
              min_peak_fraction: float = 0.3, ransac_iters: int = 500,
              max_tilt_deg: float = 10.0, seed: int = 0) -> dict | None:
    """Find the floor plane: the lowest dense layer of points below camera height.

    Returns {"normal", "offset", "inliers"} with normal . p = offset on the floor,
    or None when the sparse cloud has too little floor texture.
    """
    if len(points) < 100:
        return None
    heights = points @ up
    cam_level = float(np.median(cam_centers @ up))
    below = heights[heights < cam_level]
    if len(below) < 50:
        return None
    spread = float(np.median(cam_level - below))
    bin_w = spread / 50.0
    lo = cam_level - 4.0 * spread
    counts, edges = np.histogram(below, bins=np.arange(lo, cam_level + bin_w, bin_w))
    smooth = gaussian_filter1d(counts.astype(float), 1.5)
    peaks = [i for i in range(1, len(smooth) - 1)
             if smooth[i] >= smooth[i - 1] and smooth[i] >= smooth[i + 1]
             and smooth[i] >= min_peak_fraction * smooth.max()]
    if not peaks:
        return None
    floor_h = 0.5 * (edges[peaks[0]] + edges[peaks[0] + 1])  # lowest significant layer

    band = points[np.abs(heights - floor_h) < 2.0 * bin_w]
    if len(band) < 30:
        return None
    rng = np.random.default_rng(seed)
    cos_tilt = np.cos(np.radians(max_tilt_deg))
    best_inliers = None
    for _ in range(ransac_iters):
        a, b, c = band[rng.choice(len(band), 3, replace=False)]
        n = np.cross(b - a, c - a)
        norm = np.linalg.norm(n)
        if norm < 1e-12:
            continue
        n /= norm
        if n @ up < 0:
            n = -n
        if n @ up < cos_tilt:
            continue
        inliers = np.abs(band @ n - n @ a) < bin_w
        if best_inliers is None or inliers.sum() > best_inliers.sum():
            best_inliers = inliers
    if best_inliers is None or best_inliers.sum() < 30:
        return None

    # Least-squares refinement on the inliers.
    pts = band[best_inliers]
    centroid = pts.mean(axis=0)
    _, _, vt = np.linalg.svd(pts - centroid)
    normal = vt[-1] if vt[-1] @ up > 0 else -vt[-1]
    return {"normal": normal, "offset": float(normal @ centroid), "inliers": int(best_inliers.sum())}


def manhattan_yaw(xz: np.ndarray, bin_size: float) -> float:
    """Yaw (radians) that best lines walls up with the X and Z axes.

    Walls project to sharp spikes in the x/z histograms when axis-aligned, so we
    maximise the sum of squared histogram counts over a 90-degree sweep.
    """
    if len(xz) < 50:
        return 0.0

    def score(theta: float) -> float:
        c, s = np.cos(theta), np.sin(theta)
        x = xz[:, 0] * c + xz[:, 1] * s
        z = -xz[:, 0] * s + xz[:, 1] * c
        total = 0.0
        for coord in (x, z):
            n_bins = max(1, int(np.ptp(coord) / bin_size))
            hist, _ = np.histogram(coord, bins=n_bins)
            total += float((hist.astype(float) ** 2).sum())
        return total

    coarse = np.radians(np.arange(0.0, 90.0, 1.0))
    best = max(coarse, key=score)
    fine = best + np.radians(np.arange(-1.0, 1.0001, 0.1))
    return float(max(fine, key=score))


@dataclass
class Alignment:
    scale: float
    rotation: np.ndarray
    translation: np.ndarray
    scale_source: str
    floor_source: str
    info: dict = field(default_factory=dict)

    def matrix(self) -> np.ndarray:
        m = np.eye(4)
        m[:3, :3] = self.scale * self.rotation
        m[:3, 3] = self.translation
        return m

    def apply(self, points: np.ndarray) -> np.ndarray:
        return self.scale * points @ self.rotation.T + self.translation


def compute_alignment(points: np.ndarray, cam_centers: np.ndarray, cam_rotations: np.ndarray,
                      marker_scale: float | None = None, marker_floor_heights: list[float] | None = None,
                      capture_height_m: float = 1.35, manual_scale: float | None = None) -> Alignment:
    """Similarity transform old-world -> metric, Y-up, floor-at-zero, Manhattan-aligned frame.

    Scale priority: manual > floor markers > SOP camera height.
    """
    up = up_from_cameras(cam_rotations)
    info: dict = {"camera_up_old": up.tolist()}

    floor = fit_floor(points, cam_centers, up)
    if floor is not None:
        info["camera_vs_floor_tilt_deg"] = float(np.degrees(np.arccos(np.clip(floor["normal"] @ up, -1, 1))))
        up, floor_h, floor_source = floor["normal"], floor["offset"], "sparse-points"
        info["floor_inliers"] = floor["inliers"]
    elif marker_floor_heights:
        floor_h, floor_source = float(np.median(marker_floor_heights)), "markers"
    else:
        floor_h, floor_source = None, "camera-height"

    cam_heights = cam_centers @ up
    cam_level = float(np.median(cam_heights))

    if manual_scale:
        scale, scale_source = float(manual_scale), "manual"
    elif marker_scale:
        scale, scale_source = float(marker_scale), "markers"
    elif floor_h is not None:
        scale, scale_source = capture_height_m / (cam_level - floor_h), "camera-height"
    else:
        raise RuntimeError("Cannot determine scale: no floor detected and no markers found. "
                           "Pass --scale or capture with floor markers (see SOP).")
    if floor_h is None:
        floor_h = cam_level - capture_height_m / scale

    r_up = rotation_between(up, E_Y)
    walls = points[((points @ up) - floor_h) * scale > 0.3]
    walls = walls[((walls @ up) - floor_h) * scale < 2.0]
    rotated = scale * walls @ r_up.T
    yaw = manhattan_yaw(rotated[:, [0, 2]], bin_size=0.03)
    rotation = rotation_y(yaw) @ r_up

    cams_new = scale * cam_centers @ rotation.T
    lo, hi = cams_new.min(axis=0), cams_new.max(axis=0)
    translation = np.array([-(lo[0] + hi[0]) / 2.0, -scale * floor_h, -(lo[2] + hi[2]) / 2.0])

    info.update({
        "yaw_deg": float(np.degrees(yaw)),
        "camera_height_m": float(scale * (cam_level - floor_h)),
    })
    return Alignment(scale, rotation, translation, scale_source, floor_source, info)


def align_reconstruction(rec, images_dir, marker_size_m: float | None = 0.15,
                         capture_height_m: float = 1.35, manual_scale: float | None = None):
    """Align a pycolmap Reconstruction in place. Returns (Alignment, markers in the new frame)."""
    import pycolmap

    from .markers import scale_from_markers, triangulate_markers

    images = [rec.images[i] for i in rec.reg_image_ids()]
    rotations = np.array([im.cam_from_world().rotation.matrix() for im in images])
    centers = np.array([im.projection_center() for im in images])
    points = np.array([p.xyz for p in rec.points3D.values()])

    markers = triangulate_markers(rec, images_dir) if marker_size_m else []
    marker_scale = scale_from_markers(markers, marker_size_m) if markers else None
    up_guess = up_from_cameras(rotations)
    alignment = compute_alignment(
        points, centers, rotations,
        marker_scale=marker_scale,
        marker_floor_heights=[float(m["center"] @ up_guess) for m in markers],
        capture_height_m=capture_height_m,
        manual_scale=manual_scale,
    )
    rec.transform(pycolmap.Sim3d(alignment.scale, pycolmap.Rotation3d(alignment.rotation),
                                 alignment.translation))

    anchors = [{
        "id": m["id"],
        "position": alignment.apply(m["center"][None])[0].round(4).tolist(),
        "normal": (alignment.rotation @ m["normal"]).round(4).tolist(),
        "side_m": round(alignment.scale * m["side"], 4),
        "views": m["views"],
    } for m in markers]
    alignment.info["markers_found"] = len(markers)
    return alignment, anchors
