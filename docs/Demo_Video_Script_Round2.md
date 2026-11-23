# Mayalok: Round 2 Demo Shot List (target 4:15, limit 3 to 5 min)

**Story:** a broker lets a buyer or renter explore a flat instead of scrolling through photos. Open and close on that. Show our own captured data, not only the synthetic apartment.

**Truthfulness rules (say these, do not hide them)**
- Scale is estimated, not measured. Incubation: assumed 1.35 m phone height. House: assumed 2.95 m ceiling height.
- Incubation scene is partial (65 of 293 keyframes registered). House scene is a test capture; say "early capture". A brighter retrain, `?scene=house-bright`, exists as a comparison scene.
- The synthetic Demo Apartment is a test scene, label it as such on camera.
- Navigation is a single-floor 2D grid. No performance numbers unless read live from the stats panel (`I`).
- Do not say "photorealistic" for the real captures; say "reconstructed from our phone video".

## Shot list

| Time | Screen | Narration |
|---|---|---|
| 0:00-0:25 | Title card "Mayalok". Then a mock listing page of flat photos (any static image grid, or just the repo banner). | "A broker today sends a buyer or renter a folder of photos. Photos hide layout, distances and how rooms connect. Mayalok lets the buyer walk through the flat instead." |
| 0:25-0:55 | Raw phone footage: clip from `capture_raw` (Video 1, 24 Oct incubation capture, e.g. 20261024_145628.mp4) for 5 s, then the house phone video for 5 s. Cut to the viewer loading each scene. | "This is how we capture: a normal smartphone walkthrough, no special hardware. Video 1 is our incubation-centre capture; the second is a house. We turn each into a 3D Gaussian Splat." |
| 0:55-1:35 | `?scene=house` (or `?scene=house-bright` if it looks better; `&exposure=1.4` brightens either). Walk with WASD from the spawn. Look at the ceiling fan and window. Show minimap. | "This is our own house capture, reconstructed from phone video. It is an early reconstruction, so it has artefacts, and the scale is estimated from an assumed ceiling height, not measured. You still get a real sense of the space." |
| 1:35-2:10 | `?scene=incubation`. Walk; click POI labels (Entrance, Meeting Table, Whiteboard). Press `/` and search "meeting". | "Here is Video 1, the incubation centre, partial: 65 of 293 keyframes registered. It already has POIs. Search is fuzzy, so a buyer can type what they want and jump there." |
| 2:10-2:30 | If house POIs are placed by recording time: click a house POI (Ceiling Fan, Window). Otherwise skip this row. | "Broker-side, adding a place is a click: this is the house with places a buyer would ask about." |
| 2:30-3:20 | `?scene=demo-apartment` (labelled synthetic). `/`, type "bedroom", Shift+Enter. Show floor ribbon, HUD turn instructions, minimap route. Walk off route to trigger re-route, then `F` auto-walk. | "Navigation is clearest on our synthetic test apartment because its floor plan is clean. A* on a 5 cm grid with a 25 cm body radius, drawn as a ribbon on the floor, re-planned if you stray." |
| 3:20-3:45 | Reload with `?admin`. Add a place, draw a zone, Export (shows `pois.json`). | "A broker can label rooms and features without code and export a pois.json next to the scene." |
| 3:45-4:15 | Back to the house or incubation walkthrough, then closing card with repo and live link. | "So instead of viewing photos, a buyer or renter explores the flat, finds rooms by search and gets walking directions. Capture is one phone video. Scale is estimated and our real scenes are still partial; improving reconstruction quality is the next step. Code and technical note are in the repository." |

## Pre-recording checklist
- [ ] Confirm which build you record (local `pnpm dev` / `pnpm build`, or the VM viewer over Tailscale, vs https://mayalok.vercel.app; live currently serves only incubation and demo-apartment, no house).
- [ ] Reload `?scene=house` and `?scene=house-bright`; pick the better one; check spawn view, no blank screen, walk 60 s without crash. Decide to include or drop rows 0:55-1:35 and 2:10-2:30.
- [ ] House POIs: `pois.json` is empty (23 Nov), so row 2:10-2:30 stays skipped until POIs are placed in `?admin` from `pois.draft.json` and saved as `pois.json`.
- [ ] `/` search tested on typed examples ("meeting", "bedroom", "kichen"); adjust if no match.
- [ ] Admin > Reset clears saved local edits; help overlay dismissed (`H`).
- [ ] Desktop Chrome/Edge, 1080p, 100% zoom, notifications off, bookmarks bar hidden, GPU/WebGL on.
- [ ] Raw-footage clips trimmed; no faces, phone numbers or private info visible.
- [ ] Mic check, quiet room, 20 s test recording and playback.
- [ ] Full dry run with a timer; total 3 to 5 min.
- [ ] Narration re-read against the truthfulness rules above.
