import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WhiteboardStroke } from '../../model/whiteboardModel';

const mocks = vi.hoisted(() => ({
  getCenterStrokePath: vi.fn((stroke: WhiteboardStroke) => `M ${stroke.points[0]?.x ?? 0} 0 L 10 0`),
}));

vi.mock('../../model/whiteboardStrokeRenderGeometry', () => ({
  getCenterStrokePath: mocks.getCenterStrokePath,
  getStrokeRenderWidth: () => 1,
}));

import { WhiteboardSelectionDragTargets } from './WhiteboardSelectionDragTargets';

describe('WhiteboardSelectionDragTargets performance boundaries', () => {
  it('forwards pointer input from a selected single-point segment', () => {
    const onPointerDown = vi.fn();
    const { container } = render(
      <svg>
        <WhiteboardSelectionDragTargets
          movePreview={null}
          movingStrokeIds={new Set()}
          onPointerDown={onPointerDown}
          strokes={[{
            color: '#111111', id: 'stroke-part-2', points: [{ pressure: 0.5, x: 40, y: 20 }],
            size: 1, tool: 'pen',
          }]}
        />
      </svg>,
    );

    container.querySelector('[data-whiteboard-selection-drag-target="stroke-part-2"]')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));

    expect(onPointerDown).toHaveBeenCalledOnce();
  });

  it('reuses stroke hit paths while only the move offset changes', () => {
    const strokes = Array.from({ length: 1000 }, (_, index): WhiteboardStroke => ({
      color: '#111111', id: `stroke-${index}`,
      points: [{ pressure: 0.5, x: index, y: 0 }, { pressure: 0.5, x: index + 10, y: 0 }],
      size: 1, tool: 'pen',
    }));
    const movingStrokeIds = new Set(strokes.map((stroke) => stroke.id));
    const onPointerDown = vi.fn();
    const { container, rerender } = render(
      <svg>
        <WhiteboardSelectionDragTargets
          movePreview={{ dx: 4, dy: 6, elementIds: [], strokeIds: [...movingStrokeIds] }}
          movingStrokeIds={movingStrokeIds}
          onPointerDown={onPointerDown}
          strokes={strokes}
        />
      </svg>,
    );
    expect(mocks.getCenterStrokePath).toHaveBeenCalledTimes(strokes.length);

    rerender(
      <svg>
        <WhiteboardSelectionDragTargets
          movePreview={{ dx: 12, dy: 6, elementIds: [], strokeIds: [...movingStrokeIds] }}
          movingStrokeIds={movingStrokeIds}
          onPointerDown={onPointerDown}
          strokes={strokes}
        />
      </svg>,
    );

    expect(mocks.getCenterStrokePath).toHaveBeenCalledTimes(strokes.length);
    expect(container.querySelector('g')).toHaveAttribute('transform', 'translate(12 6)');
  });
});
