"""Read/write 3D Gaussian Splatting PLY files (the layout gsplat and most viewers use).

Per Gaussian: position (x, y, z), DC colour f_dc_0..2, higher-order SH f_rest_*,
opacity as a logit, log scales scale_0..2 and a (w, x, y, z) quaternion rot_0..3.

The PLY reader/writer is a small numpy implementation of binary PLY (vertex element,
scalar properties), which is all splat files use.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

SH_C0 = 0.28209479177387814

_PLY_TYPES = {
    "char": "i1", "int8": "i1", "uchar": "u1", "uint8": "u1",
    "short": "i2", "int16": "i2", "ushort": "u2", "uint16": "u2",
    "int": "i4", "int32": "i4", "uint": "u4", "uint32": "u4",
    "float": "f4", "float32": "f4", "double": "f8", "float64": "f8",
}


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


@dataclass
class Splats:
    means: np.ndarray      # (N, 3) float32
    scales: np.ndarray     # (N, 3) log scales
    quats: np.ndarray      # (N, 4) w, x, y, z (not necessarily normalised)
    opacities: np.ndarray  # (N,) logits
    sh0: np.ndarray        # (N, 3) DC coefficients
    shN: np.ndarray        # (N, K) f_rest_* in file order (K = 0, 9, 24 or 45)

    def __len__(self) -> int:
        return len(self.means)

    def subset(self, mask: np.ndarray) -> "Splats":
        return Splats(self.means[mask], self.scales[mask], self.quats[mask],
                      self.opacities[mask], self.sh0[mask], self.shN[mask])

    def alpha(self) -> np.ndarray:
        return sigmoid(self.opacities)

    def rgb(self) -> np.ndarray:
        """Base (view-independent) colour in [0, 1]."""
        return np.clip(0.5 + SH_C0 * self.sh0, 0.0, 1.0)

    def max_extent(self) -> np.ndarray:
        """Largest standard deviation of each Gaussian, in scene units."""
        return np.exp(self.scales).max(axis=1)

    def finite_mask(self) -> np.ndarray:
        fields = [self.means, self.scales, self.quats, self.opacities[:, None], self.sh0]
        if self.shN.size:
            fields.append(self.shN)
        return np.all(np.isfinite(np.hstack(fields)), axis=1)


def read_ply_vertices(path: Path) -> np.ndarray:
    """Vertex element of a binary PLY as a numpy structured array."""
    with open(path, "rb") as f:
        if f.readline().strip() != b"ply":
            raise ValueError(f"{path} is not a PLY file")
        fmt, count, fields, in_vertex, other_elements = None, 0, [], False, False
        while True:
            line = f.readline()
            if not line:
                raise ValueError(f"{path}: truncated PLY header")
            tokens = line.decode("ascii", "replace").split()
            if not tokens or tokens[0] in ("comment", "obj_info"):
                continue
            if tokens[0] == "end_header":
                break
            if tokens[0] == "format":
                fmt = tokens[1]
            elif tokens[0] == "element":
                in_vertex = tokens[1] == "vertex"
                if in_vertex:
                    count = int(tokens[2])
                elif count:
                    other_elements = True
            elif tokens[0] == "property" and in_vertex:
                if tokens[1] == "list":
                    raise ValueError(f"{path}: list properties are not supported in splat PLYs")
                fields.append((tokens[2], _PLY_TYPES[tokens[1]]))
        if fmt not in ("binary_little_endian", "binary_big_endian"):
            raise ValueError(f"{path}: only binary PLY is supported (got {fmt})")
        endian = "<" if fmt == "binary_little_endian" else ">"
        dtype = np.dtype([(name, endian + t) for name, t in fields])
        data = np.frombuffer(f.read(count * dtype.itemsize), dtype=dtype, count=count)
    if other_elements:
        print(f"[splats] note: ignoring non-vertex elements in {path}")
    return data


def read_ply(path: Path) -> Splats:
    vertex = read_ply_vertices(path)
    names = vertex.dtype.names

    def cols(prefix: str, n: int) -> np.ndarray:
        return np.stack([vertex[f"{prefix}{i}"].astype(np.float32) for i in range(n)], axis=1)

    n_rest = sum(1 for name in names if name.startswith("f_rest_"))
    return Splats(
        means=np.stack([vertex[a].astype(np.float32) for a in "xyz"], axis=1),
        scales=cols("scale_", 3),
        quats=cols("rot_", 4),
        opacities=vertex["opacity"].astype(np.float32),
        sh0=cols("f_dc_", 3),
        shN=cols("f_rest_", n_rest) if n_rest else np.zeros((len(vertex), 0), np.float32),
    )


def write_ply(path: Path, splats: Splats) -> None:
    n_rest = splats.shN.shape[1]
    names = (["x", "y", "z"] + [f"f_dc_{i}" for i in range(3)] + [f"f_rest_{i}" for i in range(n_rest)]
             + ["opacity"] + [f"scale_{i}" for i in range(3)] + [f"rot_{i}" for i in range(4)])
    columns = np.hstack([splats.means, splats.sh0, splats.shN, splats.opacities[:, None],
                         splats.scales, splats.quats]).astype("<f4")
    header = "\n".join(["ply", "format binary_little_endian 1.0", f"element vertex {len(splats)}",
                        *[f"property float {name}" for name in names], "end_header"]) + "\n"
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(header.encode("ascii"))
        f.write(np.ascontiguousarray(columns).tobytes())
