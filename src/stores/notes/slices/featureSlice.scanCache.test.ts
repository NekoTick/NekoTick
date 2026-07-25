import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createFeatureSlice } from './featureSlice';
import type { NotesStore } from '../types';
import { createCachedNoteContentEntry } from '../document/noteContentCache';

const MAX_SEARCHABLE_NOTE_BYTES = 512 * 1024;

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('@/lib/storage/adapter', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage/adapter')>('@/lib/storage/adapter');
  return {
    ...actual,
    getStorageAdapter: () => ({
      readFile: mocks.readFile,
      stat: mocks.stat,
    }),
  };
});

function createNotesStore(overrides: Partial<NotesStore> = {}) {
  const baseState = {
    rootFolder: {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [],
    },
    currentNote: null,
    currentNoteRevision: 0,
    currentNoteDiskRevision: 0,
    notesPath: '/notesRoot',
    isDirty: false,
    isLoading: false,
    error: null,
    recentNotes: [],
    openTabs: [],
    recentlyClosedTabs: [],
    noteContentsCache: new Map(),
    draftNotes: {},
    starredEntries: [],
    starredNotes: [],
    starredFolders: [],
    starredLoaded: true,
    pendingStarredNavigation: null,
    noteMetadata: { version: 2, notes: {} },
    noteIconSize: 60,
    displayNames: new Map(),
    isNewlyCreated: false,
    pendingDraftDiscardPath: null,
    pendingDeletedItems: [],
    newlyCreatedFolderPath: null,
    assetList: [],
    isLoadingAssets: false,
    uploadProgress: null,
    fileTreeSortMode: 'name-asc' as const,
    saveNote: vi.fn(async () => undefined),
  };

  return createStore<NotesStore>()((set, get, api) => ({
    ...(baseState as unknown as NotesStore),
    ...(createFeatureSlice(set, get, api) as unknown as NotesStore),
    ...(overrides as NotesStore),
  }));
}

