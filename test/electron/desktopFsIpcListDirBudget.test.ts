import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  opendir: vi.fn(),
  assertAuthorizedFsPath: vi.fn(async (filePath: string) => filePath),
  assertAuthorizedFsRenameTarget: vi.fn(),
  assertAuthorizedFsWatchPath: vi.fn(),
  normalizeFsPathForAccess: vi.fn((filePath: string) => filePath),
  updateAuthorizedRootRename: vi.fn(),
}));

vi.mock('electron', () => ({
  default: {
    app: {
      getPath: vi.fn((name: string) => {
        if (name === 'userData') return '/tmp/vlaina-user-data';
        if (name === 'temp') return '/tmp';
        if (name === 'home') return '/home/test';
        return '/tmp/vlaina-user-data';
      }),
    },
    BrowserWindow: vi.fn(),
    clipboard: {
      writeText: vi.fn(),
      writeImage: vi.fn(),
    },
    dialog: {},
    nativeImage: {
      createFromDataURL: vi.fn(() => ({ isEmpty: () => false })),
    },
    shell: {
      openExternal: vi.fn(),
      openPath: vi.fn(),
      trashItem: vi.fn(),
      showItemInFolder: vi.fn(),
    },
  },
}));

vi.mock('node:fs/promises', () => {
  const fsPromises = {
    copyFile: vi.fn(),
    mkdtemp: vi.fn(),
    mkdir: vi.fn(),
    open: vi.fn(),
    opendir: mocks.opendir,
    readFile: vi.fn(),
    rename: vi.fn(),
    rm: vi.fn(),
    stat: vi.fn(),
    writeFile: vi.fn(),
  };
  return {
    ...fsPromises,
    default: fsPromises,
  };
});

vi.mock('../../electron/fsAccess.mjs', () => ({
  assertAuthorizedFsPath: mocks.assertAuthorizedFsPath,
  assertAuthorizedFsRenameTarget: mocks.assertAuthorizedFsRenameTarget,
  assertAuthorizedFsWatchPath: mocks.assertAuthorizedFsWatchPath,
  authorizeFsPath: vi.fn(),
  normalizeFsPathForAccess: mocks.normalizeFsPathForAccess,
  updateAuthorizedRootRename: mocks.updateAuthorizedRootRename,
}));

import { registerDesktopIpc } from '../../electron/desktopIpc.mjs';

function registerHarness() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();

  registerDesktopIpc({
    handleIpc: (name: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(name, handler);
    },
    handleSyncIpc: vi.fn(),
    normalizeExternalUrl: (url: string) => url,
    resolveTargetWindow: vi.fn(() => null),
    requireNonEmptyString: (value: string) => value,
    requireStringArray: (value: string[]) => value,
  });

  return { handlers };
}

function createFileDirent(name: string) {
  return {
    name,
    isSymbolicLink: () => false,
    isDirectory: () => false,
    isFile: () => true,
  };
}

function createDirectoryDirent(name: string) {
  return {
    name,
    isSymbolicLink: () => false,
    isDirectory: () => true,
    isFile: () => false,
  };
}

function createSymlinkDirent(name: string) {
  return {
    name,
    isSymbolicLink: () => true,
    isDirectory: () => false,
    isFile: () => false,
  };
}

type MockDirectoryEntry = {
  name: string;
  isSymbolicLink?: () => boolean;
  isDirectory?: () => boolean;
  isFile?: () => boolean;
};

function createDirectoryHandle(entries: MockDirectoryEntry[]) {
  let nextIndex = 0;
  const close = vi.fn(async () => {});
  return {
    close,
    get yieldedCount() {
      return nextIndex;
    },
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          if (nextIndex >= entries.length) {
            return { done: true, value: undefined };
          }
          const value = entries[nextIndex];
          nextIndex += 1;
          return { done: false, value };
        },
        return: async () => ({ done: true, value: undefined }),
      };
    },
  };
}

