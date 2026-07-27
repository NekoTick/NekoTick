import { JSONParser } from '@streamparser/json';
import { WHITEBOARD_INITIAL_VIEWPORT } from './whiteboardModel';
import {
  WHITEBOARD_DOCUMENT_FORMAT,
  WHITEBOARD_DOCUMENT_VERSION,
  type WhiteboardSnapshot,
} from './whiteboardDocumentFormat';
import {
  isStoredWhiteboardContent,
  isWhiteboardRecord,
  normalizeStoredWhiteboardSnapshot,
  readStoredWhiteboardElement,
  readStoredWhiteboardStroke,
  readWhiteboardPaper,
  readWhiteboardViewport,
} from './whiteboardDocumentNormalization';
import { splitWhiteboardStrokeSegments } from './whiteboardStrokeSegments';

const WHITEBOARD_PARSE_CHUNK_CHARS = 64 * 1024;
const WHITEBOARD_PARSE_SLICE_MS = 8;
const PARSED_PATHS = [
  '$.content.elements.*',
  '$.content.paper',
  '$.content.strokes.*',
  '$.content.viewport',
  '$.format',
  '$.version',
];

export function deserializeWhiteboardSnapshot(serialized: string): WhiteboardSnapshot | null {
  try {
    const value = JSON.parse(serialized);
    if (
      !isWhiteboardRecord(value) ||
      value.format !== WHITEBOARD_DOCUMENT_FORMAT ||
      value.version !== WHITEBOARD_DOCUMENT_VERSION ||
      !isStoredWhiteboardContent(value.content)
    ) return null;
    return normalizeStoredWhiteboardSnapshot(value.content);
  } catch {
    return null;
  }
}

export async function deserializeWhiteboardSnapshotAsync(serialized: string): Promise<WhiteboardSnapshot | null> {
  const state = createParseState();
  try {
    const parser = new JSONParser({ emitPartialValues: true, keepStack: false, paths: PARSED_PATHS });
    parser.onValue = ({ key, partial, stack, value }) => collectParsedValue(state, key, stack.map((entry) => entry.key), value, Boolean(partial));
    let sliceStartedAt = performance.now();
    for (let offset = 0; offset < serialized.length;) {
      let end = Math.min(serialized.length, offset + WHITEBOARD_PARSE_CHUNK_CHARS);
      if (end < serialized.length && isHighSurrogate(serialized.charCodeAt(end - 1))) end -= 1;
      parser.write(serialized.slice(offset, end));
      offset = end;
      if (offset < serialized.length && performance.now() - sliceStartedAt >= WHITEBOARD_PARSE_SLICE_MS) {
        await yieldToMainThread();
        sliceStartedAt = performance.now();
      }
    }
    if (!parser.isEnded) parser.end();
  } catch {
    return null;
  }
  if (
    state.format !== WHITEBOARD_DOCUMENT_FORMAT ||
    state.version !== WHITEBOARD_DOCUMENT_VERSION ||
    !state.elementsSeen ||
    !state.strokesSeen ||
    !state.viewportSeen
  ) return null;
  return {
    elements: state.elements,
    ...(state.paper ? { paper: state.paper } : {}),
    strokes: state.hasSegmentBreaks ? splitWhiteboardStrokeSegments(state.strokes) : state.strokes,
    viewport: state.viewport ?? { ...WHITEBOARD_INITIAL_VIEWPORT },
  };
}

interface WhiteboardParseState {
  elementIds: Set<string>;
  elements: WhiteboardSnapshot['elements'];
  elementsSeen: boolean;
  format: unknown;
  hasSegmentBreaks: boolean;
  paper: WhiteboardSnapshot['paper'] | null;
  strokeIds: Set<string>;
  strokes: WhiteboardSnapshot['strokes'];
  strokesSeen: boolean;
  version: unknown;
  viewport: WhiteboardSnapshot['viewport'] | null;
  viewportSeen: boolean;
}

function createParseState(): WhiteboardParseState {
  return {
    elementIds: new Set(), elements: [], elementsSeen: false, format: undefined,
    hasSegmentBreaks: false, paper: null, strokeIds: new Set(), strokes: [], strokesSeen: false,
    version: undefined, viewport: null, viewportSeen: false,
  };
}

function collectParsedValue(
  state: WhiteboardParseState,
  key: unknown,
  stackKeys: unknown[],
  value: unknown,
  partial: boolean,
): void {
  const parentKey = stackKeys.at(-1);
  if (parentKey === 'elements') {
    state.elementsSeen = true;
    if (partial) return;
    const element = readStoredWhiteboardElement(value);
    if (!element || state.elementIds.has(element.id)) return;
    state.elementIds.add(element.id);
    state.elements.push(element);
    return;
  }
  if (parentKey === 'strokes') {
    state.strokesSeen = true;
    if (partial) return;
    const stroke = readStoredWhiteboardStroke(value);
    if (!stroke || state.strokeIds.has(stroke.id)) return;
    state.strokeIds.add(stroke.id);
    state.hasSegmentBreaks ||= stroke.points.some((point) => point.breakBefore);
    state.strokes.push(stroke);
    return;
  }
  if (partial) return;
  if (stackKeys.length === 1 && key === 'format') state.format = value;
  else if (stackKeys.length === 1 && key === 'version') state.version = value;
  else if (stackKeys.length === 2 && key === 'paper') state.paper = readWhiteboardPaper(value);
  else if (stackKeys.length === 2 && key === 'viewport') {
    state.viewportSeen = isWhiteboardRecord(value);
    state.viewport = readWhiteboardViewport(value);
  }
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
