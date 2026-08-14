import { describe, expect, it } from 'vitest';
import {
  createWhiteboardLinearStroke,
  getWhiteboardArrowheadPath,
  getWhiteboardLinearMidpoint,
  getWhiteboardLinearRenderPath,
  getWhiteboardLinearStrokeWidth,
  insertWhiteboardLinearMidpoint,
  replaceWhiteboardLinearPoint,
  shouldCommitWhiteboardLinearStroke,
  snapWhiteboardLinearPoint,
} from './whiteboardLinear';

describe('whiteboard linear elements', () => {
  it('creates a line with two fixed-pressure endpoints', () => {
    const line = createWhiteboardLinearStroke('line-1', 'line', { x: 10, y: 20 }, { x: 90, y: 40 }, '#111111', 1);

    expect(line).toMatchObject({ id: 'line-1', tool: 'line', color: '#111111', size: 1 });
    expect(line.points).toEqual([
      { pressure: 0.5, x: 10, y: 20 },
      { pressure: 0.5, x: 90, y: 40 },
    ]);
  });

  it('locks Shift drawing to 15-degree increments', () => {
    const snapped = snapWhiteboardLinearPoint({ x: 0, y: 0 }, { x: 100, y: 20 });
    expect(Math.atan2(snapped.y, snapped.x) * 180 / Math.PI).toBeCloseTo(15);
    expect(Math.hypot(snapped.x, snapped.y)).toBeCloseTo(Math.hypot(100, 20));
  });

  it('promotes a temporary midpoint into a real path point', () => {
    const line = createWhiteboardLinearStroke('line-1', 'line', { x: 0, y: 0 }, { x: 100, y: 0 }, '#111111', 1);
    expect(getWhiteboardLinearMidpoint(line, 0)).toMatchObject({ x: 50, y: 0 });

    const inserted = insertWhiteboardLinearMidpoint(line, 0);
    const moved = replaceWhiteboardLinearPoint(inserted, 1, { x: 50, y: 40 });

    expect(moved.points.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 0 },
    ]);
    expect(getWhiteboardLinearRenderPath(moved)).toMatch(/\bC/);
    expect(getWhiteboardLinearRenderPath(moved)).not.toContain('L 50 40');
    expect(getWhiteboardLinearMidpoint(moved, 0)?.y).toBeGreaterThan(20);
    expect(getWhiteboardLinearMidpoint(moved, 1)?.y).toBeGreaterThan(20);
  });

  it('uses an open end arrowhead and ignores sub-threshold drags', () => {
    const arrow = createWhiteboardLinearStroke('arrow-1', 'arrow', { x: 0, y: 0 }, { x: 100, y: 0 }, '#111111', 1);
    expect(getWhiteboardArrowheadPath(arrow).match(/\bM/g)).toHaveLength(4);
    expect(getWhiteboardArrowheadPath(arrow)).toMatch(/\bC/);
    expect(shouldCommitWhiteboardLinearStroke(arrow, 1)).toBe(true);
    expect(shouldCommitWhiteboardLinearStroke({ ...arrow, points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 7, y: 0 }] }, 1)).toBe(false);
  });

  it('uses a heavier outline only for recognized shapes', () => {
    const line = createWhiteboardLinearStroke('line-1', 'line', { x: 0, y: 0 }, { x: 100, y: 0 }, '#111111', 1);

    expect(getWhiteboardLinearStrokeWidth(line)).toBe(2);
    expect(getWhiteboardLinearStrokeWidth({ ...line, autoShape: 'rectangle' })).toBe(5);
  });

});
