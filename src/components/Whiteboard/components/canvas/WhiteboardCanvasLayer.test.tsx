import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { appendWhiteboardItems } from '../../model/whiteboardCollection';
import { createWhiteboardEraserSpatialIndex, EMPTY_WHITEBOARD_ERASER_PREVIEW } from '../../model/whiteboardEraser';
import type { WhiteboardElement, WhiteboardStroke } from '../../model/whiteboardModel';
import { WhiteboardRenderData } from '../../model/whiteboardRenderData';
import { WhiteboardCanvasLayer } from './WhiteboardCanvasLayer';

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

describe('WhiteboardCanvasLayer', () => {
  it('shows two endpoints and one insertable midpoint for a selected line', () => {
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent" brushCursorPoint={null} brushCursorSize={1} brushCursorTool={null}
        draftStroke={null} eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW} movePreview={null}
        renderData={createRenderData([], [{
          color: '#111111', id: 'line-1',
          points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 }],
          size: 1, tool: 'line',
        }], { selectedStrokeIds: ['line-1'] })}
        selectionPath={null} spacePressed={false} tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }} viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()} onLinearPointPointerDown={vi.fn()}
        onSelectionMovePointerDown={vi.fn()} onSelectionResizePointerDown={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('[data-whiteboard-linear-handle="point"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-whiteboard-linear-handle="midpoint"]')).toHaveLength(1);
    expect(container.querySelector('[data-whiteboard-linear-handle="midpoint"]'))
      .toHaveAttribute('fill', 'var(--vlaina-color-whiteboard-selected)');
    expect(container.querySelector('[data-whiteboard-selection-move-target]')).not.toBeNull();
    expect(container.querySelector('[data-whiteboard-selection-rotation-handle]')).toHaveClass('hover:fill-[var(--vlaina-color-whiteboard-selected)]');
  });
  it('shows the Excalidraw transform box and point handles for a multi-point arrow', () => {
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent" brushCursorPoint={null} brushCursorSize={1} brushCursorTool={null}
        draftStroke={null} eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW} movePreview={null}
        renderData={createRenderData([], [{
          color: '#111111', id: 'arrow-1',
          points: [
            { pressure: 0.5, x: 0, y: 0 },
            { pressure: 0.5, x: 50, y: 40 },
            { pressure: 0.5, x: 100, y: 0 },
          ],
          size: 1, tool: 'arrow',
        }], { selectedStrokeIds: ['arrow-1'] })}
        selectionPath={null} spacePressed={false} tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }} viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()} onLinearPointPointerDown={vi.fn()}
        onSelectionRotationPointerDown={vi.fn()}
        onSelectionMovePointerDown={vi.fn()} onSelectionResizePointerDown={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('[data-whiteboard-linear-handle="point"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-whiteboard-linear-handle="midpoint"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-whiteboard-selection-resize-handle]')).toHaveLength(8);
    expect(container.querySelector('[data-whiteboard-selection-rotation-handle]')).not.toBeNull();
    expect(container.querySelector('[data-whiteboard-selection-move-target]')).not.toBeNull();
    expect(container.querySelector('rect[stroke="var(--vlaina-color-whiteboard-selected)"][stroke-dasharray="6 5"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-whiteboard-linear-handle="point"][stroke="var(--vlaina-color-whiteboard-linear-handle-stroke)"]')).toHaveLength(3);
  });
  it('shows a shared rotation handle for a selected image', () => {
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent" brushCursorPoint={null} brushCursorSize={1} brushCursorTool={null}
        draftStroke={null} eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW} movePreview={null}
        renderData={createRenderData([{
          height: 80, id: 'image-1', text: 'demo.png', type: 'image', width: 100, x: 20, y: 30,
        }], [], { selectedElementIds: ['image-1'] })}
        selectionPath={null} spacePressed={false} tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }} viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()} onSelectionMovePointerDown={vi.fn()}
        onSelectionResizePointerDown={vi.fn()} onSelectionRotationPointerDown={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-whiteboard-selection-rotation-handle]')).not.toBeNull();
    expect(container.querySelector('rect[stroke-dasharray="6 5"]')).not.toBeNull();
  });
  it('shows only proportional resize handles for a selected text element', () => {
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent" brushCursorPoint={null} brushCursorSize={1} brushCursorTool={null}
        draftStroke={null} eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW} movePreview={null}
        renderData={createRenderData([{
          color: '#111111', fontSize: 24, height: 30, id: 'text-1', lineHeight: 1.25,
          text: 'Hello', type: 'text', width: 80, x: 20, y: 30,
        }], [], { selectedElementIds: ['text-1'] })}
        selectionPath={null} spacePressed={false} tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }} viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()} onSelectionMovePointerDown={vi.fn()}
        onSelectionResizePointerDown={vi.fn()} onSelectionRotationPointerDown={vi.fn()}
      />,
    );

    const handles = Array.from(container.querySelectorAll('[data-whiteboard-selection-resize-handle]'));
    expect(handles).toHaveLength(4);
    expect(handles.map((handle) => handle.getAttribute('data-whiteboard-selection-resize-handle')))
      .toEqual(['nw', 'ne', 'se', 'sw']);
  });
  it('keeps a mixed text selection proportional', () => {
    const elements: WhiteboardElement[] = [
      {
        color: '#111111', fontSize: 24, height: 30, id: 'text-1', lineHeight: 1.25,
        text: 'Hello', type: 'text', width: 80, x: 20, y: 30,
      },
      { height: 80, id: 'image-1', text: 'demo.png', type: 'image', width: 100, x: 140, y: 30 },
    ];
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent" brushCursorPoint={null} brushCursorSize={1} brushCursorTool={null}
        draftStroke={null} eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW} movePreview={null}
        renderData={createRenderData(elements, [], { selectedElementIds: elements.map(({ id }) => id) })}
        selectionPath={null} spacePressed={false} tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }} viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()} onSelectionMovePointerDown={vi.fn()}
        onSelectionResizePointerDown={vi.fn()} onSelectionRotationPointerDown={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('[data-whiteboard-selection-resize-handle]')).toHaveLength(4);
  });
  it('uses the shared transform box without linear point handles for auto shapes', () => {
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent" brushCursorPoint={null} brushCursorSize={1} brushCursorTool={null}
        draftStroke={null} eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW} movePreview={null}
        renderData={createRenderData([], [{
          autoShape: 'rectangle', color: '#111111', id: 'shape',
          points: [
            { pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 0 },
            { pressure: 0.5, x: 100, y: 80 }, { pressure: 0.5, x: 0, y: 80 }, { pressure: 0.5, x: 0, y: 0 },
          ],
          size: 1, tool: 'line',
        }], { selectedStrokeIds: ['shape'] })}
        selectionPath={null} spacePressed={false} tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }} viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()} onLinearPointPointerDown={vi.fn()}
        onSelectionMovePointerDown={vi.fn()} onSelectionResizePointerDown={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('[data-whiteboard-linear-handle]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-whiteboard-selection-resize-handle]')).toHaveLength(8);
    expect(container.querySelector('[data-whiteboard-selection-rotation-handle]')).not.toBeNull();
  });
  it('keeps a newly committed stroke in the interaction compositor layer', () => {
    const initialStroke = {
      color: '#111111', id: 'stroke-1',
      points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 20, y: 20 }],
      size: 1, tool: 'pen' as const,
    };
    const elements: WhiteboardElement[] = [];
    const initialStrokes = [initialStroke];
    const props = {
      brushCursorColor: '#111111',
      brushCursorPoint: null,
      brushCursorSize: 1,
      brushCursorTool: 'pen' as const,
      draftStroke: null,
      eraserPreview: EMPTY_WHITEBOARD_ERASER_PREVIEW,
      movePreview: null,
      selectionPath: null,
      spacePressed: false,
      tool: 'pen' as const,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportSize: { x: 500, y: 500 },
      onElementPointerDown: vi.fn(),
      onSelectionMovePointerDown: vi.fn(),
      onSelectionResizePointerDown: vi.fn(),
    };
    const { container, rerender } = render(
      <WhiteboardCanvasLayer {...props} renderData={createRenderData(elements, initialStrokes)} />,
    );
    const appendedStroke = { ...initialStroke, id: 'stroke-2' };

    rerender(
      <WhiteboardCanvasLayer
        {...props}
        renderData={createRenderData(elements, appendWhiteboardItems(initialStrokes, [appendedStroke]))}
      />,
    );

    const interactionLayer = container.querySelector('[data-whiteboard-layer="interaction"]');
    const committedStroke = container.querySelector('[data-whiteboard-stroke="stroke-2"]');
    expect(committedStroke?.closest('[data-whiteboard-layer="interaction"]')).toBe(interactionLayer);
  });

  it('renders images below completed strokes', () => {
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent"
        brushCursorPoint={null}
        brushCursorSize={1}
        brushCursorTool={null}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={null}
        renderData={createRenderData([{
          height: 80,
          id: 'image-1',
          imageSrc: 'data:image/png;base64,demo',
          text: 'demo.png',
          type: 'image',
          width: 100,
          x: 0,
          y: 0,
        }], [{
          color: '#111111',
          id: 'stroke-1',
          points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 20, y: 20 }],
          size: 1,
          tool: 'pen',
        }])}
        selectionPath={null}
        spacePressed={false}
        tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }}
        viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()}
        onSelectionMovePointerDown={vi.fn()}
        onSelectionResizePointerDown={vi.fn()}
      />,
    );
    const image = container.querySelector('[data-whiteboard-element="true"]');
    const strokeLayer = container.querySelector('[data-whiteboard-stroke="stroke-1"]')?.closest('svg');

    expect(image).not.toBeNull();
    expect(strokeLayer).not.toBeNull();
    expect(image!.compareDocumentPosition(strokeLayer!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('hides selection handles while a drawing tool is active', () => {
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="#111111"
        brushCursorPoint={null}
        brushCursorSize={1}
        brushCursorTool="pen"
        draftStroke={null}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={null}
        renderData={createRenderData(
          [{ height: 80, id: 'image-1', text: 'demo.png', type: 'image', width: 100, x: 0, y: 0 }],
          [],
          { selectedElementIds: ['image-1'] },
        )}
        selectionPath={null}
        spacePressed={false}
        tool="pen"
        viewport={{ x: 0, y: 0, zoom: 1 }}
        viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()}
        onSelectionMovePointerDown={vi.fn()}
        onSelectionResizePointerDown={vi.fn()}
      />,
    );

    expect(container.querySelector('rect.pointer-events-auto')).toBeNull();
    expect(container.querySelector('[data-whiteboard-element="true"]')).toHaveClass('pointer-events-none');
  });

  it('shows a grab cursor only along a selected stroke', () => {
    const onSelectionMovePointerDown = vi.fn();
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent"
        brushCursorPoint={null}
        brushCursorSize={1}
        brushCursorTool={null}
        draftStroke={null}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={null}
        renderData={createRenderData(
          [],
          [{
            color: '#111111', id: 'stroke-1',
            points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 20, y: 20 }],
            size: 1, tool: 'pen',
          }],
          { selectedStrokeIds: ['stroke-1'] },
        )}
        selectionPath={null}
        spacePressed={false}
        tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }}
        viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()}
        onSelectionMovePointerDown={onSelectionMovePointerDown}
        onSelectionResizePointerDown={vi.fn()}
      />,
    );

    const dragTarget = container.querySelector('[data-whiteboard-selection-drag-target="stroke-1"]');
    expect(dragTarget).toHaveStyle({ cursor: 'grab' });
    dragTarget?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(onSelectionMovePointerDown).toHaveBeenCalledOnce();
  });

  it('keeps selected images draggable when a lasso selects multiple items', () => {
    const onSelectionMovePointerDown = vi.fn();
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent"
        brushCursorPoint={null}
        brushCursorSize={1}
        brushCursorTool={null}
        draftStroke={null}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={null}
        renderData={createRenderData(
          [{ height: 80, id: 'image-1', text: 'one.png', type: 'image', width: 100, x: 0, y: 0 }],
          [{
            color: '#111111', id: 'stroke-1',
            points: [{ pressure: 0.5, x: 120, y: 0 }, { pressure: 0.5, x: 140, y: 20 }],
            size: 1, tool: 'pen',
          }],
          { selectedElementIds: ['image-1'], selectedStrokeIds: ['stroke-1'] },
        )}
        selectionPath={null}
        spacePressed={false}
        tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }}
        viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()}
        onSelectionMovePointerDown={onSelectionMovePointerDown}
        onSelectionResizePointerDown={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-whiteboard-element="true"]')).toHaveClass('cursor-grab');
    const moveTarget = container.querySelector('[data-whiteboard-selection-move-target="true"]');
    expect(moveTarget).toHaveStyle({ cursor: 'grab' });
    moveTarget?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(onSelectionMovePointerDown).toHaveBeenCalledOnce();
  });

  it('uses only the group target when multiple strokes are selected', () => {
    const strokes = [0, 40].map((x, index) => ({
      color: '#111111', id: `stroke-${index + 1}`,
      points: [{ pressure: 0.5, x, y: 0 }, { pressure: 0.5, x: x + 20, y: 20 }],
      size: 1, tool: 'pen' as const,
    }));
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent"
        brushCursorPoint={null}
        brushCursorSize={1}
        brushCursorTool={null}
        draftStroke={null}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={null}
        renderData={createRenderData([], strokes, { selectedStrokeIds: strokes.map((stroke) => stroke.id) })}
        selectionPath={null}
        spacePressed={false}
        tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }}
        viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()}
        onSelectionMovePointerDown={vi.fn()}
        onSelectionResizePointerDown={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-whiteboard-selection-move-target="true"]')).not.toBeNull();
    expect(container.querySelector('[data-whiteboard-selection-drag-target]')).toBeNull();
  });

  it('shows a grabbing cursor on an image while moving the selection', () => {
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent"
        brushCursorPoint={null}
        brushCursorSize={1}
        brushCursorTool={null}
        draftStroke={null}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={{ dx: 10, dy: 5 }}
        renderData={createRenderData(
          [{ height: 80, id: 'image-1', text: 'one.png', type: 'image', width: 100, x: 0, y: 0 }],
          [],
          { selectedElementIds: ['image-1'] },
        )}
        selectionPath={null}
        spacePressed={false}
        tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }}
        viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()}
        onSelectionMovePointerDown={vi.fn()}
        onSelectionResizePointerDown={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-whiteboard-element="true"]')).toHaveClass('cursor-grabbing');
  });

  it('disables resize hit targets while space-panning over a selection', () => {
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent"
        brushCursorPoint={null}
        brushCursorSize={1}
        brushCursorTool={null}
        draftStroke={null}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={null}
        renderData={createRenderData(
          [{ height: 80, id: 'image-1', text: 'one.png', type: 'image', width: 100, x: 0, y: 0 }],
          [],
          { selectedElementIds: ['image-1'] },
        )}
        selectionPath={null}
        spacePressed
        tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }}
        viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()}
        onSelectionMovePointerDown={vi.fn()}
        onSelectionResizePointerDown={vi.fn()}
      />,
    );

    const handles = Array.from(container.querySelectorAll<SVGRectElement>('[data-whiteboard-selection-resize-handle]'));
    expect(handles).toHaveLength(8);
    expect(handles.every((handle) => handle.classList.contains('pointer-events-none'))).toBe(true);
    expect(handles.every((handle) => handle.style.cursor === '')).toBe(true);
  });

});
