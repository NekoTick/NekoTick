import { describe, expect, it } from 'vitest';
import { WHITEBOARD_INITIAL_VIEWPORT } from '@/components/Whiteboard/model/core/whiteboardModel';
import {
  WHITEBOARD_DOCUMENT_FORMAT,
  WHITEBOARD_DOCUMENT_MIME_TYPE,
  WHITEBOARD_DOCUMENT_VERSION,
  deserializeWhiteboardSnapshot,
  deserializeWhiteboardSnapshotAsync,
  serializeWhiteboardSnapshot,
  serializeWhiteboardSnapshotAsync,
  serializeWhiteboardSnapshotBlobAsync,
  type WhiteboardSnapshot,
} from './whiteboardDocument';

const snapshot: WhiteboardSnapshot = {
  elements: [{
    height: 80,
    id: 'image-1',
    imageAssetPath: 'assets/demo.png',
    imageSrc: 'data:image/png;base64,preview',
    text: 'demo.png',
    type: 'image',
    width: 100,
    x: 10,
    y: 20,
  }],
  paper: 'ruled',
  strokes: [{
    color: '#111111',
    id: 'stroke-1',
    points: [{ pressure: 0.4, x: 1, y: 2 }, { pressure: 0.8, x: 3, y: 4 }],
    size: 2,
    tool: 'pen',
  }],
  viewport: { x: 12, y: 24, zoom: 1.25 },
};
const persistedImage = { ...snapshot.elements[0] };
delete persistedImage.imageSrc;

