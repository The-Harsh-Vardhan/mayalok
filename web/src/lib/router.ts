import type { NavGridData, Route, Vec2 } from "../types";
import { planRoute } from "./astar";
import { NavGrid } from "./navgrid";
import type { WorkerRequest, WorkerResponse } from "./pathWorker";

/**
 * Route planning off the main thread so re-planning while walking never stalls
 * rendering. Falls back to planning inline if workers are unavailable.
 */
export class Router {
  private worker: Worker | null = null;
  private pending = new Map<number, (r: { route: Route | null; ms: number }) => void>();
  private nextId = 1;
  private fallback: NavGrid;

  constructor(data: NavGridData) {
    this.fallback = NavGrid.fromJSON(data);
    try {
      this.worker = new Worker(new URL("./pathWorker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const resolve = this.pending.get(e.data.id);
        this.pending.delete(e.data.id);
        resolve?.({ route: e.data.route, ms: e.data.ms });
      };
      this.worker.postMessage({ type: "init", grid: data } satisfies WorkerRequest);
    } catch {
      this.worker = null;
    }
  }

  plan(start: Vec2, goal: Vec2): Promise<{ route: Route | null; ms: number }> {
    if (!this.worker) {
      const t0 = performance.now();
      return Promise.resolve({ route: planRoute(this.fallback, start, goal), ms: performance.now() - t0 });
    }
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker!.postMessage({ type: "plan", id, start, goal } satisfies WorkerRequest);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.pending.clear();
  }
}
