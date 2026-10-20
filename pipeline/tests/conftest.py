import numpy as np
import pytest

from namma.synthetic import build_apartment


@pytest.fixture(scope="session")
def apartment():
    """(splats, camera positions, camera forwards, rooms) of the procedural test apartment."""
    return build_apartment(seed=7)


def look_rotation(forward: np.ndarray, up: np.ndarray = np.array([0.0, 1.0, 0.0])) -> np.ndarray:
    """World->camera rotation for a COLMAP camera (x right, y down, z forward)."""
    z = forward / np.linalg.norm(forward)
    y = -up - (-up @ z) * z
    y /= np.linalg.norm(y)
    x = np.cross(y, z)
    return np.stack([x, y, z])
