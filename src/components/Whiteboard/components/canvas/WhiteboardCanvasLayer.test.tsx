import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createWhiteboardEraserSpatialIndex, EMPTY_WHITEBOARD_ERASER_PREVIEW } from '../../model/whiteboardEraser';
import { WhiteboardCanvasLayer } from './WhiteboardCanvasLayer';

describe('WhiteboardCanvasLayer', () => {
  it('renders images below completed strokes', () => {
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent"
        brushCursorPoint={null}
        brushCursorSize={1}
        brushCursorTool={null}
        draftStroke={null}
        elements={[{
          height: 80,
          id: 'image-1',
          imageSrc: 'data:image/png;base64,demo',
          text: 'demo.png',
          type: 'image',
          width: 100,
          x: 0,
          y: 0,
        }]}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={null}
        selectedElementIds={[]}
        selectedStrokeIds={[]}
        selectionPath={null}
        spacePressed={false}
        strokes={[{
          color: '#111111',
          id: 'stroke-1',
          points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 20, y: 20 }],
          size: 1,
          tool: 'pen',
        }]}
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
        elements={[{ height: 80, id: 'image-1', text: 'demo.png', type: 'image', width: 100, x: 0, y: 0 }]}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={null}
        selectedElementIds={['image-1']}
        selectedStrokeIds={[]}
        selectionPath={null}
        spacePressed={false}
        strokes={[]}
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
        elements={[]}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={null}
        selectedElementIds={[]}
        selectedStrokeIds={['stroke-1']}
        selectionPath={null}
        spacePressed={false}
        strokes={[{
          color: '#111111', id: 'stroke-1',
          points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 20, y: 20 }],
          size: 1, tool: 'pen',
        }]}
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
        elements={[{ height: 80, id: 'image-1', text: 'one.png', type: 'image', width: 100, x: 0, y: 0 }]}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={null}
        selectedElementIds={['image-1']}
        selectedStrokeIds={['stroke-1']}
        selectionPath={null}
        spacePressed={false}
        strokes={[{
          color: '#111111', id: 'stroke-1',
          points: [{ pressure: 0.5, x: 120, y: 0 }, { pressure: 0.5, x: 140, y: 20 }],
          size: 1, tool: 'pen',
        }]}
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

  it('shows a grabbing cursor on an image while moving the selection', () => {
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent"
        brushCursorPoint={null}
        brushCursorSize={1}
        brushCursorTool={null}
        draftStroke={null}
        elements={[{ height: 80, id: 'image-1', text: 'one.png', type: 'image', width: 100, x: 0, y: 0 }]}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={{ dx: 10, dy: 5, elementIds: ['image-1'], strokeIds: [] }}
        selectedElementIds={['image-1']}
        selectedStrokeIds={[]}
        selectionPath={null}
        spacePressed={false}
        strokes={[]}
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
        elements={[{ height: 80, id: 'image-1', text: 'one.png', type: 'image', width: 100, x: 0, y: 0 }]}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={null}
        selectedElementIds={['image-1']}
        selectedStrokeIds={[]}
        selectionPath={null}
        spacePressed
        strokes={[]}
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

  it('uses linear culling for a live stroke-eraser preview instead of a stale index', () => {
    const committedStroke = {
      color: '#111111', id: 'stroke-1',
      points: [{ pressure: 0.5, x: 10_000, y: 10_000 }, { pressure: 0.5, x: 10_020, y: 10_020 }],
      size: 1, tool: 'pen' as const,
    };
    const previewStroke = {
      ...committedStroke,
      points: [{ pressure: 0.5, x: 20, y: 20 }, { pressure: 0.5, x: 40, y: 40 }],
    };
    const { container } = render(
      <WhiteboardCanvasLayer
        brushCursorColor="transparent"
        brushCursorPoint={null}
        brushCursorSize={1}
        brushCursorTool={null}
        draftStroke={null}
        elements={[]}
        eraserPreview={EMPTY_WHITEBOARD_ERASER_PREVIEW}
        movePreview={null}
        selectedElementIds={[]}
        selectedStrokeIds={[]}
        selectionPath={null}
        spacePressed={false}
        spatialIndex={createWhiteboardEraserSpatialIndex([], [committedStroke])}
        strokes={[previewStroke]}
        tool="stroke-eraser"
        viewport={{ x: 0, y: 0, zoom: 1 }}
        viewportSize={{ x: 500, y: 500 }}
        onElementPointerDown={vi.fn()}
        onSelectionMovePointerDown={vi.fn()}
        onSelectionResizePointerDown={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-whiteboard-stroke="stroke-1"]')).not.toBeNull();
  });
});
