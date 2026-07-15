import type { PickerItemDef } from "./dye-types.js";

/** Filter picker rows by label, id, or description (case-insensitive). */
export function filterPickerItems(
  items: readonly PickerItemDef[],
  query: string,
): PickerItemDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      (item.description?.toLowerCase().includes(q) ?? false),
  );
}

/** Resolve the highlighted row for Enter — filter query must match what the UI shows. */
export function resolvePickerSelection(
  items: readonly PickerItemDef[],
  filterQuery: string,
  selectedIndex: number,
): PickerItemDef | null {
  const filtered = filterPickerItems(items, filterQuery);
  if (selectedIndex < 0 || selectedIndex >= filtered.length) return null;
  return filtered[selectedIndex] ?? null;
}