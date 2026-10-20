import { useEffect, useMemo, useRef, useState } from "react";
import { categoryStyle } from "../engine/categories";
import { formatDistance } from "../lib/format";
import { createPoiSearch } from "../lib/search";
import type { Poi } from "../types";

interface Props {
  pois: Poi[];
  player: { x: number; z: number } | null;
  onSelect: (poi: Poi) => void;
  onNavigate: (poi: Poi) => void;
}

export function SearchBar({ pois, player, onSelect, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useMemo(() => createPoiSearch(pois), [pois]);
  const results = useMemo(() => search.search(query, 8), [search, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key === "/" && target?.tagName !== "INPUT" && target?.tagName !== "TEXTAREA") {
        e.preventDefault();
        document.exitPointerLock?.();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const choose = (poi: Poi, navigate: boolean) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    if (navigate) onNavigate(poi);
    else onSelect(poi);
  };

  return (
    <div className="search" role="search">
      <div className="search-box">
        <span className="search-icon" aria-hidden>⌕</span>
        <input
          ref={inputRef}
          value={query}
          placeholder="Search rooms, furniture, places…"
          aria-label="Search places"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              choose(results[active], e.shiftKey);
            } else if (e.key === "Escape") {
              inputRef.current?.blur();
            }
          }}
        />
        <kbd className="search-kbd">/</kbd>
      </div>
      {open && (
        <ul className="search-results" role="listbox">
          {results.length === 0 && <li className="search-empty">No places match “{query}”</li>}
          {results.map((poi, i) => {
            const style = categoryStyle(poi.category);
            const d = player ? Math.hypot(poi.position[0] - player.x, poi.position[2] - player.z) : NaN;
            return (
              <li
                key={poi.id}
                role="option"
                aria-selected={i === active}
                className={i === active ? "is-active" : ""}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(poi, false);
                }}
              >
                <span className="result-icon" style={{ background: style.color }}>{style.icon}</span>
                <span className="result-text">
                  <strong>{poi.name}</strong>
                  <small>{style.label.replace(/s$/, "")}{Number.isFinite(d) ? ` · ${formatDistance(d)} away` : ""}</small>
                </span>
                <button
                  type="button"
                  className="result-go"
                  title="Navigate here"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    choose(poi, true);
                  }}
                >
                  Go
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
