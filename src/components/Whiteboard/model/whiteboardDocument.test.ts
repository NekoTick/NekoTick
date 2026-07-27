import { describe, expect, it } from 'vitest';
import { WHITEBOARD_INITIAL_VIEWPORT } from './whiteboardModel';
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

  it('stores asset paths without duplicating preview data URLs', () => {
    const document = JSON.parse(serializeWhiteboardSnapshot({
      ...snapshot,
      elements: [{ ...snapshot.elements[0], imageAssetPath: 'assets/demo.png' }],
    }));
    expect(document.content.elements[0]).toMatchObject({ imageAssetPath: 'assets/demo.png', type: 'image' });
    expect(document.content.elements[0]).not.toHaveProperty('imageSrc');
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
