from pathlib import Path

import pytest

from namma import mcp_server as tools

SCENES = Path(__file__).resolve().parents[2] / "web" / "public" / "scenes"
DEMO = SCENES / "demo-apartment"

pytestmark = pytest.mark.skipif(not DEMO.is_dir(), reason="demo scene bundle not in this checkout")


def test_list_scenes_and_info():
    scenes = tools.list_scenes(str(SCENES))["scenes"]
    assert "demo-apartment" in {s["id"] for s in scenes}
    info = tools.scene_info(str(DEMO))
    assert info["gaussians"] and info["walkable_area_m2"] and info["grid"]["resolution_m"] == 0.05


def test_find_places_is_fuzzy():
    names = [m["name"] for m in tools.find_places(str(DEMO), "kichen")["matches"]]
    assert "Kitchen" in names
    assert tools.find_places(str(DEMO), "bed")["matches"]


def test_plan_route_to_kitchen():
    out = tools.plan_route(str(DEMO), "kitchen")
    assert out["destination"]["name"] == "Kitchen"
    assert out["length_m"] > 0 and len(out["waypoints"]) >= 2
    assert out["directions"][-1] == "Arrive at Kitchen."


def test_errors_are_dicts_not_tracebacks(tmp_path):
    assert "error" in tools.scene_info(str(tmp_path / "nope"))
    assert "error" in tools.scene_info(str(SCENES))  # a scenes folder, not a scene
    assert "error" in tools.plan_route(str(DEMO), "zzzzqqq")
    assert "error" in tools.plan_route(str(DEMO), "kitchen", from_xyz=[1.0])
    assert "error" in tools.process_splat(str(tmp_path / "missing.ply"), str(tmp_path / "out"))
