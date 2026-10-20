import numpy as np

from namma.clean import clean_splats
from namma.frames import select_sharpest
from namma.splats import read_ply, write_ply


def test_ply_roundtrip(tmp_path, apartment):
    splats = apartment[0].subset(np.arange(5000))
    splats.shN = np.random.default_rng(0).normal(size=(5000, 9)).astype(np.float32)
    write_ply(tmp_path / "s.ply", splats)
    back = read_ply(tmp_path / "s.ply")
    for field in ("means", "scales", "quats", "opacities", "sh0", "shN"):
        assert np.allclose(getattr(back, field), getattr(splats, field)), field


def test_clean_removes_floaters_and_far_splats(apartment):
    splats, cams, _, _ = apartment
    n = len(splats)
    noisy = splats.subset(np.r_[np.arange(n), [0, 1, 2]])
    noisy.means[n] = [0.0, 1.0, 0.0]        # alone in the middle of the living room air
    noisy.means[n + 1] = [40.0, 1.0, 40.0]  # far outside the capture
    noisy.opacities[n + 2] = -8.0            # practically transparent
    cleaned, stats = clean_splats(noisy, cams)
    kept = {tuple(np.round(p, 3)) for p in cleaned.means[-10:]}
    assert (0.0, 1.0, 0.0) not in kept and (40.0, 1.0, 40.0) not in kept
    assert stats["removed_transparent"] >= 1 and stats["removed_outside_bounds"] >= 1
    assert stats["output"] > 0.98 * n


def test_select_sharpest_keeps_best_per_window_and_drops_blur():
    scores = [10, 50, 20,   5, 6, 4,   30, 31, 90]
    kept = select_sharpest(scores, window=3, min_rel_sharpness=0.35)
    assert kept == [1, 8]  # window 2's best (6) is far below the median (20)
