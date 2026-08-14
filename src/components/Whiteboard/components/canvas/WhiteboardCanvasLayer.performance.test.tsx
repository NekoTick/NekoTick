import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { createWhiteboardEraserSpatialIndex } from '../../model/whiteboardEraser';
import type { WhiteboardElement, WhiteboardStroke } from '../../model/whiteboardModel';
import { WhiteboardRenderData, type WhiteboardSelectionRenderData } from '../../model/whiteboardRenderData';

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
  WhiteboardSelectionOverlay: (props: { renderData: WhiteboardSelectionRenderData }) => {
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

function createRenderData(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  options: {
    selectedElementIds?: string[];
    selectedStrokeIds?: string[];
    spatialIndex?: ReturnType<typeof createWhiteboardEraserSpatialIndex>;
  } = {},
) {
  return new WhiteboardRenderData(
    elements,
    options.spatialIndex ?? createWhiteboardEraserSpatialIndex(elements, strokes),
    strokes,
    null,
    options.selectedElementIds,
    options.selectedStrokeIds,
  );
}

const baseProps: WhiteboardCanvasLayerProps = {
  brushCursorColor: '#111111',
  brushCursorPoint: null,
  brushCursorSize: 1,
  brushCursorTool: 'pen',
  draftStroke: null,
  eraserPreview: { elementIds: [], strokeIds: [], trail: [] },
  movePreview: null,
  renderData: createRenderData([], [stroke]),
  selectionPath: null,
  spacePressed: false,
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

  it('separates completed and live content into compositor layers', () => {
    const { container } = render(<WhiteboardCanvasLayer {...baseProps} />);

    const contentLayer = container.querySelector('[data-whiteboard-layer="content"]');
    const appendedLayer = container.querySelector('[data-whiteboard-layer="appended"]');
    const interactionLayer = container.querySelector('[data-whiteboard-layer="interaction"]');
    expect(contentLayer).toHaveStyle({ willChange: 'transform' });
    expect(interactionLayer).toHaveStyle({ willChange: 'transform' });
    expect(appendedLayer).not.toHaveStyle({ willChange: 'transform' });
    expect(contentLayer?.parentElement).toBe(interactionLayer?.parentElement);
    expect(appendedLayer?.parentElement).toBe(interactionLayer);
    expect(appendedLayer).toHaveClass('pointer-events-none');
    expect(interactionLayer).toHaveClass('pointer-events-none');
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

  it('does not inspect completed strokes again when the stroke array is unchanged', () => {
    let failOnItemAccess = false;
    const strokes = new Proxy([stroke], {
      get(target, property, receiver) {
        if (failOnItemAccess && property === '0') throw new Error('completed strokes were inspected again');
        return Reflect.get(target, property, receiver);
      },
    });
    const spatialIndex = createWhiteboardEraserSpatialIndex([], strokes);
    const renderData = createRenderData([], strokes, { spatialIndex });
    const initial = render(<WhiteboardCanvasLayer {...baseProps} renderData={renderData} tool="pen" />);
    failOnItemAccess = true;

    initial.rerender(
      <WhiteboardCanvasLayer
        {...baseProps}
        draftStroke={{ ...stroke, id: 'draft-stroke' }}
        renderData={renderData}
        tool="pen"
      />,
    );

    initial.rerender(
      <WhiteboardCanvasLayer
        {...baseProps}
        draftStroke={{ ...stroke, id: 'draft-stroke', points: [...stroke.points, stroke.points[1]] }}
        renderData={renderData}
        tool="pen"
      />,
    );
  });

  it('keeps an offscreen appended stroke out of the live session layer', () => {
    const elements: WhiteboardElement[] = [];
    const initialStrokes = [stroke];
    const appendedStroke = {
      ...stroke,
      id: 'stroke-offscreen',
      points: stroke.points.map((point) => ({ ...point, x: point.x + 10_000 })),
    };
    const { rerender } = render(
      <WhiteboardCanvasLayer
        {...baseProps}
        renderData={createRenderData(elements, initialStrokes)}
        tool="pen"
      />,
    );
    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);

    const completedStrokes = [...initialStrokes, appendedStroke];
    rerender(
      <WhiteboardCanvasLayer
        {...baseProps}
        renderData={createRenderData(elements, completedStrokes)}
        tool="pen"
      />,
    );

    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);
  });

  it('renders only resized preview items while document arrays stay unchanged', () => {
    const bounds = { height: 100, width: 100, x: 0, y: 0 };
    const nextBounds = { height: 150, width: 200, x: 10, y: 20 };

    render(
      <WhiteboardCanvasLayer
        {...baseProps}
        renderData={createRenderData([], [stroke], { selectedStrokeIds: [stroke.id] })}
        resizePreview={{
          nextBounds,
          originalElementsById: new Map(),
          originalStrokesById: new Map([[stroke.id, stroke]]),
          startBounds: bounds,
        }}
      />,
    );

    expect(mocks.strokeLayer.mock.calls[0][0].strokes).toEqual([]);
    expect(mocks.strokeLayer.mock.calls[1][0].strokes[0]).not.toBe(stroke);
    expect(mocks.selectionOverlay.mock.calls.at(-1)?.[0].resizePreview).toMatchObject({ nextBounds });
  });

  it('reuses source geometry with a layer transform for large resize previews', () => {
    const strokes = Array.from({ length: 1001 }, (_, index) => ({
      ...stroke,
      id: `stroke-${index}`,
    }));
    const startBounds = { height: 100, width: 100, x: 0, y: 0 };
    const nextBounds = { height: 150, width: 200, x: 10, y: 20 };

    render(
      <WhiteboardCanvasLayer
        {...baseProps}
        renderData={createRenderData([], strokes, {
          selectedStrokeIds: strokes.map((item) => item.id),
        })}
        resizePreview={{
          nextBounds,
          originalElementsById: new Map(),
          originalStrokesById: new Map(strokes.map((item) => [item.id, item])),
          startBounds,
        }}
      />,
    );

    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);
    expect(mocks.strokeLayer.mock.calls[0][0]).toMatchObject({
      cssTransform: 'translate(10px, 20px) scale(2, 1.5) translate(0px, 0px)',
      strokes,
    });
  });

  it('reuses source geometry while a large resize crosses an edge', () => {
    const strokes = Array.from({ length: 1001 }, (_, index) => ({
      ...stroke,
      id: `flipped-stroke-${index}`,
    }));

    render(
      <WhiteboardCanvasLayer
        {...baseProps}
        renderData={createRenderData([], strokes, {
          selectedStrokeIds: strokes.map((item) => item.id),
        })}
        resizePreview={{
          nextBounds: { height: -50, width: 200, x: 10, y: 20 },
          originalElementsById: new Map(),
          originalStrokesById: new Map(strokes.map((item) => [item.id, item])),
          startBounds: { height: 100, width: 100, x: 0, y: 0 },
        }}
      />,
    );

    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);
    expect(mocks.strokeLayer.mock.calls[0][0]).toMatchObject({
      cssTransform: 'translate(10px, 20px) scale(2, -0.5) translate(0px, 0px)',
      strokes,
    });
  });

  it('keeps loaded content stable while drawing and merges it when leaving the brush', () => {
    const elements: WhiteboardElement[] = [];
    const initialStrokes = [stroke];
    const { rerender } = render(<WhiteboardCanvasLayer {...baseProps} renderData={createRenderData(elements, initialStrokes)} tool="pen" />);
    const baseLayerStrokes = mocks.strokeLayer.mock.calls[0][0].strokes;
    const appendedStroke = { ...stroke, id: 'stroke-2' };
    const completedStrokes = [...initialStrokes, appendedStroke];

    rerender(<WhiteboardCanvasLayer {...baseProps} renderData={createRenderData(elements, completedStrokes)} tool="pen" />);

    expect(mocks.strokeLayer).toHaveBeenCalledTimes(2);
    expect(mocks.strokeLayer.mock.calls[0][0].strokes).toBe(baseLayerStrokes);
    expect(mocks.strokeLayer.mock.calls[1][0].strokes).toEqual([appendedStroke]);

    rerender(<WhiteboardCanvasLayer {...baseProps} renderData={createRenderData(elements, completedStrokes)} tool="select" />);

    expect(mocks.strokeLayer.mock.calls.at(-1)?.[0].strokes).toEqual(completedStrokes);
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

  it('does not rerender completed content during a pan inside the culling overscan', () => {
    const { rerender } = render(<WhiteboardCanvasLayer {...baseProps} />);
    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);

    rerender(<WhiteboardCanvasLayer {...baseProps} viewport={{ x: -100, y: 0, zoom: 1 }} />);

    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);
  });

  it('refreshes completed content after a pan crosses the culling overscan', () => {
    const { rerender } = render(<WhiteboardCanvasLayer {...baseProps} />);
    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);

    rerender(<WhiteboardCanvasLayer {...baseProps} viewport={{ x: -400, y: 0, zoom: 1 }} />);

    expect(mocks.strokeLayer).toHaveBeenCalledTimes(2);
  });

  it('refreshes completed content only after zoom crosses the culling ratio', () => {
    const { rerender } = render(<WhiteboardCanvasLayer {...baseProps} />);
    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);

    rerender(<WhiteboardCanvasLayer {...baseProps} viewport={{ x: 0, y: 0, zoom: 1.2 }} />);
    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);

    rerender(<WhiteboardCanvasLayer {...baseProps} viewport={{ x: 0, y: 0, zoom: 1.3 }} />);
    expect(mocks.strokeLayer).toHaveBeenCalledTimes(2);
  });

  it('keeps the static stroke list stable while a selection moves', () => {
    const staticStroke = { ...stroke, id: 'stroke-static' };
    const strokes = [stroke, staticStroke];
    const movePreview = { dx: 4, dy: 6, elementIds: [], strokeIds: [stroke.id] };
    const selectedStrokeIds = [stroke.id];
    const renderData = createRenderData([], strokes, { selectedStrokeIds });
    const { rerender } = render(
      <WhiteboardCanvasLayer
        {...baseProps}
        movePreview={movePreview}
        renderData={renderData}
      />,
    );
    const firstStaticStrokes = mocks.strokeLayer.mock.calls[0][0].strokes;
    const firstMovingStrokes = mocks.strokeLayer.mock.calls[1][0].strokes;

    rerender(
      <WhiteboardCanvasLayer
        {...baseProps}
        movePreview={{ ...movePreview, dx: 14 }}
        renderData={renderData}
      />,
    );
    const secondStaticStrokes = mocks.strokeLayer.mock.calls[2][0].strokes;
    const secondMovingStrokes = mocks.strokeLayer.mock.calls[3][0].strokes;

    expect(secondStaticStrokes).toBe(firstStaticStrokes);
    expect(secondMovingStrokes).toBe(firstMovingStrokes);
  });

  it('keeps a fully moving visible stroke set in the primary layer', () => {
    const movePreview = { dx: 4, dy: 6, elementIds: [], strokeIds: [stroke.id] };
    const { rerender } = render(
      <WhiteboardCanvasLayer
        {...baseProps}
        movePreview={movePreview}
        renderData={createRenderData([], [stroke], { selectedStrokeIds: [stroke.id] })}
      />,
    );

    expect(mocks.strokeLayer).toHaveBeenCalledTimes(1);
    expect(mocks.strokeLayer.mock.calls[0][0]).toMatchObject({
      cssTransform: 'translate(4px, 6px)',
      strokes: [stroke],
    });

    const translated = { ...stroke, points: stroke.points.map((point) => ({ ...point, x: point.x + 4, y: point.y + 6 })) };
    rerender(
      <WhiteboardCanvasLayer
        {...baseProps}
        movePreview={null}
        renderData={createRenderData([], [translated], { selectedStrokeIds: [stroke.id] })}
      />,
    );

    expect(mocks.strokeLayer).toHaveBeenCalledTimes(2);
    expect(mocks.strokeLayer.mock.calls[1][0]).toMatchObject({
      cssTransform: 'translate(4px, 6px)',
      strokes: [stroke],
    });
  });

  it('keeps only selected items in the moving selection overlay', () => {
    const elements = Array.from({ length: 1000 }, (_, index) => ({
      height: 40, id: `image-${index}`, text: '', type: 'image' as const, width: 40,
      x: index * 60, y: 0,
    }));
    const selectedElementIds = ['image-999'];
    const movePreview = { dx: 4, dy: 6, elementIds: selectedElementIds, strokeIds: [] };
    const renderData = createRenderData(elements, emptyStrokes, { selectedElementIds });
    const { rerender } = render(
      <WhiteboardCanvasLayer
        {...baseProps}
        movePreview={movePreview}
        renderData={renderData}
      />,
    );
    const firstElements = mocks.selectionOverlay.mock.calls.at(-1)?.[0].renderData.elements;

    rerender(
      <WhiteboardCanvasLayer
        {...baseProps}
        movePreview={{ ...movePreview, dx: 12 }}
        renderData={renderData}
      />,
    );
    const secondElements = mocks.selectionOverlay.mock.calls.at(-1)?.[0].renderData.elements;

    expect(firstElements).toEqual([elements[999]]);
    expect(secondElements).toBe(firstElements);
  });

  it('keeps offscreen selected strokes out of the rendered content', () => {
    const strokes = Array.from({ length: 1000 }, (_, index) => ({
      ...stroke,
      id: `stroke-${index}`,
      points: stroke.points.map((point) => ({ ...point, x: point.x + index * 1000 })),
    }));
    const spatialIndex = createWhiteboardEraserSpatialIndex([], strokes);

    render(
      <WhiteboardCanvasLayer
        {...baseProps}
        renderData={createRenderData([], strokes, {
          selectedStrokeIds: strokes.map((item) => item.id),
          spatialIndex,
        })}
      />,
    );

    expect(mocks.strokeLayer.mock.calls[0][0].strokes).toEqual([strokes[0]]);
    expect(mocks.selectionOverlay.mock.calls.at(-1)?.[0].renderData.strokes).toEqual(strokes);
  });

  it('does not inspect selected stroke ids outside the select tool', () => {
    const selectedStrokeIds = new Proxy([stroke.id], {
      get(target, property, receiver) {
        if (property === Symbol.iterator || property === '0') {
          throw new Error('selected stroke ids were inspected');
        }
        return Reflect.get(target, property, receiver);
      },
    });

    render(
      <WhiteboardCanvasLayer
        {...baseProps}
        renderData={createRenderData([], [stroke], { selectedStrokeIds })}
        tool="eraser"
      />,
    );

    expect(mocks.selectionOverlay).not.toHaveBeenCalled();
  });
});
