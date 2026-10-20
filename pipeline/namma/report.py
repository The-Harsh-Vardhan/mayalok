"""Per-run QC report: stage timings and quality metrics, saved as report.json.

The numbers recorded here (turnaround time, % frames registered, PSNR, splat
count, file sizes) feed the technical abstract and answer judge questions about
processing time and pipeline reliability.
"""

from __future__ import annotations

import json
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


class Report:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.data: dict[str, Any] = {"stages": {}, "metrics": {}}
        if self.path.exists():
            # Resume: keep numbers from stages that already ran.
            self.data.update(json.loads(self.path.read_text()))

    @contextmanager
    def stage(self, name: str) -> Iterator[None]:
        print(f"\n=== [{name}] ===", flush=True)
        start = time.perf_counter()
        status = "failed"
        try:
            yield
            status = "ok"
        finally:
            seconds = round(time.perf_counter() - start, 2)
            self.data["stages"][name] = {"seconds": seconds, "status": status}
            print(f"=== [{name}] {status} in {seconds:.1f}s ===", flush=True)
            self.save()

    def metric(self, key: str, value: Any) -> None:
        self.data["metrics"][key] = value
        self.save()

    def update(self, values: dict[str, Any]) -> None:
        self.data["metrics"].update(values)
        self.save()

    def total_seconds(self) -> float:
        return round(sum(s["seconds"] for s in self.data["stages"].values()), 2)

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.data["total_seconds"] = self.total_seconds()
        self.path.write_text(json.dumps(self.data, indent=2, default=_to_jsonable))


def _to_jsonable(value: Any) -> Any:
    # numpy scalars/arrays sneak into metrics; convert them without importing numpy here.
    if hasattr(value, "tolist"):
        return value.tolist()
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"Not JSON serialisable: {type(value)}")
