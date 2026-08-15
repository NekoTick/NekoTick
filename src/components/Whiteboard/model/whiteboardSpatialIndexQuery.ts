import type { WhiteboardElement, WhiteboardStroke } from './whiteboardModel';
import type { WhiteboardEraserSpatialIndex, WhiteboardItemOrder } from './whiteboardSpatialIndex';

export function getWhiteboardIndexedItems<T extends { id: string }>(
  items: T[],
  order: WhiteboardItemOrder,
  ids: string[],
): T[] {
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  for (const id of ids) {
    if (selectedIds.has(id)) continue;
    selectedIds.add(id);
    const itemOrder = order.get(id);
    const item = itemOrder === undefined ? undefined : items[itemOrder];
    if (item?.id === id) selected.push(item);
  }
  return selected;
}

export function collectWhiteboardGlobalItems(
  index: WhiteboardEraserSpatialIndex,
  elements: Set<WhiteboardElement> | null,
  strokes: Set<WhiteboardStroke> | null,
): void {
  if (index.baseIndex) collectWhiteboardGlobalItems(index.baseIndex, elements, strokes);
  if (elements) for (const element of index.globalElements) elements.add(element);
  if (strokes) for (const stroke of index.globalStrokes) strokes.add(stroke);
}

export function collectWhiteboardCellItems(
  index: WhiteboardEraserSpatialIndex,
  key: string,
  elements: Set<WhiteboardElement> | null,
  strokes: Set<WhiteboardStroke> | null,
): void {
  if (index.baseIndex) collectWhiteboardCellItems(index.baseIndex, key, elements, strokes);
  if (elements) for (const element of index.elementCells.get(key) ?? []) elements.add(element);
  if (strokes) for (const stroke of index.strokeCells.get(key) ?? []) strokes.add(stroke);
}

export function getCurrentWhiteboardItems<T extends { id: string }>(
  candidates: Set<T>,
  items: T[],
  order: WhiteboardItemOrder,
  filterStale: boolean,
): T[] {
  if (!filterStale) return [...candidates];
  return [...candidates].filter((item) => {
    const itemOrder = order.get(item.id);
    return itemOrder !== undefined && items[itemOrder] === item;
  });
}

export function sortWhiteboardItemsBySourceOrder<T extends { id: string }>(
  candidates: Set<T>,
  items: T[],
  order: WhiteboardItemOrder,
  filterStale: boolean,
): T[] {
  return getCurrentWhiteboardItems(candidates, items, order, filterStale)
    .sort((first, second) => (order.get(first.id) ?? 0) - (order.get(second.id) ?? 0));
}
