"""End-to-end SfM on images rendered by pycolmap's synthetic dataset generator."""

import numpy as np
import pytest

pycolmap = pytest.importorskip("pycolmap")

from namma.sfm import extract_and_match, map_poses  # noqa: E402


@pytest.mark.slow
def test_sfm_registers_synthetic_images(tmp_path):
    options = pycolmap.SyntheticDatasetOptions()
    options.num_rigs = 1
    options.num_frames_per_rig = 12
    options.num_points3D = 100  # few enough that the rendered feature patches don't overlap
    options.camera_width, options.camera_height = 800, 600
    options.camera_params = [720.0, 400.0, 300.0, 0.0]
    truth = pycolmap.synthesize_dataset(options)
    images = tmp_path / "images" / "v00"
    images.mkdir(parents=True)
    pycolmap.synthesize_images(pycolmap.SyntheticImageOptions(), truth, images)

    db = tmp_path / "database.db"
    extract_and_match(tmp_path / "images", db, max_image_size=800, overlap=12, use_gpu="cpu")
    rec, _ = map_poses(tmp_path / "images", db, tmp_path / "sfm")
    assert rec.num_reg_images() == 12
    assert rec.compute_mean_reprojection_error() < 1.5
    assert np.isfinite([im.projection_center() for im in rec.images.values()]).all()
