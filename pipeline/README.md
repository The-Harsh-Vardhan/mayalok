# mayalok

Turn ordinary smartphone video of an indoor space into a navigable 3D Gaussian Splat digital twin:
keyframes -> COLMAP SfM -> metric/gravity alignment -> 3DGS training -> cleaning -> walkable navgrid + minimap -> web bundle (`.spz`).

```bash
pip install "mayalok[sfm]"
mayalok --help

# full build from a walkthrough video (needs a 3DGS trainer, see docs)
mayalok build --input walkthrough.mp4 --work ./work --out ./scenes/my-venue --name "My Venue"

# or package an existing trained splat for the web viewer
mayalok process-splat --splat point_cloud.ply --cameras cameras.json --out ./scenes/my-venue --name "My Venue"
```

The `.spz` export uses [`@playcanvas/splat-transform`](https://www.npmjs.com/package/@playcanvas/splat-transform) (Node.js; fetched with `npx` if not installed).

- Docs: https://the-harsh-vardhan.github.io/mayalok/
- Live viewer: https://mayalok.vercel.app
- Source: https://github.com/The-Harsh-Vardhan/mayalok

MIT licence.
