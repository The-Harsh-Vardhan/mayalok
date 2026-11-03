import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayerState } from "./engine/PlayerControls";
import { Viewer, type PickResult } from "./engine/Viewer";
import { cumulativeLengths, polygonCentroid, projectOnPolyline } from "./lib/geometry";
import { Router } from "./lib/router";
import { listScenes, loadScene, type LoadedScene } from "./lib/sceneLoader";
import { createPoiSearch } from "./lib/search";
import type { Poi, PoiFile, Route, SceneIndexEntry, Vec2 } from "./types";
import { AdminToolbar, PoiEditor, type AdminTool } from "./ui/Admin";
import { Minimap } from "./ui/Minimap";
import { NavHud, type NavView } from "./ui/NavHud";
import { HelpOverlay, LoadingScreen, StatsPanel, Toast } from "./ui/Overlays";
import { PoiCard } from "./ui/PoiCard";
import { PoiList } from "./ui/PoiList";
import { SearchBar } from "./ui/SearchBar";

interface NavState {
  poi: Poi;
  goal: Vec2;
  route: Route;
  cum: number[];
  arrived: boolean;
  replanning: boolean;
  lastReplan: number;
}

const params = new URLSearchParams(window.location.search);
const isTouch = window.matchMedia?.("(pointer: coarse)").matches ?? false;

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode): edits just won't persist */
  }
}

