import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createWorkspaceSlice } from './workspaceSlice';
import { markExternalPathDeletion } from '../document/externalPathMutationRegistry';
import type { NotesStore } from '../types';
import { NOTE_RECOVERY_CONFLICT_ERROR } from '../noteRecovery';

const mocks = vi.hoisted(() => ({
  chooseDraftSavePath: vi.fn(),
  dispatchOpenMarkdownTargetEvent: vi.fn(),
  persistWorkspaceSnapshot: vi.fn(),
  saveNoteDocument: vi.fn(),
  storageExists: vi.fn(),
  flushCurrentPendingEditorMarkdown: vi.fn(),
}));

vi.mock('../draftNoteSave', async () => {
  const actual = await vi.importActual<typeof import('../draftNoteSave')>('../draftNoteSave');
  return {
    ...actual,
    chooseDraftSavePath: mocks.chooseDraftSavePath,
  };
});

vi.mock('../document/noteDocumentPersistence', () => ({
  saveNoteDocument: mocks.saveNoteDocument,
}));

vi.mock('../workspacePersistence', () => ({
  persistWorkspaceSnapshot: mocks.persistWorkspaceSnapshot,
}));

vi.mock('../pendingEditorMarkdownFlusher', () => ({
  flushCurrentPendingEditorMarkdown: mocks.flushCurrentPendingEditorMarkdown,
}));

vi.mock('@/components/Notes/features/OpenTarget/openTargetEvents', () => ({
  dispatchOpenMarkdownTargetEvent: mocks.dispatchOpenMarkdownTargetEvent,
}));

vi.mock('@/lib/storage/adapter', () => ({
  getStorageAdapter: () => ({
    exists: mocks.storageExists,
  }),
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
  normalizePath: (path: string) => path.replace(/\\/g, '/'),
  relativePath: (base: string, target: string) =>
    target.replace(/\\/g, '/').replace(`${base.replace(/\\/g, '/').replace(/\/+$/, '')}/`, ''),
  getParentPath: (path: string) => {
    const index = path.replace(/\\/g, '/').lastIndexOf('/');
    return index <= 0 ? '' : path.slice(0, index);
  },
}));

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

