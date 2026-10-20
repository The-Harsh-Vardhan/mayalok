"""Undistorted dataset -> trained Gaussian splat, using gsplat's reference trainer.

We call gsplat's `examples/simple_trainer.py` (pinned commit, see the Colab
notebook) with the MCMC densification strategy and a hard cap on the number of
Gaussians, which bounds both GPU memory and the size of the web download.
World-space normalisation is disabled so the splat stays in our metric,
floor-at-zero frame (set by the align stage).
"""

from __future__ import annotations

import glob
import json
import os
import subprocess
import sys
from pathlib import Path


def train_gsplat(dataset_dir: Path, result_dir: Path, gsplat_dir: Path, steps: int = 30_000,
                 cap_max: int = 1_500_000, data_factor: int = 1, test_every: int = 8,
                 extra_args: list[str] | None = None) -> dict:
    examples = Path(gsplat_dir) / "examples"
    trainer = examples / "simple_trainer.py"
    if not trainer.exists():
        raise FileNotFoundError(f"{trainer} not found; clone gsplat and pass --gsplat-dir")

    # Flag spelling follows tyro: booleans are --flag / --no-flag.
    cmd = [
        sys.executable, str(trainer), "mcmc",
        "--data-dir", str(Path(dataset_dir).resolve()),
        "--result-dir", str(Path(result_dir).resolve()),
        "--data-factor", str(data_factor),
        "--test-every", str(test_every),
        "--max-steps", str(steps),
        "--eval-steps", str(steps),
        "--save-steps", str(steps),
        "--ply-steps", str(steps),
        "--strategy.cap-max", str(cap_max),
        "--no-normalize-world-space",
        "--save-ply",
        "--disable-viewer",
        "--disable-video",
        *(extra_args or []),
    ]
    print("[train]", " ".join(cmd), flush=True)
    env = dict(os.environ, PYTHONUNBUFFERED="1")
    subprocess.run(cmd, cwd=examples, check=True, env=env)

    plys = sorted(glob.glob(str(Path(result_dir) / "ply" / "*.ply")), key=os.path.getmtime)
    if not plys:
        raise RuntimeError(f"Training finished but no PLY was written under {result_dir}/ply")
    stats = {"ply": plys[-1], "steps": steps, "cap_max": cap_max}
    val = sorted(glob.glob(str(Path(result_dir) / "stats" / "val_step*.json")), key=os.path.getmtime)
    if val:
        metrics = json.loads(Path(val[-1]).read_text())
        stats.update({k: round(float(v), 4) for k, v in metrics.items() if isinstance(v, (int, float))})
    return stats
