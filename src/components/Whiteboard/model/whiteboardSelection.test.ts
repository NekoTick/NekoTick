import { describe, expect, it, vi } from 'vitest';
import type { WhiteboardElement, WhiteboardStroke } from './whiteboardModel';
import {
  findStrokeAtPoint,
  getElementsInLasso,
  getItemsInLasso,
  getStrokeBounds,
  getStrokesInLasso,
  translateStroke,
} from './whiteboardSelection';

const lasso = [
  { x: 0, y: 0 },
  { x: 120, y: 0 },
  { x: 120, y: 120 },
  { x: 0, y: 120 },
];

describe('whiteboard lasso selection', () => {
  it('selects elements inside the lasso path', () => {
    const elements: WhiteboardElement[] = [
      { height: 40, id: 'inside', text: '', type: 'image', width: 40, x: 40, y: 40 },
      { height: 40, id: 'outside', text: '', type: 'image', width: 40, x: 180, y: 40 },
    ];

    expect(getElementsInLasso(elements, lasso)).toEqual(['inside']);
  });

  it('selects strokes crossing the lasso path', () => {
    const strokes: WhiteboardStroke[] = [
      {
        color: '#111111',
        id: 'crossing',
        points: [
          { pressure: 0.5, x: -20, y: 60 },
          { pressure: 0.5, x: 60, y: 60 },
        ],
        size: 1,
        tool: 'pen',
      },
      {
        color: '#111111',
        id: 'outside',
        points: [
          { pressure: 0.5, x: 160, y: 60 },
          { pressure: 0.5, x: 220, y: 60 },
        ],
        size: 1,
        tool: 'pen',
      },
    ];

    expect(getStrokesInLasso(strokes, lasso)).toEqual(['crossing']);
  });

  it('selects elements and strokes with one lasso pass', () => {
    const elements: WhiteboardElement[] = [
      { height: 40, id: 'inside', text: '', type: 'image', width: 40, x: 40, y: 40 },
      { height: 40, id: 'outside', text: '', type: 'image', width: 40, x: 180, y: 40 },
    ];
    const strokes: WhiteboardStroke[] = [
      {
        color: '#111111',
        id: 'crossing',
        points: [
          { pressure: 0.5, x: -20, y: 60 },
          { pressure: 0.5, x: 60, y: 60 },
        ],
        size: 1,
        tool: 'pen',
      },
      {
        color: '#111111',
        id: 'outside-stroke',
        points: [
          { pressure: 0.5, x: 160, y: 60 },
          { pressure: 0.5, x: 220, y: 60 },
        ],
        size: 1,
        tool: 'pen',
      },
    ];

    expect(getItemsInLasso(elements, strokes, lasso)).toEqual({
      elementIds: ['inside'],
      strokeIds: ['crossing'],
    });
  });

  it('finds the topmost stroke at a point after skipping distant stroke bounds', () => {
    const strokes: WhiteboardStroke[] = [
      {
        color: '#111111',
        id: 'far',
        points: [
          { pressure: 0.5, x: 200, y: 200 },
          { pressure: 0.5, x: 260, y: 200 },
        ],
        size: 1,
        tool: 'pen',
      },
      {
        color: '#111111',
        id: 'hit',
        points: [
          { pressure: 0.5, x: 0, y: 10 },
          { pressure: 0.5, x: 80, y: 10 },
        ],
        size: 1,
        tool: 'pen',
      },
    ];

    expect(findStrokeAtPoint(strokes, { x: 40, y: 10 }, 1)?.id).toBe('hit');
  });

  it('reuses translated stroke bounds without rescanning points', () => {
    const stroke: WhiteboardStroke = {
      color: '#111111',
      id: 'translated',
      points: [
        { pressure: 0.5, x: 10, y: 20 },
        { breakBefore: true, pressure: 0.5, x: 30, y: 40 },
      ],
      size: 1,
      tool: 'pen',
    };
    const originalBounds = getStrokeBounds(stroke);
    const translated = translateStroke(stroke, 12, 8);
    const iteratePoints = vi.fn(Array.prototype[Symbol.iterator].bind(translated.points));
    Object.defineProperty(translated.points, Symbol.iterator, { value: iteratePoints });

    expect(getStrokeBounds(translated)).toEqual(originalBounds && {
      ...originalBounds,
      x: originalBounds.x + 12,
      y: originalBounds.y + 8,
    });
    expect(translated.points[1]).toMatchObject({ breakBefore: true, x: 42, y: 48 });
    expect(iteratePoints).not.toHaveBeenCalled();
  });
});
