import type { WhiteboardSelectionRect } from './whiteboardSelectionTransform';
import { getItemCellKeys } from './whiteboardSpatialGrid';

export function addWhiteboardItemToCells<T>(
  cells: Map<string, T[]>,
  item: T,
  bounds: WhiteboardSelectionRect,
): boolean {
  const keys = getItemCellKeys(bounds);
  if (!keys) return false;
  for (const key of keys) {
    const items = cells.get(key);
    if (items) items.push(item);
    else cells.set(key, [item]);
  }
  return true;
}

export function addWhiteboardItemToOverlayCells<T>(
  cells: Map<string, T[]>,
  item: T,
  bounds: WhiteboardSelectionRect,
): boolean {
  const keys = getItemCellKeys(bounds);
  if (!keys) return false;
  for (const key of keys) cells.set(key, [...(cells.get(key) ?? []), item]);
  return true;
}
