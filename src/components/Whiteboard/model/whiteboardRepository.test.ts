import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizePath } from '@/lib/storage/adapter/pathUtils';
import { getNotesRootStorageKey } from '@/lib/storage/notesRootStorageKey';
import {
  createWhiteboardEntry,
  loadWhiteboardIndex,
  normalizeWhiteboardIndex,
  readWhiteboardBoard,
  refreshWhiteboardAssetUrls,
  WHITEBOARD_ASSET_HYDRATION_CONCURRENCY,
  writeWhiteboardAsset,
  writeWhiteboardBoard,
  writeWhiteboardIndex,
} from './whiteboardRepository';
import { normalizeWhiteboardSnapshot } from './whiteboardDocument';

const mocks = vi.hoisted(() => {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    dirs,
    files,
    loadImageAsBlob: vi.fn(),
    storage: {
      exists: vi.fn(async (path: string) => files.has(normalizePath(path, true)) || dirs.has(normalizePath(path, true))),
      getBasePath: vi.fn(async () => '/app'),
      mkdir: vi.fn(async (path: string) => {
        dirs.add(normalizePath(path, true));
      }),
      readFile: vi.fn(async (path: string) => files.get(normalizePath(path, true)) ?? ''),
      listDir: vi.fn(async (path: string) => {
        const normalized = normalizePath(path, true).replace(/\/$/, '');
        return Array.from(files.keys())
          .filter((filePath) => filePath.startsWith(`${normalized}/`))
          .map((filePath) => ({
            isDirectory: false,
            isFile: true,
            name: filePath.slice(normalized.length + 1),
            path: filePath,
          }));
      }),
      deleteDir: vi.fn(async (path: string) => {
        const normalized = normalizePath(path, true).replace(/\/$/, '');
        for (const filePath of Array.from(files.keys())) {
          if (filePath === normalized || filePath.startsWith(`${normalized}/`)) files.delete(filePath);
        }
        for (const dirPath of Array.from(dirs)) {
          if (dirPath === normalized || dirPath.startsWith(`${normalized}/`)) dirs.delete(dirPath);
        }
      }),
      deleteFile: vi.fn(async (path: string) => {
        files.delete(normalizePath(path, true));
      }),
      copyFile: vi.fn(async (source: string, target: string) => {
        const content = files.get(normalizePath(source, true));
        if (content === undefined) throw new Error('Source does not exist');
        files.set(normalizePath(target, true), content);
      }),
      rename: vi.fn(async (source: string, target: string) => {
        const normalizedSource = normalizePath(source, true);
        const content = files.get(normalizedSource);
        if (content === undefined) throw new Error('Source does not exist');
        files.set(normalizePath(target, true), content);
        files.delete(normalizedSource);
      }),
      writeBinaryFile: vi.fn(async (path: string, content: Uint8Array) => {
        files.set(normalizePath(path, true), `binary:${Array.from(content).join(',')}`);
      }),
      writeFile: vi.fn(async (path: string, content: string) => {
        files.set(normalizePath(path, true), content);
      }),
    },
  };
});

vi.mock('@/lib/storage/adapter', () => ({
  getStorageAdapter: () => mocks.storage,
  joinPath: async (...segments: string[]) => normalizePath(segments.filter(Boolean).join('/'), true),
}));

vi.mock('@/lib/assets/io/reader', () => ({
  loadImageAsBlob: mocks.loadImageAsBlob,
}));

const SYSTEM_ROOT = `/app/.vlaina/whiteboards/notes-roots/${getNotesRootStorageKey('/notesRoot')}`;

