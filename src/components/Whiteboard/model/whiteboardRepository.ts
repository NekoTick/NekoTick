import { loadImageAsBlob } from '@/lib/assets/io/reader';
import { processFilename } from '@/lib/assets/core/naming';
import { getStorageAdapter, joinPath } from '@/lib/storage/adapter';
import { getWhiteboardNotesRootPath } from '@/lib/storage/whiteboardStoragePaths';
import {
  createWhiteboardDocument,
  deserializeWhiteboardSnapshot,
  normalizeWhiteboardSnapshot,
  type WhiteboardSnapshot,
} from './whiteboardDocument';
import type { WhiteboardElement } from './whiteboardModel';
import { readRecoverableText, writeRecoverableText } from './whiteboardTextStorage';
import {
  DEFAULT_WHITEBOARD_TITLE,
  createDefaultWhiteboardIndex,
  normalizeWhiteboardIndex,
  parseWhiteboardIndex,
  type WhiteboardIndex,
  type WhiteboardIndexEntry,
} from './whiteboardIndex';

export { createDefaultWhiteboardIndex, normalizeWhiteboardIndex } from './whiteboardIndex';
export type { WhiteboardIndex, WhiteboardIndexEntry } from './whiteboardIndex';

const WHITEBOARD_INDEX_MAX_BYTES = 256 * 1024;
export const WHITEBOARD_BOARD_MAX_BYTES = 16 * 1024 * 1024;
const WHITEBOARD_ASSET_MAX_BYTES = 50 * 1024 * 1024;
const WHITEBOARD_CONFIG_MAX_BYTES = 64 * 1024;
export const WHITEBOARD_ASSET_HYDRATION_CONCURRENCY = 8;
const WHITEBOARD_BOARDS_DIR = 'boards';
const WHITEBOARD_INDEX_FILE = 'index.json';
const WHITEBOARD_CONFIG_FILE = 'config.json';
const WHITEBOARD_BOARD_FILE = 'board.vlwb.json';
const WHITEBOARD_ASSETS_DIR = 'assets';
const WHITEBOARD_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
};

export async function getWhiteboardStorageTree(notesRootPath: string) {
  const rootPath = await getWhiteboardNotesRootPath(notesRootPath);
  const boardsPath = await joinPath(rootPath, WHITEBOARD_BOARDS_DIR);
  const indexPath = await joinPath(rootPath, WHITEBOARD_INDEX_FILE);
  const configPath = await joinPath(rootPath, WHITEBOARD_CONFIG_FILE);
  return { boardsPath, configPath, indexPath, rootPath };
}

export async function loadWhiteboardIndex(notesRootPath: string): Promise<WhiteboardIndex> {
  const { configPath, indexPath } = await getWhiteboardStorageTree(notesRootPath);
  await ensureWhiteboardConfig(notesRootPath, configPath);
  const index = await readRecoverableText(indexPath, WHITEBOARD_INDEX_MAX_BYTES, parseWhiteboardIndex);
  return index ?? createDefaultWhiteboardIndex();
}

export async function writeWhiteboardIndex(notesRootPath: string, index: WhiteboardIndex): Promise<void> {
  const { configPath, indexPath } = await getWhiteboardStorageTree(notesRootPath);
  await ensureWhiteboardConfig(notesRootPath, configPath);
  await writeRecoverableText(
    indexPath,
    JSON.stringify(normalizeWhiteboardIndex(index), null, 2),
    WHITEBOARD_INDEX_MAX_BYTES,
  );
}

export async function readWhiteboardBoard(
  notesRootPath: string,
  board: WhiteboardIndexEntry,
): Promise<WhiteboardSnapshot | null> {
  const boardPath = await getWhiteboardBoardPath(notesRootPath, board);
  const snapshot = await readRecoverableText(
    boardPath,
    WHITEBOARD_BOARD_MAX_BYTES,
    deserializeWhiteboardSnapshot,
  );
  return snapshot ? hydrateWhiteboardAssets(notesRootPath, board, snapshot) : null;
}