describe('whiteboard document format', () => {
  it('serializes and deserializes current whiteboard content', () => {
    const serialized = serializeWhiteboardSnapshot(snapshot);
    const document = JSON.parse(serialized);
    expect(WHITEBOARD_DOCUMENT_MIME_TYPE).toBe('application/vnd.vlaina.whiteboard+json');
    expect(document.format).toBe(WHITEBOARD_DOCUMENT_FORMAT);
    expect(document.version).toBe(WHITEBOARD_DOCUMENT_VERSION);
    expect(deserializeWhiteboardSnapshot(serialized)).toEqual({
      ...snapshot,
      elements: [persistedImage],
    });
  });

  it('uses the same document format for asynchronous persistence serialization', async () => {
    await expect(serializeWhiteboardSnapshotAsync(snapshot)).resolves.toBe(serializeWhiteboardSnapshot(snapshot));
    await expect((await serializeWhiteboardSnapshotBlobAsync(snapshot)).text())
      .resolves.toBe(serializeWhiteboardSnapshot(snapshot));
  });

  it('incrementally deserializes the same stored document without trusting runtime fields', async () => {
    const serialized = serializeWhiteboardSnapshot(snapshot);
    const document = JSON.parse(serialized);
    document.content.elements[0].imageSrc = 'https://example.invalid/tracker.png';
    const stored = JSON.stringify(document);

    await expect(deserializeWhiteboardSnapshotAsync(stored))
      .resolves.toEqual(deserializeWhiteboardSnapshot(stored));
  });

  it('persists colored pencil strokes while retaining legacy fountain strokes', () => {
    const strokes: WhiteboardSnapshot['strokes'] = [
      { color: '#1e96eb', id: 'colored-pencil', points: [{ pressure: 0.6, x: 1, y: 2 }], size: 1, tool: 'colored-pencil' },
      { color: '#111111', id: 'legacy-fountain', points: [{ pressure: 0.6, x: 3, y: 4 }], size: 1, tool: 'fountain' },
    ];

    const restored = deserializeWhiteboardSnapshot(serializeWhiteboardSnapshot({
      elements: [],
      strokes,
      viewport: WHITEBOARD_INITIAL_VIEWPORT,
    }));

    expect(restored?.strokes.map((stroke) => stroke.tool)).toEqual(['colored-pencil', 'fountain']);
  });

  it('round-trips line and arrow path points', () => {
    const strokes: WhiteboardSnapshot['strokes'] = [
      { color: '#111111', id: 'line', points: [{ pressure: 0.5, x: 0, y: 0 }, { pressure: 0.5, x: 40, y: 20 }], size: 1, tool: 'line' },
      { color: '#ef4444', id: 'arrow', points: [{ pressure: 0.5, x: 5, y: 5 }, { pressure: 0.5, x: 25, y: 15 }, { pressure: 0.5, x: 50, y: 5 }], size: 1.5, tool: 'arrow' },
    ];

    const restored = deserializeWhiteboardSnapshot(serializeWhiteboardSnapshot({
      elements: [], strokes, viewport: WHITEBOARD_INITIAL_VIEWPORT,
    }));

    expect(restored?.strokes).toEqual(strokes);
  });

  it('round-trips a commercially licensed AutoDraw icon reference', () => {
    const icon: WhiteboardSnapshot['elements'][number] = {
      autoDrawIcon: 'house', color: '#1e96eb', height: 120, id: 'house',
      text: 'House', type: 'icon', width: 140, x: 10, y: 20,
    };

    const restored = deserializeWhiteboardSnapshot(serializeWhiteboardSnapshot({
      elements: [icon], strokes: [], viewport: WHITEBOARD_INITIAL_VIEWPORT,
    }));

    expect(restored?.elements).toEqual([icon]);
  });

  it.each([
    'triangle', 'rectangle', 'diamond', 'parallelogram', 'trapezoid',
    'pentagon', 'hexagon', 'octagon', 'ellipse', 'star', 'cross',
  ] as const)('round-trips AutoDraw %s geometry', (autoShape) => {
    const shape: WhiteboardSnapshot['strokes'][number] = {
      autoShape, color: '#111111', id: 'shape',
      points: [{ pressure: 0.5, x: 0, y: 50 }, { pressure: 0.5, x: 100, y: 0 }, { pressure: 0.5, x: 200, y: 50 }],
      size: 1, tool: 'line',
    };

    const restored = deserializeWhiteboardSnapshot(serializeWhiteboardSnapshot({
      elements: [], strokes: [shape], viewport: WHITEBOARD_INITIAL_VIEWPORT,
    }));

    expect(restored?.strokes[0]).toEqual(shape);
  });

  it('round-trips stroke dynamics and fragment rendering metadata', () => {
    const stroke: WhiteboardSnapshot['strokes'][number] = {
      color: '#663399',
      id: 'dynamic-fragment',
      points: [{ azimuth: 1.2, pressure: 0.7, rotation: 0.4, tilt: 0.6, velocity: 0.8, x: 4, y: 8 }],
      renderPathOffset: 18,
      renderPointOffset: 6,
      renderSeed: 'source-stroke',
      renderTaperStart: false,
      renderTextureScale: 1.25,
      size: 1.5,
      tool: 'crayon',
    };
    const serialized = serializeWhiteboardSnapshot({ elements: [], strokes: [stroke], viewport: WHITEBOARD_INITIAL_VIEWPORT });
    const document = JSON.parse(serialized);
    const restored = deserializeWhiteboardSnapshot(serialized)?.strokes[0];

    expect(document.content.strokes[0].points[0]).toEqual([4, 8, 0.7, null, 0.6, 1.2, 0.4, 0.8]);
    expect(restored).toEqual({
      ...stroke,
      points: [{ ...stroke.points[0], azimuth: expect.any(Number), rotation: expect.any(Number) }],
    });
    expect(restored?.points[0].azimuth).toBeCloseTo(1.2);
    expect(restored?.points[0].rotation).toBeCloseTo(0.4);
  });

  it('stores asset paths without duplicating preview data URLs', () => {
    const document = JSON.parse(serializeWhiteboardSnapshot({
      ...snapshot,
      elements: [{ ...snapshot.elements[0], imageAssetPath: 'assets/demo.png' }],
    }));
    expect(document.content.elements[0]).toMatchObject({ imageAssetPath: 'assets/demo.png', type: 'image' });
    expect(document.content.elements[0]).not.toHaveProperty('imageSrc');
  });

  it('round-trips flipped image orientation', () => {
    const flipped = { ...snapshot.elements[0], flipX: true, flipY: true };

    const restored = deserializeWhiteboardSnapshot(serializeWhiteboardSnapshot({
      ...snapshot,
      elements: [flipped],
    }))?.elements[0];

    expect(restored).toEqual({ ...flipped, imageSrc: undefined });
    expect(restored).not.toHaveProperty('imageSrc');
  });

  it('round-trips image rotation', () => {
    const rotated = { ...snapshot.elements[0], rotation: Math.PI / 3 };

    const restored = deserializeWhiteboardSnapshot(serializeWhiteboardSnapshot({
      ...snapshot,
      elements: [rotated],
    }))?.elements[0];

    expect(restored?.rotation).toBeCloseTo(Math.PI / 3);
  });

  it('round-trips text appearance and transforms', () => {
    const text = {
      color: '#1e96eb', flipX: true, fontSize: 24, height: 60, id: 'text-1', lineHeight: 1.25,
      rotation: Math.PI / 4, text: 'First\nSecond', type: 'text' as const, width: 80, x: 10, y: 20,
    };

    const restored = deserializeWhiteboardSnapshot(serializeWhiteboardSnapshot({
      elements: [text], strokes: [], viewport: WHITEBOARD_INITIAL_VIEWPORT,
    }))?.elements[0];

    expect(restored).toEqual(text);
  });

  it('does not trust a stored runtime image source', () => {
    const serialized = serializeWhiteboardSnapshot(snapshot);
    const document = JSON.parse(serialized);
    document.content.elements[0].imageSrc = 'https://example.invalid/tracker.png';

    expect(deserializeWhiteboardSnapshot(JSON.stringify(document))?.elements[0]).not.toHaveProperty('imageSrc');
  });

  it('drops removed object types instead of restoring obsolete content', () => {
    const parsed = deserializeWhiteboardSnapshot(JSON.stringify({
      content: {
        elements: [
          snapshot.elements[0],
          { height: 80, id: 'old-note', text: 'Old', type: 'note', width: 100, x: 0, y: 0 },
          { height: 80, id: 'old-shape', text: '', type: 'rect', width: 100, x: 0, y: 0 },
        ],
        ruler: { angle: 12, visible: true, x: 50, y: 60 },
        strokes: [],
        viewport: WHITEBOARD_INITIAL_VIEWPORT,
      },
      format: WHITEBOARD_DOCUMENT_FORMAT,
      version: WHITEBOARD_DOCUMENT_VERSION,
    }));
    expect(parsed?.elements).toEqual([persistedImage]);
    expect(parsed).not.toHaveProperty('connectors');
    expect(parsed).not.toHaveProperty('ruler');
  });

  it('loads legacy visually split strokes as independently selectable strokes', () => {
    const parsed = deserializeWhiteboardSnapshot(JSON.stringify({
      content: {
        elements: [],
        strokes: [{
          color: '#111111',
          id: 'legacy-stroke',
          points: [[0, 0, 0.5], [40, 0, 0.5], [60, 0, 0.5, true], [100, 0, 0.5]],
          size: 1,
          tool: 'pen',
        }],
        viewport: WHITEBOARD_INITIAL_VIEWPORT,
      },
      format: WHITEBOARD_DOCUMENT_FORMAT,
      version: WHITEBOARD_DOCUMENT_VERSION,
    }));

    expect(parsed?.strokes).toHaveLength(2);
    expect(new Set(parsed?.strokes.map((stroke) => stroke.id)).size).toBe(2);
    expect(parsed?.strokes.flatMap((stroke) => stroke.points).some((point) => point.breakBefore)).toBe(false);
  });

  it('removes a redundant legacy break marker from the first stroke point', () => {
    const parsed = deserializeWhiteboardSnapshot(JSON.stringify({
      content: {
        elements: [],
        strokes: [{ color: '#111111', id: 'legacy-stroke', points: [[0, 0, 0.5, true]], size: 1, tool: 'pen' }],
        viewport: WHITEBOARD_INITIAL_VIEWPORT,
      },
      format: WHITEBOARD_DOCUMENT_FORMAT,
      version: WHITEBOARD_DOCUMENT_VERSION,
    }));

    expect(parsed?.strokes[0].points[0]).toEqual({ pressure: 0.5, x: 0, y: 0 });
  });

  it('deduplicates ids and rejects oversized format identifiers and asset paths', () => {
    const parsed = deserializeWhiteboardSnapshot(JSON.stringify({
      content: {
        elements: [
          { height: 80, id: 'image-1', imageAssetPath: 'assets/first.png', text: 'first.png', type: 'image', width: 100, x: 0, y: 0 },
          { height: 80, id: 'image-1', imageAssetPath: 'assets/second.png', text: 'second.png', type: 'image', width: 100, x: 10, y: 10 },
          { height: 80, id: 'image-2', imageAssetPath: `assets/${'x'.repeat(300)}`, text: 'unsafe.png', type: 'image', width: 100, x: 20, y: 20 },
          { height: 80, id: 'x'.repeat(201), text: 'oversized.png', type: 'image', width: 100, x: 30, y: 30 },
        ],
        strokes: [
          { color: '#111111', id: 'stroke-1', points: [[0, 0, 0.5]], size: 1, tool: 'pen' },
          { color: '#222222', id: 'stroke-1', points: [[10, 10, 0.5]], size: 1, tool: 'pen' },
        ],
        viewport: WHITEBOARD_INITIAL_VIEWPORT,
      },
      format: WHITEBOARD_DOCUMENT_FORMAT,
      version: WHITEBOARD_DOCUMENT_VERSION,
    }));

    expect(parsed?.elements.map((element) => element.id)).toEqual(['image-1', 'image-2']);
    expect(parsed?.elements[0].imageAssetPath).toBe('assets/first.png');
    expect(parsed?.elements[1]).not.toHaveProperty('imageAssetPath');
    expect(parsed?.strokes).toHaveLength(1);
    expect(parsed?.strokes[0].color).toBe('#111111');
  });

  it('rejects raw snapshots, unknown documents, and malformed JSON', () => {
    expect(deserializeWhiteboardSnapshot(JSON.stringify(snapshot))).toBeNull();
    expect(deserializeWhiteboardSnapshot('not json')).toBeNull();
    expect(deserializeWhiteboardSnapshot(JSON.stringify({
      content: snapshot,
      format: WHITEBOARD_DOCUMENT_FORMAT,
      version: WHITEBOARD_DOCUMENT_VERSION + 1,
    }))).toBeNull();
  });

  it('rejects structurally incomplete stored content so backup recovery can run', () => {
    expect(deserializeWhiteboardSnapshot(JSON.stringify({
      content: {},
      format: WHITEBOARD_DOCUMENT_FORMAT,
      version: WHITEBOARD_DOCUMENT_VERSION,
    }))).toBeNull();
    expect(deserializeWhiteboardSnapshot(serializeWhiteboardSnapshot({
      elements: [], strokes: [], viewport: WHITEBOARD_INITIAL_VIEWPORT,
    }))).toEqual({ elements: [], strokes: [], viewport: WHITEBOARD_INITIAL_VIEWPORT });
  });

  it('rejects malformed and structurally incomplete content during incremental parsing', async () => {
    await expect(deserializeWhiteboardSnapshotAsync('not json')).resolves.toBeNull();
    await expect(deserializeWhiteboardSnapshotAsync(JSON.stringify({
      content: {},
      format: WHITEBOARD_DOCUMENT_FORMAT,
      version: WHITEBOARD_DOCUMENT_VERSION,
    }))).resolves.toBeNull();
    await expect(deserializeWhiteboardSnapshotAsync(serializeWhiteboardSnapshot({
      elements: [], strokes: [], viewport: WHITEBOARD_INITIAL_VIEWPORT,
    }))).resolves.toEqual({ elements: [], strokes: [], viewport: WHITEBOARD_INITIAL_VIEWPORT });
  });
});
