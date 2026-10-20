import { categoryStyle } from "../engine/categories";
import { formatDistance } from "../lib/format";
import type { Poi } from "../types";

interface Props {
  poi: Poi;
  distance: number | null;
  admin: boolean;
  onNavigate: () => void;
  onGoThere: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDrawZone: () => void;
}

export function PoiCard({ poi, distance, admin, onNavigate, onGoThere, onClose, onEdit, onDelete, onDrawZone }: Props) {
  const style = categoryStyle(poi.category);
  return (
    <section className="poi-card" aria-label={`${poi.name} details`}>
      <header>
        <span className="poi-card-icon" style={{ background: style.color }}>{style.icon}</span>
        <div>
          <h2>{poi.name}</h2>
          <p>
            {style.label.replace(/s$/, "")}
            {distance !== null ? ` · ${formatDistance(distance)} away` : ""}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </header>
      {poi.description && <p className="poi-card-desc">{poi.description}</p>}
      {poi.tags && poi.tags.length > 0 && (
        <ul className="tags">{poi.tags.map((t) => <li key={t}>{t}</li>)}</ul>
      )}
      <div className="poi-card-actions">
        <button type="button" className="btn btn-primary" onClick={onNavigate} title="Show the walking route (G)">
          Navigate
        </button>
        <button type="button" className="btn" onClick={onGoThere} title="Jump straight there (T)">
          Go there
        </button>
      </div>
      {admin && (
        <div className="poi-card-admin">
          <button type="button" className="btn btn-small" onClick={onEdit}>Edit</button>
          <button type="button" className="btn btn-small" onClick={onDrawZone}>{poi.zone ? "Redraw zone" : "Draw zone"}</button>
          <button type="button" className="btn btn-small btn-danger" onClick={onDelete}>Delete</button>
        </div>
      )}
    </section>
  );
}