export async function writeWhiteboardBoard(
  notesRootPath: string,
  board: WhiteboardIndexEntry,
  snapshot: WhiteboardSnapshot,
): Promise<number> {
  const storage = getStorageAdapter();
  const { configPath } = await getWhiteboardStorageTree(notesRootPath);
  await ensureWhiteboardConfig(notesRootPath, configPath);
  const boardPath = await getWhiteboardBoardPath(notesRootPath, board);
  await storage.mkdir(await getWhiteboardAssetsPath(notesRootPath, board), true);
  return writeRecoverableText(
    boardPath,
    JSON.stringify(createWhiteboardDocument(snapshot), null, 2),
    WHITEBOARD_BOARD_MAX_BYTES,
  );
}

export async function createWhiteboardEntry(
  notesRootPath: string,
  title = DEFAULT_WHITEBOARD_TITLE,
): Promise<{ entry: WhiteboardIndexEntry; index: WhiteboardIndex }> {
  const storage = getStorageAdapter();
  const index = await loadWhiteboardIndex(notesRootPath);
  const { boardsPath } = await getWhiteboardStorageTree(notesRootPath);
  const storedFolders = await storage.listDir(boardsPath).catch(() => []);
  const usedFolders = [
    ...index.boards.map((board) => board.folder),
    ...storedFolders.filter((item) => item.isDirectory).map((item) => item.name),
  ];
  const now = new Date().toISOString();
  const entry: WhiteboardIndexEntry = {
    createdAt: now,
    folder: getAvailableFolder(usedFolders, slugifyWhiteboardTitle(title) || 'board'),
    id: `board-${crypto.randomUUID()}`,
    title,
    updatedAt: now,
  };
  const nextIndex = normalizeWhiteboardIndex({
    ...index,
    activeBoardId: entry.id,
    boards: [...index.boards, entry],
  });
  await writeWhiteboardBoard(notesRootPath, entry, normalizeWhiteboardSnapshot({}));
  await writeWhiteboardIndex(notesRootPath, nextIndex);
  return { entry, index: nextIndex };
}

export async function deleteWhiteboardEntry(
  notesRootPath: string,
  board: WhiteboardIndexEntry,
): Promise<void> {
  const storage = getStorageAdapter();
  const { boardsPath } = await getWhiteboardStorageTree(notesRootPath);
  await storage.deleteDir(await joinPath(boardsPath, board.folder), true);
}

export async function writeWhiteboardAsset(
  notesRootPath: string,
  board: WhiteboardIndexEntry,
  file: File,
): Promise<string> {
  const storage = getStorageAdapter();
  if (typeof file.size === 'number' && file.size > WHITEBOARD_ASSET_MAX_BYTES) {
    throw new Error('Whiteboard image is too large');
  }
  const assetsPath = await getWhiteboardAssetsPath(notesRootPath, board);
  const filename = createWhiteboardAssetFilename(file);
  const fullPath = await joinPath(assetsPath, filename);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > WHITEBOARD_ASSET_MAX_BYTES) {
    throw new Error('Whiteboard image is too large');
  }
  await storage.writeBinaryFile(fullPath, bytes, { recursive: true });
  return `${WHITEBOARD_ASSETS_DIR}/${filename}`;
}

function createWhiteboardAssetFilename(file: File): string {
  const mimeType = file.type?.split(';')[0]?.trim().toLowerCase() ?? '';
  const mimeExtension = WHITEBOARD_IMAGE_EXTENSIONS[mimeType];
  const originalName = file.name || 'image';
  const originalDot = originalName.lastIndexOf('.');
  const sourceName = mimeExtension
    ? `${originalDot > 0 ? originalName.slice(0, originalDot) : originalName}${mimeExtension}`
    : originalName;
  const filename = processFilename(sourceName, new Set(), 120);
  const lastDot = filename.lastIndexOf('.');
  const suffix = crypto.randomUUID();
  return lastDot > 0
    ? `${filename.slice(0, lastDot)}-${suffix}${filename.slice(lastDot)}`
    : `${filename}-${suffix}`;
}

