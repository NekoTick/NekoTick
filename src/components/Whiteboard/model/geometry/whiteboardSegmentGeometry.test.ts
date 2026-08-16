import { describe, expect, it } from 'vitest';
import { distanceBetweenSegments } from './whiteboardSegmentGeometry';

describe('whiteboard segment geometry', () => {
  it('returns zero for crossing segments', () => {
    expect(distanceBetweenSegments(
      { x: 0, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
      { x: 20, y: 0 },
    )).toBe(0);
  });

  it('keeps separated collinear segments apart', () => {
    expect(distanceBetweenSegments(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    )).toBe(10);
  });
});
