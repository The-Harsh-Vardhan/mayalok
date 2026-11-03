"""Remove floaters and out-of-scene Gaussians, and fine-tune the floor height.

Runs on the trained splat, which is already in the metric, floor-at-zero frame.
"""

from __future__ import annotations

import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.spatial import cKDTree

from .splats import Splats


def refine_floor_offset(splats: Splats, search: float = 0.3, bin_w: float = 0.01) -> float:
    """Height of the densest opaque layer near y = 0 (the true floor, from dense splats).

    The sparse-point floor fit can be off by a few centimetres; the trained splat has
    far more floor samples. Only a vertical shift is applied, so view-dependent
    colour (spherical harmonics) is unaffected.
    """
    y = splats.means[:, 1]
    mask = (np.abs(y) < search) & (splats.alpha() > 0.5)
    if mask.sum() < 500:
        return 0.0
    counts, edges = np.histogram(y[mask], bins=np.arange(-search, search + bin_w, bin_w))
    peak = int(np.argmax(gaussian_filter1d(counts.astype(float), 1.0)))
    return float(0.5 * (edges[peak] + edges[peak + 1]))


def clean_splats(splats: Splats, cam_positions: np.ndarray, min_opacity: float = 0.05,
                 max_extent_m: float = 1.0, margin_m: float = 3.0, y_range: tuple[float, float] = (-0.5, 4.0),
                 knn: int = 8, std_ratio: float = 3.0) -> tuple[Splats, dict]:
    stats = {"input": len(splats)}

    keep = splats.finite_mask()
    stats["removed_non_finite"] = int((~keep).sum())

    low_alpha = splats.alpha() < min_opacity
    stats["removed_transparent"] = int((keep & low_alpha).sum())
    keep &= ~low_alpha

    huge = splats.max_extent() > max_extent_m
    stats["removed_oversized"] = int((keep & huge).sum())
    keep &= ~huge

    # Walls sit beyond the walked path, hence the generous margin around the cameras.
    # Without camera poses (external splats) fall back to the bulk of the splat itself.
    m = splats.means
    if len(cam_positions):
        lo = cam_positions.min(axis=0) - margin_m
        hi = cam_positions.max(axis=0) + margin_m
    else:
        lo = np.percentile(m[keep], 0.5, axis=0) - 0.5
        hi = np.percentile(m[keep], 99.5, axis=0) + 0.5
    inside = ((m[:, 0] >= lo[0]) & (m[:, 0] <= hi[0]) & (m[:, 2] >= lo[2]) & (m[:, 2] <= hi[2])
              & (m[:, 1] >= y_range[0]) & (m[:, 1] <= y_range[1]))
    stats["removed_outside_bounds"] = int((keep & ~inside).sum())
    keep &= inside

    # Statistical outlier removal: isolated Gaussians floating in empty space.
    idx = np.flatnonzero(keep)
    if len(idx) > knn + 1:
        tree = cKDTree(m[idx])
        dists, _ = tree.query(m[idx], k=knn + 1, workers=-1)
        mean_d = dists[:, 1:].mean(axis=1)
        isolated = mean_d > mean_d.mean() + std_ratio * mean_d.std()
        stats["removed_isolated"] = int(isolated.sum())
        keep[idx[isolated]] = False

    cleaned = splats.subset(keep)
    stats["output"] = len(cleaned)
    return cleaned, stats
