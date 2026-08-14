import { createRef, type ComponentProps } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_WHITEBOARD_ERASER_PREVIEW } from '../../model/whiteboardEraser';
import { createWhiteboardEraserSpatialIndex } from '../../model/whiteboardEraser';
import { WhiteboardRenderData } from '../../model/whiteboardRenderData';
import { WhiteboardSurface } from './WhiteboardSurface';

function createProps(): ComponentProps<typeof WhiteboardSurface> {
  return {
    brushCursorColor: 'transparent',
    brushCursorPoint: null,
    brushCursorSize: 1,
    brushCursorTool: null,
    draftStroke: null,
    eraserPreview: EMPTY_WHITEBOARD_ERASER_PREVIEW,
    isPanning: false,
    movePreview: null,
    paperStyle: 'blank',
    renderData: new WhiteboardRenderData(
      [],
      createWhiteboardEraserSpatialIndex([], []),
      [],
    ),
    selectionPath: null,
    spacePressed: false,
    tool: 'select',
    viewport: { x: 0, y: 0, zoom: 1 },
    viewportRef: createRef<HTMLDivElement>(),
    onElementPointerDown: vi.fn(),
    onDoubleClick: vi.fn(),
    onImageDrop: vi.fn(),
    onPointerCancel: vi.fn(),
    onPointerDown: vi.fn(),
    onPointerLeave: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    onSelectionMovePointerDown: vi.fn(),
    onSelectionResizePointerDown: vi.fn(),
    onWheel: vi.fn(),
  };
}

describe('WhiteboardSurface', () => {
  it('switches the lasso cursor from crosshair to grabbing while moving a selection', () => {
    const props = createProps();
    const { container, rerender } = render(<WhiteboardSurface {...props} />);
    const surface = container.firstElementChild;

    expect(surface).toHaveClass('cursor-crosshair');

    rerender(<WhiteboardSurface {...props} movePreview={{ dx: 0, dy: 0 }} />);

    expect(surface).toHaveClass('cursor-grabbing');
    expect(surface).not.toHaveClass('cursor-crosshair');
  });

  it('forwards native double clicks for text editing', () => {
    const props = createProps();
    const { container } = render(<WhiteboardSurface {...props} />);

    fireEvent.doubleClick(container.firstElementChild!);

    expect(props.onDoubleClick).toHaveBeenCalledOnce();
  });
});
