import type { NavGridData, PoiFile, SceneIndexEntry, SceneManifest } from "../types";
import { NavGrid } from "./navgrid";

export interface LoadedScene {
  manifest: SceneManifest;
  baseUrl: string;
  grid: NavGrid;
  /** Raw grid JSON, handed to the route-planning worker. */
  navgridData: NavGridData;
  pois: PoiFile;
  minimap: HTMLImageElement;
}

const SCENES_ROOT = `${import.meta.env.BASE_URL}scenes/`;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return (await res.json()) as T;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export async function listScenes(): Promise<SceneIndexEntry[]> {
  const index = await getJson<{ scenes: SceneIndexEntry[] }>(`${SCENES_ROOT}index.json`);
  return index.scenes;
}

/** Loads everything except the splat itself (the viewer streams that with progress). */
export async function loadScene(id: string): Promise<LoadedScene> {
  const baseUrl = `${SCENES_ROOT}${id}/`;
  const manifest = await getJson<SceneManifest>(`${baseUrl}scene.json`);
  const [navgrid, pois, minimap] = await Promise.all([
    getJson<NavGridData>(baseUrl + manifest.files.navgrid),
    getJson<PoiFile>(baseUrl + manifest.files.pois).catch(() => ({ version: 1 as const, pois: [] })),
    loadImage(baseUrl + manifest.files.minimap),
  ]);
  return { manifest, baseUrl, grid: NavGrid.fromJSON(navgrid), navgridData: navgrid, pois, minimap };
}
