/** Shapes of the files written by the pipeline (see pipeline/namma/export.py). */

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface Anchor {
  id: number;
  position: Vec3;
  normal: Vec3;
  side_m: number;
  views: number;
}

export interface SceneManifest {
  id: string;
  name: string;
  version: number;
  frame: { units: "meters"; up: "+y"; floorY: number };
  files: { splat: string; navgrid: string; minimap: string; pois: string };
  bounds: { min: Vec3; max: Vec3 };
  minimap: { origin: Vec2; metersPerPixel: number };
  eyeHeight: number;
  spawn: { position: Vec3; yaw: number };
  anchors: Anchor[];
  trajectory: Vec2[];
  stats: Record<string, unknown>;
}

export interface SceneIndexEntry {
  id: string;
  name: string;
  description?: string;
  /** Start in fly mode (collisions off), e.g. for partial scans with a patchy navgrid. */
  fly?: boolean;
}

export interface Poi {
  id: string;
  name: string;
  category: string;
  tags?: string[];
  description?: string;
  /** Label anchor in world space (metres, +Y up). */
  position: Vec3;
  /** Optional floor footprint as [x, z] vertices (rooms, zones). */
  zone?: Vec2[] | null;
}

export interface PoiFile {
  version: 1;
  pois: Poi[];
}

export interface NavGridData {
  version: number;
  resolution: number;
  origin: Vec2;
  cols: number;
  rows: number;
  agentRadius: number;
  encoding: "base64-uint8-rowmajor";
  walkable: string;
  clearanceCm: string;
}

export type TurnKind = "start" | "straight" | "slight-left" | "slight-right" | "left" | "right" | "u-turn" | "arrive";

export interface Instruction {
  kind: TurnKind;
  /** Distance along the route (m) where this instruction applies. */
  at: number;
  point: Vec2;
}

export interface Route {
  points: Vec2[];
  length: number;
  instructions: Instruction[];
}
