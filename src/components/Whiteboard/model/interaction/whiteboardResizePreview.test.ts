import { describe, expect, it } from 'vitest';
import { createWhiteboardEraserSpatialIndex } from './whiteboardEraser';
import type { WhiteboardResizePreview } from './whiteboardInteractions';
import { getWhiteboardResizePreviewItems, getWhiteboardResizePreviewTransform } from './whiteboardResizePreview';
import { resizeSelectionElements, resizeSelectionStroke, resizeSelectionStrokes } from './whiteboardSelection';

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

  it('uses the same proportional text geometry as the committed resize', () => {
    const text = {
      color: '#111111', fontSize: 24, height: 30, id: 'text', lineHeight: 1.25,
      text: 'Hello', type: 'text' as const, width: 80, x: 10, y: 20,
    };
    const preview: WhiteboardResizePreview = {
      nextBounds: { height: 60, width: 160, x: 10, y: 20 },
      originalElementsById: new Map([[text.id, text]]),
      originalStrokesById: new Map(),
      startBounds: { height: 30, width: 80, x: 10, y: 20 },
    };

    const rendered = getWhiteboardResizePreviewItems(
      preview,
      createWhiteboardEraserSpatialIndex([text], []),
      { height: 500, width: 500, x: -100, y: -100 },
    );
    const committed = resizeSelectionElements(
      [text], preview.originalElementsById, preview.startBounds, preview.nextBounds,
    );

    expect(rendered.elements).toEqual(committed);
    expect(rendered.elements[0]).toMatchObject({ fontSize: 48, height: 60, width: 160 });
  });

  it('transforms the combined chisel nib angle during non-uniform resize', () => {
    const marker = {
      ...stroke,
      points: [{ azimuth: 0, pressure: 0.5, rotation: Math.PI / 4, x: 0, y: 0 }],
      tool: 'marker' as const,
    };

    const resized = resizeSelectionStroke(
      marker,
      { height: 100, width: 100, x: 0, y: 0 },
      { height: 100, width: 200, x: 0, y: 0 },
    );

    expect(resized.points[0].azimuth).toBeCloseTo(Math.atan2(1, 2));
    expect(resized.points[0].rotation).toBeUndefined();
  });

  it('keeps edge crossing on the layer-transform preview path', () => {
    const preview: WhiteboardResizePreview = {
      nextBounds: { height: -50, width: 200, x: 10, y: 20 },
      originalElementsById: new Map(),
      originalStrokesById: new Map([[stroke.id, stroke]]),
      startBounds: { height: 100, width: 100, x: 0, y: 0 },
    };

    expect(getWhiteboardResizePreviewTransform(preview))
      .toBe('translate(10px, 20px) scale(2, -0.5) translate(0px, 0px)');
  });
});