describe('desktop filesystem list directory budget', () => {
  it('honors a small caller limit without scanning the entire directory', async () => {
    const directoryHandle = createDirectoryHandle([
      ...Array.from({ length: 1023 }, (_value, index) =>
        createFileDirent(`asset-${String(index).padStart(4, '0')}.png`)
      ),
      createFileDirent('late.md'),
      createFileDirent('unscanned.md'),
    ]);
    mocks.opendir.mockResolvedValueOnce(directoryHandle);
    const { handlers } = registerHarness();

    const entries = await handlers.get('desktop:fs:list-dir')?.({}, '/notesRoot', 256);

    expect(entries).toHaveLength(256);
    expect(directoryHandle.yieldedCount).toBe(1024);
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'late.md' }),
    ]));
    expect(entries).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'unscanned.md' }),
    ]));
  });

  it('caps single-directory listings before describing overflow entries', async () => {
    mocks.opendir.mockResolvedValueOnce(createDirectoryHandle([
      ...Array.from({ length: 20_000 }, (_value, index) =>
        createFileDirent(`note-${String(index).padStart(5, '0')}.md`)
      ),
      {
        name: 'overflow.md',
        isSymbolicLink: () => {
          throw new Error('overflow entry should not be described');
        },
      },
    ]));
    const { handlers } = registerHarness();

    const entries = await handlers.get('desktop:fs:list-dir')?.({}, '/notesRoot');

    expect(entries).toHaveLength(20_000);
    expect(entries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'overflow.md' }),
      ]),
    );
  });

  it('prioritizes markdown entries before applying the single-directory cap', async () => {
    mocks.opendir.mockResolvedValueOnce(createDirectoryHandle([
      ...Array.from({ length: 20_000 }, (_value, index) =>
        createFileDirent(`asset-${String(index).padStart(5, '0')}.png`)
      ),
      createFileDirent('late.md'),
    ]));
    const { handlers } = registerHarness();

    const entries = await handlers.get('desktop:fs:list-dir')?.({}, '/notesRoot');

    expect(entries).toHaveLength(20_000);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'late.md' }),
      ]),
    );
    expect(entries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'asset-19999.png' }),
      ]),
    );
  });

  it('prioritizes markdown entries before directories when applying the single-directory cap', async () => {
    mocks.opendir.mockResolvedValueOnce(createDirectoryHandle([
      ...Array.from({ length: 20_000 }, (_value, index) =>
        createDirectoryDirent(`folder-${String(index).padStart(5, '0')}`)
      ),
      createFileDirent('late.md'),
    ]));
    const { handlers } = registerHarness();

    const entries = await handlers.get('desktop:fs:list-dir')?.({}, '/notesRoot');

    expect(entries).toHaveLength(20_000);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'late.md' }),
      ]),
    );
    expect(entries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'folder-19999' }),
      ]),
    );
  });

  it('keeps generated-looking directories low priority when applying the single-directory cap', async () => {
    mocks.opendir.mockResolvedValueOnce(createDirectoryHandle([
      ...Array.from({ length: 19_999 }, (_value, index) =>
        createDirectoryDirent(`folder-${String(index).padStart(5, '0')}`)
      ),
      createDirectoryDirent('node_modules'),
      createFileDirent('late.md'),
    ]));
    const { handlers } = registerHarness();

    const entries = await handlers.get('desktop:fs:list-dir')?.({}, '/notesRoot');

    expect(entries).toHaveLength(20_000);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'late.md' }),
      ]),
    );
    expect(entries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'node_modules' }),
      ]),
    );
  });

  it('keeps unsafe markdown-looking names low priority when applying the single-directory cap', async () => {
    mocks.opendir.mockResolvedValueOnce(createDirectoryHandle([
      ...Array.from({ length: 20_000 }, (_value, index) =>
        createFileDirent(`unsafe-${String(index).padStart(5, '0')}\u0001.md`)
      ),
      createFileDirent('late.md'),
    ]));
    const { handlers } = registerHarness();

    const entries = await handlers.get('desktop:fs:list-dir')?.({}, '/notesRoot');

    expect(entries).toHaveLength(20_000);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'late.md' }),
      ]),
    );
    expect(entries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'unsafe-19999\u0001.md' }),
      ]),
    );
  });

  it('keeps symlink directory candidates before ordinary files when applying the single-directory cap', async () => {
    mocks.opendir.mockResolvedValueOnce(createDirectoryHandle([
      ...Array.from({ length: 20_000 }, (_value, index) =>
        createFileDirent(`asset-${String(index).padStart(5, '0')}.png`)
      ),
      createSymlinkDirent('linked-docs'),
    ]));
    const { handlers } = registerHarness();

    const entries = await handlers.get('desktop:fs:list-dir')?.({}, '/notesRoot');

    expect(entries).toHaveLength(20_000);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'linked-docs' }),
      ]),
    );
    expect(entries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'asset-19999.png' }),
      ]),
    );
  });

  it('stops scanning oversized directories at a bounded budget', async () => {
    const directoryHandle = createDirectoryHandle([
      ...Array.from({ length: 40_000 }, (_value, index) =>
        createFileDirent(`asset-${String(index).padStart(5, '0')}.png`)
      ),
      createFileDirent('unscanned.md'),
    ]);
    mocks.opendir.mockResolvedValueOnce(directoryHandle);
    const { handlers } = registerHarness();

    const entries = await handlers.get('desktop:fs:list-dir')?.({}, '/notesRoot');

    expect(entries).toHaveLength(20_000);
    expect(directoryHandle.yieldedCount).toBe(40_000);
    expect(directoryHandle.close).toHaveBeenCalledTimes(1);
    expect(entries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'unscanned.md' }),
      ]),
    );
  });
});
