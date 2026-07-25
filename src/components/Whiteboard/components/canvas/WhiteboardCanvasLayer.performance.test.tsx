import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';

const mocks = vi.hoisted(() => ({
  selectionOverlay: vi.fn(),
  strokeLayer: vi.fn(),
}));

vi.mock('./WhiteboardStrokeLayer', () => ({
  WhiteboardDraftStrokeLayer: () => null,
  WhiteboardStrokeLayer: (props: { strokes: unknown[] }) => {
    mocks.strokeLayer(props);
    return null;
  },
}));

vi.mock('./WhiteboardSelectionOverlay', () => ({
  WhiteboardSelectionOverlay: (props: { elements: unknown[]; strokes: unknown[] }) => {
    mocks.selectionOverlay(props);
    return null;
  },
}));

import { WhiteboardCanvasLayer } from './WhiteboardCanvasLayer';

type WhiteboardCanvasLayerProps = ComponentProps<typeof WhiteboardCanvasLayer>;

const stroke = {
  color: '#111111',
  id: 'stroke-1',
  points: [{ pressure: 0.5, x: 20, y: 20 }, { pressure: 0.5, x: 80, y: 80 }],
  size: 1,
  tool: 'pen' as const,
};
const emptyStrokes = [] as typeof stroke[];

const baseProps: WhiteboardCanvasLayerProps = {
  brushCursorColor: '#111111',
  brushCursorPoint: null,
  brushCursorSize: 1,
  brushCursorTool: 'pen',
  draftStroke: null,
  elements: [],
  eraserPreview: { elementIds: [], strokeIds: [], trail: [] },
  movePreview: null,
  selectedElementIds: [],
  selectedStrokeIds: [],
  selectionPath: null,
  spacePressed: false,
  strokes: [stroke],
  tool: 'select',
  viewport: { x: 0, y: 0, zoom: 1 },
  viewportSize: { x: 500, y: 500 },
  onElementPointerDown: vi.fn(),
  onSelectionMovePointerDown: vi.fn(),
  onSelectionResizePointerDown: vi.fn(),
};

describe('WhiteboardCanvasLayer performance boundaries', () => {
  beforeEach(() => {
    mocks.selectionOverlay.mockClear();
    mocks.strokeLayer.mockClear();
  });

  it('does not rerender board content when only the brush cursor moves', () => {
    const { rerender } = render(<WhiteboardCanvasLayer {...baseProps} />);
    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);

    rerender(<WhiteboardCanvasLayer {...baseProps} brushCursorPoint={{ x: 120, y: 90 }} />);

    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);
  });

  it('does not rerender completed content while the draft stroke grows', () => {
    const draftStroke = { ...stroke, id: 'draft-stroke' };
    const { rerender } = render(<WhiteboardCanvasLayer {...baseProps} draftStroke={draftStroke} />);
    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);

    rerender(
      <WhiteboardCanvasLayer
        {...baseProps}
        draftStroke={{
          ...draftStroke,
          points: [...draftStroke.points, { pressure: 0.5, x: 120, y: 100 }],
        }}
      />,
    );

    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);
  });

  it('does not rerender completed content while only the eraser trail changes', () => {
    const { rerender } = render(<WhiteboardCanvasLayer {...baseProps} />);
    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);

    rerender(
      <WhiteboardCanvasLayer
        {...baseProps}
        eraserPreview={{
          elementIds: baseProps.eraserPreview.elementIds,
          strokeIds: baseProps.eraserPreview.strokeIds,
          trail: [{ point: { x: 40, y: 50 }, size: 1 }],
        }}
      />,
    );

    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);
  });

  it('keeps the static stroke list stable while a selection moves', () => {
    const movePreview = { dx: 4, dy: 6, elementIds: [], strokeIds: [stroke.id] };
    const selectedStrokeIds = [stroke.id];
    const { rerender } = render(
      <WhiteboardCanvasLayer
        {...baseProps}
        movePreview={movePreview}
        selectedStrokeIds={selectedStrokeIds}
      />,
    );
    const firstStaticStrokes = mocks.strokeLayer.mock.calls[0][0].strokes;
    const firstMovingStrokes = mocks.strokeLayer.mock.calls[1][0].strokes;

    rerender(
      <WhiteboardCanvasLayer
        {...baseProps}
        movePreview={{ ...movePreview, dx: 14 }}
        selectedStrokeIds={selectedStrokeIds}
      />,
    );
    const secondStaticStrokes = mocks.strokeLayer.mock.calls[2][0].strokes;
    const secondMovingStrokes = mocks.strokeLayer.mock.calls[3][0].strokes;

    expect(secondStaticStrokes).toBe(firstStaticStrokes);
    expect(secondMovingStrokes).toBe(firstMovingStrokes);
  });

  it('keeps only selected items in the moving selection overlay', () => {
    const elements = Array.from({ length: 1000 }, (_, index) => ({
      height: 40, id: `image-${index}`, text: '', type: 'image' as const, width: 40,
      x: index * 60, y: 0,
    }));
    const selectedElementIds = ['image-999'];
    const movePreview = { dx: 4, dy: 6, elementIds: selectedElementIds, strokeIds: [] };
    const { rerender } = render(
      <WhiteboardCanvasLayer
        {...baseProps}
        elements={elements}
        movePreview={movePreview}
        selectedElementIds={selectedElementIds}
        strokes={emptyStrokes}
      />,
    );
    const firstElements = mocks.selectionOverlay.mock.calls.at(-1)?.[0].elements;

    rerender(
      <WhiteboardCanvasLayer
        {...baseProps}
        elements={elements}
        movePreview={{ ...movePreview, dx: 12 }}
        selectedElementIds={selectedElementIds}
        strokes={emptyStrokes}
      />,
    );
    const secondElements = mocks.selectionOverlay.mock.calls.at(-1)?.[0].elements;

    expect(firstElements).toEqual([elements[999]]);
    expect(secondElements).toBe(firstElements);
  });
});
