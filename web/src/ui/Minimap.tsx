import { useCallback, useEffect, useRef } from "react";
import { categoryStyle } from "../engine/categories";
import type { PlayerState } from "../engine/PlayerControls";
import type { LoadedScene } from "../lib/sceneLoader";
import type { Poi, Vec2 } from "../types";

interface Props {
  data: LoadedScene;
  player: PlayerState | null;
  pois: Poi[];
  route: Vec2[] | null;
  selectedId: string | null;
  expanded: boolean;
  draftZone: Vec2[] | null;
  onToggleExpanded: () => void;
  onSelectPoi: (poi: Poi) => void;
  /** Clicked an empty spot. Return nothing; the app decides (teleport or admin drawing). */
  onMapClick: (x: number, z: number) => void;
}

/** World extent (m) shown by the compact map before it switches to following the player. */
const COMPACT_SPAN_M = 22;

export function Minimap({ data, player, pois, route, selectedId, expanded, draftZone, onToggleExpanded, onSelectPoi, onMapClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ scale: 1, offX: 0, offY: 0 });
  const { manifest, minimap } = data;
  const [ox, oz] = manifest.minimap.origin;
  const mpp = manifest.minimap.metersPerPixel;

  const toImage = useCallback((x: number, z: number): Vec2 => [(x - ox) / mpp, (z - oz) / mpp], [ox, oz, mpp]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const imgW = minimap.naturalWidth;
    const imgH = minimap.naturalHeight;
    const spanM = Math.max(imgW, imgH) * mpp;
    const follow = !expanded && spanM > COMPACT_SPAN_M && player;
    let scale: number;
    let offX: number;
    let offY: number;
    if (follow) {
      scale = cw / (COMPACT_SPAN_M / mpp);
      const [px, py] = toImage(player.x, player.z);
      offX = cw / 2 - px * scale;
      offY = ch / 2 - py * scale;
    } else {
      scale = Math.min(cw / imgW, ch / imgH) * 0.92;
      offX = (cw - imgW * scale) / 2;
      offY = (ch - imgH * scale) / 2;
    }
    viewRef.current = { scale, offX, offY };
    const S = (x: number, z: number): Vec2 => {
      const [ix, iy] = toImage(x, z);
      return [offX + ix * scale, offY + iy * scale];
    };

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(minimap, offX, offY, imgW * scale, imgH * scale);

    // Zones.
    for (const poi of pois) {
      if (!poi.zone || poi.zone.length < 3) continue;
      const style = categoryStyle(poi.category);
      ctx.beginPath();
      poi.zone.forEach(([x, z], i) => {
        const [sx, sy] = S(x, z);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.fillStyle = `${style.color}${poi.id === selectedId ? "40" : "14"}`;
      ctx.fill();
      ctx.strokeStyle = `${style.color}${poi.id === selectedId ? "ff" : "70"}`;
      ctx.lineWidth = poi.id === selectedId ? 2 : 1;
      ctx.stroke();
    }

    // Admin: zone being drawn.
    if (draftZone && draftZone.length) {
      ctx.beginPath();
      draftZone.forEach(([x, z], i) => {
        const [sx, sy] = S(x, z);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [x, z] of draftZone) {
        const [sx, sy] = S(x, z);
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(sx - 3, sy - 3, 6, 6);
      }
    }

    // Route.
    if (route && route.length > 1) {
      ctx.beginPath();
      route.forEach(([x, z], i) => {
        const [sx, sy] = S(x, z);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.strokeStyle = "rgba(46, 197, 255, 0.35)";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.strokeStyle = "#2ec5ff";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // POI dots, then names placed greedily (selected first) so labels never overlap:
    // try right of the dot, then left, otherwise show only the dot.
    for (const poi of pois) {
      const style = categoryStyle(poi.category);
      const [sx, sy] = S(poi.position[0], poi.position[2]);
      const r = poi.id === selectedId ? 6 : 4;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = style.color;
      ctx.fill();
      ctx.strokeStyle = "#0b0f17";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    const placed: [number, number, number, number][] = [];
    const overlaps = (b: [number, number, number, number]) =>
      placed.some((p) => b[0] < p[2] && b[2] > p[0] && b[1] < p[3] && b[3] > p[1]);
    const labelled = pois.filter((p) => expanded || p.id === selectedId)
      .sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId));
    for (const poi of labelled) {
      const [sx, sy] = S(poi.position[0], poi.position[2]);
      const w = ctx.measureText(poi.name).width;
      const candidates: [number, number, number, number][] = [
        [sx + 8, sy - 7, sx + 8 + w, sy + 6],
        [sx - 8 - w, sy - 7, sx - 8, sy + 6],
      ];
      const box = candidates.find((b) => !overlaps(b));
      if (!box) continue;
      placed.push(box);
      ctx.fillStyle = "#e9eef7";
      ctx.strokeStyle = "rgba(11,15,23,0.85)";
      ctx.lineWidth = 3;
      ctx.strokeText(poi.name, box[0], sy + 4);
      ctx.fillText(poi.name, box[0], sy + 4);
    }

    // Player: position dot with a view cone pointing along the camera heading.
    if (player) {
      const [sx, sy] = S(player.x, player.z);
      const angle = Math.atan2(-Math.cos(player.yaw), -Math.sin(player.yaw));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, 34, angle - 0.55, angle + 0.55);
      ctx.closePath();
      const cone = ctx.createRadialGradient(sx, sy, 0, sx, sy, 34);
      cone.addColorStop(0, "rgba(255,255,255,0.45)");
      cone.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = cone;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#2e7dff";
      ctx.fill();
    }
  }, [draftZone, expanded, minimap, mpp, player, pois, route, selectedId, toImage]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { scale, offX, offY } = viewRef.current;
    const x = ox + ((cx - offX) / scale) * mpp;
    const z = oz + ((cy - offY) / scale) * mpp;
    if (!draftZone) {
      const hit = pois.find((p) => {
        const [ix, iy] = toImage(p.position[0], p.position[2]);
        return Math.hypot(offX + ix * scale - cx, offY + iy * scale - cy) < 11;
      });
      if (hit) {
        onSelectPoi(hit);
        return;
      }
    }
    onMapClick(x, z);
  };

  return (
    <div className={`minimap ${expanded ? "is-expanded" : ""}`}>
      <canvas ref={canvasRef} onClick={onClick} aria-label="Floor plan. Click a place to select it, or an empty spot to jump there." />
      <button type="button" className="minimap-toggle" onClick={onToggleExpanded} title="Toggle large map (M)">
        {expanded ? "✕" : "⤢"}
      </button>
      {expanded && <div className="minimap-hint">Click a place to select it · click the floor to jump there</div>}
    </div>
  );
}
