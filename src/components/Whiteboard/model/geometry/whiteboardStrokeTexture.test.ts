import { describe, expect, it } from 'vitest';
import type { WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';
import { getWhiteboardStrokeDashStyle } from './whiteboardStrokeTexture';

function createStroke(id: string, size: number): WhiteboardStroke {
  return {
    color: '#333333',
    id,
    points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 20, y: 0 }],
    size,
    tool: 'pencil',
  };
}

describe('whiteboard stroke texture', () => {
  it('keeps texture deterministic while varying it between strokes', () => {
    const first = getWhiteboardStrokeDashStyle(createStroke('stroke-a', 1), '1 5', 0, 0);
    const repeated = getWhiteboardStrokeDashStyle(createStroke('stroke-a', 1), '1 5', 0, 0);
    const second = getWhiteboardStrokeDashStyle(createStroke('stroke-b', 1), '1 5', 0, 0);

    expect(repeated).toEqual(first);
    expect(second.dashOffset).not.toBe(first.dashOffset);
  });

  it('scales grain spacing moderately with brush size', () => {
    const normal = getWhiteboardStrokeDashStyle(createStroke('stroke', 1), '1 5', 0, 0);
    const large = getWhiteboardStrokeDashStyle(createStroke('stroke', 4), '1 5', 0, 0);

    expect(large.dashArray).toBe('2 10');
    expect(large.dashOffset).toBeCloseTo(normal.dashOffset * 2, 3);
  });
});
