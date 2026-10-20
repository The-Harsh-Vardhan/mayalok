import * as THREE from "three";
import type { NavGrid } from "../lib/navgrid";
import type { Vec2, Vec3 } from "../types";

const RIBBON_WIDTH = 0.5;
const RIBBON_Y = 0.04;

const vertexShader = /* glsl */ `
  attribute float aVisible;
  varying vec2 vUv;
  varying float vVisible;
  void main() {
    vUv = uv;
    vVisible = aVisible;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// uv.x = metres along the route, uv.y = 0..1 across. Chevrons scroll towards the goal.
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vVisible;
  void main() {
    float v = (vUv.y - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.75, 1.0, abs(v));
    float phase = fract((vUv.x - uTime * 1.1) / 0.9);
    float d = abs(phase - (0.62 - 0.3 * abs(v)));
    float chevron = 1.0 - smoothstep(0.045, 0.085, d);
    float ends = smoothstep(0.0, 0.35, vUv.x) * (1.0 - smoothstep(uLength - 0.5, uLength, vUv.x));
    float visibility = mix(0.22, 1.0, vVisible);
    float alpha = (0.32 + 0.68 * chevron) * edge * ends * visibility;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), chevron * 0.55), alpha);
  }
`;

/**
 * The walking route as a glowing floor ribbon with moving chevrons, plus a light
 * pillar at the destination. Splats do not write depth, so the ribbon is drawn on
 * top and dimmed wherever the navgrid says a wall blocks the line of sight.
 */
export class PathLayer {
  readonly group = new THREE.Group();
  private ribbon: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  private samples: Vec2[] = [];
  private beacon: THREE.Group;
  private beaconRing: THREE.Mesh;
  private lastVisibilityUpdate = 0;
  private readonly grid: NavGrid;
  private readonly material: THREE.ShaderMaterial;

  constructor(grid: NavGrid) {
    this.grid = grid;
    this.group.name = "route";
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uTime: { value: 0 }, uLength: { value: 1 }, uColor: { value: new THREE.Color("#2ec5ff") } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.beacon = this.createBeacon();
    this.beaconRing = this.beacon.getObjectByName("ring") as THREE.Mesh;
    this.beacon.visible = false;
    this.group.add(this.beacon);
  }

  setRoute(points: Vec2[] | null, destination?: Vec3): void {
    if (this.ribbon) {
      this.group.remove(this.ribbon);
      this.ribbon.geometry.dispose();
      this.ribbon = null;
    }
    this.samples = [];
    this.beacon.visible = false;
    if (!points || points.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, RIBBON_Y, z)), false, "centripetal");
    const length = curve.getLength();
    const n = Math.max(2, Math.ceil(length / 0.08));
    const pts = curve.getSpacedPoints(n);
    const positions = new Float32Array(pts.length * 2 * 3);
    const uvs = new Float32Array(pts.length * 2 * 2);
    const visible = new Float32Array(pts.length * 2).fill(1);
    const indices: number[] = [];
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) along += pts[i].distanceTo(pts[i - 1]);
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const tx = b.x - a.x;
      const tz = b.z - a.z;
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len;
      const nz = tx / len;
      const p = pts[i];
      positions.set([p.x + nx * RIBBON_WIDTH / 2, p.y, p.z + nz * RIBBON_WIDTH / 2,
        p.x - nx * RIBBON_WIDTH / 2, p.y, p.z - nz * RIBBON_WIDTH / 2], i * 6);
      uvs.set([along, 0, along, 1], i * 4);
      if (i > 0) {
        const k = 2 * i;
        indices.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
      this.samples.push([p.x, p.z]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute("aVisible", new THREE.BufferAttribute(visible, 1));
    geo.setIndex(indices);
    this.material.uniforms.uLength.value = along;
    this.ribbon = new THREE.Mesh(geo, this.material);
    this.ribbon.renderOrder = 30;
    this.ribbon.frustumCulled = false;
    this.group.add(this.ribbon);

    const end = destination ?? [points[points.length - 1][0], 0, points[points.length - 1][1]];
    this.beacon.position.set(end[0], 0, end[2]);
    this.beacon.visible = true;
    this.lastVisibilityUpdate = 0;
  }

  update(timeS: number, camera: THREE.Camera): void {
    this.material.uniforms.uTime.value = timeS;
    if (this.beacon.visible) {
      const pulse = (timeS * 0.8) % 1;
      this.beaconRing.scale.setScalar(0.4 + pulse * 1.4);
      (this.beaconRing.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - pulse);
    }
    // Line-of-sight dimming is cheap but not free; 8 Hz is plenty.
    if (this.ribbon && timeS - this.lastVisibilityUpdate > 0.125) {
      this.lastVisibilityUpdate = timeS;
      const attr = this.ribbon.geometry.getAttribute("aVisible") as THREE.BufferAttribute;
      const cx = camera.position.x;
      const cz = camera.position.z;
      for (let i = 0; i < this.samples.length; i++) {
        const [x, z] = this.samples[i];
        const far = Math.hypot(x - cx, z - cz) > 30;
        const vis = !far && this.grid.lineFree(cx, cz, x, z) ? 1 : 0;
        attr.setX(2 * i, vis);
        attr.setX(2 * i + 1, vis);
      }
      attr.needsUpdate = true;
    }
  }

  private createBeacon(): THREE.Group {
    const group = new THREE.Group();
    const pillarGeo = new THREE.CylinderGeometry(0.18, 0.18, 2.6, 24, 1, true);
    pillarGeo.translate(0, 1.3, 0);
    const colors: number[] = [];
    const pos = pillarGeo.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const fade = 1 - pos.getY(i) / 2.6;
      colors.push(0.18 * fade + 0.1, 0.77 * fade + 0.1, 1.0 * fade + 0.1);
    }
    pillarGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const pillar = new THREE.Mesh(pillarGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    pillar.renderOrder = 31;
    const ringGeo = new THREE.RingGeometry(0.42, 0.5, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: "#2ec5ff", transparent: true, opacity: 0.8, depthWrite: false, depthTest: false,
    }));
    ring.name = "ring";
    ring.position.y = 0.05;
    ring.renderOrder = 32;
    group.add(pillar, ring);
    return group;
  }

  dispose(): void {
    this.setRoute(null);
    this.material.dispose();
  }
}
