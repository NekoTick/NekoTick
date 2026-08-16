import { themeGraphTokens } from '@/styles/themeTokens';
import type { GraphScreenBounds } from './graphLabelGeometry';

interface OwnedBounds extends GraphScreenBounds {
  owner: number;
}

function overlaps(
  left: number,
  top: number,
  right: number,
  bottom: number,
  other: OwnedBounds,
): boolean {
  return left < other.right
    && right > other.left
    && top < other.bottom
    && bottom > other.top;
}

export class GraphLabelBoundsIndex {
  private readonly cells = new Map<number, OwnedBounds[]>();

  private static hash(cellX: number, cellY: number): number {
    return ((cellX * 73856093) ^ (cellY * 19349663)) >>> 0;
  }

  insert(bounds: GraphScreenBounds, owner: number): void {
    const cellSize = themeGraphTokens.labelCollisionGridCellPx;
    const minX = Math.floor(bounds.left / cellSize);
    const maxX = Math.floor(bounds.right / cellSize);
    const minY = Math.floor(bounds.top / cellSize);
    const maxY = Math.floor(bounds.bottom / cellSize);
    const ownedBounds = { ...bounds, owner };
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellY = minY; cellY <= maxY; cellY += 1) {
        const key = GraphLabelBoundsIndex.hash(cellX, cellY);
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(ownedBounds);
        else this.cells.set(key, [ownedBounds]);
      }
    }
  }

  intersects(bounds: GraphScreenBounds, owner: number): boolean {
    const cellSize = themeGraphTokens.labelCollisionGridCellPx;
    const minX = Math.floor(bounds.left / cellSize);
    const maxX = Math.floor(bounds.right / cellSize);
    const minY = Math.floor(bounds.top / cellSize);
    const maxY = Math.floor(bounds.bottom / cellSize);
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellY = minY; cellY <= maxY; cellY += 1) {
        const bucket = this.cells.get(GraphLabelBoundsIndex.hash(cellX, cellY));
        if (!bucket) continue;
        for (const existing of bucket) {
          if (existing.owner !== owner && overlaps(
            bounds.left,
            bounds.top,
            bounds.right,
            bounds.bottom,
            existing,
          )) return true;
        }
      }
    }
    return false;
  }

  getIntersectionArea(bounds: GraphScreenBounds, owner: number): number {
    const cellSize = themeGraphTokens.labelCollisionGridCellPx;
    const minX = Math.floor(bounds.left / cellSize);
    const maxX = Math.floor(bounds.right / cellSize);
    const minY = Math.floor(bounds.top / cellSize);
    const maxY = Math.floor(bounds.bottom / cellSize);
    const visited = new Set<OwnedBounds>();
    let area = 0;
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellY = minY; cellY <= maxY; cellY += 1) {
        const bucket = this.cells.get(GraphLabelBoundsIndex.hash(cellX, cellY));
        if (!bucket) continue;
        for (const existing of bucket) {
          if (existing.owner === owner || visited.has(existing)) continue;
          visited.add(existing);
          const width = Math.min(bounds.right, existing.right)
            - Math.max(bounds.left, existing.left);
          const height = Math.min(bounds.bottom, existing.bottom)
            - Math.max(bounds.top, existing.top);
          if (width > 0 && height > 0) area += width * height;
        }
      }
    }
    return area;
  }
}
