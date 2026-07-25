import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createFeatureSlice } from './featureSlice';
import type { NotesStore } from '../types';
import { createCachedNoteContentEntry } from '../document/noteContentCache';
import { setPendingEditorMarkdownFlusher } from '../pendingEditorMarkdownFlusher';

const MAX_SEARCHABLE_NOTE_BYTES = 512 * 1024;
const MAX_METADATA_UPDATE_NOTE_BYTES = 10 * 1024 * 1024;

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  safeWriteTextFile: vi.fn(),
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

vi.mock('../storage', async () => {
  const actual = await vi.importActual<typeof import('../storage')>('../storage');
  return {
    ...actual,
    safeWriteTextFile: mocks.safeWriteTextFile,
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

function createDeferredOneNoteScanStore() {
  mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: 16 });
  let resolveRead = (_content: string) => {};
  mocks.readFile.mockImplementation(() => new Promise<string>((resolve) => {
    resolveRead = resolve;
  }));
  const store = createNotesStore({
    notesPath: '/notesRoot',
    rootFolder: {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [{ id: 'alpha', name: 'alpha.md', path: 'alpha.md', isFolder: false }],
    },
  });
  return { resolveRead: (content: string) => resolveRead(content), store };
}

describe('featureSlice draft metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPendingEditorMarkdownFlusher(null);
    mocks.readFile.mockResolvedValue('');
    mocks.safeWriteTextFile.mockResolvedValue(undefined);
    mocks.stat.mockResolvedValue({ modifiedAt: 1, size: 16 });
  });

  it('materializes an active draft instead of writing metadata to a draft path', async () => {
    const saveNote = vi.fn(async () => undefined);
    const store = createNotesStore({
      currentNote: { path: 'draft:blank', content: '' },
      openTabs: [{ path: 'draft:blank', name: '', isDirty: false }],
      draftNotes: {
        'draft:blank': { parentPath: null, name: '' },
      },
      noteContentsCache: new Map([['draft:blank', { content: '', modifiedAt: null }]]),
      saveNote,
    });

    store.getState().setNoteIcon('draft:blank', '💡');

    await vi.waitFor(() => {
      expect(saveNote).toHaveBeenCalledWith({ explicit: false });
    });

    expect(store.getState().currentNote?.path).toBe('draft:blank');
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([
      { path: 'draft:blank', name: '', isDirty: true },
    ]);
    expect(store.getState().noteMetadata?.notes['draft:blank']?.icon).toBe('💡');
  });

  it('stores active draft metadata in memory when no notesRoot is selected', async () => {
    const saveNote = vi.fn(async () => undefined);
    const store = createNotesStore({
      notesPath: '',
      rootFolder: null,
      currentNote: { path: 'draft:blank', content: '' },
      openTabs: [{ path: 'draft:blank', name: '', isDirty: false }],
      draftNotes: {
        'draft:blank': { parentPath: null, name: '' },
      },
      noteContentsCache: new Map([['draft:blank', { content: '', modifiedAt: null }]]),
      saveNote,
    });

    store.getState().setNoteIcon('draft:blank', '💡');
    store.getState().setNoteCover('draft:blank', {
      assetPath: '@monet/1',
      positionX: 50,
      positionY: 50,
      height: 200,
      scale: 1,
    });

    await vi.waitFor(() => {
      expect(store.getState().noteMetadata?.notes['draft:blank']?.cover?.assetPath).toBe('@monet/1');
    });

    expect(saveNote).not.toHaveBeenCalled();
    expect(store.getState().noteMetadata?.notes['draft:blank']?.icon).toBe('💡');
    expect(store.getState().currentNote?.path).toBe('draft:blank');
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([
      { path: 'draft:blank', name: '', isDirty: true },
    ]);
  });

  it('keeps preserved draft metadata in memory instead of implicitly saving into the new notesRoot', async () => {
    const saveNote = vi.fn(async () => undefined);
    const store = createNotesStore({
      notesPath: '/notes-root-next',
      currentNote: { path: 'draft:blank', content: '' },
      openTabs: [{ path: 'draft:blank', name: '', isDirty: false }],
      draftNotes: {
        'draft:blank': { parentPath: null, name: '', originNotesPath: '' },
      },
      noteContentsCache: new Map([['draft:blank', { content: '', modifiedAt: null }]]),
      saveNote,
    });

    store.getState().setNoteIcon('draft:blank', '💡');
    store.getState().setNoteCover('draft:blank', {
      assetPath: '@monet/1',
      positionX: 50,
      positionY: 50,
      height: 200,
      scale: 1,
    });

    await vi.waitFor(() => {
      expect(store.getState().noteMetadata?.notes['draft:blank']?.cover?.assetPath).toBe('@monet/1');
    });

    expect(saveNote).not.toHaveBeenCalled();
    expect(store.getState().noteMetadata?.notes['draft:blank']?.icon).toBe('💡');
    expect(store.getState().currentNote?.path).toBe('draft:blank');
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([
      { path: 'draft:blank', name: '', isDirty: true },
    ]);
  });

  it('writes metadata for an absolute note opened without a notesRoot', async () => {
    const store = createNotesStore({
      notesPath: '',
      rootFolder: null,
      currentNote: { path: '/notes/alpha.md', content: '# Alpha' },
      openTabs: [{ path: '/notes/alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['/notes/alpha.md', { content: '# Alpha', modifiedAt: 1 }]]),
    });

    store.getState().setNoteIcon('/notes/alpha.md', '💡');

    await vi.waitFor(() => {
      expect(mocks.safeWriteTextFile).toHaveBeenCalled();
    });

    expect(mocks.safeWriteTextFile.mock.calls[0]?.[0]).toBe('/notes/alpha.md');
    expect(store.getState().noteMetadata?.notes['/notes/alpha.md']?.icon).toBe('💡');
    expect(store.getState().currentNote?.content).toContain('vlaina_icon');
    expect(store.getState().isDirty).toBe(false);
  });

  it('writes note icon size into frontmatter for a saved note', async () => {
    const notePath = 'docs/alpha.md';
    const sourceContent = [
      '---',
      'vlaina_icon: "💡"',
      '---',
      '',
      '# Alpha',
    ].join('\n');
    mocks.readFile.mockResolvedValue(sourceContent);
    const store = createNotesStore({
      currentNote: { path: notePath, content: sourceContent },
      openTabs: [{ path: notePath, name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([[notePath, { content: sourceContent, modifiedAt: 1 }]]),
    });

    store.getState().setNoteIconSize(notePath, 84);

    await vi.waitFor(() => {
      expect(mocks.safeWriteTextFile).toHaveBeenCalled();
    });

    const writtenContent = mocks.safeWriteTextFile.mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('vlaina_icon: "💡" size=84');
    expect(store.getState().noteMetadata?.notes[notePath]?.iconSize).toBe(84);
  });

  it('flushes pending editor content before writing note metadata', async () => {
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      currentNote: { path: notePath, content: '# Alpha' },
      openTabs: [{ path: notePath, name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([[notePath, { content: '# Alpha', modifiedAt: 1 }]]),
    });
    setPendingEditorMarkdownFlusher(() => {
      store.setState((state) => ({
        currentNote: { path: notePath, content: '# Alpha\n\nd' },
        currentNoteRevision: state.currentNoteRevision + 1,
        isDirty: true,
        openTabs: state.openTabs.map((tab) =>
          tab.path === notePath ? { ...tab, isDirty: true } : tab
        ),
        noteContentsCache: new Map(state.noteContentsCache).set(notePath, {
          content: '# Alpha\n\nd',
          modifiedAt: 1,
        }),
      }));
      return true;
    });

    store.getState().setNoteIcon(notePath, '💡');

    await vi.waitFor(() => {
      expect(store.getState().noteMetadata?.notes[notePath]?.icon).toBe('💡');
    });

    const content = store.getState().currentNote?.content ?? '';
    expect(content).toContain('vlaina_icon');
    expect(content).toContain('# Alpha\n\nd');
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([
      { path: notePath, name: 'alpha', isDirty: true },
    ]);
    expect(mocks.safeWriteTextFile).not.toHaveBeenCalled();
  });

  it('writes metadata for a Windows absolute note opened without a notesRoot', async () => {
    const notePath = 'C:\\notes\\alpha.md';
    const store = createNotesStore({
      notesPath: '',
      rootFolder: null,
      currentNote: { path: notePath, content: '# Alpha' },
      openTabs: [{ path: notePath, name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([[notePath, { content: '# Alpha', modifiedAt: 1 }]]),
    });

    store.getState().setNoteIcon(notePath, '💡');

    await vi.waitFor(() => {
      expect(mocks.safeWriteTextFile).toHaveBeenCalled();
    });

    expect(mocks.safeWriteTextFile.mock.calls[0]?.[0]).toBe(notePath);
    expect(store.getState().noteMetadata?.notes[notePath]?.icon).toBe('💡');
    expect(store.getState().currentNote?.content).toContain('vlaina_icon');
    expect(store.getState().isDirty).toBe(false);
  });

  it('does not update cached metadata source content that is too complex for the editor', async () => {
    const notePath = 'docs/alpha.md';
    const complexMarkdown = 'x'.repeat(512 * 1024 + 1);
    const store = createNotesStore({
      notesPath: '/notesRoot',
      noteContentsCache: new Map([[notePath, { content: complexMarkdown, modifiedAt: 1 }]]),
    });

    store.getState().setNoteIcon(notePath, '💡');

    await vi.waitFor(() => {
      expect(store.getState().error).toBe('Note file is too complex to open safely.');
    });
    expect(mocks.safeWriteTextFile).not.toHaveBeenCalled();
    expect(store.getState().noteMetadata?.notes[notePath]).toBeUndefined();
    expect(store.getState().noteContentsCache.get(notePath)).toEqual({
      content: complexMarkdown,
      modifiedAt: 1,
    });
  });

  it('does not update uncached disk metadata source content that is too complex for the editor', async () => {
    const notePath = 'docs/alpha.md';
    const complexMarkdown = 'x'.repeat(512 * 1024 + 1);
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: complexMarkdown.length });
    mocks.readFile.mockResolvedValue(complexMarkdown);
    const store = createNotesStore({
      notesPath: '/notesRoot',
    });

    store.getState().setNoteIcon(notePath, '💡');

    await vi.waitFor(() => {
      expect(store.getState().error).toBe('Note file is too complex to open safely.');
    });
    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/docs/alpha.md', MAX_METADATA_UPDATE_NOTE_BYTES);
    expect(mocks.safeWriteTextFile).not.toHaveBeenCalled();
    expect(store.getState().noteMetadata?.notes[notePath]).toBeUndefined();
    expect(store.getState().noteContentsCache.has(notePath)).toBe(false);
  });

  it('rejects uncached disk metadata source content with invalid stat size before reading', async () => {
    const notePath = 'docs/alpha.md';
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: -1 });
    mocks.readFile.mockResolvedValue('# Alpha');
    const store = createNotesStore({
      notesPath: '/notesRoot',
    });

    store.getState().setNoteIcon(notePath, '💡');

    await vi.waitFor(() => {
      expect(store.getState().error).toBe('Note file is too large to update metadata.');
    });
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.safeWriteTextFile).not.toHaveBeenCalled();
    expect(store.getState().noteMetadata?.notes[notePath]).toBeUndefined();
    expect(store.getState().noteContentsCache.has(notePath)).toBe(false);
  });

  it('rejects uncached notesRoot metadata source content that exceeds the read limit after reading', async () => {
    const notePath = 'docs/alpha.md';
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true });
    mocks.readFile.mockResolvedValue('x'.repeat(MAX_METADATA_UPDATE_NOTE_BYTES + 1));
    const store = createNotesStore({
      notesPath: '/notesRoot',
    });

    store.getState().setNoteIcon(notePath, '💡');

    await vi.waitFor(() => {
      expect(store.getState().error).toBe('Note file is too large to update metadata.');
    });
    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/docs/alpha.md', MAX_METADATA_UPDATE_NOTE_BYTES);
    expect(mocks.safeWriteTextFile).not.toHaveBeenCalled();
    expect(store.getState().noteMetadata?.notes[notePath]).toBeUndefined();
    expect(store.getState().noteContentsCache.has(notePath)).toBe(false);
  });

  it('rejects uncached absolute metadata source content that exceeds the read limit after reading', async () => {
    const notePath = '/notes/alpha.md';
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true });
    mocks.readFile.mockResolvedValue('x'.repeat(MAX_METADATA_UPDATE_NOTE_BYTES + 1));
    const store = createNotesStore({
      notesPath: '',
      rootFolder: null,
    });

    store.getState().setNoteIcon(notePath, '💡');

    await vi.waitFor(() => {
      expect(store.getState().error).toBe('Note file is too large to update metadata.');
    });
    expect(mocks.readFile).toHaveBeenCalledWith(notePath, MAX_METADATA_UPDATE_NOTE_BYTES);
    expect(mocks.safeWriteTextFile).not.toHaveBeenCalled();
    expect(store.getState().noteMetadata?.notes[notePath]).toBeUndefined();
    expect(store.getState().noteContentsCache.has(notePath)).toBe(false);
  });

  it('merges notesRoot metadata updates with newer disk edits instead of overwriting them', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    mocks.stat
      .mockResolvedValueOnce({ modifiedAt: 2, size: 16 })
      .mockResolvedValueOnce({ modifiedAt: 3, size: 16 });
    mocks.readFile.mockResolvedValue(['# Alpha', '', 'Disk body'].join('\n'));
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      notesPath: '/notesRoot',
      currentNote: { path: notePath, content: ['# Alpha', '', 'Original body'].join('\n') },
      openTabs: [{ path: notePath, name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([[
        notePath,
        { content: ['# Alpha', '', 'Original body'].join('\n'), modifiedAt: 1 },
      ]]),
    });

    store.getState().setNoteIcon(notePath, '💡');

    await vi.waitFor(() => {
      expect(mocks.safeWriteTextFile).toHaveBeenCalled();
    });

    const writtenContent = mocks.safeWriteTextFile.mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('vlaina_icon: "💡"');
    expect(writtenContent).toContain('Disk body');
    expect(writtenContent).not.toContain('Original body');
    expect(store.getState().currentNote?.content).toBe(writtenContent);
    expect(store.getState().noteContentsCache.get(notePath)).toEqual({
      content: writtenContent,
      modifiedAt: 3,
    });

    vi.useRealTimers();
  });

  it('keeps a failed absolute metadata write dirty so the change is not silently lost', async () => {
    mocks.safeWriteTextFile.mockRejectedValueOnce(new Error('disk unavailable'));
    const notePath = '/notes/alpha.md';
    const store = createNotesStore({
      notesPath: '',
      rootFolder: null,
      currentNote: { path: notePath, content: '# Alpha' },
      openTabs: [{ path: notePath, name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([[notePath, { content: '# Alpha', modifiedAt: 1 }]]),
    });

    store.getState().setNoteIcon(notePath, '💡');

    await vi.waitFor(() => {
      expect(store.getState().error).toBe('disk unavailable');
    });

    expect(store.getState().currentNote?.content).toContain('vlaina_icon');
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([
      { path: notePath, name: 'alpha', isDirty: true },
    ]);
    expect(store.getState().noteContentsCache.get(notePath)?.content).toContain('vlaina_icon');
  });

  it('keeps a failed notesRoot metadata write dirty so the change is not silently lost', async () => {
    mocks.safeWriteTextFile.mockRejectedValueOnce(new Error('disk unavailable'));
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      notesPath: '/notesRoot',
      currentNote: { path: notePath, content: '# Alpha' },
      openTabs: [{ path: notePath, name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([[notePath, { content: '# Alpha', modifiedAt: 1 }]]),
    });

    store.getState().setNoteCover(notePath, {
      assetPath: '@monet/1',
      positionX: 50,
      positionY: 50,
      height: 200,
      scale: 1,
    });

    await vi.waitFor(() => {
      expect(store.getState().error).toBe('disk unavailable');
    });

    expect(store.getState().currentNote?.content).toContain('vlaina_cover');
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([
      { path: notePath, name: 'alpha', isDirty: true },
    ]);
    expect(store.getState().noteContentsCache.get(notePath)?.content).toContain('vlaina_cover');
  });

  it('does not overwrite newer edits when absolute metadata write finishes later', async () => {
    let resolveWrite: (() => void) | undefined;
    mocks.safeWriteTextFile.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveWrite = resolve;
    }));
    const notePath = '/notes/alpha.md';
    const store = createNotesStore({
      notesPath: '',
      rootFolder: null,
      currentNote: { path: notePath, content: '# Alpha' },
      openTabs: [{ path: notePath, name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([[notePath, { content: '# Alpha', modifiedAt: 1 }]]),
    });

    store.getState().setNoteIcon(notePath, '💡');

    await vi.waitFor(() => {
      expect(mocks.safeWriteTextFile).toHaveBeenCalled();
    });
    const contentWithMetadata = store.getState().currentNote?.content ?? '';
    const newerContent = `${contentWithMetadata}\n\nUser edit`;
    store.setState((state) => ({
      currentNote: { path: notePath, content: newerContent },
      currentNoteRevision: state.currentNoteRevision + 1,
      isDirty: true,
      openTabs: state.openTabs.map((tab) =>
        tab.path === notePath ? { ...tab, isDirty: true } : tab
      ),
      noteContentsCache: new Map(state.noteContentsCache).set(notePath, {
        content: newerContent,
        modifiedAt: 1,
      }),
    }));

    resolveWrite?.();

    await vi.waitFor(() => {
      expect(store.getState().noteContentsCache.get(notePath)?.modifiedAt).toBe(1);
    });
    expect(store.getState().currentNote).toEqual({ path: notePath, content: newerContent });
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([
      { path: notePath, name: 'alpha', isDirty: true },
    ]);
    expect(store.getState().noteContentsCache.get(notePath)).toEqual({
      content: newerContent,
      modifiedAt: 1,
    });
  });

  it('does not overwrite newer edits when notesRoot metadata write finishes later', async () => {
    let resolveWrite: (() => void) | undefined;
    mocks.safeWriteTextFile.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveWrite = resolve;
    }));
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      notesPath: '/notesRoot',
      currentNote: { path: notePath, content: '# Alpha' },
      openTabs: [{ path: notePath, name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([[notePath, { content: '# Alpha', modifiedAt: 1 }]]),
    });

    store.getState().setNoteIcon(notePath, '💡');

    await vi.waitFor(() => {
      expect(mocks.safeWriteTextFile).toHaveBeenCalled();
    });
    const contentWithMetadata = store.getState().currentNote?.content ?? '';
    const newerContent = `${contentWithMetadata}\n\nUser edit`;
    store.setState((state) => ({
      currentNote: { path: notePath, content: newerContent },
      currentNoteRevision: state.currentNoteRevision + 1,
      isDirty: true,
      openTabs: state.openTabs.map((tab) =>
        tab.path === notePath ? { ...tab, isDirty: true } : tab
      ),
      noteContentsCache: new Map(state.noteContentsCache).set(notePath, {
        content: newerContent,
        modifiedAt: 1,
      }),
    }));

    resolveWrite?.();

    await vi.waitFor(() => {
      expect(store.getState().noteContentsCache.get(notePath)?.modifiedAt).toBe(1);
    });
    expect(store.getState().currentNote).toEqual({ path: notePath, content: newerContent });
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([
      { path: notePath, name: 'alpha', isDirty: true },
    ]);
    expect(store.getState().noteContentsCache.get(notePath)).toEqual({
      content: newerContent,
      modifiedAt: 1,
    });
  });

  it('does not overwrite edits made while metadata source content is being read', async () => {
    let resolveRead: (content: string) => void;
    mocks.readFile.mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveRead = resolve;
    }));
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      notesPath: '/notesRoot',
      currentNote: { path: 'docs/beta.md', content: '# Beta' },
      openTabs: [{ path: 'docs/beta.md', name: 'beta', isDirty: false }],
      noteContentsCache: new Map([['docs/beta.md', { content: '# Beta', modifiedAt: 1 }]]),
    });

    store.getState().setNoteIcon(notePath, '💡');

    await vi.waitFor(() => {
      expect(mocks.readFile).toHaveBeenCalled();
    });
    store.setState((state) => ({
      currentNote: { path: notePath, content: '# Local edit' },
      currentNoteRevision: state.currentNoteRevision + 1,
      isDirty: true,
      openTabs: [
        { path: 'docs/beta.md', name: 'beta', isDirty: false },
        { path: notePath, name: 'alpha', isDirty: true },
      ],
      noteContentsCache: new Map(state.noteContentsCache).set(notePath, {
        content: '# Local edit',
        modifiedAt: 1,
      }),
    }));
    resolveRead!('# Disk content');

    await vi.waitFor(() => {
      expect(store.getState().noteMetadata?.notes[notePath]?.icon).toBe('💡');
    });

    expect(store.getState().currentNote?.path).toBe(notePath);
    expect(store.getState().currentNote?.content).toContain('# Local edit');
    expect(store.getState().currentNote?.content).not.toContain('# Disk content');
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().openTabs).toEqual([
      { path: 'docs/beta.md', name: 'beta', isDirty: false },
      { path: notePath, name: 'alpha', isDirty: true },
    ]);
    expect(mocks.safeWriteTextFile).not.toHaveBeenCalled();
  });

  it('does not overwrite current note cache when scanAllNotes finishes after a local edit', async () => {
    let resolveRead: (content: string) => void;
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: 16 });
    mocks.readFile.mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveRead = resolve;
    }));
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      notesPath: '/notesRoot',
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: 'docs',
            name: 'docs',
            path: 'docs',
            isFolder: true,
            expanded: true,
            children: [{ id: notePath, name: 'alpha', path: notePath, isFolder: false }],
          },
        ],
      },
      currentNote: { path: notePath, content: '# Old alpha' },
      openTabs: [{ path: notePath, name: 'alpha', isDirty: false }],
      noteContentsCache: new Map(),
    });

    const scan = store.getState().scanAllNotes();
    await vi.waitFor(() => {
      expect(mocks.readFile).toHaveBeenCalled();
    });
    store.setState((state) => ({
      currentNote: { path: notePath, content: '# Local edit during scan' },
      currentNoteRevision: state.currentNoteRevision + 1,
      isDirty: true,
      openTabs: state.openTabs.map((tab) =>
        tab.path === notePath ? { ...tab, isDirty: true } : tab
      ),
      noteContentsCache: new Map(state.noteContentsCache).set(notePath, {
        content: '# Local edit during scan',
        modifiedAt: 1,
      }),
    }));
    resolveRead!('# Scanned disk content');
    await scan;

    expect(store.getState().currentNote).toEqual({
      path: notePath,
      content: '# Local edit during scan',
    });
    expect(store.getState().isDirty).toBe(true);
    expect(store.getState().noteContentsCache.get(notePath)).toEqual({
      content: '# Local edit during scan',
      modifiedAt: 1,
    });
  });

  it('updates case-insensitive symbol icon schemes when changing all icon colors', async () => {
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      currentNote: { path: notePath, content: '# Alpha' },
      isDirty: true,
      openTabs: [{ path: notePath, name: 'alpha', isDirty: true }],
      noteContentsCache: new Map([[notePath, { content: '# Alpha', modifiedAt: 1 }]]),
      noteMetadata: {
        version: 2,
        notes: {
          [notePath]: { icon: 'ICON:star:red' },
          'docs/beta.md': { icon: '👋' },
        },
      },
    });

    store.getState().updateAllIconColors('blue');

    await vi.waitFor(() => {
      expect(store.getState().noteMetadata?.notes[notePath]?.icon).toBe('ICON:star:blue');
    });
    expect(store.getState().noteMetadata?.notes['docs/beta.md']?.icon).toBe('👋');
  });

  it('does not treat case-insensitive symbol icon schemes as emoji during skin tone updates', async () => {
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      currentNote: { path: notePath, content: '# Alpha' },
      isDirty: true,
      openTabs: [{ path: notePath, name: 'alpha', isDirty: true }],
      noteContentsCache: new Map([[notePath, { content: '# Alpha', modifiedAt: 1 }]]),
      noteMetadata: {
        version: 2,
        notes: {
          [notePath]: { icon: '👋' },
          'docs/symbol.md': { icon: 'ICON:star:red' },
        },
      },
    });

    await store.getState().updateAllEmojiSkinTones(1);

    expect(store.getState().noteMetadata?.notes['docs/symbol.md']?.icon).toBe('ICON:star:red');
    expect(store.getState().noteMetadata?.notes[notePath]?.icon).not.toBe('ICON:star:red');
  });

  it('reuses cached note contents during full-notesRoot scans and reads only missing notes', async () => {
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: 16 });
    mocks.readFile.mockResolvedValue('# Beta from disk');
    const alphaPath = 'docs/alpha.md';
    const betaPath = 'docs/beta.md';
    const store = createNotesStore({
      notesPath: '/notesRoot',
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: 'docs',
            name: 'docs',
            path: 'docs',
            isFolder: true,
            expanded: true,
            children: [
              { id: alphaPath, name: 'alpha', path: alphaPath, isFolder: false },
              { id: betaPath, name: 'beta', path: betaPath, isFolder: false },
            ],
          },
        ],
      },
      noteContentsCache: new Map([
        [alphaPath, createCachedNoteContentEntry('# Alpha cached', 2, { size: 16 })],
      ]),
    });

    await store.getState().scanAllNotes();

    expect(mocks.readFile).toHaveBeenCalledTimes(1);
    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/docs/beta.md', MAX_SEARCHABLE_NOTE_BYTES);
    expect(store.getState().noteContentsCache.get(alphaPath)).toEqual({
      content: '# Alpha cached',
      modifiedAt: 2,
    });
    expect(store.getState().noteContentsCache.get(alphaPath)?.size).toBe(16);
    expect(store.getState().noteContentsCache.get(betaPath)).toEqual({
      content: '# Beta from disk',
      modifiedAt: 2,
    });
  });

  it('reloads cached full-notesRoot scan content when disk metadata changes', async () => {
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: 16 });
    mocks.readFile.mockResolvedValue('# Alpha from disk');
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      notesPath: '/notesRoot',
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: 'docs',
            name: 'docs',
            path: 'docs',
            isFolder: true,
            expanded: true,
            children: [{ id: notePath, name: 'alpha', path: notePath, isFolder: false }],
          },
        ],
      },
      noteContentsCache: new Map([
        [notePath, createCachedNoteContentEntry('# Alpha cached', 1, { size: 16 })],
      ]),
    });

    await store.getState().scanAllNotes();

    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/docs/alpha.md', MAX_SEARCHABLE_NOTE_BYTES);
    expect(store.getState().noteContentsCache.get(notePath)).toEqual({
      content: '# Alpha from disk',
      modifiedAt: 2,
    });
    expect(store.getState().noteContentsCache.get(notePath)?.size).toBe(16);
  });

  it('stores scanned note disk size as hidden cache metadata', async () => {
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: 16 });
    mocks.readFile.mockResolvedValue('# Alpha from disk');
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      notesPath: '/notesRoot',
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: 'docs',
            name: 'docs',
            path: 'docs',
            isFolder: true,
            expanded: true,
            children: [{ id: notePath, name: 'alpha', path: notePath, isFolder: false }],
          },
        ],
      },
    });

    await store.getState().scanAllNotes();

    const entry = store.getState().noteContentsCache.get(notePath);
    expect(entry).toEqual({
      content: '# Alpha from disk',
      modifiedAt: 2,
    });
    expect(entry?.size).toBe(16);
  });

  it('does not scan non-markdown file tree nodes', async () => {
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: 16 });
    mocks.readFile.mockResolvedValue('# Unexpected');
    const store = createNotesStore({
      notesPath: '/notesRoot',
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          { id: 'docs/image.png', name: 'image', path: 'docs/image.png', isFolder: false },
          { id: 'docs/readme.txt', name: 'readme', path: 'docs/readme.txt', isFolder: false },
        ],
      },
    });

    await store.getState().scanAllNotes();

    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(store.getState().noteContentsCache.size).toBe(0);
  });

  it('reads full-notesRoot scan notes with bounded reads when stat has no size', async () => {
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true });
    mocks.readFile.mockResolvedValue('# Alpha');
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      notesPath: '/notesRoot',
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: 'docs',
            name: 'docs',
            path: 'docs',
            isFolder: true,
            expanded: true,
            children: [{ id: notePath, name: 'alpha', path: notePath, isFolder: false }],
          },
        ],
      },
    });

    await store.getState().scanAllNotes();

    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/docs/alpha.md', MAX_SEARCHABLE_NOTE_BYTES);
    expect(store.getState().noteContentsCache.get(notePath)).toEqual({
      content: '# Alpha',
      modifiedAt: 2,
    });
  });

  it('does not cache full-notesRoot scan content that exceeds the searchable note limit after read', async () => {
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: 16 });
    mocks.readFile.mockResolvedValue('你'.repeat(Math.floor(MAX_SEARCHABLE_NOTE_BYTES / 3) + 1));
    const notePath = 'docs/alpha.md';
    const store = createNotesStore({
      notesPath: '/notesRoot',
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: 'docs',
            name: 'docs',
            path: 'docs',
            isFolder: true,
            expanded: true,
            children: [{ id: notePath, name: 'alpha', path: notePath, isFolder: false }],
          },
        ],
      },
    });

    await store.getState().scanAllNotes();

    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/docs/alpha.md', MAX_SEARCHABLE_NOTE_BYTES);
    expect(store.getState().noteContentsCache.has(notePath)).toBe(false);
  });

  it('scans deeply nested full-notesRoot notes without recursive traversal', async () => {
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: 16 });
    mocks.readFile.mockResolvedValue('# Deep');
    let current: any = {
      id: 'deep',
      name: 'deep.md',
      path: 'deep.md',
      isFolder: false,
    };

    for (let depth = 0; depth < 1500; depth += 1) {
      current = {
        id: `folder-${depth}`,
        name: `folder-${depth}`,
        path: `folder-${depth}`,
        isFolder: true,
        expanded: true,
        children: [current],
      };
    }

    const store = createNotesStore({
      notesPath: '/notesRoot',
      rootFolder: current,
    });

    await store.getState().scanAllNotes();

    expect(mocks.readFile).toHaveBeenCalledWith('/notesRoot/deep.md', MAX_SEARCHABLE_NOTE_BYTES);
    expect(store.getState().noteContentsCache.get('deep.md')?.content).toBe('# Deep');
  });

  it('caps full-notesRoot scan paths from oversized folder trees', async () => {
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: 16 });
    mocks.readFile.mockResolvedValue('# Note');
    const store = createNotesStore({
      notesPath: '/notesRoot',
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: Array.from({ length: 5001 }, (_, index) => ({
          id: `note-${index}`,
          name: `note-${index}.md`,
          path: `note-${index}.md`,
          isFolder: false,
        })),
      },
    });

    await store.getState().scanAllNotes();

    expect(mocks.stat).toHaveBeenCalledTimes(5000);
    expect(store.getState().noteContentsCache.size).toBe(5000);
  });

  it('stops full-notesRoot scans before starting later batches after cancellation', async () => {
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: 16 });
    const pendingReads: Array<(content: string) => void> = [];
    mocks.readFile.mockImplementation(() => new Promise<string>((resolve) => {
      pendingReads.push(resolve);
    }));
    const firstBatchSize = 32;
    const notePaths = Array.from({ length: 40 }, (_, index) => `docs/${index}.md`);
    const store = createNotesStore({
      notesPath: '/notesRoot',
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [
          {
            id: 'docs',
            name: 'docs',
            path: 'docs',
            isFolder: true,
            expanded: true,
            children: notePaths.map((path) => ({
              id: path,
              name: path.split('/').pop() ?? path,
              path,
              isFolder: false as const,
            })),
          },
        ],
      },
    });

    const scan = store.getState().scanAllNotes();
    await vi.waitFor(() => {
      expect(mocks.readFile).toHaveBeenCalledTimes(firstBatchSize);
    });

    store.getState().cancelNoteContentScan();
    pendingReads.forEach((resolve, index) => resolve(`# Note ${index}`));
    await scan;

    expect(mocks.readFile).toHaveBeenCalledTimes(firstBatchSize);
    expect(store.getState().noteContentsCache.size).toBe(0);
  });

  it('reuses an active foreground scan for background prewarm requests', async () => {
    const { resolveRead, store } = createDeferredOneNoteScanStore();

    const foregroundScan = store.getState().scanAllNotes();
    await vi.waitFor(() => expect(mocks.readFile).toHaveBeenCalledTimes(1));
    const backgroundScan = store.getState().scanAllNotes({ background: true });

    expect(backgroundScan).toBe(foregroundScan);
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
    resolveRead('# Alpha');
    await Promise.all([foregroundScan, backgroundScan]);
  });

  it('prioritizes and notifies a joined background request without a second scan', async () => {
    const paths = Array.from({ length: 96 }, (_, index) => `note-${index}.md`);
    const firstBatchResolvers: Array<(content: string) => void> = [];
    const thirdBatchResolvers: Array<(content: string) => void> = [];
    let readCount = 0;
    mocks.stat.mockResolvedValue({ modifiedAt: 2, isFile: true, size: 16 });
    mocks.readFile.mockImplementation(() => {
      const index = readCount;
      readCount += 1;
      if (index < 32) {
        return new Promise<string>((resolve) => firstBatchResolvers.push(resolve));
      }
      if (index < 64) return Promise.resolve(`# Note ${index}`);
      return new Promise<string>((resolve) => thirdBatchResolvers.push(resolve));
    });
    const store = createNotesStore({
      notesPath: '/notesRoot',
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

    const foregroundScan = store.getState().scanAllNotes();
    await vi.waitFor(() => expect(mocks.readFile).toHaveBeenCalledTimes(32));
    const backgroundScan = store.getState().scanAllNotes({
      background: true,
      priorityPaths: ['note-95.md'],
      onPriorityPathsScanned,
    });

    expect(onPriorityPathsScanned).not.toHaveBeenCalled();
    firstBatchResolvers.forEach((resolve, index) => resolve(`# Note ${index}`));
    await vi.waitFor(() => expect(onPriorityPathsScanned).toHaveBeenCalledTimes(1));
    expect(mocks.readFile.mock.calls.slice(32, 64).map(([path]) => path)).toContain(
      '/notesRoot/note-95.md',
    );
    expect(store.getState().noteContentsCache.get('note-95.md')?.content).toBeTruthy();
    expect(mocks.readFile).toHaveBeenCalledTimes(96);
    expect(thirdBatchResolvers).toHaveLength(32);

    thirdBatchResolvers.forEach((resolve, index) => resolve(`# Note ${index + 64}`));
    await Promise.all([foregroundScan, backgroundScan]);
    expect(onPriorityPathsScanned).toHaveBeenCalledTimes(1);
  });

  it('rejects an opted-in scan when the shared controller is cancelled', async () => {
    const { resolveRead, store } = createDeferredOneNoteScanStore();

    const scan = store.getState().scanAllNotes({ rejectOnCancel: true });
    const rejection = expect(scan).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(mocks.readFile).toHaveBeenCalledTimes(1));
    store.getState().cancelNoteContentScan();
    resolveRead('# Alpha');

    await rejection;
    expect(store.getState().noteContentsCache.size).toBe(0);
  });

  it('rejects an opted-in joiner when the scan owner cancels shared work', async () => {
    const { resolveRead, store } = createDeferredOneNoteScanStore();
    const ownerController = new AbortController();
    const onPriorityPathsScanned = vi.fn();

    const ownerScan = store.getState().scanAllNotes({ signal: ownerController.signal });
    await vi.waitFor(() => expect(mocks.readFile).toHaveBeenCalledTimes(1));
    const joinedScan = store.getState().scanAllNotes({
      background: true,
      rejectOnCancel: true,
      priorityPaths: ['alpha.md'],
      onPriorityPathsScanned,
    });
    const rejection = expect(joinedScan).rejects.toMatchObject({ name: 'AbortError' });
    ownerController.abort();

    await rejection;
    expect(onPriorityPathsScanned).not.toHaveBeenCalled();
    expect(store.getState().noteContentsCache.size).toBe(0);

    resolveRead('# Alpha');
    await ownerScan;
  });

  it('settles aborted joiners immediately without cancelling shared work', async () => {
    const { resolveRead, store } = createDeferredOneNoteScanStore();
    const joinerController = new AbortController();
    const resolvingJoinerController = new AbortController();
    const onPriorityPathsScanned = vi.fn();

    const ownerScan = store.getState().scanAllNotes();
    await vi.waitFor(() => expect(mocks.readFile).toHaveBeenCalledTimes(1));
    const joinedScan = store.getState().scanAllNotes({
      background: true,
      rejectOnCancel: true,
      signal: joinerController.signal,
      priorityPaths: ['alpha.md'],
      onPriorityPathsScanned,
    });
    const resolvingJoinedScan = store.getState().scanAllNotes({
      background: true,
      signal: resolvingJoinerController.signal,
    });
    const rejection = expect(joinedScan).rejects.toMatchObject({ name: 'AbortError' });

    joinerController.abort();
    resolvingJoinerController.abort();
    await Promise.all([rejection, resolvingJoinedScan]);
    expect(onPriorityPathsScanned).not.toHaveBeenCalled();
    expect(store.getState().noteContentsCache.size).toBe(0);

    resolveRead('# Alpha');
    await ownerScan;
    expect(store.getState().noteContentsCache.get('alpha.md')?.content).toBe('# Alpha');
  });

  it('does not start a full-notesRoot scan when its signal is already aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();
    const store = createNotesStore({
      notesPath: '/notesRoot',
      rootFolder: {
        id: '',
        name: 'Notes',
        path: '',
        isFolder: true,
        expanded: true,
        children: [{ id: 'alpha', name: 'alpha', path: 'alpha.md', isFolder: false }],
      },
    });

    await store.getState().scanAllNotes({ signal: abortController.signal });

    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(store.getState().noteContentsCache.size).toBe(0);
  });

  it('removes stale absolute-note icon and cover metadata after frontmatter deletion', async () => {
    const notePath = '/notes/alpha.md';
    const content = [
      '---',
      'vlaina_cover: "@monet/4" x=50 y=50 height=200 scale=1',
      'vlaina_icon: "💡"',
      '---',
      '# Alpha',
    ].join('\n');
    const store = createNotesStore({
      notesPath: '',
      rootFolder: null,
      currentNote: { path: notePath, content },
      openTabs: [{ path: notePath, name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([[notePath, { content, modifiedAt: 1 }]]),
      noteMetadata: {
        version: 2,
        notes: {
          [notePath]: {
            icon: '💡',
            cover: {
              assetPath: '@monet/4',
              positionX: 50,
              positionY: 50,
              height: 200,
              scale: 1,
            },
          },
        },
      },
    });

    store.getState().setNoteIcon(notePath, null);

    await vi.waitFor(() => {
      expect(store.getState().currentNote?.content).not.toContain('vlaina_icon');
    });
    expect(store.getState().noteMetadata?.notes[notePath]?.icon).toBeUndefined();
    expect(store.getState().noteMetadata?.notes[notePath]?.cover?.assetPath).toBe('@monet/4');

    store.getState().setNoteCover(notePath, null);

    await vi.waitFor(() => {
      expect(store.getState().currentNote?.content).not.toContain('vlaina_cover');
    });
    expect(store.getState().noteMetadata?.notes[notePath]?.icon).toBeUndefined();
    expect(store.getState().noteMetadata?.notes[notePath]?.cover).toBeUndefined();
  });
});