describe('workspace document actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chooseDraftSavePath.mockResolvedValue('/notesRoot/Untitled.md');
    mocks.saveNoteDocument.mockResolvedValue({
      content: 'draft text',
      metadata: { updatedAt: 1 },
      modifiedAt: 1,
      nextCache: new Map([['Untitled.md', { content: 'draft text', modifiedAt: 1 }]]),
    });
    mocks.storageExists.mockResolvedValue(false);
    mocks.persistWorkspaceSnapshot.mockReturnValue(undefined);
    mocks.flushCurrentPendingEditorMarkdown.mockReturnValue(false);
  });

  it('requires an explicit save for an unreviewed recovery conflict', async () => {
    const store = createNotesStore({
      currentNote: { path: 'alpha.md', content: 'recovered conflict document' },
      isDirty: true,
      saveError: NOTE_RECOVERY_CONFLICT_ERROR,
      saveErrorPath: 'alpha.md',
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: true }],
      noteContentsCache: new Map([
        ['alpha.md', { content: 'recovered conflict document', modifiedAt: 1 }],
      ]),
    });

    await store.getState().saveNote();
    expect(mocks.saveNoteDocument).not.toHaveBeenCalled();
    expect(store.getState().isDirty).toBe(true);

    await store.getState().saveNote({ explicit: true });
    expect(mocks.saveNoteDocument).toHaveBeenCalledTimes(1);
  });

  it('keeps the regular note cache stable while editing the current note', () => {
    const noteContentsCache = new Map([
      ['alpha.md', { content: '# Saved alpha', modifiedAt: 1 }],
      ...Array.from({ length: 250 }, (_value, index) => [
        `cached-${index}.md`,
        { content: `Cached ${index}`, modifiedAt: index + 2 },
      ] as const),
    ]);
    const store = createNotesStore({
      currentNote: { path: 'alpha.md', content: '# Saved alpha' },
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache,
    });

    store.getState().updateContent('# Edited alpha');

    expect(store.getState().currentNote?.content).toBe('# Edited alpha');
    expect(store.getState().noteContentsCache).toBe(noteContentsCache);
    expect(store.getState().noteContentsCache.get('alpha.md')?.content).toBe('# Saved alpha');
    expect(store.getState().openTabs[0]?.isDirty).toBe(true);
  });

  it('keeps draft edits in the current note without cloning the content cache', () => {
    const noteContentsCache = new Map([
      ['draft:blank', { content: '', modifiedAt: null }],
    ]);
    const store = createNotesStore({
      currentNote: { path: 'draft:blank', content: '' },
      openTabs: [{ path: 'draft:blank', name: '', isDirty: true }],
      draftNotes: {
        'draft:blank': { parentPath: null, name: '' },
      },
      noteContentsCache,
    });

    store.getState().updateContent('Draft body');

    expect(store.getState().currentNote?.content).toBe('Draft body');
    expect(store.getState().noteContentsCache).toBe(noteContentsCache);
    expect(store.getState().noteContentsCache.get('draft:blank')?.content).toBe('');
  });

  it('keeps the active tab dirty when a draft save fails after the file write step', async () => {
    mocks.persistWorkspaceSnapshot.mockImplementation(() => {
      throw new Error('snapshot failed');
    });
    const store = createNotesStore({
      notesPath: '',
      currentNote: { path: 'draft:blank', content: 'draft text' },
      isDirty: true,
      openTabs: [{ path: 'draft:blank', name: '', isDirty: true }],
      draftNotes: {
        'draft:blank': { parentPath: null, name: '' },
      },
      noteContentsCache: new Map([['draft:blank', { content: 'draft text', modifiedAt: null }]]),
    });

    await store.getState().saveNote({ explicit: true });

    expect(store.getState().error).toBe('snapshot failed');
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([{ path: '/notesRoot/Untitled.md', name: 'Untitled', isDirty: true }]);
  });

  it('remaps draft navigation history to the saved markdown path', async () => {
    const store = createNotesStore({
      currentNote: { path: 'draft:blank', content: 'draft text' },
      isDirty: true,
      openTabs: [{ path: 'draft:blank', name: '', isDirty: true }],
      draftNotes: {
        'draft:blank': { parentPath: null, name: '' },
      },
      noteContentsCache: new Map([['draft:blank', { content: 'draft text', modifiedAt: null }]]),
      noteNavigationHistory: ['alpha.md', 'draft:blank'],
      noteNavigationHistoryIndex: 1,
    });

    await store.getState().saveNote({ explicit: true });

    expect(store.getState().currentNote?.path).toBe('Untitled.md');
    expect(store.getState().noteNavigationHistory).toEqual(['alpha.md', 'Untitled.md']);
    expect(store.getState().noteNavigationHistoryIndex).toBe(1);
  });

  it('does not invalidate cached content for a dirty background tab', () => {
    const store = createNotesStore({
      currentNote: { path: 'beta.md', content: '# beta' },
      isDirty: false,
      openTabs: [
        { path: 'alpha.md', name: 'alpha', isDirty: true },
        { path: 'beta.md', name: 'beta', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['alpha.md', { content: 'Unsaved alpha', modifiedAt: 1 }],
        ['beta.md', { content: '# beta', modifiedAt: 2 }],
      ]),
    });

    store.getState().invalidateNoteCache('alpha.md');

    expect(store.getState().noteContentsCache.get('alpha.md')).toEqual({
      content: 'Unsaved alpha',
      modifiedAt: 1,
    });
  });

  it('invalidates cached content for a clean background tab', () => {
    const store = createNotesStore({
      currentNote: { path: 'beta.md', content: '# beta' },
      isDirty: false,
      openTabs: [
        { path: 'alpha.md', name: 'alpha', isDirty: false },
        { path: 'beta.md', name: 'beta', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['alpha.md', { content: '# alpha', modifiedAt: 1 }],
        ['beta.md', { content: '# beta', modifiedAt: 2 }],
      ]),
    });

    store.getState().invalidateNoteCache('alpha.md');

    expect(store.getState().noteContentsCache.has('alpha.md')).toBe(false);
    expect(store.getState().noteContentsCache.get('beta.md')).toEqual({
      content: '# beta',
      modifiedAt: 2,
    });
  });

  it('invalidates descendant cached content while preserving current and dirty tabs', () => {
    const store = createNotesStore({
      currentNote: { path: 'docs/current.md', content: '# current' },
      isDirty: false,
      openTabs: [
        { path: 'docs/current.md', name: 'current', isDirty: false },
        { path: 'docs/dirty.md', name: 'dirty', isDirty: true },
        { path: 'docs/clean.md', name: 'clean', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['docs/current.md', { content: '# current', modifiedAt: 1 }],
        ['docs/dirty.md', { content: 'Unsaved dirty', modifiedAt: 2 }],
        ['docs/clean.md', { content: '# clean', modifiedAt: 3 }],
        ['docs/nested/other.md', { content: '# other', modifiedAt: 4 }],
        ['outside.md', { content: '# outside', modifiedAt: 5 }],
      ]),
    });

    store.getState().invalidateNoteCache('docs', { includeDescendants: true });

    expect(store.getState().noteContentsCache.get('docs/current.md')).toEqual({
      content: '# current',
      modifiedAt: 1,
    });
    expect(store.getState().noteContentsCache.get('docs/dirty.md')).toEqual({
      content: 'Unsaved dirty',
      modifiedAt: 2,
    });
    expect(store.getState().noteContentsCache.has('docs/clean.md')).toBe(false);
    expect(store.getState().noteContentsCache.has('docs/nested/other.md')).toBe(false);
    expect(store.getState().noteContentsCache.get('outside.md')).toEqual({
      content: '# outside',
      modifiedAt: 5,
    });
  });

  it('flushes pending editor markdown before saving the current note snapshot', async () => {
    const store = createNotesStore({
      currentNote: { path: 'alpha.md', content: 'old' },
      isDirty: false,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['alpha.md', { content: 'old', modifiedAt: 1 }]]),
    });
    mocks.flushCurrentPendingEditorMarkdown.mockImplementation(() => {
      store.setState((state) => ({
        currentNote: { path: 'alpha.md', content: ['1', '', '2', '', '3'].join('\n') },
        isDirty: true,
        openTabs: state.openTabs.map((tab) =>
          tab.path === 'alpha.md' ? { ...tab, isDirty: true } : tab
        ),
        noteContentsCache: new Map(state.noteContentsCache).set('alpha.md', {
          content: ['1', '', '2', '', '3'].join('\n'),
          modifiedAt: 1,
        }),
      }));
      return true;
    });
    mocks.saveNoteDocument.mockResolvedValue({
      content: ['1', '', '2', '', '3'].join('\n'),
      metadata: { updatedAt: 2 },
      modifiedAt: 2,
      nextCache: new Map([['alpha.md', { content: ['1', '', '2', '', '3'].join('\n'), modifiedAt: 2 }]]),
    });

    await store.getState().saveNote();

    expect(mocks.flushCurrentPendingEditorMarkdown).toHaveBeenCalledTimes(1);
    expect(mocks.saveNoteDocument).toHaveBeenCalledWith(expect.objectContaining({
      currentNote: {
        path: 'alpha.md',
        content: ['1', '', '2', '', '3'].join('\n'),
      },
    }));
    expect(store.getState().isDirty).toBe(false);
  });

  it('reports an autosave write failure and clears it after a successful retry', async () => {
    const savedNote = {
      content: 'Unsaved alpha',
      metadata: { updatedAt: 2 },
      modifiedAt: 2,
      size: 'Unsaved alpha'.length,
      nextCache: new Map([['alpha.md', { content: 'Unsaved alpha', modifiedAt: 2 }]]),
    };
    mocks.saveNoteDocument
      .mockRejectedValueOnce(new Error('disk busy'))
      .mockResolvedValueOnce(savedNote);
    const store = createNotesStore({
      currentNote: { path: 'alpha.md', content: 'Unsaved alpha' },
      isDirty: true,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: true }],
      noteContentsCache: new Map([['alpha.md', { content: 'Unsaved alpha', modifiedAt: 1 }]]),
    });
    const autosaveOptions = { explicit: false, throwOnError: true };

    await expect(store.getState().saveNote(autosaveOptions)).rejects.toThrow('disk busy');
    expect(store.getState().error).toBe('disk busy');
    expect(store.getState().saveError).toBe('disk busy');
    expect(store.getState().isDirty).toBe(true);

    await expect(store.getState().saveNote(autosaveOptions)).resolves.toBeUndefined();
    expect(store.getState().error).toBeNull();
    expect(store.getState().saveError).toBeNull();
    expect(store.getState().isDirty).toBe(false);
  });

  it('lets a regular save recover after an in-flight autosave fails', async () => {
    let rejectAutosave: (error: Error) => void = () => undefined;
    mocks.saveNoteDocument
      .mockImplementationOnce(() => new Promise((_resolve, reject) => {
        rejectAutosave = reject;
      }))
      .mockResolvedValueOnce({
        content: 'Unsaved alpha',
        metadata: { updatedAt: 2 },
        modifiedAt: 2,
        size: 'Unsaved alpha'.length,
        nextCache: new Map([['alpha.md', { content: 'Unsaved alpha', modifiedAt: 2 }]]),
      });
    const store = createNotesStore({
      currentNote: { path: 'alpha.md', content: 'Unsaved alpha' },
      isDirty: true,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: true }],
      noteContentsCache: new Map([['alpha.md', { content: 'Unsaved alpha', modifiedAt: 1 }]]),
    });

    const autosave = store.getState().saveNote({ explicit: false, throwOnError: true });
    await vi.waitFor(() => expect(mocks.saveNoteDocument).toHaveBeenCalledTimes(1));
    const regularSave = store.getState().saveNote({ explicit: false });
    rejectAutosave(new Error('disk busy'));

    await expect(autosave).rejects.toThrow('disk busy');
    await expect(regularSave).resolves.toBeUndefined();
    expect(mocks.saveNoteDocument).toHaveBeenCalledTimes(2);
    expect(store.getState().error).toBeNull();
    expect(store.getState().isDirty).toBe(false);
  });

  it('does not mark the next active note dirty when the previous autosave fails', async () => {
    let rejectAutosave: (error: Error) => void = () => undefined;
    mocks.saveNoteDocument.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectAutosave = reject;
    }));
    const store = createNotesStore({
      currentNote: { path: 'alpha.md', content: 'Unsaved alpha' },
      isDirty: true,
      openTabs: [
        { path: 'alpha.md', name: 'alpha', isDirty: true },
        { path: 'beta.md', name: 'beta', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['alpha.md', { content: 'Unsaved alpha', modifiedAt: 1 }],
        ['beta.md', { content: '# beta', modifiedAt: 1 }],
      ]),
    });

    const autosave = store.getState().saveNote({ explicit: false, throwOnError: true });
    await vi.waitFor(() => expect(mocks.saveNoteDocument).toHaveBeenCalledTimes(1));
    store.setState((state) => ({
      currentNote: { path: 'beta.md', content: '# beta' },
      currentNoteRevision: state.currentNoteRevision + 1,
      isDirty: false,
    }));
    rejectAutosave(new Error('disk busy'));

    await expect(autosave).rejects.toThrow('disk busy');
    expect(store.getState().currentNote).toEqual({ path: 'beta.md', content: '# beta' });
    expect(store.getState().isDirty).toBe(false);
    expect(store.getState().openTabs).toEqual([
      { path: 'alpha.md', name: 'alpha', isDirty: true },
      { path: 'beta.md', name: 'beta', isDirty: false },
    ]);
    expect(store.getState().saveError).toBe('disk busy');
    expect(store.getState().saveErrorPath).toBe('alpha.md');
  });

  it('keeps the file tree reference stable when saving mtime metadata under name sorting', async () => {
    const rootFolder: NonNullable<NotesStore['rootFolder']> = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [
        { id: 'alpha.md', name: 'alpha', path: 'alpha.md', isFolder: false },
        { id: 'beta.md', name: 'beta', path: 'beta.md', isFolder: false },
      ],
    };
    const store = createNotesStore({
      rootFolder,
      currentNote: { path: 'alpha.md', content: 'Unsaved alpha' },
      isDirty: true,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: true }],
      fileTreeSortMode: 'name-asc',
      noteContentsCache: new Map([['alpha.md', { content: 'Unsaved alpha', modifiedAt: 1 }]]),
      noteMetadata: { version: 2, notes: {} },
    });
    mocks.saveNoteDocument.mockResolvedValueOnce({
      content: 'Unsaved alpha',
      metadata: { updatedAt: 2 },
      modifiedAt: 2,
      size: 'Unsaved alpha'.length,
      nextCache: new Map([['alpha.md', { content: 'Unsaved alpha', modifiedAt: 2 }]]),
    });

    await store.getState().saveNote();

    expect(store.getState().rootFolder).toBe(rootFolder);
    expect(store.getState().noteMetadata?.notes['alpha.md']?.updatedAt).toBe(2);
    expect(store.getState().isDirty).toBe(false);
  });

  it('does not clear dirty state when the note path is externally deleted while save is in flight', async () => {
    type SaveResult = {
      content: string;
      metadata: { updatedAt: number };
      modifiedAt: number;
      size: number;
      nextCache: Map<string, { content: string; modifiedAt: number }>;
    };
    let resolveSave: ((value: SaveResult) => void) | undefined;
    mocks.saveNoteDocument.mockImplementation(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));

    const store = createNotesStore({
      currentNote: { path: 'alpha.md', content: 'Unsaved alpha' },
      isDirty: true,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: true }],
      noteContentsCache: new Map([['alpha.md', { content: 'Unsaved alpha', modifiedAt: 1 }]]),
    });

    const save = store.getState().saveNote();
    await vi.waitFor(() => expect(mocks.saveNoteDocument).toHaveBeenCalledTimes(1));

    markExternalPathDeletion('alpha.md');
    expect(resolveSave).toBeDefined();
    const completeSave = resolveSave as (value: SaveResult) => void;
    completeSave({
      content: 'Unsaved alpha',
      metadata: { updatedAt: 2 },
      modifiedAt: 2,
      size: 'Unsaved alpha'.length,
      nextCache: new Map([['alpha.md', { content: 'Unsaved alpha', modifiedAt: 2 }]]),
    });
    await save;

    expect(store.getState().currentNote).toEqual({ path: 'alpha.md', content: 'Unsaved alpha' });
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([{ path: 'alpha.md', name: 'alpha', isDirty: true }]);
    expect(store.getState().error).toBe(
      'Current note changed outside vlaina while saving. Its latest content is preserved; save again after reviewing it.'
    );
  });

  it('serializes overlapping saves for an edited external starred note', async () => {
    const saveResults: Array<{
      content: string;
      metadata: Record<string, unknown>;
      modifiedAt: number;
      nextCache: Map<string, { content: string; modifiedAt: number | null }>;
    }> = [];
    mocks.saveNoteDocument.mockImplementation(async () => {
      const next = saveResults.shift();
      if (!next) {
        throw new Error('Missing save result');
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      return next;
    });
    saveResults.push(
      {
        content: 'First saved',
        metadata: { updatedAt: 2 },
        modifiedAt: 2,
        nextCache: new Map([['/external/starred.md', { content: 'First saved', modifiedAt: 2 }]]),
      },
      {
        content: 'Second saved',
        metadata: { updatedAt: 3 },
        modifiedAt: 3,
        nextCache: new Map([['/external/starred.md', { content: 'Second saved', modifiedAt: 3 }]]),
      },
    );

    const store = createNotesStore({
      currentNote: { path: '/external/starred.md', content: 'First edit' },
      currentNoteRevision: 1,
      isDirty: true,
      openTabs: [{ path: '/external/starred.md', name: 'starred', isDirty: true }],
      noteContentsCache: new Map([['/external/starred.md', { content: 'First edit', modifiedAt: 1 }]]),
    });

    const firstSave = store.getState().saveNote({ explicit: false });
    expect(mocks.saveNoteDocument).toHaveBeenCalledTimes(1);

    store.setState((state) => ({
      currentNote: { path: '/external/starred.md', content: 'Second edit' },
      currentNoteRevision: state.currentNoteRevision + 1,
      isDirty: true,
      openTabs: state.openTabs.map((tab) => ({ ...tab, isDirty: true })),
      noteContentsCache: new Map(state.noteContentsCache).set('/external/starred.md', {
        content: 'Second edit',
        modifiedAt: 1,
      }),
    }));

    const secondSave = store.getState().saveNote({ explicit: false });
    await firstSave;

    expect(store.getState().currentNote).toEqual({
      path: '/external/starred.md',
      content: 'Second edit',
    });
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().noteContentsCache.get('/external/starred.md')).toEqual({
      content: 'Second edit',
      modifiedAt: 2,
    });

    await secondSave;

    expect(mocks.saveNoteDocument).toHaveBeenCalledTimes(2);
    expect(mocks.saveNoteDocument).toHaveBeenNthCalledWith(2, {
      notesPath: '/notesRoot',
      currentNote: { path: '/external/starred.md', content: 'Second edit' },
      cache: expect.any(Map),
    });
    expect(store.getState().currentNote).toEqual({
      path: '/external/starred.md',
      content: 'Second saved',
    });
    expect(store.getState().isDirty).toBe(false);
    expect(store.getState().openTabs).toEqual([
      { path: '/external/starred.md', name: 'starred', isDirty: false },
    ]);
  });

  it('skips saving a clean regular note after pending markdown is flushed', async () => {
    const store = createNotesStore({
      currentNote: { path: 'current.md', content: 'Clean content' },
      isDirty: false,
      openTabs: [{ path: 'current.md', name: 'current', isDirty: false }],
      noteContentsCache: new Map([['current.md', { content: 'Clean content', modifiedAt: 1 }]]),
    });

    await store.getState().saveNote({ explicit: false });
    await store.getState().saveNote({ explicit: true });

    expect(mocks.flushCurrentPendingEditorMarkdown).toHaveBeenCalledTimes(2);
    expect(mocks.saveNoteDocument).not.toHaveBeenCalled();
    expect(store.getState().error).toBeNull();
    expect(store.getState().isDirty).toBe(false);
  });

  it('skips non-explicit saves for an empty untitled draft', async () => {
    const store = createNotesStore({
      currentNote: { path: 'draft:blank', content: '# ' },
      isDirty: true,
      openTabs: [{ path: 'draft:blank', name: '', isDirty: true }],
      draftNotes: {
        'draft:blank': { parentPath: null, name: '' },
      },
      noteContentsCache: new Map([['draft:blank', { content: '# ', modifiedAt: null }]]),
    });

    await store.getState().saveNote({ explicit: false });

    expect(mocks.chooseDraftSavePath).not.toHaveBeenCalled();
    expect(mocks.saveNoteDocument).not.toHaveBeenCalled();
    expect(store.getState().currentNote).toEqual({ path: 'draft:blank', content: '# ' });
    expect(store.getState().draftNotes['draft:blank']).toEqual({ parentPath: null, name: '' });
  });

  it('dispatches an open target after saving a draft outside the opened folder', async () => {
    mocks.chooseDraftSavePath.mockResolvedValue('/home/vladelaina/sdf.md');
    mocks.saveNoteDocument.mockResolvedValue({
      content: 'draft text',
      metadata: { updatedAt: 1 },
      modifiedAt: 1,
      nextCache: new Map([
        ['draft:blank', { content: 'draft text', modifiedAt: null }],
        ['/home/vladelaina/sdf.md', { content: 'draft text', modifiedAt: 1 }],
      ]),
    });
    const store = createNotesStore({
      notesPath: '',
      currentNote: { path: 'draft:blank', content: 'draft text' },
      isDirty: true,
      openTabs: [{ path: 'draft:blank', name: '', isDirty: true }],
      draftNotes: {
        'draft:blank': { parentPath: null, name: 'sdf' },
      },
      noteContentsCache: new Map([['draft:blank', { content: 'draft text', modifiedAt: null }]]),
    });

    await store.getState().saveNote({ explicit: true });

    expect(store.getState().currentNote?.path).toBe('/home/vladelaina/sdf.md');
    expect(store.getState().openTabs).toEqual([{ path: '/home/vladelaina/sdf.md', name: 'sdf', isDirty: false }]);
    expect(mocks.dispatchOpenMarkdownTargetEvent).toHaveBeenCalledWith('/home/vladelaina/sdf.md');
  });

  it('materializes a draft into the active notesRoot without opening a save dialog', async () => {
    mocks.saveNoteDocument.mockResolvedValue({
      content: 'draft text',
      metadata: { updatedAt: 1 },
      modifiedAt: 1,
      nextCache: new Map([
        ['draft:blank', { content: 'draft text', modifiedAt: null }],
        ['Draft title.md', { content: 'draft text', modifiedAt: 1 }],
      ]),
    });
    const store = createNotesStore({
      currentNote: { path: 'draft:blank', content: 'draft text' },
      isDirty: true,
      isNewlyCreated: true,
      openTabs: [{ path: 'draft:blank', name: '', isDirty: true }],
      draftNotes: {
        'draft:blank': { parentPath: null, name: 'Draft title' },
      },
      noteContentsCache: new Map([['draft:blank', { content: 'draft text', modifiedAt: null }]]),
    });

    await store.getState().saveNote({ explicit: false });

    expect(mocks.chooseDraftSavePath).not.toHaveBeenCalled();
    expect(mocks.saveNoteDocument).toHaveBeenCalledWith({
      notesPath: '/notesRoot',
      currentNote: { path: 'Draft title.md', content: 'draft text' },
      cache: expect.any(Map),
    });
    expect(store.getState().currentNote?.path).toBe('Draft title.md');
    expect(store.getState().openTabs).toEqual([{ path: 'Draft title.md', name: 'Draft title', isDirty: false }]);
    expect(store.getState().isNewlyCreated).toBe(false);
  });

  it('keeps newer draft edits dirty after materializing while a save is in flight', async () => {
    type SaveResult = {
      content: string;
      metadata: Record<string, unknown>;
      modifiedAt: number;
      nextCache: Map<string, { content: string; modifiedAt: number | null }>;
    };
    let resolveFirstSave: ((value: SaveResult) => void) | undefined;
    mocks.saveNoteDocument
      .mockImplementationOnce(() => new Promise<SaveResult>((resolve) => {
        resolveFirstSave = resolve;
      }))
      .mockResolvedValueOnce({
        content: 'Second saved',
        metadata: { updatedAt: 3 },
        modifiedAt: 3,
        nextCache: new Map([['Draft title.md', { content: 'Second saved', modifiedAt: 3 }]]),
      });
    const store = createNotesStore({
      currentNote: { path: 'draft:blank', content: 'First edit' },
      isDirty: true,
      openTabs: [{ path: 'draft:blank', name: '', isDirty: true }],
      draftNotes: {
        'draft:blank': { parentPath: null, name: 'Draft title' },
      },
      noteContentsCache: new Map([['draft:blank', { content: 'First edit', modifiedAt: null }]]),
    });

    const firstSave = store.getState().saveNote({ explicit: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.saveNoteDocument).toHaveBeenCalledWith({
      notesPath: '/notesRoot',
      currentNote: { path: 'Draft title.md', content: 'First edit' },
      cache: expect.any(Map),
    });

    store.setState((state) => ({
      currentNote: { path: 'draft:blank', content: 'Second edit' },
      currentNoteRevision: state.currentNoteRevision + 1,
      isDirty: true,
      openTabs: state.openTabs.map((tab) =>
        tab.path === 'draft:blank' ? { ...tab, isDirty: true } : tab
      ),
      noteContentsCache: new Map(state.noteContentsCache).set('draft:blank', {
        content: 'Second edit',
        modifiedAt: null,
      }),
    }));

    const secondSave = store.getState().saveNote({ explicit: false });
    resolveFirstSave?.({
      content: 'First saved',
      metadata: { updatedAt: 2 },
      modifiedAt: 2,
      nextCache: new Map([['Draft title.md', { content: 'First saved', modifiedAt: 2 }]]),
    });
    await firstSave;

    expect(store.getState().currentNote).toEqual({
      path: 'Draft title.md',
      content: 'Second edit',
    });
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([
      { path: 'Draft title.md', name: 'Draft title', isDirty: true },
    ]);
    expect(store.getState().draftNotes).toEqual({});
    expect(store.getState().noteContentsCache.has('draft:blank')).toBe(false);
    expect(store.getState().noteContentsCache.get('Draft title.md')).toEqual({
      content: 'Second edit',
      modifiedAt: 2,
    });

    await secondSave;

    expect(mocks.saveNoteDocument).toHaveBeenCalledTimes(2);
    expect(mocks.saveNoteDocument).toHaveBeenNthCalledWith(2, {
      notesPath: '/notesRoot',
      currentNote: { path: 'Draft title.md', content: 'Second edit' },
      cache: expect.any(Map),
    });
    expect(store.getState().currentNote).toEqual({
      path: 'Draft title.md',
      content: 'Second saved',
    });
    expect(store.getState().isDirty).toBe(false);
    expect(store.getState().openTabs).toEqual([
      { path: 'Draft title.md', name: 'Draft title', isDirty: false },
    ]);
  });

  it('flushes draft input made while title materialization is in flight', async () => {
    const store = createNotesStore({
      currentNote: { path: 'draft:blank', content: '' },
      isDirty: false,
      openTabs: [{ path: 'draft:blank', name: '', isDirty: false }],
      draftNotes: {
        'draft:blank': { parentPath: null, name: 'Draft title' },
      },
      noteContentsCache: new Map([['draft:blank', { content: '', modifiedAt: null }]]),
    });
    let flushCount = 0;
    mocks.flushCurrentPendingEditorMarkdown.mockImplementation(() => {
      flushCount += 1;
      if (flushCount !== 2) return false;
      store.getState().updateContent('Body typed during title save');
      return true;
    });
    mocks.saveNoteDocument.mockResolvedValueOnce({
      content: '',
      metadata: { updatedAt: 2 },
      modifiedAt: 2,
      size: 0,
      nextCache: new Map([['Draft title.md', { content: '', modifiedAt: 2 }]]),
    });

    await store.getState().saveNote({ explicit: false });

    expect(mocks.flushCurrentPendingEditorMarkdown).toHaveBeenCalledTimes(2);
    expect(store.getState().currentNote).toEqual({
      path: 'Draft title.md',
      content: 'Body typed during title save',
    });
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([
      { path: 'Draft title.md', name: 'Draft title', isDirty: true },
    ]);
    expect(store.getState().noteContentsCache.get('Draft title.md')).toEqual({
      content: 'Body typed during title save',
      modifiedAt: 2,
    });
  });

  it('materializes a draft tab when the user switches away before the draft save finishes', async () => {
    type SaveResult = {
      content: string;
      metadata: Record<string, unknown>;
      modifiedAt: number;
      nextCache: Map<string, { content: string; modifiedAt: number | null }>;
    };
    let resolveSave: ((value: SaveResult) => void) | undefined;
    mocks.saveNoteDocument.mockImplementationOnce(() => new Promise<SaveResult>((resolve) => {
      resolveSave = resolve;
    }));
    const store = createNotesStore({
      currentNote: { path: 'draft:blank', content: 'Draft body' },
      isDirty: true,
      openTabs: [
        { path: 'draft:blank', name: '', isDirty: true },
        { path: 'beta.md', name: 'beta', isDirty: false },
      ],
      draftNotes: {
        'draft:blank': { parentPath: null, name: 'Draft title' },
      },
      noteContentsCache: new Map([
        ['draft:blank', { content: 'Draft body', modifiedAt: null }],
        ['beta.md', { content: '# beta', modifiedAt: 1 }],
      ]),
    });

    const save = store.getState().saveNote({ explicit: false });
    await new Promise((resolve) => setTimeout(resolve, 0));

    store.setState((state) => ({
      currentNote: { path: 'beta.md', content: '# beta' },
      currentNoteRevision: state.currentNoteRevision + 1,
      isDirty: false,
      openTabs: state.openTabs,
    }));

    resolveSave?.({
      content: 'Draft saved',
      metadata: { updatedAt: 2 },
      modifiedAt: 2,
      nextCache: new Map([['Draft title.md', { content: 'Draft saved', modifiedAt: 2 }]]),
    });
    await save;

    expect(store.getState().currentNote).toEqual({
      path: 'beta.md',
      content: '# beta',
    });
    expect(store.getState().isDirty).toBe(false);
    expect(store.getState().openTabs).toEqual([
      { path: 'Draft title.md', name: 'Draft title', isDirty: false },
      { path: 'beta.md', name: 'beta', isDirty: false },
    ]);
    expect(store.getState().draftNotes).toEqual({});
    expect(store.getState().noteContentsCache.has('draft:blank')).toBe(false);
    expect(store.getState().noteContentsCache.get('Draft title.md')).toEqual({
      content: 'Draft saved',
      modifiedAt: 2,
    });
  });

  it('prompts for a save location when a preserved draft came from another workspace', async () => {
    mocks.chooseDraftSavePath.mockResolvedValue('/notes-root-next/Chosen.md');
    mocks.saveNoteDocument.mockResolvedValue({
      content: 'draft text',
      metadata: { updatedAt: 1 },
      modifiedAt: 1,
      nextCache: new Map([
        ['draft:blank', { content: 'draft text', modifiedAt: null }],
        ['Chosen.md', { content: 'draft text', modifiedAt: 1 }],
      ]),
    });
    const store = createNotesStore({
      notesPath: '/notes-root-next',
      currentNote: { path: 'draft:blank', content: 'draft text' },
      isDirty: true,
      openTabs: [{ path: 'draft:blank', name: '', isDirty: true }],
      draftNotes: {
        'draft:blank': {
          parentPath: null,
          name: '',
          originNotesPath: '',
        },
      },
      noteContentsCache: new Map([['draft:blank', { content: 'draft text', modifiedAt: null }]]),
    });

    await store.getState().saveNote({ explicit: true });

    expect(mocks.chooseDraftSavePath).toHaveBeenCalledWith('/notes-root-next', {
      parentPath: null,
      name: '',
      originNotesPath: '',
    });
    expect(mocks.saveNoteDocument).toHaveBeenCalledWith({
      notesPath: '/notes-root-next',
      currentNote: { path: 'Chosen.md', content: 'draft text' },
      cache: expect.any(Map),
    });
    expect(store.getState().currentNote?.path).toBe('Chosen.md');
  });

  it('keeps a preserved draft untouched when the explicit save dialog is cancelled', async () => {
    mocks.chooseDraftSavePath.mockResolvedValue(null);
    const store = createNotesStore({
      notesPath: '/notes-root-next',
      currentNote: { path: 'draft:blank', content: 'draft text' },
      isDirty: true,
      openTabs: [{ path: 'draft:blank', name: '', isDirty: true }],
      draftNotes: {
        'draft:blank': {
          parentPath: null,
          name: 'Draft title',
          originNotesPath: '',
        },
      },
      noteContentsCache: new Map([['draft:blank', { content: 'draft text', modifiedAt: null }]]),
      noteMetadata: { version: 2, notes: { 'draft:blank': { icon: '✨' } } },
    });

    await store.getState().saveNote({ explicit: true });

    expect(mocks.chooseDraftSavePath).toHaveBeenCalledWith('/notes-root-next', {
      parentPath: null,
      name: 'Draft title',
      originNotesPath: '',
    });
    expect(mocks.saveNoteDocument).not.toHaveBeenCalled();
    expect(store.getState().currentNote).toEqual({ path: 'draft:blank', content: 'draft text' });
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([{ path: 'draft:blank', name: '', isDirty: true }]);
    expect(store.getState().draftNotes['draft:blank']).toEqual({
      parentPath: null,
      name: 'Draft title',
      originNotesPath: '',
    });
    expect(store.getState().noteMetadata?.notes['draft:blank']).toEqual({ icon: '✨' });
  });

  it('saves a preserved draft to an existing relative file chosen by the user', async () => {
    mocks.chooseDraftSavePath.mockResolvedValue('/notes-root-next/Untitled.md');
    mocks.saveNoteDocument.mockResolvedValue({
      content: 'draft text',
      metadata: { icon: '💾', updatedAt: 1 },
      modifiedAt: 1,
      nextCache: new Map([
        ['draft:blank', { content: 'draft text', modifiedAt: null }],
        ['Untitled.md', { content: 'draft text', modifiedAt: 1 }],
      ]),
    });
    const store = createNotesStore({
      notesPath: '/notes-root-next',
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [{ id: 'Untitled.md', name: 'Untitled', path: 'Untitled.md', isFolder: false }],
      },
      currentNote: { path: 'draft:blank', content: 'draft text' },
      isDirty: true,
      openTabs: [
        { path: 'draft:blank', name: '', isDirty: true },
        { path: 'other.md', name: 'other', isDirty: false },
      ],
      draftNotes: {
        'draft:blank': {
          parentPath: null,
          name: 'Draft title',
          originNotesPath: '',
        },
      },
      noteContentsCache: new Map([
        ['draft:blank', { content: 'draft text', modifiedAt: null }],
        ['other.md', { content: 'other', modifiedAt: 1 }],
      ]),
      noteMetadata: { version: 2, notes: { 'draft:blank': { icon: '📝' } } },
    });

    await store.getState().saveNote({ explicit: true });

    expect(mocks.saveNoteDocument).toHaveBeenCalledWith({
      notesPath: '/notes-root-next',
      currentNote: { path: 'Untitled.md', content: 'draft text' },
      cache: expect.any(Map),
    });
    expect(store.getState().currentNote).toEqual({ path: 'Untitled.md', content: 'draft text' });
    expect(store.getState().openTabs).toEqual([
      { path: 'Untitled.md', name: 'Untitled', isDirty: false },
      { path: 'other.md', name: 'other', isDirty: false },
    ]);
    expect(store.getState().draftNotes).toEqual({});
    expect(store.getState().noteContentsCache.has('draft:blank')).toBe(false);
    expect(store.getState().noteContentsCache.get('Untitled.md')).toEqual({
      content: 'draft text',
      modifiedAt: 1,
    });
    expect(store.getState().rootFolder?.children).toEqual([
      { id: 'Untitled.md', name: 'Untitled', path: 'Untitled.md', isFolder: false },
    ]);
    expect(store.getState().noteMetadata?.notes['Untitled.md']).toEqual({
      icon: '💾',
      updatedAt: 1,
    });
  });

  it('does not implicitly save a preserved draft into a newly opened workspace', async () => {
    const store = createNotesStore({
      notesPath: '/notes-root-next',
      currentNote: { path: 'draft:blank', content: 'draft text' },
      isDirty: true,
      openTabs: [{ path: 'draft:blank', name: '', isDirty: true }],
      draftNotes: {
        'draft:blank': {
          parentPath: null,
          name: '',
          originNotesPath: '',
        },
      },
      noteContentsCache: new Map([['draft:blank', { content: 'draft text', modifiedAt: null }]]),
    });

    await store.getState().saveNote({ explicit: false });

    expect(mocks.chooseDraftSavePath).not.toHaveBeenCalled();
    expect(mocks.saveNoteDocument).not.toHaveBeenCalled();
    expect(store.getState().currentNote?.path).toBe('draft:blank');
    expect(store.getState().isDirty).toBe(true);
  });

  it('ignores a stale save that finishes after the workspace switches notes-roots', async () => {
    let resolveSave: (value: {
      content: string;
      metadata: Record<string, unknown>;
      modifiedAt: number;
      nextCache: Map<string, { content: string; modifiedAt: number | null }>;
    }) => void;
    mocks.saveNoteDocument.mockImplementation(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));
    const store = createNotesStore({
      currentNote: { path: 'current.md', content: 'Old notesRoot content' },
      isDirty: true,
      openTabs: [{ path: 'current.md', name: 'current', isDirty: true }],
      noteContentsCache: new Map([['current.md', { content: 'Old notesRoot content', modifiedAt: 1 }]]),
    });

    const save = store.getState().saveNote();
    store.setState({
      notesPath: '/notes-root-next',
      currentNote: null,
      isDirty: false,
      openTabs: [],
      noteContentsCache: new Map(),
    });
    resolveSave!({
      content: 'Saved old notesRoot content',
      metadata: { updatedAt: 2 },
      modifiedAt: 2,
      nextCache: new Map([['current.md', { content: 'Saved old notesRoot content', modifiedAt: 2 }]]),
    });
    await save;

    expect(store.getState().notesPath).toBe('/notes-root-next');
    expect(store.getState().currentNote).toBeNull();
    expect(store.getState().openTabs).toEqual([]);
    expect(store.getState().noteContentsCache.size).toBe(0);
  });
});
