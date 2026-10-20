from collections import deque

import numpy as np
import pytest

from namma.navgrid import build_navgrid


@pytest.fixture(scope="module")
def grid(apartment):
    splats, cams, _, _ = apartment
    grid, _ = build_navgrid(splats, cams, resolution=0.05, agent_radius=0.25)
    return grid


def walkable_at(grid, x, z):
    r, c = grid.to_cell(x, z)
    return bool(grid.walkable[r, c])


def reachable(grid, start, goal):
    """Breadth-first search over walkable cells (8-connected)."""
    sr, sc = grid.to_cell(*start)
    gr, gc = grid.to_cell(*goal)
    rows, cols = grid.shape
    seen = np.zeros(grid.shape, bool)
    seen[sr, sc] = True
    queue = deque([(int(sr), int(sc))])
    while queue:
        r, c = queue.popleft()
        if (r, c) == (gr, gc):
            return True
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols and grid.walkable[nr, nc] and not seen[nr, nc]:
                    seen[nr, nc] = True
                    queue.append((nr, nc))
    return False


def test_open_floor_is_walkable(grid):
    for x, z in [(-0.5, 0.0), (3.0, 0.9), (0.0, 3.0)]:
        assert walkable_at(grid, x, z), (x, z)


def test_walls_and_furniture_block(grid):
    blocked = {
        "living/bedroom wall": (2.0, -1.2),
        "sofa": (-2.5, -0.2),
        "coffee table": (-1.6, -0.2),
        "bed": (4.4, -1.0),
        "dining table": (-1.1, 3.3),
        "kitchen counter": (-2.65, 3.25),
    }
    for name, (x, z) in blocked.items():
        assert not walkable_at(grid, x, z), name


def test_rooms_connected_through_door_and_opening(grid):
    assert reachable(grid, (-0.5, 0.0), (3.0, 0.9))   # through the 0.9 m bedroom door
    assert reachable(grid, (-0.5, 0.0), (0.0, 3.0))   # through the kitchen opening


def test_walkable_cells_keep_clearance(grid):
    # Apart from the walked path itself, walkable cells keep the agent radius from obstacles.
    tight = grid.walkable & (grid.clearance < grid.agent_radius)
    assert tight.sum() < 0.05 * grid.walkable.sum()


def test_serialisation_roundtrip(grid):
    import base64
    data = grid.to_json()
    walk = np.frombuffer(base64.b64decode(data["walkable"]), np.uint8).reshape(data["rows"], data["cols"])
    assert np.array_equal(walk.astype(bool), grid.walkable)
