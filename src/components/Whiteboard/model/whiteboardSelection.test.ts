import { describe, expect, it, vi } from 'vitest';
import type { WhiteboardElement, WhiteboardStroke } from './whiteboardModel';
import {
  findStrokeAtPoint,
  getElementsInLasso,
  getItemsInLasso,
  getResizedSelectionBounds,
  getStrokeBounds,
  getStrokesInLasso,
  normalizeWhiteboardSelectionRect,
  resizeSelectionElement,
  resizeSelectionStroke,
  rotateSelectionElement,
  rotateSelectionStroke,
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

  it('selects a stroke drawn on an image without selecting the image around it', () => {
    const image: WhiteboardElement = { height: 300, id: 'image', text: '', type: 'image', width: 300, x: 0, y: 0 };
    const stroke: WhiteboardStroke = {
      color: '#111111', id: 'stroke',
      points: [{ pressure: 0.5, x: 130, y: 150 }, { pressure: 0.5, x: 170, y: 150 }],
      size: 1,
      tool: 'pen',
    };
    const strokeLasso = [
      { x: 110, y: 130 }, { x: 190, y: 130 }, { x: 190, y: 170 }, { x: 110, y: 170 },
    ];

    expect(getItemsInLasso([image], [stroke], strokeLasso)).toEqual({
      elementIds: [],
      strokeIds: ['stroke'],
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

  it('selects the visible arrowhead as part of the arrow', () => {
    const arrow: WhiteboardStroke = {
      color: '#111111', id: 'arrow',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 }],
      size: 1, tool: 'arrow',
    };

    expect(findStrokeAtPoint([arrow], { x: 77, y: 8 }, 1)?.id).toBe(arrow.id);
    expect(getStrokeBounds(arrow)?.height).toBeGreaterThan(16);
  });

  it('selects the visible edge of a wide chisel stroke', () => {
    const stroke: WhiteboardStroke = {
      color: '#ffaa00',
      id: 'wide-marker',
      points: [{ pressure: 1, x: 20, y: 60 }, { pressure: 1, x: 100, y: 60 }],
      size: 4,
      tool: 'marker',
    };
    const edgeLasso = [
      { x: 40, y: 96 }, { x: 80, y: 96 }, { x: 80, y: 108 }, { x: 40, y: 108 },
    ];

    expect(findStrokeAtPoint([stroke], { x: 60, y: 96 }, 1)?.id).toBe(stroke.id);
    expect(getStrokesInLasso([stroke], edgeLasso)).toEqual([stroke.id]);
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

describe('whiteboard selection resize', () => {
  it.each([
    ['n', { x: 60, y: 110 }, { height: -10, width: 100, x: 10, y: 110 }],
    ['e', { x: -30, y: 60 }, { height: 80, width: -40, x: 10, y: 20 }],
    ['s', { x: 60, y: -30 }, { height: -50, width: 100, x: 10, y: 20 }],
    ['w', { x: 150, y: 60 }, { height: 80, width: -40, x: 150, y: 20 }],
  ] as const)('lets the %s edge cross its opposite edge', (handle, point, expected) => {
    const resized = getResizedSelectionBounds(
      { height: 80, width: 100, x: 10, y: 20 },
      handle === 'n' ? { x: 60, y: 20 } : handle === 's' ? { x: 60, y: 100 } : handle === 'e' ? { x: 110, y: 60 } : { x: 10, y: 60 },
      point,
      handle,
      false,
    );

    expect(resized).toEqual(expected);
  });

  it('normalizes a crossed edge for rendering', () => {
    expect(normalizeWhiteboardSelectionRect({ height: -50, width: 100, x: 10, y: 20 }))
      .toEqual({ height: 50, width: 100, x: 10, y: -30 });
  });

  it('mirrors stroke points when an edge crosses its opposite edge', () => {
    const stroke: WhiteboardStroke = {
      color: '#111111', id: 'stroke',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 100 }],
      size: 1, tool: 'line',
    };

    expect(resizeSelectionStroke(
      stroke,
      { height: 100, width: 100, x: 0, y: 0 },
      { height: -50, width: 100, x: 0, y: 0 },
    ).points).toEqual([
      { pressure: 0.5, x: 0, y: 0 },
      { pressure: 0.5, x: 100, y: -50 },
    ]);
  });

  it('toggles image orientation when crossing an edge', () => {
    const element: WhiteboardElement = {
      height: 100, id: 'image', text: '', type: 'image', width: 100, x: 0, y: 0,
    };
    const flipped = resizeSelectionElement(
      element,
      { height: 100, width: 100, x: 0, y: 0 },
      { height: -50, width: 100, x: 0, y: 0 },
    );

    expect(flipped).toMatchObject({ flipY: true, height: 50, width: 100, x: 0, y: -50 });
    expect(resizeSelectionElement(
      flipped,
      { height: 50, width: 100, x: 0, y: -50 },
      { height: -100, width: 100, x: 0, y: -50 },
    )).not.toHaveProperty('flipY');
  });

  it('scales text bounds and font size by the same ratio', () => {
    const text: WhiteboardElement = {
      color: '#111111', fontSize: 24, height: 30, id: 'text', lineHeight: 1.25,
      text: 'Hello', type: 'text', width: 80, x: 10, y: 20,
    };

    expect(resizeSelectionElement(
      text,
      { height: 30, width: 80, x: 10, y: 20 },
      { height: 60, width: 160, x: 10, y: 20 },
    )).toMatchObject({ fontSize: 48, height: 60, width: 160, x: 10, y: 20 });
  });
});

describe('whiteboard selection rotation', () => {
  it('rotates image centers and stroke points around one shared center', () => {
    const element: WhiteboardElement = {
      height: 20, id: 'image', text: '', type: 'image', width: 40, x: 80, y: 40,
    };
    const stroke: WhiteboardStroke = {
      color: '#111111', id: 'stroke', points: [{ pressure: 0.5, x: 50, y: 0 }], size: 1, tool: 'pen',
    };
    const center = { x: 50, y: 50 };

    expect(rotateSelectionElement(element, center, Math.PI / 2)).toMatchObject({
      rotation: Math.PI / 2,
      x: 30,
      y: 90,
    });
    expect(rotateSelectionStroke(stroke, center, Math.PI / 2).points[0]).toMatchObject({ x: 100, y: 50 });
  });
});
