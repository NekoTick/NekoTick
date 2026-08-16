import { describe, expect, it } from 'vitest';
import { getWhiteboardAutoDrawSuggestions } from './whiteboardAutoDrawRecognition';
import type { WhiteboardPoint, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';

const stroke = (id: string, points: WhiteboardPoint[]): WhiteboardStroke => ({
  color: '#111111',
  id,
  points: points.map((point) => ({ ...point, pressure: 0.5 })),
  size: 1,
  tool: 'pen',
});

describe('whiteboard AutoDraw suggestions', () => {
  it('ranks a rectangle template first without discarding other candidates', () => {
    const rectangle = stroke('rectangle', [
      { x: 0, y: 0 }, { x: 160, y: 0 }, { x: 160, y: 100 },
      { x: 0, y: 100 }, { x: 0, y: 0 },
    ]);

    const suggestions = getWhiteboardAutoDrawSuggestions([rectangle]);

    expect(suggestions[0]).toMatchObject({ kind: 'shape', shape: 'rectangle' });
    expect(suggestions).toHaveLength(12);
    expect(suggestions.some((candidate) => candidate.kind === 'icon')).toBe(true);
  });

  it('combines multiple strokes when ranking a house sketch', () => {
    const outline = stroke('outline', [
      { x: 0, y: 55 }, { x: 50, y: 10 }, { x: 100, y: 55 },
      { x: 100, y: 110 }, { x: 0, y: 110 }, { x: 0, y: 55 },
    ]);
    const door = stroke('door', [
      { x: 38, y: 110 }, { x: 38, y: 70 }, { x: 62, y: 70 }, { x: 62, y: 110 },
    ]);

    const suggestions = getWhiteboardAutoDrawSuggestions([outline, door]);

    expect(suggestions.slice(0, 6)).toContainEqual(expect.objectContaining({ kind: 'icon', icon: 'house' }));
  });

  it('does not show suggestions for an accidental tap', () => {
    expect(getWhiteboardAutoDrawSuggestions([stroke('tap', [{ x: 2, y: 2 }])])).toEqual([]);
  });

});
