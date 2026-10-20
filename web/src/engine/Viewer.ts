import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import * as THREE from "three";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import type { LoadedScene } from "../lib/sceneLoader";
import type { Poi, Vec2, Vec3 } from "../types";
import { PathLayer } from "./PathLayer";
import { PlayerControls, type PlayerState } from "./PlayerControls";
import { PoiLayer } from "./PoiLayer";

export interface PickResult {
  point: THREE.Vector3 | null;
  poi: Poi | null;
}

export interface ViewerCallbacks {
  onPick?: (hit: PickResult) => void;
  onPoiLabelClick?: (poi: Poi) => void;
  /** ~10 Hz player updates for HUD, minimap and navigation progress. */
  onPlayer?: (state: PlayerState) => void;
  onAutopilotEnd?: (completed: boolean) => void;
  onLockChange?: (locked: boolean) => void;
  onFps?: (fps: number, pixelRatio: number) => void;
}

const MIN_PIXEL_RATIO = 0.6;

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: PlayerControls;
  readonly pois: PoiLayer;
  readonly path: PathLayer;
  private readonly labels: CSS2DRenderer;
  private readonly spark: SparkRenderer;
  private readonly fadeEl: HTMLDivElement;
  private splat: SplatMesh | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private lastTime = performance.now();
  private lastPlayerEmit = 0;
  private fpsFrames = 0;
  private fpsSince = performance.now();
  private pixelRatio: number;
  private maxPixelRatio: number;
  private goodFpsStreak = 0;
  private readonly container: HTMLElement;
  private readonly data: LoadedScene;
  private readonly callbacks: ViewerCallbacks;

  constructor(container: HTMLElement, data: LoadedScene, callbacks: ViewerCallbacks = {}) {
    this.container = container;
    this.data = data;
    this.callbacks = callbacks;
    const { manifest, grid } = data;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setClearColor(new THREE.Color("#0b0f17"));
    this.renderer.domElement.className = "viewer-canvas";
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "viewer-labels";
    container.appendChild(this.labels.domElement);

    this.fadeEl = document.createElement("div");
    this.fadeEl.className = "viewer-fade";
    container.appendChild(this.fadeEl);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 300);
    this.spark = new SparkRenderer({ renderer: this.renderer });
    this.scene.add(this.spark);

    this.controls = new PlayerControls(this.camera, this.renderer.domElement, grid);
    this.controls.eyeHeight = manifest.eyeHeight ?? 1.6;
    const [sx, , sz] = manifest.spawn.position;
    this.controls.setPose(sx, sz, manifest.spawn.yaw, -0.05);
    this.controls.onPick = (ndc) => this.callbacks.onPick?.(this.pick(ndc));
    this.controls.onAutopilotEnd = (done) => this.callbacks.onAutopilotEnd?.(done);
    this.controls.onLockChange = (locked) => this.callbacks.onLockChange?.(locked);

    this.pois = new PoiLayer(grid);
    this.pois.onSelect = (poi) => this.callbacks.onPoiLabelClick?.(poi);
    this.path = new PathLayer(grid);
    this.scene.add(this.pois.group, this.path.group);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  /** Streams the splat file; resolves once it is ready to render. */
  async loadSplat(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const url = this.data.baseUrl + this.data.manifest.files.splat;
    const splat = new SplatMesh({
      url,
      onProgress: (e: ProgressEvent) => onProgress?.(e.loaded, e.lengthComputable ? e.total : 0),
    });
    await splat.initialized;
    // The pipeline already writes splats in the viewer's frame (+Y up, metres), so no flip.
    this.splat = splat;
    this.scene.add(splat);
  }

  /** What is under a screen point: the surface hit plus the POI there (point POI or zone). */
  pick(ndc: THREE.Vector2): PickResult {
    this.raycaster.setFromCamera(ndc, this.camera);
    let point: THREE.Vector3 | null = null;
    if (this.splat) {
      const hits = this.raycaster.intersectObject(this.splat, false);
      if (hits.length) point = hits[0].point.clone();
    }
    if (!point) {
      const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const p = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(floor, p) && p.distanceTo(this.camera.position) < 60) point = p;
    }
    if (!point) return { point: null, poi: null };
    const poi = this.pois.nearestPoint(point) ?? this.pois.zoneAt([point.x, point.z]);
    return { point, poi };
  }

  setPois(pois: Poi[]): void {
    this.pois.setPois(pois);
  }

  showRoute(points: Vec2[] | null, destination?: Vec3): void {
    this.path.setRoute(points, destination);
  }

  /** Jump to a spot: short hops animate, long jumps fade through black (no wall clipping). */
  teleport(x: number, z: number, yaw: number, pitch = -0.12): void {
    const dist = Math.hypot(x - this.controls.x, z - this.controls.z);
    if (dist < 5 && this.data.grid.lineFree(this.controls.x, this.controls.z, x, z)) {
      this.controls.flyTo(x, z, yaw, pitch, 0.6 + dist * 0.08);
      return;
    }
    this.controls.stopAutopilot(false);
    this.fadeEl.classList.add("is-visible");
    window.setTimeout(() => {
      this.controls.setPose(x, z, yaw, pitch);
      this.fadeEl.classList.remove("is-visible");
    }, 220);
  }

  /** Look at a POI from a good nearby standpoint. */
  goToPoi(poi: Poi): void {
    const target: Vec2 = [poi.position[0], poi.position[2]];
    const from: Vec2 = [this.controls.x, this.controls.z];
    const spot = this.data.grid.viewpointFor(target, from) ?? from;
    const yaw = Math.atan2(-(target[0] - spot[0]), -(target[1] - spot[1]));
    const dist = Math.hypot(target[0] - spot[0], target[1] - spot[1]);
    const pitch = Math.atan2(Math.min(poi.position[1], 1.2) - this.controls.eyeHeight, Math.max(dist, 0.5));
    this.teleport(spot[0], spot[1], yaw, THREE.MathUtils.clamp(pitch, -0.6, 0.1));
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Lower the render resolution when the frame rate drops; raise it again when there is headroom. */
  private adaptResolution(fps: number): void {
    if (fps < 40 && this.pixelRatio > MIN_PIXEL_RATIO) {
      this.pixelRatio = Math.max(MIN_PIXEL_RATIO, this.pixelRatio - 0.15);
      this.goodFpsStreak = 0;
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    } else if (fps > 57 && this.pixelRatio < this.maxPixelRatio) {
      if (++this.goodFpsStreak >= 4) {
        this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.1);
        this.goodFpsStreak = 0;
        this.renderer.setPixelRatio(this.pixelRatio);
        this.resize();
      }
    } else {
      this.goodFpsStreak = 0;
    }
  }

  private tick = () => {
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const t = now / 1000;

    this.controls.update(dt);
    this.pois.update(this.camera, t);
    this.path.update(t, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);

    if (now - this.lastPlayerEmit > 100) {
      this.lastPlayerEmit = now;
      this.callbacks.onPlayer?.(this.controls.state());
    }
    this.fpsFrames++;
    if (now - this.fpsSince >= 1000) {
      const fps = (this.fpsFrames * 1000) / (now - this.fpsSince);
      this.fpsFrames = 0;
      this.fpsSince = now;
      this.adaptResolution(fps);
      this.callbacks.onFps?.(fps, this.pixelRatio);
    }
  };

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.pois.dispose();
    this.path.dispose();
    this.splat?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
    this.fadeEl.remove();
  }
}
