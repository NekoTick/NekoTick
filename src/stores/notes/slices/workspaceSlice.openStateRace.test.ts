import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createWorkspaceSlice } from './workspaceSlice';
import type { NotesStore } from '../types';

const storageAdapter = vi.hoisted(() => ({
  stat: vi.fn<(path: string) => Promise<{ isFile?: boolean; isDirectory?: boolean; modifiedAt?: number | null; size?: number | null } | null>>(),
  readFile: vi.fn<(path: string) => Promise<string>>(),
}));

const hoisted = vi.hoisted(() => ({
  persistWorkspaceSnapshot: vi.fn(),
}));

vi.mock('../workspacePersistence', () => ({
  persistWorkspaceSnapshot: hoisted.persistWorkspaceSnapshot,
}));

vi.mock('../pendingEditorMarkdownFlusher', () => ({
  flushCurrentPendingEditorMarkdown: vi.fn(),
}));

vi.mock('@/lib/storage/adapter', () => ({
  getStorageAdapter: () => storageAdapter,
  isAbsolutePath: (path: string) => path.startsWith('/'),
  joinPath: (...segments: string[]) => Promise.resolve(segments.join('/').replace(/\/+/g, '/')),
  normalizeAbsolutePath: (path: string) => {
    if (!path.startsWith('/')) return path;
    const parts: string[] = [];
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        parts.pop();
        continue;
      }
      parts.push(part);
    }
    return `/${parts.join('/')}`;
  },
}));

function createNotesStore(overrides: Partial<NotesStore> = {}) {
  const baseState = {
    rootFolder: null,
    rootFolderPath: null,
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
    noteContentsCacheRevision: 0,
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
  };

  return createStore<NotesStore>()((set, get, api) => ({
    ...(baseState as unknown as NotesStore),
    ...(createWorkspaceSlice(set, get, api) as unknown as NotesStore),
    ...(overrides as NotesStore),
  }));
}

