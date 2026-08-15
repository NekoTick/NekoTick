import type { WhiteboardElement, WhiteboardStroke } from './whiteboardModel';

export function cloneElements(
  elements: WhiteboardElement[],
  offset: number,
  idPrefix: string,
): WhiteboardElement[] {
  return elements.map((element, index) => ({
    ...element,
    id: `${idPrefix}-element-${index + 1}`,
    x: element.x + offset,
    y: element.y + offset,
  }));
}

export function cloneStrokes(
  strokes: WhiteboardStroke[],
  offset: number,
  idPrefix: string,
): WhiteboardStroke[] {
  return strokes.map((stroke, index) => ({
    ...stroke,
    id: `${idPrefix}-stroke-${index + 1}`,
    points: stroke.points.map((point) => ({ ...point, x: point.x + offset, y: point.y + offset })),
    renderSeed: stroke.renderSeed ?? stroke.id,
  }));
}