describe('featureSlice starred path resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeWriteTextFile.mockResolvedValue(undefined);
  });

  it('matches current-notesRoot absolute note paths against relative starred notes', () => {
    const store = createNotesStore({
      notesPath: '/notesRoot',
      starredEntries: [
        {
          id: 'starred-alpha',
          kind: 'note',
          notesRootPath: '/notesRoot',
          relativePath: 'docs/alpha.md',
          addedAt: 1,
        },
      ],
      starredNotes: ['docs/alpha.md'],
    });

    expect(store.getState().isStarred('/notesRoot/docs/alpha.md')).toBe(true);
    expect(store.getState().isStarred('/other/docs/alpha.md')).toBe(false);
  });

  it('matches root-notesRoot absolute note paths against relative starred notes', () => {
    const store = createNotesStore({
      notesPath: '/',
      starredEntries: [
        {
          id: 'starred-alpha',
          kind: 'note',
          notesRootPath: '/',
          relativePath: 'docs/alpha.md',
          addedAt: 1,
        },
      ],
      starredNotes: ['docs/alpha.md'],
    });

    expect(store.getState().isStarred('/docs/alpha.md')).toBe(true);
  });

  it('toggles root-notesRoot absolute note paths as relative starred entries', () => {
    const store = createNotesStore({
      notesPath: '/',
      starredEntries: [],
      starredNotes: [],
    });

    store.getState().toggleStarred('/docs/alpha.md');

    expect(store.getState().starredEntries[0]).toMatchObject({
      kind: 'note',
      notesRootPath: '/',
      relativePath: 'docs/alpha.md',
    });
    expect(store.getState().starredNotes).toEqual(['docs/alpha.md']);
  });

  it('toggles current-notesRoot absolute note paths as relative starred entries', () => {
    const store = createNotesStore({
      notesPath: '/notesRoot',
      starredEntries: [],
      starredNotes: [],
    });

    store.getState().toggleStarred('/notesRoot/docs/alpha.md');

    expect(store.getState().starredEntries[0]).toMatchObject({
      kind: 'note',
      notesRootPath: '/notesRoot',
      relativePath: 'docs/alpha.md',
    });
    expect(store.getState().starredNotes).toEqual(['docs/alpha.md']);

    store.getState().toggleStarred('/notesRoot/docs/alpha.md');

    expect(store.getState().starredEntries).toEqual([]);
    expect(store.getState().starredNotes).toEqual([]);
  });

  it('ignores non-markdown note paths when toggling current-notesRoot starred notes', () => {
    const store = createNotesStore({
      notesPath: '/notesRoot',
      starredEntries: [],
      starredNotes: [],
    });

    expect(() => store.getState().toggleStarred('/notesRoot/docs/image.png')).not.toThrow();

    expect(store.getState().starredEntries).toEqual([]);
    expect(store.getState().starredNotes).toEqual([]);
  });

  it('matches external absolute starred note paths from another notesRoot', () => {
    const store = createNotesStore({
      notesPath: '/notesRoot',
      starredEntries: [
        {
          id: 'starred-external',
          kind: 'note',
          notesRootPath: '/other',
          relativePath: 'docs/alpha.md',
          addedAt: 1,
        },
      ],
      starredNotes: [],
    });

    expect(store.getState().isStarred('/other/docs/alpha.md')).toBe(true);
  });

  it('toggles an external absolute starred note path off without adding it to the opened folder', () => {
    const store = createNotesStore({
      notesPath: '/notesRoot',
      starredEntries: [
        {
          id: 'starred-external',
          kind: 'note',
          notesRootPath: '/other',
          relativePath: 'docs/alpha.md',
          addedAt: 1,
        },
      ],
      starredNotes: [],
    });

    store.getState().toggleStarred('/other/docs/alpha.md');

    expect(store.getState().starredEntries).toEqual([]);
    expect(store.getState().starredNotes).toEqual([]);
  });

  it('toggles an external absolute starred note path off when no folder is open', () => {
    const store = createNotesStore({
      notesPath: '',
      starredEntries: [
        {
          id: 'starred-external',
          kind: 'note',
          notesRootPath: '/other',
          relativePath: 'docs/alpha.md',
          addedAt: 1,
        },
      ],
      starredNotes: [],
    });

    expect(store.getState().isStarred('/other/docs/alpha.md')).toBe(true);

    store.getState().toggleStarred('/other/docs/alpha.md');

    expect(store.getState().starredEntries).toEqual([]);
  });

  it('creates external starred entries for absolute notes when no folder is open', () => {
    const store = createNotesStore({
      notesPath: '',
      starredEntries: [],
      starredNotes: [],
    });

    store.getState().toggleStarred('/other/docs/alpha.md');

    expect(store.getState().starredEntries[0]).toMatchObject({
      kind: 'note',
      notesRootPath: '/other/docs',
      relativePath: 'alpha.md',
    });
    expect(store.getState().starredNotes).toEqual([]);
  });

  it('removes duplicate starred entries for the same external absolute note path', () => {
    const store = createNotesStore({
      notesPath: '/notesRoot',
      starredEntries: [
        {
          id: 'starred-external-a',
          kind: 'note',
          notesRootPath: '/other/docs',
          relativePath: 'alpha.md',
          addedAt: 1,
        },
        {
          id: 'starred-external-b',
          kind: 'note',
          notesRootPath: '/other/docs',
          relativePath: 'alpha.md',
          addedAt: 2,
        },
      ],
      starredNotes: [],
    });

    store.getState().toggleStarred('/other/docs/alpha.md');

    expect(store.getState().starredEntries).toEqual([]);
  });

  it('creates external starred entries for absolute notes outside the opened folder', () => {
    const store = createNotesStore({
      notesPath: '/notesRoot',
      starredEntries: [],
      starredNotes: [],
    });

    store.getState().toggleStarred('/other/docs/alpha.md');

    expect(store.getState().starredEntries[0]).toMatchObject({
      kind: 'note',
      notesRootPath: '/other/docs',
      relativePath: 'alpha.md',
    });
    expect(store.getState().starredNotes).toEqual([]);
  });
});