describe('workspace note open state races', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageAdapter.stat.mockResolvedValue({ isFile: true, modifiedAt: 2, size: 11 });
  });

  afterEach(() => {
    delete (window as any).vlainaDesktop;
  });

  it('opens recovered content as dirty while preserving the disk baseline', async () => {
    const readNoteRecovery = vi.fn().mockResolvedValue({
      content: '# Recovered edit',
      diskMatchesBaseline: true,
      draft: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    (window as any).vlainaDesktop = {
      platform: 'electron',
      app: { readNoteRecovery },
    };
    storageAdapter.readFile.mockResolvedValue('# Saved disk');
    const store = createNotesStore();

    await store.getState().openNote('alpha.md');

    expect(store.getState().currentNote).toEqual({
      path: 'alpha.md',
      content: '# Recovered edit',
    });
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toContainEqual({
      path: 'alpha.md',
      name: 'alpha',
      isDirty: true,
    });
    expect(store.getState().noteContentsCache.get('alpha.md')?.savedContent).toBe('# Saved disk');
    expect(readNoteRecovery).toHaveBeenCalledWith({
      notesPath: '/notesRoot',
      notePath: 'alpha.md',
      currentDiskContent: '# Saved disk',
    });
  });

  it('marks a disk-diverged recovery as a save-blocking conflict', async () => {
    (window as any).vlainaDesktop = {
      platform: 'electron',
      app: {
        readNoteRecovery: vi.fn().mockResolvedValue({
          content: '# Recovered edit',
          diskMatchesBaseline: false,
          draft: null,
          updatedAt: '2026-08-01T00:00:00.000Z',
        }),
      },
    };
    storageAdapter.readFile.mockResolvedValue('# Changed disk');
    const store = createNotesStore();

    await store.getState().openNote('alpha.md');

    expect(store.getState().currentNote?.content).toContain('# Recovered edit');
    expect(store.getState().currentNote?.content).toContain('# Changed disk');
    expect(store.getState().saveErrorPath).toBe('alpha.md');
    expect(store.getState().saveError).toContain('Review or edit');
  });

  it('does not overwrite a notesRoot tab that becomes dirty while it is opening', async () => {
    let resolveRead: ((content: string) => void) | undefined;
    storageAdapter.readFile.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRead = resolve;
    }));
    const store = createNotesStore({
      currentNote: { path: 'alpha.md', content: '# alpha' },
      openTabs: [
        { path: 'alpha.md', name: 'alpha', isDirty: false },
        { path: 'beta.md', name: 'beta', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['alpha.md', { content: '# alpha', modifiedAt: 1 }],
      ]),
    });

    const open = store.getState().openNote('beta.md');
    await new Promise((resolve) => setTimeout(resolve, 0));
    store.setState((state) => ({
      openTabs: state.openTabs.map((tab) =>
        tab.path === 'beta.md' ? { ...tab, isDirty: true } : tab
      ),
      noteContentsCache: new Map(state.noteContentsCache).set('beta.md', {
        content: '# unsaved beta',
        modifiedAt: 1,
      }),
    }));

    resolveRead?.('# disk beta');
    await open;

    expect(store.getState().currentNote).toEqual({ path: 'beta.md', content: '# unsaved beta' });
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs.find((tab) => tab.path === 'beta.md')?.isDirty).toBe(true);
    const betaCacheEntry = store.getState().noteContentsCache.get('beta.md');
    expect(betaCacheEntry).toEqual({ content: '# unsaved beta', modifiedAt: 2 });
    expect(betaCacheEntry?.savedContent).toBe('# disk beta');
  });

  it('preserves the raw disk baseline when opening normalized markdown', async () => {
    storageAdapter.readFile.mockResolvedValue('# beta\r\n');
    const store = createNotesStore();

    await store.getState().openNote('beta.md');

    const betaCacheEntry = store.getState().noteContentsCache.get('beta.md');
    expect(store.getState().currentNote).toEqual({ path: 'beta.md', content: '# beta\n' });
    expect(betaCacheEntry?.content).toBe('# beta\n');
    expect(betaCacheEntry?.savedContent).toBe('# beta\r\n');
  });

  it('does not overwrite an absolute tab that becomes dirty while it is opening', async () => {
    let resolveRead: ((content: string) => void) | undefined;
    storageAdapter.readFile.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRead = resolve;
    }));
    const absolutePath = '/outside/beta.md';
    const store = createNotesStore({
      currentNote: { path: 'alpha.md', content: '# alpha' },
      openTabs: [
        { path: 'alpha.md', name: 'alpha', isDirty: false },
        { path: absolutePath, name: 'beta', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['alpha.md', { content: '# alpha', modifiedAt: 1 }],
      ]),
    });

    const open = store.getState().openNoteByAbsolutePath(absolutePath);
    await new Promise((resolve) => setTimeout(resolve, 0));
    store.setState((state) => ({
      openTabs: state.openTabs.map((tab) =>
        tab.path === absolutePath ? { ...tab, isDirty: true } : tab
      ),
      noteContentsCache: new Map(state.noteContentsCache).set(absolutePath, {
        content: '# unsaved outside beta',
        modifiedAt: 1,
      }),
    }));

    resolveRead?.('# disk outside beta');
    await open;

    expect(store.getState().currentNote).toEqual({
      path: absolutePath,
      content: '# unsaved outside beta',
    });
    expect(store.getState().isDirty).toBe(true);
    const betaCacheEntry = store.getState().noteContentsCache.get(absolutePath);
    expect(betaCacheEntry).toEqual({ content: '# unsaved outside beta', modifiedAt: 2 });
    expect(betaCacheEntry?.savedContent).toBe('# disk outside beta');
  });

  it('preserves the original disk baseline when opening normalized markdown', async () => {
    const absolutePath = '/outside/alpha.md';
    const diskContent = ['# Alpha', '<br data-vlaina-empty-line="true"/>', 'Body'].join('\n');
    storageAdapter.stat.mockResolvedValue({
      isFile: true,
      modifiedAt: 2,
      size: diskContent.length,
    });
    storageAdapter.readFile.mockResolvedValue(diskContent);
    const store = createNotesStore();

    await store.getState().openNoteByAbsolutePath(absolutePath);

    const cacheEntry = store.getState().noteContentsCache.get(absolutePath);
    expect(store.getState().currentNote?.content).toBe(['# Alpha', '', 'Body'].join('\n'));
    expect(cacheEntry?.content).toBe(['# Alpha', '', 'Body'].join('\n'));
    expect(cacheEntry?.savedContent).toBe(diskContent);
  });
});
