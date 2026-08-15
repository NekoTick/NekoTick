import type { WhiteboardAutoShape, WhiteboardPoint } from './whiteboardModel';

export function getWhiteboardAutoShapePoints(
  shape: WhiteboardAutoShape,
  bounds: readonly [number, number, number, number],
): WhiteboardPoint[] {
  const [minX, minY, maxX, maxY] = bounds;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  if (shape === 'triangle') {
    return close([{ x: centerX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }]);
  }
  if (shape === 'rectangle') {
    return close([
      { x: minX, y: minY }, { x: maxX, y: minY },
      { x: maxX, y: maxY }, { x: minX, y: maxY },
    ]);
  }
  if (shape === 'diamond') {
    return close([
      { x: centerX, y: minY }, { x: maxX, y: centerY },
      { x: centerX, y: maxY }, { x: minX, y: centerY },
    ]);
  }
  const width = maxX - minX;
  if (shape === 'parallelogram') {
    return close([
      { x: minX + width * 0.22, y: minY }, { x: maxX, y: minY },
      { x: maxX - width * 0.22, y: maxY }, { x: minX, y: maxY },
    ]);
  }
  if (shape === 'trapezoid') {
    return close([
      { x: minX + width * 0.22, y: minY }, { x: maxX - width * 0.22, y: minY },
      { x: maxX, y: maxY }, { x: minX, y: maxY },
    ]);
  }
  if (shape === 'pentagon') return close(getRegularPolygonPoints(5, bounds));
  if (shape === 'hexagon') {
    return close([
      { x: minX + width * 0.25, y: minY }, { x: maxX - width * 0.25, y: minY },
      { x: maxX, y: centerY }, { x: maxX - width * 0.25, y: maxY },
      { x: minX + width * 0.25, y: maxY }, { x: minX, y: centerY },
    ]);
  }
  if (shape === 'octagon') return close(getRegularPolygonPoints(8, bounds));
  if (shape === 'star') return close(getStarPoints(bounds));
  if (shape === 'cross') return close(getCrossPoints(bounds));
  const radiusX = (maxX - minX) / 2;
  const radiusY = (maxY - minY) / 2;
  return Array.from({ length: 33 }, (_, index) => {
    const angle = Math.PI * 2 * index / 32;
    return { x: centerX + Math.cos(angle) * radiusX, y: centerY + Math.sin(angle) * radiusY };
  });
}

function close(points: WhiteboardPoint[]): WhiteboardPoint[] {
  return [...points, points[0]];
}

function getRegularPolygonPoints(sides: number, bounds: readonly [number, number, number, number]): WhiteboardPoint[] {
  const [minX, minY, maxX, maxY] = bounds;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const radiusX = (maxX - minX) / 2;
  const radiusY = (maxY - minY) / 2;
  return Array.from({ length: sides }, (_, index) => {
    const angle = -Math.PI / 2 + Math.PI * 2 * index / sides;
    return { x: centerX + Math.cos(angle) * radiusX, y: centerY + Math.sin(angle) * radiusY };
  });
}

function getStarPoints(bounds: readonly [number, number, number, number]): WhiteboardPoint[] {
  const [minX, minY, maxX, maxY] = bounds;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const radiusX = (maxX - minX) / 2;
  const radiusY = (maxY - minY) / 2;
  return Array.from({ length: 10 }, (_, index) => {
    const radiusScale = index % 2 === 0 ? 1 : 0.4;
    const angle = -Math.PI / 2 + Math.PI * index / 5;
    return {
      x: centerX + Math.cos(angle) * radiusX * radiusScale,
      y: centerY + Math.sin(angle) * radiusY * radiusScale,
    };
  });
}

function getCrossPoints(bounds: readonly [number, number, number, number]): WhiteboardPoint[] {
  const [minX, minY, maxX, maxY] = bounds;
  const width = maxX - minX;
  const height = maxY - minY;
  const left = minX + width / 3;
  const right = maxX - width / 3;
  const top = minY + height / 3;
  const bottom = maxY - height / 3;
  return [
    { x: left, y: minY }, { x: right, y: minY }, { x: right, y: top },
    { x: maxX, y: top }, { x: maxX, y: bottom }, { x: right, y: bottom },
    { x: right, y: maxY }, { x: left, y: maxY }, { x: left, y: bottom },
    { x: minX, y: bottom }, { x: minX, y: top }, { x: left, y: top },
  ];
}