describe('whiteboardRepository', () => {
  beforeEach(() => {
    mocks.files.clear();
    mocks.dirs.clear();
    vi.clearAllMocks();
    mocks.loadImageAsBlob.mockImplementation(async (path: string) => `blob:${path}`);
  });

  it('loads a default index when the whiteboard index does not exist', async () => {
    await expect(loadWhiteboardIndex('/notesRoot')).resolves.toMatchObject({
      activeBoardId: 'default',
      boards: [{ folder: 'default', id: 'default', title: 'Board' }],
      version: 1,
    });
  });

  it('rejects unversioned whiteboard indexes', () => {
    expect(normalizeWhiteboardIndex({ activeBoardId: 'legacy', boards: [] })).toMatchObject({
      activeBoardId: 'default',
      version: 1,
    });
  });

  it('deduplicates board ids and folders in the index', () => {
    const timestamp = '2026-07-16T00:00:00.000Z';
    const normalized = normalizeWhiteboardIndex({
      activeBoardId: 'third',
      boards: [
        { createdAt: timestamp, folder: 'first', id: 'first', title: 'First', updatedAt: timestamp },
        { createdAt: timestamp, folder: 'second', id: 'first', title: 'Duplicate id', updatedAt: timestamp },
        { createdAt: timestamp, folder: 'first', id: 'third', title: 'Duplicate folder', updatedAt: timestamp },
        { createdAt: timestamp, folder: 'fourth', id: 'fourth', title: 'Fourth', updatedAt: timestamp },
      ],
      version: 1,
    });

    expect(normalized.boards.map((board) => board.id)).toEqual(['first', 'fourth']);
    expect(normalized.activeBoardId).toBe('first');
  });

  it('creates each board as a folder with board JSON and assets directory', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Project Plan');

    expect(entry.folder).toBe('project-plan');
    expect(mocks.files.has(`${SYSTEM_ROOT}/config.json`)).toBe(true);
    expect(mocks.files.has(`${SYSTEM_ROOT}/index.json`)).toBe(true);
    expect(mocks.files.has(`${SYSTEM_ROOT}/boards/project-plan/board.vlwb.json`)).toBe(true);
    expect(mocks.dirs.has(`${SYSTEM_ROOT}/boards/project-plan/assets`)).toBe(true);
  });

  it('does not reuse an orphaned board folder left by failed cleanup', async () => {
    mocks.storage.listDir.mockResolvedValueOnce([{
      isDirectory: true,
      isFile: false,
      name: 'project-plan',
      path: `${SYSTEM_ROOT}/boards/project-plan`,
    }]);

    const { entry } = await createWhiteboardEntry('/notesRoot', 'Project Plan');

    expect(entry.folder).toBe('project-plan-2');
  });

  it('writes board snapshots into the selected board folder', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Sketch');
    const byteLength = await writeWhiteboardBoard('/notesRoot', entry, normalizeWhiteboardSnapshot({
      elements: [{ height: 80, id: 'image-1', text: 'hello.png', type: 'image', width: 120, x: 1, y: 2 }],
    }));

    const rawBoard = mocks.files.get(`${SYSTEM_ROOT}/boards/sketch/board.vlwb.json`);
    expect(byteLength).toBe(new TextEncoder().encode(rawBoard).byteLength);
    expect(rawBoard).toContain('"format": "vlaina.whiteboard"');
    expect(rawBoard).toContain('"image-1"');
  });

  it('refreshes revoked whiteboard Blob URLs without replacing element edits', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Sketch');
    const elements = normalizeWhiteboardSnapshot({
      elements: [{
        height: 80,
        id: 'image-1',
        imageAssetPath: 'assets/photo.png',
        imageSrc: 'blob:stale',
        text: 'photo.png',
        type: 'image',
        width: 120,
        x: 17,
        y: 23,
      }],
    }).elements;

    const refreshed = await refreshWhiteboardAssetUrls('/notesRoot', entry, elements);

    expect(mocks.loadImageAsBlob).toHaveBeenCalledWith(
      `${SYSTEM_ROOT}/boards/sketch/assets/photo.png`,
    );
    expect(refreshed[0]).toMatchObject({
      imageSrc: `blob:${SYSTEM_ROOT}/boards/sketch/assets/photo.png`,
      x: 17,
      y: 23,
    });
  });

  it('removes a revoked whiteboard Blob URL when its asset cannot be reloaded', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Sketch');
    mocks.loadImageAsBlob.mockRejectedValueOnce(new Error('missing asset'));
    const elements = normalizeWhiteboardSnapshot({
      elements: [{
        height: 80,
        id: 'image-1',
        imageAssetPath: 'assets/missing.png',
        imageSrc: 'blob:stale',
        text: 'missing.png',
        type: 'image',
        width: 120,
        x: 1,
        y: 2,
      }],
    }).elements;

    const refreshed = await refreshWhiteboardAssetUrls('/notesRoot', entry, elements);

    expect(refreshed[0]).not.toHaveProperty('imageSrc');
  });

  it('recovers a board from its backup when the primary file is malformed', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Sketch');
    const boardPath = `${SYSTEM_ROOT}/boards/sketch/board.vlwb.json`;
    await writeWhiteboardBoard('/notesRoot', entry, normalizeWhiteboardSnapshot({
      elements: [{ height: 80, id: 'recovered', text: 'safe.png', type: 'image', width: 120, x: 1, y: 2 }],
    }));
    await writeWhiteboardBoard('/notesRoot', entry, normalizeWhiteboardSnapshot({
      elements: [{ height: 80, id: 'recovered', text: 'safe.png', type: 'image', width: 120, x: 1, y: 2 }],
    }));
    mocks.files.set(boardPath, '{broken');

    const snapshot = await readWhiteboardBoard('/notesRoot', entry);

    expect(snapshot?.elements[0]).toMatchObject({ id: 'recovered' });
    expect(mocks.files.get(boardPath)).toBe(mocks.files.get(`${boardPath}.bak`));
  });

  it('recovers a board when the primary JSON has a header but no content', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Sketch');
    const boardPath = `${SYSTEM_ROOT}/boards/sketch/board.vlwb.json`;
    await writeWhiteboardBoard('/notesRoot', entry, normalizeWhiteboardSnapshot({
      elements: [{ height: 80, id: 'recovered', text: 'safe.png', type: 'image', width: 120, x: 1, y: 2 }],
    }));
    await writeWhiteboardBoard('/notesRoot', entry, normalizeWhiteboardSnapshot({
      elements: [{ height: 80, id: 'recovered', text: 'safe.png', type: 'image', width: 120, x: 1, y: 2 }],
    }));
    mocks.files.set(boardPath, JSON.stringify({ format: 'vlaina.whiteboard', version: 1 }));

    await expect(readWhiteboardBoard('/notesRoot', entry)).resolves.toMatchObject({
      elements: [expect.objectContaining({ id: 'recovered' })],
    });
  });

  it('recovers the index from its backup when the primary file is malformed', async () => {
    const created = await createWhiteboardEntry('/notesRoot', 'Sketch');
    await writeWhiteboardIndex('/notesRoot', created.index);
    mocks.files.set(`${SYSTEM_ROOT}/index.json`, '{broken');

    const recovered = await loadWhiteboardIndex('/notesRoot');

    expect(recovered.activeBoardId).toBe(created.entry.id);
    expect(recovered.boards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.entry.id }),
    ]));
  });

  it('recovers the index when the primary JSON has a version but no boards', async () => {
    const created = await createWhiteboardEntry('/notesRoot', 'Sketch');
    await writeWhiteboardIndex('/notesRoot', created.index);
    mocks.files.set(`${SYSTEM_ROOT}/index.json`, JSON.stringify({ activeBoardId: created.entry.id, version: 1 }));

    await expect(loadWhiteboardIndex('/notesRoot')).resolves.toMatchObject({
      activeBoardId: created.entry.id,
      boards: expect.arrayContaining([expect.objectContaining({ id: created.entry.id })]),
    });
  });

  it('keeps the previous primary and backup when atomic replacement fails', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Sketch');
    const boardPath = `${SYSTEM_ROOT}/boards/sketch/board.vlwb.json`;
    const previous = mocks.files.get(boardPath);
    mocks.storage.rename.mockRejectedValueOnce(new Error('replace failed'));

    await expect(writeWhiteboardBoard('/notesRoot', entry, normalizeWhiteboardSnapshot({
      elements: [{ height: 80, id: 'new', text: 'new.png', type: 'image', width: 120, x: 1, y: 2 }],
    }))).rejects.toThrow('replace failed');

    expect(mocks.files.get(boardPath)).toBe(previous);
    expect(mocks.files.get(`${boardPath}.bak`)).toBe(previous);
    expect(Array.from(mocks.files.keys()).some((path) => path.endsWith('.tmp'))).toBe(false);
  });

  it('rejects board payloads larger than the 16 MB read limit', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Sketch');
    const oversized = normalizeWhiteboardSnapshot({
      elements: [{ height: 80, id: 'large', text: 'x'.repeat(16 * 1024 * 1024), type: 'image', width: 120, x: 1, y: 2 }],
    });

    await expect(writeWhiteboardBoard('/notesRoot', entry, oversized)).rejects.toThrow('too large');
  });

  it('bounds concurrent image hydration when opening image-heavy boards', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Images');
    const elements = Array.from({ length: WHITEBOARD_ASSET_HYDRATION_CONCURRENCY * 3 }, (_, index) => ({
      height: 80,
      id: `image-${index}`,
      imageAssetPath: `assets/image-${index}.png`,
      text: `image-${index}.png`,
      type: 'image' as const,
      width: 120,
      x: index * 10,
      y: 0,
    }));
    await writeWhiteboardBoard('/notesRoot', entry, normalizeWhiteboardSnapshot({ elements }));
    let activeLoads = 0;
    let maxActiveLoads = 0;
    mocks.loadImageAsBlob.mockImplementation(async (path: string) => {
      activeLoads += 1;
      maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
      await Promise.resolve();
      activeLoads -= 1;
      return `blob:${path}`;
    });

    const snapshot = await readWhiteboardBoard('/notesRoot', entry);

    expect(snapshot?.elements.every((element) => Boolean(element.imageSrc))).toBe(true);
    expect(maxActiveLoads).toBeLessThanOrEqual(WHITEBOARD_ASSET_HYDRATION_CONCURRENCY);
  });

  it('writes imported images into the board assets folder', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Sketch');
    const file = {
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      name: 'Demo:Image.png',
    } as File;

    const assetPath = await writeWhiteboardAsset('/notesRoot', entry, file);
    expect(assetPath).toMatch(/^assets\/DemoImage-[0-9a-f-]+\.png$/);
    expect(mocks.files.get(`${SYSTEM_ROOT}/boards/sketch/${assetPath}`)).toBe('binary:1,2,3');
  });

  it('keeps concurrent same-name image assets in distinct files', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Sketch');
    let releaseFirstWrite: () => void = () => undefined;
    let markFirstWriteStarted: () => void = () => undefined;
    const firstWriteStarted = new Promise<void>((resolve) => { markFirstWriteStarted = resolve; });
    const firstWriteGate = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
    mocks.storage.writeBinaryFile.mockImplementationOnce(async (path: string, content: Uint8Array) => {
      markFirstWriteStarted();
      await firstWriteGate;
      mocks.files.set(normalizePath(path, true), `binary:${Array.from(content).join(',')}`);
    });
    const firstFile = { arrayBuffer: async () => new Uint8Array([1]).buffer, name: 'Same.png' } as File;
    const secondFile = { arrayBuffer: async () => new Uint8Array([2]).buffer, name: 'Same.png' } as File;

    const firstWrite = writeWhiteboardAsset('/notesRoot', entry, firstFile);
    await firstWriteStarted;
    const secondWrite = writeWhiteboardAsset('/notesRoot', entry, secondFile);
    releaseFirstWrite();
    const [firstPath, secondPath] = await Promise.all([firstWrite, secondWrite]);

    expect(firstPath).not.toBe(secondPath);
    expect(mocks.files.get(`${SYSTEM_ROOT}/boards/sketch/${firstPath}`)).toBe('binary:1');
    expect(mocks.files.get(`${SYSTEM_ROOT}/boards/sketch/${secondPath}`)).toBe('binary:2');
  });

  it('uses the image MIME type when an imported asset has no extension', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Sketch');
    const file = {
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      name: 'clipboard-image',
      type: 'image/png',
    } as File;

    await expect(writeWhiteboardAsset('/notesRoot', entry, file)).resolves.toMatch(/^assets\/clipboard-image-[0-9a-f-]+\.png$/);
  });

  it('rejects oversized assets before reading their bytes', async () => {
    const { entry } = await createWhiteboardEntry('/notesRoot', 'Sketch');
    const arrayBuffer = vi.fn();
    const file = { arrayBuffer, name: 'large.png', size: 50 * 1024 * 1024 + 1 } as unknown as File;

    await expect(writeWhiteboardAsset('/notesRoot', entry, file)).rejects.toThrow('too large');
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

});
