import { describe, expect, it } from 'vitest';
import { createWhiteboardEraserSpatialIndex } from './whiteboardEraser';
import type { WhiteboardResizePreview } from './whiteboardInteractions';
import { getWhiteboardResizePreviewItems } from './whiteboardResizePreview';
import { resizeSelectionStrokes } from './whiteboardSelection';

const stroke = {
  color: '#111111',
  id: 'stroke',
  points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 100, y: 100 }],
  size: 1,
  tool: 'pen' as const,
};

describe('whiteboard resize preview', () => {
  it('uses the same stroke geometry as the committed resize', () => {
    const preview: WhiteboardResizePreview = {
      nextBounds: { height: 180, width: 220, x: 10, y: 20 },
      originalElementsById: new Map(),
      originalStrokesById: new Map([[stroke.id, stroke]]),
      startBounds: { height: 100, width: 100, x: 0, y: 0 },
    };

    const rendered = getWhiteboardResizePreviewItems(
      preview,
      createWhiteboardEraserSpatialIndex([], [stroke]),
      { height: 500, width: 500, x: -100, y: -100 },
    );
    const committed = resizeSelectionStrokes(
      [stroke],
      preview.originalStrokesById,
      preview.startBounds,
      preview.nextBounds,
    );

    expect(rendered.strokes).toEqual(committed);
  });
});
