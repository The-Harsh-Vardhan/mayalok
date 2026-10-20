import * as THREE from "three";
import { cumulativeLengths, pointAlong } from "../lib/geometry";
import type { NavGrid } from "../lib/navgrid";
import type { Vec2 } from "../types";

export interface PlayerState {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
}

const MAX_PITCH = THREE.MathUtils.degToRad(85);
const DRAG_THRESHOLD_PX = 5;

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * First-person walking: WASD/arrows + mouse (drag, or pointer lock), touch joystick on
 * phones. Collision uses the navgrid clearance field, so the player slides along walls
 * and furniture instead of passing through them.
 */
export class PlayerControls {
  eyeHeight = 1.6;
  walkSpeed = 1.6;
  runSpeed = 3.4;
  bodyRadius = 0.18;
  lookSensitivity = 0.0022;
  noclip = false;

  x = 0;
  z = 0;
  y = 1.6;
  yaw = 0;
  pitch = 0;

  onPick?: (ndc: THREE.Vector2) => void;
  onAutopilotEnd?: (completed: boolean) => void;
  onLockChange?: (locked: boolean) => void;

  private keys = new Set<string>();
  private velocity = new THREE.Vector2();
  private bobPhase = 0;
  private dragging: { id: number; x: number; y: number; moved: boolean } | null = null;
  private joystick: { id: number; x0: number; y0: number; dx: number; dy: number } | null = null;
  private joystickEl: HTMLDivElement;
  private tween: { from: number[]; to: number[]; t: number; duration: number } | null = null;
  private auto: { points: Vec2[]; cum: number[]; along: number } | null = null;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly dom: HTMLElement;
  private readonly grid: NavGrid;

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, grid: NavGrid) {
    this.camera = camera;
    this.dom = dom;
    this.grid = grid;
    camera.rotation.order = "YXZ";
    this.joystickEl = document.createElement("div");
    this.joystickEl.className = "touch-joystick";
    this.joystickEl.hidden = true;
    dom.parentElement?.appendChild(this.joystickEl);
    this.attach();
  }

  get locked(): boolean {
    return document.pointerLockElement === this.dom;
  }

  get autopiloting(): boolean {
    return this.auto !== null;
  }

  state(): PlayerState {
    return { x: this.x, z: this.z, yaw: this.yaw, pitch: this.pitch, speed: this.velocity.length() };
  }

  setPose(x: number, z: number, yaw: number, pitch = 0): void {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.pitch = pitch;
    this.y = this.eyeHeight;
    this.velocity.set(0, 0);
    this.tween = null;
    this.applyToCamera();
  }

  /** Smoothly move/turn to a pose (used by search "go there" and minimap jumps). */
  flyTo(x: number, z: number, yaw: number, pitch = -0.12, duration = 1.1): void {
    this.stopAutopilot(false);
    const dYaw = wrapAngle(yaw - this.yaw);
    this.tween = {
      from: [this.x, this.z, this.yaw, this.pitch],
      to: [x, z, this.yaw + dYaw, pitch],
      t: 0,
      duration,
    };
  }

  /** Walk the route automatically, looking ahead along it (desktop "follow" mode). */
  startAutopilot(points: Vec2[], fromAlong = 0): void {
    this.tween = null;
    this.auto = { points, cum: cumulativeLengths(points), along: fromAlong };
  }

  stopAutopilot(notify = true): void {
    if (this.auto && notify) this.onAutopilotEnd?.(false);
    this.auto = null;
  }

  requestLock(): void {
    this.dom.requestPointerLock?.();
  }

  canStand(x: number, z: number): boolean {
    return this.grid.clearanceAt(x, z) >= this.bodyRadius;
  }

  update(dtRaw: number): void {
    const dt = Math.min(dtRaw, 0.05);
    if (this.tween) {
      this.tween.t += dt / this.tween.duration;
      const t = easeInOutCubic(Math.min(1, this.tween.t));
      const [x0, z0, yaw0, p0] = this.tween.from;
      const [x1, z1, yaw1, p1] = this.tween.to;
      this.x = x0 + (x1 - x0) * t;
      this.z = z0 + (z1 - z0) * t;
      this.yaw = yaw0 + (yaw1 - yaw0) * t;
      this.pitch = p0 + (p1 - p0) * t;
      // A small hop makes long jumps read as movement rather than a camera cut.
      const hop = Math.min(0.5, Math.hypot(x1 - x0, z1 - z0) * 0.08);
      this.y = this.eyeHeight + hop * Math.sin(Math.PI * t);
      if (this.tween.t >= 1) {
        this.tween = null;
        this.y = this.eyeHeight;
      }
      this.applyToCamera();
      return;
    }

    const input = this.readInput();
    if (this.auto && (input.x !== 0 || input.y !== 0)) this.stopAutopilot();

    if (this.auto) {
      this.updateAutopilot(dt);
    } else {
      const speed = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? this.runSpeed : this.walkSpeed;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      const target = new THREE.Vector2(fx * input.y + rx * input.x, fz * input.y + rz * input.x);
      if (target.lengthSq() > 1) target.normalize();
      target.multiplyScalar(speed);
      this.velocity.lerp(target, 1 - Math.exp(-dt * 10));
      this.move(this.velocity.x * dt, this.velocity.y * dt);
      if (this.noclip) {
        const up = (this.keys.has("Space") ? 1 : 0) - (this.keys.has("KeyC") ? 1 : 0);
        this.y = Math.max(0.2, this.y + up * speed * dt);
      } else {
        this.y = this.eyeHeight;
      }
    }

    // Subtle head bob while walking.
    const moving = this.velocity.length();
    this.bobPhase += dt * moving * 5.5;
    const bob = this.noclip ? 0 : Math.sin(this.bobPhase) * 0.012 * Math.min(1, moving / this.walkSpeed);
    this.applyToCamera(bob);
  }

  private updateAutopilot(dt: number): void {
    const auto = this.auto!;
    const total = auto.cum[auto.cum.length - 1];
    auto.along = Math.min(total, auto.along + 1.35 * dt);
    const [x, z] = pointAlong(auto.points, auto.cum, auto.along);
    this.velocity.set((x - this.x) / Math.max(dt, 1e-3), (z - this.z) / Math.max(dt, 1e-3));
    this.x = x;
    this.z = z;
    const ahead = pointAlong(auto.points, auto.cum, Math.min(total, auto.along + 1.2));
    if (Math.hypot(ahead[0] - x, ahead[1] - z) > 0.05) {
      const targetYaw = Math.atan2(-(ahead[0] - x), -(ahead[1] - z));
      this.yaw += wrapAngle(targetYaw - this.yaw) * (1 - Math.exp(-dt * 4));
    }
    this.pitch += (-0.1 - this.pitch) * (1 - Math.exp(-dt * 3));
    this.y = this.eyeHeight;
    if (auto.along >= total) {
      this.auto = null;
      this.velocity.set(0, 0);
      this.onAutopilotEnd?.(true);
    }
  }

  /** Move with wall sliding; sub-stepped so fast movement cannot tunnel through thin walls. */
  private move(dx: number, dz: number): void {
    if (this.noclip) {
      this.x += dx;
      this.z += dz;
      return;
    }
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.05));
    const sx = dx / steps;
    const sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      const nx = this.x + sx;
      const nz = this.z + sz;
      if (this.canStand(nx, nz)) {
        this.x = nx;
        this.z = nz;
      } else if (this.canStand(nx, this.z)) {
        this.x = nx;
      } else if (this.canStand(this.x, nz)) {
        this.z = nz;
      } else if (!this.canStand(this.x, this.z)
        && this.grid.clearanceAt(nx, nz) >= this.grid.clearanceAt(this.x, this.z)) {
        // Spawned or teleported into a tight spot: let the player walk out of it.
        this.x = nx;
        this.z = nz;
      } else {
        break;
      }
    }
  }

  private readInput(): THREE.Vector2 {
    const k = this.keys;
    const forward = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const strafe = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const v = new THREE.Vector2(strafe, forward);
    if (this.joystick) {
      v.x += this.joystick.dx;
      v.y -= this.joystick.dy;
    }
    return v;
  }

  private applyToCamera(bob = 0): void {
    this.pitch = THREE.MathUtils.clamp(this.pitch, -MAX_PITCH, MAX_PITCH);
    this.camera.position.set(this.x, this.y + bob, this.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private look(dx: number, dy: number): void {
    this.yaw -= dx * this.lookSensitivity;
    this.pitch -= dy * this.lookSensitivity;
    if (this.auto) this.stopAutopilot();
  }

  // --- DOM events -------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.joystick = null;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.locked) return;
    if (e.pointerType === "touch") {
      const rect = this.dom.getBoundingClientRect();
      if (e.clientX - rect.left < rect.width * 0.4 && !this.joystick) {
        this.joystick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
        this.joystickEl.hidden = false;
        this.joystickEl.style.left = `${e.clientX - rect.left}px`;
        this.joystickEl.style.top = `${e.clientY - rect.top}px`;
        this.joystickEl.style.setProperty("--dx", "0px");
        this.joystickEl.style.setProperty("--dy", "0px");
        return;
      }
    }
    this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    this.dom.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.locked) {
      this.look(e.movementX, e.movementY);
      return;
    }
    if (this.joystick && e.pointerId === this.joystick.id) {
      const radius = 56;
      let dx = (e.clientX - this.joystick.x0) / radius;
      let dy = (e.clientY - this.joystick.y0) / radius;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.joystick.dx = dx;
      this.joystick.dy = dy;
      this.joystickEl.style.setProperty("--dx", `${dx * radius}px`);
      this.joystickEl.style.setProperty("--dy", `${dy * radius}px`);
      return;
    }
    const drag = this.dragging;
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const touchBoost = e.pointerType === "touch" ? 1.6 : 1;
    this.look(dx * touchBoost, dy * touchBoost);
    drag.x = e.clientX;
    drag.y = e.clientY;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.joystick && e.pointerId === this.joystick.id) {
      this.joystick = null;
      this.joystickEl.hidden = true;
      return;
    }
    const drag = this.dragging;
    if (!drag || e.pointerId !== drag.id) return;
    this.dragging = null;
    if (!drag.moved && this.onPick) {
      const rect = this.dom.getBoundingClientRect();
      this.onPick(new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      ));
    }
  };

  private onClick = () => {
    if (this.locked) this.onPick?.(new THREE.Vector2(0, 0));
  };

  private onLock = () => {
    this.onLockChange?.(this.locked);
  };

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.dom.addEventListener("pointerdown", this.onPointerDown);
    this.dom.addEventListener("pointermove", this.onPointerMove);
    this.dom.addEventListener("pointerup", this.onPointerUp);
    this.dom.addEventListener("pointercancel", this.onPointerUp);
    this.dom.addEventListener("click", this.onClick);
    document.addEventListener("pointerlockchange", this.onLock);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.dom.removeEventListener("pointerdown", this.onPointerDown);
    this.dom.removeEventListener("pointermove", this.onPointerMove);
    this.dom.removeEventListener("pointerup", this.onPointerUp);
    this.dom.removeEventListener("pointercancel", this.onPointerUp);
    this.dom.removeEventListener("click", this.onClick);
    document.removeEventListener("pointerlockchange", this.onLock);
    this.joystickEl.remove();
  }
}
