import type { WhiteboardElement, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';
import {
  WHITEBOARD_DOCUMENT_FORMAT,
  WHITEBOARD_DOCUMENT_MIME_TYPE,
  WHITEBOARD_DOCUMENT_VERSION,
  type StoredStroke,
  type WhiteboardDocumentV1,
  type WhiteboardSnapshot,
} from './whiteboardDocumentFormat';

const WHITEBOARD_SERIALIZATION_SLICE_MS = 8;
const WHITEBOARD_SERIALIZATION_CHUNK_CHARS = 256 * 1024;

export function createWhiteboardDocument(snapshot: WhiteboardSnapshot): WhiteboardDocumentV1 {
  return {
    content: {
      ...snapshot,
      elements: snapshot.elements.map(encodeElement),
      strokes: snapshot.strokes.map(encodeStroke),
    },
    format: WHITEBOARD_DOCUMENT_FORMAT,
    version: WHITEBOARD_DOCUMENT_VERSION,
  };
}

export function serializeWhiteboardSnapshot(snapshot: WhiteboardSnapshot): string {
  return Array.from(iterateSerializedWhiteboardSnapshot(snapshot)).join('');
}

export async function serializeWhiteboardSnapshotAsync(snapshot: WhiteboardSnapshot): Promise<string> {
  const chunks = await collectSerializedWhiteboardSnapshotChunks(snapshot, (chunk) => chunk);
  return chunks.join('');
}

export async function serializeWhiteboardSnapshotBlobAsync(snapshot: WhiteboardSnapshot): Promise<Blob> {
  const chunks = await collectSerializedWhiteboardSnapshotChunks(snapshot, (chunk) => new Blob([chunk]));
  return new Blob(chunks, { type: WHITEBOARD_DOCUMENT_MIME_TYPE });
}

async function collectSerializedWhiteboardSnapshotChunks<T>(
  snapshot: WhiteboardSnapshot,
  createChunk: (content: string) => T,
): Promise<T[]> {
  const chunks: T[] = [];
  let pendingChunk = '';
  let sliceStartedAt = performance.now();
  for (const part of iterateSerializedWhiteboardSnapshot(snapshot)) {
    pendingChunk += part;
    if (pendingChunk.length >= WHITEBOARD_SERIALIZATION_CHUNK_CHARS) {
      chunks.push(createChunk(pendingChunk));
      pendingChunk = '';
    }
    if (performance.now() - sliceStartedAt >= WHITEBOARD_SERIALIZATION_SLICE_MS) {
      await yieldToMainThread();
      sliceStartedAt = performance.now();
    }
  }
  if (pendingChunk) chunks.push(createChunk(pendingChunk));
  return chunks;
}

function* iterateSerializedWhiteboardSnapshot(snapshot: WhiteboardSnapshot): Generator<string> {
  yield '{"content":{"elements":[';
  for (let index = 0; index < snapshot.elements.length; index += 1) {
    yield `${index === 0 ? '' : ','}${JSON.stringify(encodeElement(snapshot.elements[index]))}`;
  }
  yield ']';
  if (snapshot.paper !== undefined) yield `,"paper":${JSON.stringify(snapshot.paper)}`;
  yield ',"strokes":[';
  for (let index = 0; index < snapshot.strokes.length; index += 1) {
    yield `${index === 0 ? '' : ','}${JSON.stringify(encodeStroke(snapshot.strokes[index]))}`;
  }
  yield `],"viewport":${JSON.stringify(snapshot.viewport)}},"format":${JSON.stringify(WHITEBOARD_DOCUMENT_FORMAT)},"version":${WHITEBOARD_DOCUMENT_VERSION}}`;
}

function encodeStroke(stroke: WhiteboardStroke): StoredStroke {
  return { ...stroke, points: stroke.points.map(encodeStrokePoint) };
}

function encodeStrokePoint(point: WhiteboardStroke['points'][number]): StoredStroke['points'][number] {
  const stored: Array<number | true | null> = [
    point.x,
    point.y,
    point.pressure,
    point.breakBefore ? true : null,
    point.tilt ?? null,
    point.azimuth ?? null,
    point.rotation ?? null,
    point.velocity ?? null,
  ];
  while (stored.at(-1) === null) stored.pop();
  return stored as StoredStroke['points'][number];
}

function encodeElement(element: WhiteboardElement): WhiteboardElement {
  const stored = { ...element };
  delete stored.imageSrc;
  return stored;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