/** Where to walk for a POI: the middle of its zone, or the POI itself. */
function poiGoal(poi: Poi): Vec2 {
  if (poi.zone && poi.zone.length >= 3) return polygonCentroid(poi.zone);
  return [poi.position[0], poi.position[2]];
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const routerRef = useRef<Router | null>(null);

  const [scenes, setScenes] = useState<SceneIndexEntry[]>([]);
  const [data, setData] = useState<LoadedScene | null>(null);
  const [loading, setLoading] = useState({ stage: "Loading scene…", loaded: 0, total: 0, done: false });
  const [error, setError] = useState<string | null>(null);

  const [pois, setPois] = useState<Poi[]>([]);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<Poi | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [nav, setNav] = useState<NavState | null>(null);
  const [navView, setNavView] = useState<NavView | null>(null);
  const [autopiloting, setAutopiloting] = useState(false);
  const [locked, setLocked] = useState(false);

  const [admin, setAdmin] = useState(params.has("admin"));
  const [tool, setTool] = useState<AdminTool>("none");
  const [draftZone, setDraftZone] = useState<Vec2[] | null>(null);
  const [editing, setEditing] = useState<Poi | null>(null);

  const [showHelp, setShowHelp] = useState(() => storageGet("namma.helpSeen") === null);
  const [showList, setShowList] = useState(false);
  const [showStats, setShowStats] = useState(params.has("stats"));
  const [mapExpanded, setMapExpanded] = useState(false);
  const [noclip, setNoclip] = useState(false);
  const [fps, setFps] = useState({ fps: 0, pixelRatio: 1 });
  const [toast, setToast] = useState<string | null>(null);

  // Viewer callbacks are created once; they read the latest state through these refs.
  const navRef = useRef(nav);
  navRef.current = nav;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const poisRef = useRef(pois);
  poisRef.current = pois;

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((m) => (m === message ? null : m)), 3200);
  }, []);

  // ---- Load scene list + scene data -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listScenes();
        if (cancelled) return;
        setScenes(list);
        const id = params.get("scene") ?? list[0]?.id;
        if (!id) throw new Error("No scenes found in scenes/index.json");
        setNoclip(list.find((s) => s.id === id)?.fly === true);
        setLoading((l) => ({ ...l, stage: "Loading map and places…" }));
        const scene = await loadScene(id);
        if (cancelled) return;
        const draft = storageGet(`namma.pois.${id}`);
        setPois(draft ? (JSON.parse(draft) as PoiFile).pois : scene.pois.pois);
        setDirty(draft !== null);
        setData(scene);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Create the 3D viewer once the scene data is in ---------------------------------
  useEffect(() => {
    if (!data || !containerRef.current) return;
    let disposed = false;
    const router = new Router(data.navgridData);
    routerRef.current = router;
    const viewer = new Viewer(containerRef.current, data, {
      onPick: (hit) => handlePickRef.current(hit),
      onPoiLabelClick: (poi) => selectRef.current(poi),
      onPlayer: (state) => {
        setPlayer(state);
        trackRef.current(state);
      },
      onAutopilotEnd: (completed) => {
        setAutopiloting(false);
        if (completed) trackRef.current(viewer.controls.state(), true);
      },
      onLockChange: setLocked,
      onFps: (f, pixelRatio) => setFps({ fps: f, pixelRatio }),
    });
    viewerRef.current = viewer;
    // Dev-only hook for the browser smoke test (scripts drive poses directly).
    if (import.meta.env.DEV) (window as unknown as { __namma: unknown }).__namma = { viewer };
    setLoading((l) => ({ ...l, stage: "Streaming the 3D model…" }));
    viewer
      .loadSplat((loaded, total) => !disposed && setLoading((l) => ({ ...l, loaded, total })))
      .then(() => !disposed && setLoading((l) => ({ ...l, done: true })))
      .catch((e: Error) => !disposed && setError(`Could not load the 3D model: ${e.message}`));
    return () => {
      disposed = true;
      viewer.dispose();
      router.dispose();
      viewerRef.current = null;
      routerRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    viewerRef.current?.setPois(pois);
  }, [pois, data]);

  useEffect(() => {
    viewerRef.current?.pois.setSelected(selected?.id ?? null);
  }, [selected, data]);

  useEffect(() => {
    if (viewerRef.current) viewerRef.current.controls.noclip = noclip;
  }, [noclip]);

  // ---- POI edits (admin) ----------------------------------------------------------------
  const savePois = useCallback((next: Poi[]) => {
    setPois(next);
    setDirty(true);
    if (data) storageSet(`namma.pois.${data.manifest.id}`, JSON.stringify({ version: 1, pois: next }));
  }, [data]);

  // ---- Navigation -----------------------------------------------------------------------
  const stopNavigation = useCallback(() => {
    viewerRef.current?.controls.stopAutopilot(false);
    viewerRef.current?.showRoute(null);
    setAutopiloting(false);
    setNav(null);
    setNavView(null);
  }, []);

  const startNavigation = useCallback(async (poi: Poi) => {
    const viewer = viewerRef.current;
    const router = routerRef.current;
    if (!viewer || !router) return;
    setSelected(poi);
    const goal = poiGoal(poi);
    const { route, ms } = await router.plan([viewer.controls.x, viewer.controls.z], goal);
    if (!route) {
      notify(`No walkable route to ${poi.name} from here`);
      return;
    }
    viewer.controls.stopAutopilot(false);
    setAutopiloting(false);
    viewer.showRoute(route.points, [route.points.at(-1)![0], 0, route.points.at(-1)![1]]);
    setNav({ poi, goal, route, cum: cumulativeLengths(route.points), arrived: false, replanning: false, lastReplan: performance.now() });
    console.info(`[route] ${poi.name}: ${route.length.toFixed(1)} m, planned in ${ms.toFixed(1)} ms`);
  }, [notify]);

  /** Follow the player along the route: progress, next turn, arrival and re-routing. */
  const track = useCallback((state: PlayerState, forceArrive = false) => {
    const current = navRef.current;
    if (!current || current.arrived) return;
    const { route, cum } = current;
    const here: Vec2 = [state.x, state.z];
    const { along, offset } = projectOnPolyline(route.points, cum, here);
    const remaining = Math.max(0, route.length - along);
    if (forceArrive || remaining < 0.9) {
      viewerRef.current?.controls.stopAutopilot(false);
      setAutopiloting(false);
      setNav({ ...current, arrived: true });
      setNavView({ destination: current.poi.name, next: route.instructions.at(-1)!, distanceToNext: 0, remaining: 0, arrived: true, replanning: false });
      notify(`You have arrived at ${current.poi.name}`);
      return;
    }
    const next = route.instructions.find((s) => s.at > along + 0.3) ?? route.instructions.at(-1)!;
    setNavView({ destination: current.poi.name, next, distanceToNext: next.at - along, remaining, arrived: false, replanning: current.replanning });

    const now = performance.now();
    const viewer = viewerRef.current;
    if (offset > 1.6 && now - current.lastReplan > 1500 && viewer && !viewer.controls.autopiloting && routerRef.current) {
      const pending = { ...current, replanning: true, lastReplan: now };
      setNav(pending);
      routerRef.current.plan(here, current.goal).then(({ route: fresh }) => {
        if (navRef.current?.poi.id !== current.poi.id) return;
        if (!fresh) {
          setNav({ ...pending, replanning: false });
          return;
        }
        viewerRef.current?.showRoute(fresh.points, [fresh.points.at(-1)![0], 0, fresh.points.at(-1)![1]]);
        setNav({ ...pending, route: fresh, cum: cumulativeLengths(fresh.points), replanning: false });
      });
    }
  }, [notify]);
  const trackRef = useRef(track);
  trackRef.current = track;

  const toggleAutopilot = useCallback(() => {
    const viewer = viewerRef.current;
    const current = navRef.current;
    if (!viewer || !current || current.arrived) return;
    if (viewer.controls.autopiloting) {
      viewer.controls.stopAutopilot(false);
      setAutopiloting(false);
      return;
    }
    const { along } = projectOnPolyline(current.route.points, current.cum, [viewer.controls.x, viewer.controls.z]);
    viewer.controls.startAutopilot(current.route.points, along);
    setAutopiloting(true);
  }, []);

  // ---- Selection, picking, teleport -------------------------------------------------------
  const select = useCallback((poi: Poi | null) => setSelected(poi), []);
  const selectRef = useRef(select);
  selectRef.current = select;

  const goThere = useCallback((poi: Poi) => {
    setSelected(poi);
    viewerRef.current?.goToPoi(poi);
  }, []);

  const handlePick = useCallback((hit: PickResult) => {
    if (toolRef.current === "add-poi" && hit.point) {
      const y = Math.min(2.2, Math.max(0.7, hit.point.y + 0.5));
      setEditing({ id: `poi-${Date.now().toString(36)}`, name: "", category: "room", position: [hit.point.x, y, hit.point.z] });
      setTool("none");
      return;
    }
    if (hit.poi) {
      setSelected(hit.poi);
      notify(hit.poi.name);
    }
  }, [notify]);
  const handlePickRef = useRef(handlePick);
  handlePickRef.current = handlePick;

  const onMapClick = useCallback((x: number, z: number) => {
    if (tool === "draw-zone") {
      setDraftZone((zone) => [...(zone ?? []), [Number(x.toFixed(3)), Number(z.toFixed(3))]]);
      return;
    }
    const viewer = viewerRef.current;
    const spot = data?.grid.nearestWalkable(x, z, 1.0);
    if (!viewer || !spot) {
      notify("That spot is not walkable");
      return;
    }
    viewer.teleport(spot[0], spot[1], viewer.controls.yaw, viewer.controls.pitch);
  }, [data, notify, tool]);

  // Deep links: ?to=<poi id or name> starts navigation as soon as the scene is ready.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    const to = params.get("to");
    if (!to || deepLinkDone.current || !loading.done || pois.length === 0) return;
    deepLinkDone.current = true;
    const poi = pois.find((p) => p.id === to) ?? createPoiSearch(pois).search(to, 1)[0];
    if (poi) startNavigation(poi);
    else notify(`No place called “${to}”`);
  }, [loading.done, notify, pois, startNavigation]);

  // ---- Keyboard shortcuts ---------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case "h":
        case "?":
          setShowHelp((s) => !s);
          break;
        case "m":
          setMapExpanded((s) => !s);
          break;
        case "i":
          setShowStats((s) => !s);
          break;
        case "p":
          setShowList((s) => !s);
          break;
        case "n":
          setNoclip((s) => !s);
          break;
        case "l":
          viewerRef.current?.controls.requestLock();
          break;
        case "g":
          if (selected) startNavigation(selected);
          break;
        case "t":
          if (selected) goThere(selected);
          break;
        case "f":
          toggleAutopilot();
          break;
        case "x":
          stopNavigation();
          break;
        case "escape":
          setShowList(false);
          setMapExpanded(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goThere, selected, startNavigation, stopNavigation, toggleAutopilot]);

  const distance = useMemo(() => {
    if (!selected || !player) return null;
    return Math.hypot(selected.position[0] - player.x, selected.position[2] - player.z);
  }, [player, selected]);

  const closeHelp = () => {
    setShowHelp(false);
    storageSet("namma.helpSeen", "1");
  };

  return (
    <div className="app">
      <div className="viewer" ref={containerRef} />
      {locked && <div className="crosshair" aria-hidden />}

      {data && (
        <>
          <header className="topbar">
            <div className="brand"><span className="brand-pin" aria-hidden />Mayalok</div>
            {scenes.length > 1 ? (
              <select className="scene-select" value={data.manifest.id} aria-label="Choose a space"
                onChange={(e) => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("scene", e.target.value);
                  window.location.href = url.toString();
                }}>
                {scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <span className="scene-name">{data.manifest.name}</span>
            )}
            <SearchBar pois={pois} player={player} onSelect={(p) => setSelected(p)} onNavigate={startNavigation} />
            <nav className="topbar-actions">
              <button type="button" className="icon-btn" onClick={() => setShowList((s) => !s)} title="All places (P)">☰</button>
              <button type="button" className="icon-btn" onClick={() => setShowHelp(true)} title="Controls (H)">?</button>
              <button type="button" className={`icon-btn ${showStats ? "is-on" : ""}`} onClick={() => setShowStats((s) => !s)} title="Stats (I)">ⓘ</button>
              <button type="button" className={`icon-btn ${admin ? "is-on" : ""}`} onClick={() => setAdmin((a) => !a)} title="Edit places">✎</button>
            </nav>
          </header>

          {admin && (
            <AdminToolbar
              tool={tool}
              dirty={dirty}
              zonePoints={draftZone?.length ?? 0}
              onTool={(t) => {
                setTool(t);
                if (t !== "draw-zone") setDraftZone(null);
              }}
              onFinishZone={() => {
                if (selected && draftZone && draftZone.length >= 3) {
                  const updated = { ...selected, zone: draftZone };
                  savePois(pois.map((p) => (p.id === selected.id ? updated : p)));
                  setSelected(updated);
                }
                setDraftZone(null);
                setTool("none");
              }}
              onExport={() => {
                const blob = new Blob([JSON.stringify({ version: 1, pois }, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "pois.json";
                a.click();
                URL.revokeObjectURL(a.href);
              }}
              onImport={(file) => savePois(file.pois)}
              onReset={() => {
                storageSet(`namma.pois.${data.manifest.id}`, null);
                setPois(data.pois.pois);
                setDirty(false);
                setSelected(null);
              }}
              onExit={() => {
                setAdmin(false);
                setTool("none");
                setDraftZone(null);
              }}
            />
          )}

          {showList && <PoiList pois={pois} selectedId={selected?.id ?? null} onSelect={(p) => setSelected(p)} onClose={() => setShowList(false)} />}

          {selected && !navView && (
            <PoiCard
              poi={selected}
              distance={distance}
              admin={admin}
              onNavigate={() => startNavigation(selected)}
              onGoThere={() => goThere(selected)}
              onClose={() => setSelected(null)}
              onEdit={() => setEditing(selected)}
              onDelete={() => {
                savePois(pois.filter((p) => p.id !== selected.id));
                setSelected(null);
              }}
              onDrawZone={() => {
                setTool("draw-zone");
                setDraftZone([]);
                setMapExpanded(true);
              }}
            />
          )}

          {navView && <NavHud nav={navView} autopiloting={autopiloting} onAutopilot={toggleAutopilot} onStop={stopNavigation} />}

          <Minimap
            data={data}
            player={player}
            pois={pois}
            route={nav && !nav.arrived ? nav.route.points : null}
            selectedId={selected?.id ?? null}
            expanded={mapExpanded}
            draftZone={tool === "draw-zone" ? draftZone ?? [] : null}
            onToggleExpanded={() => setMapExpanded((s) => !s)}
            onSelectPoi={(p) => setSelected(p)}
            onMapClick={onMapClick}
          />

          {!locked && !isTouch && loading.done && (
            <button type="button" className="lock-hint" onClick={() => viewerRef.current?.controls.requestLock()}>
              Drag to look · <kbd>WASD</kbd> to walk · <kbd>L</kbd> mouse-look
            </button>
          )}

          {showStats && <StatsPanel fps={fps.fps} pixelRatio={fps.pixelRatio} stats={data.manifest.stats} player={player} noclip={noclip} />}
        </>
      )}

      {editing && (
        <PoiEditor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(poi) => {
            const exists = pois.some((p) => p.id === poi.id);
            savePois(exists ? pois.map((p) => (p.id === poi.id ? poi : p)) : [...pois, poi]);
            setSelected(poi);
            setEditing(null);
          }}
        />
      )}

      {showHelp && loading.done && <HelpOverlay onClose={closeHelp} touch={isTouch} />}
      {(!loading.done || error) && <LoadingScreen stage={loading.stage} loaded={loading.loaded} total={loading.total} error={error} />}
      <Toast message={toast} />
    </div>
  );
}
