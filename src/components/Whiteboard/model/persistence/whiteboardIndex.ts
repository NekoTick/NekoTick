export interface WhiteboardIndexEntry {
  id: string;
  title: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhiteboardIndex {
  version: 1;
  activeBoardId: string;
  boards: WhiteboardIndexEntry[];
}

const WHITEBOARD_INDEX_ID_MAX_CHARS = 200;
const WHITEBOARD_INDEX_TITLE_MAX_CHARS = 120;
const WHITEBOARD_INDEX_FOLDER_MAX_CHARS = 200;
const DEFAULT_WHITEBOARD_ID = 'default';
export const DEFAULT_WHITEBOARD_TITLE = 'Board';

export function createDefaultWhiteboardIndex(now = new Date().toISOString()): WhiteboardIndex {
  return {
    activeBoardId: DEFAULT_WHITEBOARD_ID,
    boards: [{
      createdAt: now,
      folder: DEFAULT_WHITEBOARD_ID,
      id: DEFAULT_WHITEBOARD_ID,
      title: DEFAULT_WHITEBOARD_TITLE,
      updatedAt: now,
    }],
    version: 1,
  };
}

export function normalizeWhiteboardIndex(value: unknown): WhiteboardIndex {
  if (!isRecord(value) || value.version !== 1) return createDefaultWhiteboardIndex();
  const boards = Array.isArray(value.boards)
    ? value.boards.flatMap((item) => {
      const board = normalizeBoardEntry(item);
      return board ? [board] : [];
    })
    : [];
  const uniqueBoards = dedupeWhiteboardEntries(boards);
  const normalizedBoards = uniqueBoards.length > 0 ? uniqueBoards : createDefaultWhiteboardIndex().boards;
  const activeBoardId = typeof value.activeBoardId === 'string' &&
    normalizedBoards.some((board) => board.id === value.activeBoardId)
    ? value.activeBoardId
    : normalizedBoards[0].id;
  return { activeBoardId, boards: normalizedBoards, version: 1 };
}

export function parseWhiteboardIndex(content: string): WhiteboardIndex | null {
  try {
    const value = JSON.parse(content);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      typeof value.activeBoardId !== 'string' ||
      !Array.isArray(value.boards) ||
      value.boards.length === 0
    ) return null;
    const normalized = normalizeWhiteboardIndex(value);
    return normalized.boards.some((board) => board.id === value.activeBoardId) ? normalized : null;
  } catch {
    return null;
  }
}

function normalizeBoardEntry(value: unknown): WhiteboardIndexEntry | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id, WHITEBOARD_INDEX_ID_MAX_CHARS);
  const title = readString(value.title, WHITEBOARD_INDEX_TITLE_MAX_CHARS);
  const folder = readSafeFolder(value.folder);
  if (!id || !title || !folder) return null;
  const now = new Date().toISOString();
  return {
    createdAt: readString(value.createdAt) ?? now,
    folder,
    id,
    title,
    updatedAt: readString(value.updatedAt) ?? now,
  };
}

function dedupeWhiteboardEntries(boards: WhiteboardIndexEntry[]): WhiteboardIndexEntry[] {
  const ids = new Set<string>();
  const folders = new Set<string>();
  return boards.filter((board) => {
    if (ids.has(board.id) || folders.has(board.folder)) return false;
    ids.add(board.id);
    folders.add(board.folder);
    return true;
  });
}

function readSafeFolder(value: unknown): string | null {
  const folder = readString(value, WHITEBOARD_INDEX_FOLDER_MAX_CHARS);
  if (!folder || folder.includes('/') || folder.includes('\\') || folder === '.' || folder === '..') return null;
  return folder;
}

function readString(value: unknown, maxChars = Number.POSITIVE_INFINITY): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxChars ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
