import base64

import numpy as np
import pytest

from namma.route import (Grid, describe, find_grid_path, grid_from_json, plan_route, smooth_path,
                         turn_kind)

# 7 x 7 cells of 1 m. '#' blocked, '.' walkable. A wall with one gap forces a detour.
LAYOUT = [
    ".......",
    ".......",
    "###.###",
    ".......",
    ".......",
    ".......",
    ".......",
]


def make_grid(layout=LAYOUT, res=1.0) -> Grid:
    walk = np.array([[ch == "." for ch in row] for row in layout])
    clear = np.where(walk, 1.0, 0.0).astype(np.float32)
    return Grid((0.0, 0.0), res, walk, clear)


def test_detours_through_the_gap_and_never_enters_walls():
    grid = make_grid()
    route = plan_route(grid, (0.5, 0.5), (0.5, 5.5))
    assert route is not None
    pts = route["points"]
    assert pts[0] == (0.5, 0.5) and pts[-1] == pytest.approx((0.5, 5.5))
    # Straight line would be 5 m; the detour through column 3 must be longer.
    assert route["length"] > 5.5
    assert all(grid.is_walkable(x, z) for x, z in pts)
    for a, b in zip(pts, pts[1:]):
        assert grid.line_walkable(*a, *b)
    kinds = [s["kind"] for s in route["instructions"]]
    assert kinds[0] == "start" and kinds[-1] == "arrive" and len(kinds) > 2
    assert describe(route["instructions"], "Kitchen")[-1] == "Arrive at Kitchen."


def test_no_corner_cutting():
    # Two diagonal blocks: moving diagonally between them would squeeze through a corner.
    layout = ["..", ".."]
    grid = make_grid(layout)
    grid.walkable[0, 1] = False
    grid.walkable[1, 0] = False
    assert find_grid_path(grid, (0.5, 0.5), (1.5, 1.5)) is None  # (1,1) is cut off


def test_start_and_goal_snap_to_nearest_walkable():
    grid = make_grid()
    route = plan_route(grid, (0.5, 2.5), (6.5, 2.5))  # both inside the wall row
    assert route is not None
    assert grid.is_walkable(*route["points"][-1])


def test_unreachable_and_empty_grids_return_none():
    grid = make_grid(["..#..", "..#..", "..#.."])
    assert plan_route(grid, (0.5, 0.5), (4.5, 0.5)) is None
    empty = make_grid(["##", "##"])
    assert plan_route(empty, (0.5, 0.5), (1.5, 1.5)) is None


def test_smooth_path_collapses_open_floor_to_two_points():
    grid = make_grid(["....."] * 5)
    cells = find_grid_path(grid, (0.5, 0.5), (4.5, 4.5))
    assert len(smooth_path(grid, cells)) == 2


def test_turn_kind_thresholds():
    import math
    assert turn_kind(0.0) == "straight"
    assert turn_kind(math.radians(30)) == "slight-left"
    assert turn_kind(math.radians(-90)) == "right"
    assert turn_kind(math.radians(170)) == "u-turn"


def test_grid_from_json_roundtrip():
    walk = np.array([[1, 0, 1], [1, 1, 1]], dtype=np.uint8)
    clear = np.array([[100, 0, 50], [60, 255, 30]], dtype=np.uint8)
    d = {"version": 1, "resolution": 0.05, "origin": [-1.0, 2.0], "cols": 3, "rows": 2,
         "agentRadius": 0.25, "encoding": "base64-uint8-rowmajor",
         "walkable": base64.b64encode(walk.tobytes()).decode(),
         "clearanceCm": base64.b64encode(clear.tobytes()).decode()}
    grid = grid_from_json(d)
    assert (grid.rows, grid.cols) == (2, 3)
    assert grid.is_walkable(-1.0 + 0.5 * 0.05, 2.0 + 0.5 * 0.05)
    assert not grid.is_walkable(-1.0 + 1.5 * 0.05, 2.0 + 0.5 * 0.05)
    assert grid.clearance[1, 1] == pytest.approx(2.55)
    with pytest.raises(ValueError):
        grid_from_json({**d, "cols": 4})
