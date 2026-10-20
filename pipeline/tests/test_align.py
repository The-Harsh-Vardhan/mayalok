import numpy as np
from conftest import look_rotation
from scipy.spatial.transform import Rotation

from namma.align import compute_alignment, manhattan_yaw, rotation_between, up_from_cameras
from namma.markers import triangulate_dlt


def _scene(apartment, n_points=40_000, seed=0):
    splats, cams, fwds, _ = apartment
    rng = np.random.default_rng(seed)
    points = splats.means[rng.choice(len(splats), n_points, replace=False)].astype(float)
    rotations = np.array([look_rotation(f + np.array([0, -0.3, 0])) for f in fwds])  # looking slightly down
    return points, cams, rotations


def _distort(points, cams, rotations, scale, rot, trans):
    """Express the scene in an arbitrary SfM-like frame: x_old = scale * rot @ x + trans."""
    return (scale * points @ rot.T + trans, scale * cams @ rot.T + trans, rotations @ rot.T)


def test_rotation_between_maps_vectors():
    for a in [np.array([0.3, -0.8, 0.5]), np.array([0, -1.0, 0]), np.array([0, 1.0, 0])]:
        r = rotation_between(a, np.array([0, 1.0, 0]))
        assert np.allclose(r @ (a / np.linalg.norm(a)), [0, 1, 0], atol=1e-9)
        assert np.allclose(r @ r.T, np.eye(3), atol=1e-9)


def test_up_from_cameras_recovers_gravity(apartment):
    _, _, rotations = _scene(apartment)
    assert np.allclose(up_from_cameras(rotations), [0, 1, 0], atol=0.02)


def test_alignment_recovers_metric_floor_frame(apartment):
    points, cams, rotations = _scene(apartment)
    rot = Rotation.from_euler("xyz", [35, -70, 120], degrees=True).as_matrix()
    p_old, c_old, r_old = _distort(points, cams, rotations, 0.37, rot, np.array([4.0, -2.0, 7.5]))

    alignment = compute_alignment(p_old, c_old, r_old, capture_height_m=1.35)
    aligned = alignment.apply(p_old)

    assert alignment.scale_source == "camera-height"
    assert abs(alignment.scale - 1 / 0.37) / (1 / 0.37) < 0.02
    floor = aligned[np.abs(points[:, 1]) < 1e-3]
    assert np.abs(np.median(floor[:, 1])) < 0.02             # floor at y = 0
    assert np.abs(floor[:, 1]).max() < 0.05                  # and flat (correct up axis)
    assert abs(alignment.info["camera_height_m"] - 1.35) < 0.03
    # Walls are axis-aligned again: the best yaw of the aligned cloud is ~0 (mod 90 degrees).
    walls = aligned[(aligned[:, 1] > 0.3) & (aligned[:, 1] < 2.0)]
    yaw = np.degrees(manhattan_yaw(walls[:, [0, 2]], 0.03)) % 90
    assert min(yaw, 90 - yaw) < 1.0


def test_markers_override_camera_height(apartment):
    points, cams, rotations = _scene(apartment)
    alignment = compute_alignment(points * 2.0, cams * 2.0, rotations, marker_scale=0.5)
    assert alignment.scale_source == "markers"
    assert abs(alignment.scale - 0.5) < 1e-9


def test_dlt_triangulation():
    X = np.array([0.4, -0.2, 3.0])
    projections, pts = [], []
    for angle in (-20, 0, 25):
        R = Rotation.from_euler("y", angle, degrees=True).as_matrix()
        t = np.array([0.1 * angle / 20, 0.0, 0.5])
        P = np.hstack([R, t[:, None]])
        cam = P @ np.append(X, 1)
        projections.append(P)
        pts.append(cam[:2] / cam[2])
    assert np.allclose(triangulate_dlt(projections, pts), X, atol=1e-8)
