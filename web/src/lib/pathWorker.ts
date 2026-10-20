/// <reference lib="webworker" />
import type { NavGridData, Route, Vec2 } from "../types";
import { planRoute } from "./astar";
import { NavGrid } from "./navgrid";

export type WorkerRequest =
  | { type: "init"; grid: NavGridData }
  | { type: "plan"; id: number; start: Vec2; goal: Vec2 };

export type WorkerResponse = { type: "route"; id: number; route: Route | null; ms: number };

let grid: NavGrid | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === "init") {
    grid = NavGrid.fromJSON(msg.grid);
    return;
  }
  const t0 = performance.now();
  const route = grid ? planRoute(grid, msg.start, msg.goal) : null;
  const response: WorkerResponse = { type: "route", id: msg.id, route, ms: performance.now() - t0 };
  self.postMessage(response);
};