describe('featureSlice scan cache validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stat.mockResolvedValue({ isFile: true, size: 7 });
    mocks.readFile.mockResolvedValue('# Disk!');
  });

  it('does not reuse scanned note content when stat has size but no modified time', async () => {
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: notePath,
            name: 'alpha.md',
            path: notePath,
            isFolder: false,
          },
        ],
      },
      noteContentsCache: new Map([
        [notePath, createCachedNoteContentEntry('# Cache', null, { size: 7 })],
      ]),
    });

    await store.getState().scanAllNotes();

    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/docs/alpha.md', MAX_SEARCHABLE_NOTE_BYTES);
    expect(store.getState().noteContentsCache.get(notePath)).toEqual({
      content: '# Disk!',
      modifiedAt: null,
    });
    expect(store.getState().noteContentsCache.get(notePath)?.size).toBe(7);
  });

  it('reuses a recently validated scan entry without another stat call', async () => {
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [{ id: notePath, name: 'alpha.md', path: notePath, isFolder: false }],
      },
      noteContentsCache: new Map([[
        notePath,
        createCachedNoteContentEntry('# Cache', 2, {
          freshUntil: Date.now() + 10_000,
          size: 7,
        }),
      ]]),
    });

    await store.getState().scanAllNotes();

    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(store.getState().noteContentsCache.get(notePath)?.content).toBe('# Cache');
  });

  it('preserves the raw disk baseline while scanning normalized markdown', async () => {
    mocks.stat.mockResolvedValue({ isFile: true, modifiedAt: 2, size: 9 });
    mocks.readFile.mockResolvedValue('# Disk!\r\n');
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [{ id: notePath, name: 'alpha.md', path: notePath, isFolder: false }],
      },
    });

    await store.getState().scanAllNotes();

    const entry = store.getState().noteContentsCache.get(notePath);
    expect(entry?.content).toBe('# Disk!\n');
    expect(entry?.savedContent).toBe('# Disk!\r\n');
  });

  it('does not reuse scanned note content when stat has an invalid modified time', async () => {
    mocks.stat.mockResolvedValue({ isFile: true, modifiedAt: Number.POSITIVE_INFINITY, size: 7 });
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: notePath,
            name: 'alpha.md',
            path: notePath,
            isFolder: false,
          },
        ],
      },
      noteContentsCache: new Map([
        [notePath, createCachedNoteContentEntry('# Cache', 2, { size: 7 })],
      ]),
    });

    await store.getState().scanAllNotes();

    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/docs/alpha.md', MAX_SEARCHABLE_NOTE_BYTES);
    expect(store.getState().noteContentsCache.get(notePath)).toEqual({
      content: '# Disk!',
      modifiedAt: null,
    });
    expect(store.getState().noteContentsCache.get(notePath)?.size).toBe(7);
  });

  it('does not reuse scanned note content when stat has no modified time or size', async () => {
    mocks.stat.mockResolvedValue({ isFile: true });
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: notePath,
            name: 'alpha.md',
            path: notePath,
            isFolder: false,
          },
        ],
      },
      noteContentsCache: new Map([
        [notePath, createCachedNoteContentEntry('# Cache', null)],
      ]),
    });

    await store.getState().scanAllNotes();

    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/docs/alpha.md', MAX_SEARCHABLE_NOTE_BYTES);
    expect(store.getState().noteContentsCache.get(notePath)).toEqual({
      content: '# Disk!',
      modifiedAt: null,
    });
    expect(store.getState().noteContentsCache.get(notePath)?.size).toBeNull();
  });

  it('does not read or reuse scanned note content when stat size is invalid', async () => {
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: -1 });
    mocks.readFile.mockResolvedValue('# Disk!');
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: notePath,
            name: 'alpha.md',
            path: notePath,
            isFolder: false,
          },
        ],
      },
      noteContentsCache: new Map([
        [notePath, createCachedNoteContentEntry('# Cache', 2, { size: -1 })],
      ]),
    });

    await store.getState().scanAllNotes();

    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(store.getState().noteContentsCache.has(notePath)).toBe(false);
  });

  it('rereads a nonempty file when its cached scan content is empty', async () => {
    mocks.stat.mockResolvedValue({ isFile: true, modifiedAt: 2, size: 7 });
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [{
          id: notePath,
          name: 'alpha.md',
          path: notePath,
          isFolder: false,
        }],
      },
      noteContentsCache: new Map([
        [notePath, createCachedNoteContentEntry('', 2, { size: 7 })],
      ]),
    });

    await store.getState().scanAllNotes();

    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/docs/alpha.md', MAX_SEARCHABLE_NOTE_BYTES);
    expect(store.getState().noteContentsCache.get(notePath)?.content).toBe('# Disk!');
  });

  it('reads priority paths before ordinary paths', async () => {
    const paths = Array.from({ length: 12 }, (_, index) => `note-${index}.md`);
    const store = createNotesStore({
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: paths.map((path) => ({
          id: path,
          name: path,
          path,
          isFolder: false as const,
        })),
      },
    });

    await store.getState().scanAllNotes({ priorityPaths: ['note-11.md', 'note-10.md'] });

    expect(mocks.readFile.mock.calls.slice(0, 2).map(([path]) => path)).toEqual([
      '/notesRoot/note-10.md',
      '/notesRoot/note-11.md',
    ]);
  });

  it('publishes priority content before the remaining scan finishes', async () => {
    const paths = Array.from({ length: 40 }, (_, index) => `note-${index}.md`);
    const priorityPaths = paths.slice(0, 32);
    const store = createNotesStore({
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: paths.map((path) => ({
          id: path,
          name: path,
          path,
          isFolder: false as const,
        })),
      },
    });
    let cacheAtPriorityReady!: NotesStore['noteContentsCache'];

    await store.getState().scanAllNotes({
      priorityPaths,
      onPriorityPathsScanned: () => {
        cacheAtPriorityReady = new Map(store.getState().noteContentsCache);
      },
    });

    expect(cacheAtPriorityReady?.size).toBe(32);
    expect(cacheAtPriorityReady?.has('note-0.md')).toBe(true);
    expect(cacheAtPriorityReady?.has('note-39.md')).toBe(false);
    expect(store.getState().noteContentsCache.size).toBe(40);
  });

  it('rejects without publishing an empty priority snapshot when every readable note fails', async () => {
    const paths = ['alpha.md', 'beta.md'];
    const store = createNotesStore({
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: paths.map((path) => ({
          id: path,
          name: path,
          path,
          isFolder: false as const,
        })),
      },
    });
    const onPriorityPathsScanned = vi.fn();
    mocks.readFile.mockRejectedValue(new Error('storage unavailable'));

    await expect(store.getState().scanAllNotes({
      priorityPaths: paths,
      onPriorityPathsScanned,
    })).rejects.toThrow('Unable to read any scannable notes');

    expect(onPriorityPathsScanned).not.toHaveBeenCalled();
    expect(store.getState().noteContentsCache.size).toBe(0);
  });

  it('keeps successfully read notes when only part of a scan fails', async () => {
    const paths = ['alpha.md', 'beta.md'];
    const store = createNotesStore({
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: paths.map((path) => ({
          id: path,
          name: path,
          path,
          isFolder: false as const,
        })),
      },
    });
    mocks.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/beta.md')) throw new Error('missing');
      return '# Alpha';
    });

    await store.getState().scanAllNotes();

    expect(store.getState().noteContentsCache.get('alpha.md')?.content).toBe('# Alpha');
    expect(store.getState().noteContentsCache.has('beta.md')).toBe(false);
  });

  it('does not spend full-notesRoot scan traversal priority on non-markdown siblings before markdown notes', async () => {
    const store = createNotesStore({
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: 'early.md',
            name: 'early.md',
            path: 'early.md',
            isFolder: false,
          },
          ...Array.from({ length: 19_999 }, (_, index) => ({
            id: `asset-${index}.png`,
            name: `asset-${index}.png`,
            path: `asset-${index}.png`,
            isFolder: false as const,
          })),
          {
            id: 'late.md',
            name: 'late.md',
            path: 'late.md',
            isFolder: false,
          },
        ],
      },
    });

    await store.getState().scanAllNotes();

    expect(mocks.stat).toHaveBeenCalledTimes(2);
    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/early.md', MAX_SEARCHABLE_NOTE_BYTES);
    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/late.md', MAX_SEARCHABLE_NOTE_BYTES);
    expect(store.getState().noteContentsCache.has('early.md')).toBe(true);
    expect(store.getState().noteContentsCache.has('late.md')).toBe(true);
  });
});
