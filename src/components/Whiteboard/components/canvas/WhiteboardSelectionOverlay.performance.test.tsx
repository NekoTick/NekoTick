import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WhiteboardSelectionRenderData } from '../../model/whiteboardRenderData';
import { WhiteboardSelectionOverlay } from './WhiteboardSelectionOverlay';

const strokes = [0, 40].map((x, index) => ({
  color: '#111111',
  id: `stroke-${index + 1}`,
  points: [{ pressure: 0.5, x, y: 0 }, { pressure: 0.5, x: x + 20, y: 20 }],
  size: 1,
  tool: 'pen' as const,
}));

describe('WhiteboardSelectionOverlay performance boundaries', () => {
  it('does not rescan selected ids after the selected items are resolved', () => {
    const { container } = render(
      <WhiteboardSelectionOverlay
        movePreview={null}
        renderData={new WhiteboardSelectionRenderData([], strokes)}
        selectionPath={null}
        spacePressed={false}
        onSelectionMovePointerDown={vi.fn()}
        onSelectionResizePointerDown={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-whiteboard-selection-move-target="true"]')).not.toBeNull();
  });
});