async function getWhiteboardBoardPath(notesRootPath: string, board: WhiteboardIndexEntry): Promise<string> {
  const { boardsPath } = await getWhiteboardStorageTree(notesRootPath);
  return joinPath(boardsPath, board.folder, WHITEBOARD_BOARD_FILE);
}

async function getWhiteboardAssetsPath(notesRootPath: string, board: WhiteboardIndexEntry): Promise<string> {
  const { boardsPath } = await getWhiteboardStorageTree(notesRootPath);
  return joinPath(boardsPath, board.folder, WHITEBOARD_ASSETS_DIR);
}

async function hydrateWhiteboardAssets(
  notesRootPath: string,
  board: WhiteboardIndexEntry,
  snapshot: WhiteboardSnapshot,
): Promise<WhiteboardSnapshot> {
  const elements = await refreshWhiteboardAssetUrls(notesRootPath, board, snapshot.elements);
  return { ...snapshot, elements };
}

export async function refreshWhiteboardAssetUrls(
  notesRootPath: string,
  board: WhiteboardIndexEntry,
  elements: WhiteboardElement[],
): Promise<WhiteboardElement[]> {
  const refreshedElements = [...elements];
  let nextIndex = 0;
  const hydrateNext = async () => {
    while (nextIndex < refreshedElements.length) {
      const index = nextIndex;
      nextIndex += 1;
      const element = refreshedElements[index];
      if (
        element.type !== 'image' ||
        !element.imageAssetPath ||
        (element.imageSrc && !element.imageSrc.startsWith('blob:'))
      ) continue;
      const fileName = getAssetFileName(element.imageAssetPath);
      if (!fileName) continue;
      try {
        const fullPath = await joinPath(await getWhiteboardAssetsPath(notesRootPath, board), fileName);
        refreshedElements[index] = { ...element, imageSrc: await loadImageAsBlob(fullPath) };
      } catch {
        const { imageSrc: _staleImageSrc, ...elementWithoutStaleSrc } = element;
        refreshedElements[index] = elementWithoutStaleSrc;
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(WHITEBOARD_ASSET_HYDRATION_CONCURRENCY, refreshedElements.length) },
    hydrateNext,
  ));
  return refreshedElements;
}

function getAssetFileName(assetPath: string): string | null {
  if (!assetPath.startsWith(`${WHITEBOARD_ASSETS_DIR}/`)) return null;
  const fileName = assetPath.slice(WHITEBOARD_ASSETS_DIR.length + 1);
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName === '.' || fileName === '..') return null;
  return fileName;
}

function getAvailableFolder(usedFolders: string[], baseFolder: string): string {
  const used = new Set(usedFolders);
  if (!used.has(baseFolder)) return baseFolder;
  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${baseFolder}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${baseFolder}-${Date.now()}`;
}

function slugifyWhiteboardTitle(value: string): string {
  return value.trim().toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function ensureWhiteboardConfig(notesRootPath: string, configPath: string): Promise<void> {
  const storage = getStorageAdapter();
  const nextConfig = { createdAt: new Date().toISOString(), notesRootPath, version: 1 };
  if (!await storage.exists(configPath)) {
    await storage.writeFile(configPath, JSON.stringify(nextConfig, null, 2), { recursive: true });
    return;
  }
  try {
    const parsed = JSON.parse(await storage.readFile(configPath, WHITEBOARD_CONFIG_MAX_BYTES));
    if (isRecord(parsed) && parsed.notesRootPath === notesRootPath && parsed.version === 1) return;
    await storage.writeFile(configPath, JSON.stringify(nextConfig, null, 2), { recursive: true });
  } catch {
    await storage.writeFile(configPath, JSON.stringify(nextConfig, null, 2), { recursive: true });
  }
}
