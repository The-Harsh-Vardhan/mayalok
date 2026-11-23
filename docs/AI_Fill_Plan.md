# Mayalok: AI fill plan for holes in a scene

Draft, 23 Nov 2026. All times and costs are estimates. Nobody has run this yet.

## Plain-language summary

**Problem.** A phone walkthrough does not see every surface. The 3D scene then has holes: blank
patches on floors, ceilings, corners and behind furniture. A buyer sees these when they walk.

**Idea.** Find the holes. Render the picture a camera would see there. Ask an image AI model to
paint only the missing part. Add the painted pictures to the training set. Train the scene again.
The new scene has fewer blank patches.

**Honest limits.** The AI paints what is probably there. It does not know the real room.
The filled parts are a guess. We must label them as "AI-filled" in the viewer and in the demo.
We must not use filled parts for any measurement. Scale and the walking grid stay from the real capture.

**Time and cost (estimate).** About 1 day of work for one test scene. About 1 to 3 hours of
GPU time. A free Kaggle GPU session can do it.

## Technical section

**Inputs**
- The trained scene: `scene.spz` or the trainer output `point_cloud.ply`.
- The camera poses from SfM (`namma.sfm`) and the original frames.
- The scene `bounds` and `navgrid` (walkable area) from `scene.json`.

**Steps**
1. **Find holes.** Render the scene from many virtual cameras along the walkable area. Render an
   opacity map for each view. Pixels with low opacity inside the room are holes. Merge them into
   a mask per view. Keep views with 5 to 40 percent hole area.
2. **Paint.** Send the rendered view and its mask to an inpainting model. Ask for the same room,
   same light, no new objects. Keep the paint inside the mask only.
3. **Check.** Reject a painted view if the unmasked pixels changed, or if its colour is far from
   the real frames (simple colour-histogram test). A person reviews a sample.
4. **Train again.** Add the accepted views as extra training images, with a lower loss weight than
   real frames. Use the same trainer (`namma.train`, gsplat or Brush) with the same settings.
5. **Mark.** Store a list of AI-filled Gaussians or regions in `report.json`. Show them with a
   toggle in the viewer.

**Model options**
| Option | Where it runs | Notes |
| --- | --- | --- |
| Inpainting diffusion model, open weights (for example an SDXL or FLUX fill model) | Kaggle GPU or other cloud GPU | Best control of the mask. Check the licence of the weights before any commercial use. |
| Hosted image-edit API | Any machine | Easy start, per-image cost, and it sends room pictures to a third party. Do not use it for private scans such as the house. |

**Recommendation.** Start with the open-weights inpainting model on Kaggle, on the incubation
scene or the synthetic apartment, not on the private house scan.

**Estimates (to confirm with one pilot)**
- Virtual views: 100 to 300 per scene. Rendering: minutes on a GPU.
- Painting: 10 to 40 seconds per view on a T4-class GPU. About 0.5 to 2 hours in total.
- Retrain: the same as the first training run, 20,000 to 30,000 steps.
- API cost, if used: check the live price per image first.
- The VM has no GPU, so the painting step is not practical there. The VM can hold files and serve the viewer.

**Risks**
- Painted views do not agree with each other, so the scene may flicker or smear. The lower loss weight and the review step limit this.
- The AI may add objects that do not exist. The prompt and the mask must stop this.
- Scale. Do not use painted areas for distance, route or area numbers.
- Privacy. Keep private scans off third-party services.

**Done when**
- One pilot scene has fewer holes in a walk-through video than the base scene.
- The AI-filled parts are labelled in the viewer.
- Measurements and the walking grid are unchanged.
