import { CATEGORIES, categoryStyle } from "../engine/categories";
import type { Poi } from "../types";

interface Props {
  pois: Poi[];
  selectedId: string | null;
  onSelect: (poi: Poi) => void;
  onClose: () => void;
}

export function PoiList({ pois, selectedId, onSelect, onClose }: Props) {
  const groups = new Map<string, Poi[]>();
  for (const poi of pois) {
    const key = CATEGORIES[poi.category] ? poi.category : "other";
    groups.set(key, [...(groups.get(key) ?? []), poi]);
  }
  return (
    <aside className="poi-list" aria-label="All places">
      <header>
        <h2>Places</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </header>
      {pois.length === 0 && <p className="muted">No places tagged yet. Open edit mode to add some.</p>}
      {[...groups.entries()].map(([category, items]) => (
        <section key={category}>
          <h3>{categoryStyle(category).icon} {categoryStyle(category).label} <span>{items.length}</span></h3>
          <ul>
            {items.sort((a, b) => a.name.localeCompare(b.name)).map((poi) => (
              <li key={poi.id}>
                <button type="button" className={poi.id === selectedId ? "is-selected" : ""} onClick={() => onSelect(poi)}>
                  {poi.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
