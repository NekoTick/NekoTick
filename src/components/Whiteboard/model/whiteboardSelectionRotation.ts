import { markWhiteboardSparseUpdate } from './whiteboardCollection';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardStroke } from './whiteboardModel';
import type { WhiteboardItemOrder } from './whiteboardSpatialIndex';

export function rotateSelectionElements(
  elements: WhiteboardElement[],
  originalElements: ReadonlyMap<string, WhiteboardElement>,
  center: WhiteboardPoint,
  angle: number,
  order?: WhiteboardItemOrder | null,
): WhiteboardElement[] {
  const rotated = order ? elements.slice() : new Array<WhiteboardElement>(elements.length);
  const changedItems: WhiteboardElement[] = [];
  if (order) {
    for (const original of originalElements.values()) {
      const index = order.get(original.id);
      if (index === undefined || elements[index]?.id !== original.id) continue;
      const next = rotateSelectionElement({ ...original, imageSrc: elements[index].imageSrc }, center, angle);
      rotated[index] = next;
      changedItems.push(next);
    }
  } else {
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const original = originalElements.get(element.id);
      const next = original ? rotateSelectionElement({ ...original, imageSrc: element.imageSrc }, center, angle) : element;
      rotated[index] = next;
      if (original) changedItems.push(next);
    }
  }
  return markWhiteboardSparseUpdate(elements, rotated, changedItems);
}

export function rotateSelectionElement(
  element: WhiteboardElement,
  center: WhiteboardPoint,
  angle: number,
): WhiteboardElement {
  const elementCenter = rotatePoint({
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  }, center, angle);
  const rotation = normalizeAngle((element.rotation ?? 0) + angle);
  const rotated: WhiteboardElement = {
    ...element,
    rotation,
    x: elementCenter.x - element.width / 2,
    y: elementCenter.y - element.height / 2,
  };
  if (Math.abs(rotation) < 1e-10) delete rotated.rotation;
  return rotated;
}

export function rotateSelectionStrokes(
  strokes: WhiteboardStroke[],
  originalStrokes: ReadonlyMap<string, WhiteboardStroke>,
  center: WhiteboardPoint,
  angle: number,
  order?: WhiteboardItemOrder | null,
): WhiteboardStroke[] {
  const rotated = order ? strokes.slice() : new Array<WhiteboardStroke>(strokes.length);
  const changedItems: WhiteboardStroke[] = [];
  if (order) {
    for (const original of originalStrokes.values()) {
      const index = order.get(original.id);
      if (index === undefined || strokes[index]?.id !== original.id) continue;
      const next = rotateSelectionStroke(original, center, angle);
      rotated[index] = next;
      changedItems.push(next);
    }
  } else {
    for (let index = 0; index < strokes.length; index += 1) {
      const stroke = strokes[index];
      const original = originalStrokes.get(stroke.id);
      const next = original ? rotateSelectionStroke(original, center, angle) : stroke;
      rotated[index] = next;
      if (original) changedItems.push(next);
    }
  }
  return markWhiteboardSparseUpdate(strokes, rotated, changedItems);
}

export function rotateSelectionStroke(
  stroke: WhiteboardStroke,
  center: WhiteboardPoint,
  angle: number,
): WhiteboardStroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => {
      const rotated = rotatePoint(point, center, angle);
      return {
        ...point,
        ...(point.azimuth !== undefined ? { azimuth: normalizeAngle(point.azimuth + angle) } : {}),
        ...rotated,
      };
    }),
  };
}

function rotatePoint<T extends WhiteboardPoint>(point: T, center: WhiteboardPoint, angle: number): T {
  const x = point.x - center.x;
  const y = point.y - center.y;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    ...point,
    x: center.x + x * cosine - y * sine,
    y: center.y + x * sine + y * cosine,
  };
}

function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  return (angle % fullTurn + fullTurn) % fullTurn;
}
