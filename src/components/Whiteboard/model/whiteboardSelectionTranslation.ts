import { markWhiteboardSparseUpdate } from './whiteboardCollection';
import type { WhiteboardElement, WhiteboardStroke } from './whiteboardModel';
import { cacheTranslatedStrokeBounds } from './whiteboardSelectionGeometry';
import type { WhiteboardItemOrder } from './whiteboardSpatialIndex';

export function translateStroke(stroke: WhiteboardStroke, dx: number, dy: number): WhiteboardStroke {
  const points = new Array<WhiteboardStroke['points'][number]>(stroke.points.length);
  for (let index = 0; index < stroke.points.length; index += 1) {
    const point = stroke.points[index];
    points[index] = { ...point, x: point.x + dx, y: point.y + dy };
  }
  const translated: WhiteboardStroke = { ...stroke, points };
  cacheTranslatedStrokeBounds(stroke, translated, dx, dy);
  return translated;
}

export function translateStrokesFromOriginals(
  strokes: WhiteboardStroke[],
  originalStrokes: WhiteboardStroke[] | ReadonlyMap<string, WhiteboardStroke>,
  dx: number,
  dy: number,
  order?: WhiteboardItemOrder | null,
): WhiteboardStroke[] {
  const originalById = toStrokeMap(originalStrokes);
  if (!Array.isArray(originalStrokes) && order) {
    const translated = strokes.slice();
    const changedItems: WhiteboardStroke[] = [];
    for (const original of originalById.values()) {
      const index = order.get(original.id);
      if (index === undefined || strokes[index]?.id !== original.id) continue;
      const next = translateStroke(original, dx, dy);
      translated[index] = next;
      changedItems.push(next);
    }
    return markWhiteboardSparseUpdate(strokes, translated, changedItems);
  }
  const translated = new Array<WhiteboardStroke>(strokes.length);
  const changedItems: WhiteboardStroke[] = [];
  for (let index = 0; index < strokes.length; index += 1) {
    const stroke = strokes[index];
    const original = originalById.get(stroke.id);
    const next = original ? translateStroke(original, dx, dy) : stroke;
    translated[index] = next;
    if (original) changedItems.push(next);
  }
  return markWhiteboardSparseUpdate(strokes, translated, changedItems);
}

export function translateElementsFromOriginals(
  elements: WhiteboardElement[],
  originalElements: ReadonlyMap<string, WhiteboardElement>,
  dx: number,
  dy: number,
  order?: WhiteboardItemOrder | null,
): WhiteboardElement[] {
  const translated = order ? elements.slice() : new Array<WhiteboardElement>(elements.length);
  const changedItems: WhiteboardElement[] = [];
  if (order) {
    for (const original of originalElements.values()) {
      const index = order.get(original.id);
      if (index === undefined || elements[index]?.id !== original.id) continue;
      const next = { ...elements[index], x: Math.round(original.x + dx), y: Math.round(original.y + dy) };
      translated[index] = next;
      changedItems.push(next);
    }
  } else {
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const original = originalElements.get(element.id);
      const next = original
        ? { ...element, x: Math.round(original.x + dx), y: Math.round(original.y + dy) }
        : element;
      translated[index] = next;
      if (original) changedItems.push(next);
    }
  }
  return markWhiteboardSparseUpdate(elements, translated, changedItems);
}

const toStrokeMap = (strokes: WhiteboardStroke[] | ReadonlyMap<string, WhiteboardStroke>) => (
  Array.isArray(strokes) ? new Map(strokes.map((stroke) => [stroke.id, stroke])) : strokes
);
