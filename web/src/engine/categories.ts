/** Display style per POI category (unknown categories fall back to "other"). */
export interface CategoryStyle {
  label: string;
  icon: string;
  color: string;
}

export const CATEGORIES: Record<string, CategoryStyle> = {
  room: { label: "Rooms", icon: "🚪", color: "#4f8cff" },
  furniture: { label: "Furniture", icon: "🛋️", color: "#f2a541" },
  electronics: { label: "Electronics", icon: "📺", color: "#9b6dff" },
  facility: { label: "Facilities", icon: "🚻", color: "#2fbf71" },
  exit: { label: "Exits", icon: "🚪", color: "#ff5d5d" },
  shop: { label: "Shops", icon: "🛍️", color: "#ff7ab6" },
  food: { label: "Food", icon: "☕", color: "#c98b4a" },
  info: { label: "Information", icon: "ℹ️", color: "#2ec5d3" },
  other: { label: "Other", icon: "📍", color: "#8a94a6" },
};

export function categoryStyle(category: string): CategoryStyle {
  return CATEGORIES[category] ?? CATEGORIES.other;
}
