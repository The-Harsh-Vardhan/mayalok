interface LoadingProps {
  stage: string;
  loaded: number;
  total: number;
  error: string | null;
}

export function LoadingScreen({ stage, loaded, total, error }: LoadingProps) {
  const pct = total > 0 ? Math.min(100, (loaded / total) * 100) : null;
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="brand brand-large"><span className="brand-pin" aria-hidden />Namma Space</div>
      {error ? (
        <p className="loading-error">{error}</p>
      ) : (
        <>
          <p>{stage}</p>
          <div className={`progress ${pct === null ? "is-indeterminate" : ""}`}>
            <div style={{ width: pct === null ? "35%" : `${pct}%` }} />
          </div>
          <small>{total > 0 ? `${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB` : " "}</small>
        </>
      )}
    </div>
  );
}

interface HelpProps {
  onClose: () => void;
  touch: boolean;
}

export function HelpOverlay({ onClose, touch }: HelpProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal help" role="dialog" aria-label="Controls" onClick={(e) => e.stopPropagation()}>
        <h2>Walk around like in a game</h2>
        {touch ? (
          <ul className="keys">
            <li><span>Left thumb</span> drag to walk</li>
            <li><span>Right side</span> drag to look around</li>
            <li><span>Tap</span> a label or place to see what it is</li>
          </ul>
        ) : (
          <ul className="keys">
            <li><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span> walk (arrow keys work too)</li>
            <li><span><kbd>Shift</kbd></span> walk faster</li>
            <li><span>Drag mouse</span> look around, or press <kbd>L</kbd> for mouse-look (<kbd>Esc</kbd> to exit)</li>
            <li><span>Click</span> a room or object to see its name</li>
            <li><span><kbd>/</kbd></span> search places · <kbd>M</kbd> big map</li>
            <li><span><kbd>G</kbd> / <kbd>T</kbd></span> navigate to / jump to the selected place</li>
            <li><span><kbd>F</kbd></span> auto-walk the route · <kbd>X</kbd> end navigation</li>
            <li><span><kbd>N</kbd></span> fly mode (no collisions) · <kbd>H</kbd> this help · <kbd>I</kbd> stats</li>
          </ul>
        )}
        <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>Start exploring</button>
      </div>
    </div>
  );
}

interface StatsProps {
  fps: number;
  pixelRatio: number;
  stats: Record<string, unknown>;
  player: { x: number; z: number } | null;
  noclip: boolean;
}

export function StatsPanel({ fps, pixelRatio, stats, player, noclip }: StatsProps) {
  const exportStats = (stats.export ?? {}) as { gaussians?: number; splat_mb?: number };
  const sfm = (stats.sfm ?? {}) as { frames_registered?: number; frames_total?: number };
  const seconds = stats.processing_seconds as number | undefined;
  return (
    <div className="stats" aria-label="Performance statistics">
      <div><span>FPS</span><strong>{fps.toFixed(0)}</strong></div>
      <div><span>Render scale</span><strong>{pixelRatio.toFixed(2)}×</strong></div>
      {exportStats.gaussians !== undefined && <div><span>Gaussians</span><strong>{(exportStats.gaussians / 1e6).toFixed(2)} M</strong></div>}
      {exportStats.splat_mb !== undefined && <div><span>Download</span><strong>{exportStats.splat_mb} MB</strong></div>}
      {sfm.frames_total !== undefined && <div><span>Frames registered</span><strong>{sfm.frames_registered}/{sfm.frames_total}</strong></div>}
      {seconds !== undefined && <div><span>Processing</span><strong>{(seconds / 60).toFixed(1)} min</strong></div>}
      {player && <div><span>Position</span><strong>{player.x.toFixed(2)}, {player.z.toFixed(2)}</strong></div>}
      {noclip && <div className="stats-warn">Fly mode: collisions off</div>}
    </div>
  );
}

interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  return <div className={`toast ${message ? "is-visible" : ""}`} role="status" aria-live="polite">{message}</div>;
}
