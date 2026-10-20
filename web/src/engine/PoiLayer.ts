import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { pointInPolygon, polygonArea } from "../lib/geometry";
import type { NavGrid } from "../lib/navgrid";
import type { Poi, Vec2 } from "../types";
import { categoryStyle } from "./categories";

interface PoiVisual {
  poi: Poi;
  label: CSS2DObject;
  /** Pin line from the floor to the label (objects only; rooms are shown by their zone). */
  stem?: THREE.Line;
  /** Floor point used for line-of-sight tests, and how much of the line's end to ignore. */
  sightTarget: Vec2;
  sightIgnore: number;
  zoneFill?: THREE.Mesh;
  zoneEdge?: THREE.LineLoop;
}

const LABEL_RANGE_M = 14;

/** POI labels anchored in 3D (HTML, always crisp) plus room/zone floor highlights. */
export class PoiLayer {
  readonly group = new THREE.Group();
  onSelect?: (poi: Poi) => void;
  private visuals = new Map<string, PoiVisual>();
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private lastUpdate = -1;
  private readonly grid: NavGrid;

  constructor(grid: NavGrid) {
    this.grid = grid;
    this.group.name = "pois";
  }

  setPois(pois: Poi[]): void {
    for (const v of this.visuals.values()) this.disposeVisual(v);
    this.visuals.clear();
    for (const poi of pois) this.visuals.set(poi.id, this.createVisual(poi));
    this.refreshStyles();
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    this.lastUpdate = -1;
    this.refreshStyles();
  }

  setHovered(id: string | null): void {
    if (id === this.hoveredId) return;
    this.hoveredId = id;
    this.refreshStyles();
  }

  /** POI whose zone contains the floor point (smallest zone wins, e.g. a counter inside a kitchen). */
  zoneAt(p: Vec2): Poi | null {
    let best: Poi | null = null;
    let bestArea = Infinity;
    for (const { poi } of this.visuals.values()) {
      if (!poi.zone || poi.zone.length < 3 || !pointInPolygon(p, poi.zone)) continue;
      const area = polygonArea(poi.zone);
      if (area < bestArea) {
        bestArea = area;
        best = poi;
      }
    }
    return best;
  }

  /** Point POI (no zone) nearest to a 3D surface hit, within `radius` metres. */
  nearestPoint(p: THREE.Vector3, radius = 0.9): Poi | null {
    let best: Poi | null = null;
    let bestD = radius;
    for (const { poi } of this.visuals.values()) {
      if (poi.zone && poi.zone.length >= 3) continue;
      const d = Math.hypot(poi.position[0] - p.x, poi.position[2] - p.z);
      if (d < bestD) {
        bestD = d;
        best = poi;
      }
    }
    return best;
  }

  /** Fade labels with distance and dim the ones hidden behind walls (throttled to ~8 Hz). */
  update(camera: THREE.Camera, timeS: number): void {
    if (timeS - this.lastUpdate < 0.125) return;
    this.lastUpdate = timeS;
    const cx = camera.position.x;
    const cz = camera.position.z;
    for (const v of this.visuals.values()) {
      const [px, , pz] = v.poi.position;
      const d = Math.hypot(px - cx, pz - cz);
      const important = v.poi.id === this.selectedId || v.poi.id === this.hoveredId;
      const el = v.label.element;
      if (d > LABEL_RANGE_M && !important) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        continue;
      }
      const visible = this.grid.lineFree(cx, cz, v.sightTarget[0], v.sightTarget[1], v.sightIgnore);
      const fade = Math.max(0.25, 1 - Math.max(0, d - 6) / (LABEL_RANGE_M - 6));
      el.style.opacity = String(important ? 1 : (visible ? 1 : 0.38) * fade);
      el.style.pointerEvents = "auto";
      el.classList.toggle("is-occluded", !visible && !important);
    }
  }

  private createVisual(poi: Poi): PoiVisual {
    const style = categoryStyle(poi.category);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "poi-label";
    el.style.setProperty("--poi-color", style.color);
    el.innerHTML = `<span class="poi-icon"></span><span class="poi-name"></span>`;
    (el.querySelector(".poi-icon") as HTMLElement).textContent = style.icon;
    (el.querySelector(".poi-name") as HTMLElement).textContent = poi.name;
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onSelect?.(poi);
    });
    el.addEventListener("pointerenter", () => this.setHovered(poi.id));
    el.addEventListener("pointerleave", () => this.setHovered(null));
    const label = new CSS2DObject(el);
    label.position.set(...poi.position);
    label.center.set(0.5, 1);
    this.group.add(label);

    // Rooms: is the label point (room centre) in view? Objects: is the object itself in view,
    // ignoring its own footprint, which is blocked in the navgrid.
    const isZone = !!poi.zone && poi.zone.length >= 3;
    const sightTarget: Vec2 = [poi.position[0], poi.position[2]];
    const visual: PoiVisual = { poi, label, sightTarget, sightIgnore: isZone ? 0.3 : 0.8 };
    if (!isZone) {
      const stemGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(poi.position[0], 0.02, poi.position[2]),
        new THREE.Vector3(...poi.position),
      ]);
      visual.stem = new THREE.Line(stemGeo, new THREE.LineBasicMaterial({
        color: style.color, transparent: true, opacity: 0.55, depthTest: false,
      }));
      visual.stem.renderOrder = 20;
      this.group.add(visual.stem);
    }
    if (poi.zone && poi.zone.length >= 3) {
      // Shape is built in (x, -z) then rotated onto the floor plane (x, 0, z).
      const shape = new THREE.Shape(poi.zone.map(([x, z]) => new THREE.Vector2(x, -z)));
      const fillGeo = new THREE.ShapeGeometry(shape);
      fillGeo.rotateX(-Math.PI / 2);
      fillGeo.translate(0, 0.03, 0);
      visual.zoneFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({
        color: style.color, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
        side: THREE.DoubleSide,
      }));
      visual.zoneFill.renderOrder = 10;
      const edgeGeo = new THREE.BufferGeometry().setFromPoints(
        poi.zone.map(([x, z]) => new THREE.Vector3(x, 0.035, z)),
      );
      visual.zoneEdge = new THREE.LineLoop(edgeGeo, new THREE.LineBasicMaterial({
        color: style.color, transparent: true, opacity: 0, depthTest: false,
      }));
      visual.zoneEdge.renderOrder = 11;
      this.group.add(visual.zoneFill, visual.zoneEdge);
    }
    return visual;
  }

  private refreshStyles(): void {
    for (const v of this.visuals.values()) {
      const selected = v.poi.id === this.selectedId;
      const hovered = v.poi.id === this.hoveredId;
      v.label.element.classList.toggle("is-selected", selected);
      v.label.element.classList.toggle("is-hovered", hovered);
      if (v.zoneFill) (v.zoneFill.material as THREE.MeshBasicMaterial).opacity = selected ? 0.2 : hovered ? 0.12 : 0;
      if (v.zoneEdge) (v.zoneEdge.material as THREE.LineBasicMaterial).opacity = selected ? 0.9 : hovered ? 0.6 : 0;
    }
  }

  private disposeVisual(v: PoiVisual): void {
    v.label.element.remove();
    this.group.remove(v.label);
    for (const obj of [v.stem, v.zoneFill, v.zoneEdge]) {
      if (!obj) continue;
      this.group.remove(obj);
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    }
  }

  dispose(): void {
    for (const v of this.visuals.values()) this.disposeVisual(v);
    this.visuals.clear();
  }
}
