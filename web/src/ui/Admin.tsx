import { useState } from "react";
import { CATEGORIES } from "../engine/categories";
import type { Poi, PoiFile } from "../types";

export type AdminTool = "none" | "add-poi" | "draw-zone";

interface ToolbarProps {
  tool: AdminTool;
  dirty: boolean;
  zonePoints: number;
  onTool: (tool: AdminTool) => void;
  onFinishZone: () => void;
  onExport: () => void;
  onImport: (file: PoiFile) => void;
  onReset: () => void;
  onExit: () => void;
}

export function AdminToolbar({ tool, dirty, zonePoints, onTool, onFinishZone, onExport, onImport, onReset, onExit }: ToolbarProps) {
  const [importError, setImportError] = useState<string | null>(null);
  return (
    <div className="admin-bar" role="toolbar" aria-label="Edit places">
      <strong>Edit mode</strong>
      <button type="button" className={`btn btn-small ${tool === "add-poi" ? "btn-primary" : ""}`}
        onClick={() => onTool(tool === "add-poi" ? "none" : "add-poi")}>
        + Add place
      </button>
      {tool === "add-poi" && <span className="admin-hint">Click a spot in the 3D view</span>}
      {tool === "draw-zone" && (
        <>
          <span className="admin-hint">Click corners on the map ({zonePoints} so far)</span>
          <button type="button" className="btn btn-small btn-primary" disabled={zonePoints < 3} onClick={onFinishZone}>Finish zone</button>
          <button type="button" className="btn btn-small" onClick={() => onTool("none")}>Cancel</button>
        </>
      )}
      <span className="admin-spacer" />
      <button type="button" className="btn btn-small" onClick={onExport} title="Download pois.json to commit into the scene folder">
        Export{dirty ? " •" : ""}
      </button>
      <label className="btn btn-small">
        Import
        <input type="file" accept="application/json" hidden onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const parsed = JSON.parse(await file.text()) as PoiFile;
            if (!Array.isArray(parsed.pois)) throw new Error("missing pois array");
            setImportError(null);
            onImport(parsed);
          } catch (err) {
            setImportError(`Not a pois.json file (${(err as Error).message})`);
          }
          e.target.value = "";
        }} />
      </label>
      <button type="button" className="btn btn-small" onClick={onReset} title="Discard local edits">Reset</button>
      <button type="button" className="btn btn-small" onClick={onExit}>Close</button>
      {importError && <span className="admin-error">{importError}</span>}
    </div>
  );
}

interface EditorProps {
  initial: Poi;
  onSave: (poi: Poi) => void;
  onCancel: () => void;
}

export function PoiEditor({ initial, onSave, onCancel }: EditorProps) {
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [tags, setTags] = useState((initial.tags ?? []).join(", "));
  const [description, setDescription] = useState(initial.description ?? "");
  const [height, setHeight] = useState(initial.position[1]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="modal poi-editor"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave({
            ...initial,
            name: name.trim(),
            category,
            tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
            description: description.trim() || undefined,
            position: [initial.position[0], height, initial.position[2]],
          });
        }}
      >
        <h2>{initial.name ? "Edit place" : "New place"}</h2>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meeting Room 4" autoFocus required /></label>
        <label>Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORIES).map(([key, c]) => <option key={key} value={key}>{c.icon} {c.label}</option>)}
          </select>
        </label>
        <label>Search keywords<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma separated, e.g. couch, 3-seater" /></label>
        <label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></label>
        <label>Label height (m)
          <input type="number" step={0.1} min={0.2} max={3} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
  );
}
