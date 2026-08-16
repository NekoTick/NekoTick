import type { WhiteboardPoint } from '@/components/Whiteboard/model/core/whiteboardModel';
import type { WhiteboardSelectionRect } from './whiteboardSelectionTransform';

const CELL_SIZE = 256;
const MAX_CELLS_PER_ITEM = 256;
const MAX_QUERY_CELLS = 4096;

interface WhiteboardSpatialSweep {
  end: { point: WhiteboardPoint };
  radius: number;
  start: { point: WhiteboardPoint };
}

export function getItemCellKeys(bounds: WhiteboardSelectionRect): string[] | null {
  return getCellKeys(bounds, MAX_CELLS_PER_ITEM);
}

export function getRectCellKeys(bounds: WhiteboardSelectionRect): string[] | null {
  return getCellKeys(bounds, MAX_QUERY_CELLS);
}

export function getSweepCellKeys(sweeps: WhiteboardSpatialSweep[]): Set<string> {
  const keys = new Set<string>();
  for (const sweep of sweeps) {
    const bounds = {
      height: Math.abs(sweep.end.point.y - sweep.start.point.y) + sweep.radius * 2,
      width: Math.abs(sweep.end.point.x - sweep.start.point.x) + sweep.radius * 2,
      x: Math.min(sweep.start.point.x, sweep.end.point.x) - sweep.radius,
      y: Math.min(sweep.start.point.y, sweep.end.point.y) - sweep.radius,
    };
    for (const key of getCellKeys(bounds) ?? []) keys.add(key);
  }
  return keys;
}

export function getPointCellKey(point: WhiteboardPoint): string {
  return `${Math.floor(point.x / CELL_SIZE)}:${Math.floor(point.y / CELL_SIZE)}`;
}

function getCellKeys(bounds: WhiteboardSelectionRect, maxCells = Infinity): string[] | null {
  const minCellX = Math.floor(bounds.x / CELL_SIZE);
  const maxCellX = Math.floor((bounds.x + bounds.width) / CELL_SIZE);
  const minCellY = Math.floor(bounds.y / CELL_SIZE);
  const maxCellY = Math.floor((bounds.y + bounds.height) / CELL_SIZE);
  if ((maxCellX - minCellX + 1) * (maxCellY - minCellY + 1) > maxCells) return null;
  const keys: string[] = [];
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) keys.push(`${cellX}:${cellY}`);
  }
  return keys;
}
