import Fuse from "fuse.js";
import type { Poi } from "../types";

export interface PoiSearch {
  search(query: string, limit?: number): Poi[];
}

/** Fuzzy search over POI names, tags, categories and descriptions (typo tolerant). */
export function createPoiSearch(pois: Poi[]): PoiSearch {
  const fuse = new Fuse(pois, {
    keys: [
      { name: "name", weight: 0.6 },
      { name: "tags", weight: 0.25 },
      { name: "category", weight: 0.1 },
      { name: "description", weight: 0.05 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
  });
  return {
    search(query, limit = 8) {
      const q = query.trim();
      if (!q) return pois.slice(0, limit);
      return fuse.search(q, { limit }).map((r) => r.item);
    },
  };
}
