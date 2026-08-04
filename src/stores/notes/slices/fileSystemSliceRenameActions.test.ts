import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileSystemSlice } from './fileSystemSlice';
import { setPendingEditorMarkdownFlusher } from '../pendingEditorMarkdownFlusher';

const hoisted = vi.hoisted(() => ({
  storageAdapter: {
    exists: vi.fn(async () => false),
    rename: vi.fn(async () => undefined),
  },
  saveStarredRegistry: vi.fn(),
  collectImageReferenceContentUpdates: vi.fn(async () => [] as Array<{
    path: string;
    documentPath?: string;
    baselineContent: string;
    content: string;
  }>),
  saveNoteDocument: vi.fn(),
}));

vi.mock('@/lib/storage/adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage/adapter')>();
  return {
    ...actual,
    getStorageAdapter: () => hoisted.storageAdapter,
  };
});

vi.mock('../starred', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../starred')>();
  return {
    ...actual,
    saveStarredRegistry: hoisted.saveStarredRegistry,
  };
});

vi.mock('../workspacePersistence', () => ({
  persistWorkspaceSnapshot: vi.fn(),
}));

vi.mock('../utils/fs/imageReferenceRewrite', () => ({
  collectImageReferenceContentUpdates: hoisted.collectImageReferenceContentUpdates,
}));

vi.mock('../document/noteDocumentPersistence', async (importOriginal) => ({
  ...await importOriginal<typeof import('../document/noteDocumentPersistence')>(),
  saveNoteDocument: hoisted.saveNoteDocument,
}));

function createSliceHarness() {
  let state: any;

  const set = (partial: any) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...nextState };
  };

  const get = () => state;
  const slice = createFileSystemSlice(set as never, get as never, {} as never);

  state = {
    ...slice,
    currentNote: null,
    currentNoteRevision: 0,
    isDirty: false,
    error: null,
    recentNotes: [],
    openTabs: [],
    noteContentsCache: new Map(),
    noteContentsCacheRevision: 0,
    draftNotes: {},
    starredEntries: [],
    starredNotes: [],
    starredFolders: [],
    noteMetadata: null,
    displayNames: new Map(),
    saveNote: vi.fn(),
  };

  return {
    getState: () => state,
  };
}

describe('fileSystemSlice rename actions', () => {
  beforeEach(() => {
    hoisted.storageAdapter.exists.mockReset();
    hoisted.storageAdapter.exists.mockResolvedValue(false);
    hoisted.storageAdapter.rename.mockReset();
    hoisted.storageAdapter.rename.mockResolvedValue(undefined);
    hoisted.saveStarredRegistry.mockReset();
    hoisted.collectImageReferenceContentUpdates.mockReset();
    hoisted.collectImageReferenceContentUpdates.mockResolvedValue([]);
    hoisted.saveNoteDocument.mockReset();
    hoisted.saveNoteDocument.mockImplementation(async ({ currentNote, cache }) => ({
      content: currentNote.content,
      modifiedAt: 2,
      size: currentNote.content.length,
      metadata: { cover: { assetPath: 'assets/renamed.png' } },
      nextCache: new Map(cache).set(currentNote.path, {
        content: currentNote.content,
        modifiedAt: 2,
      }),
    }));
    setPendingEditorMarkdownFlusher(null);
  });

  afterEach(() => {
    setPendingEditorMarkdownFlusher(null);
  });

  it('renames an image and saves rewritten note references', async () => {
    const harness = createSliceHarness();
    harness.getState().notesPath = '/notesRoot';
    harness.getState().rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [{
        id: 'assets/cover.png',
        name: 'cover.png',
        path: 'assets/cover.png',
        isFolder: false,
        kind: 'image',
      }],
    };
    harness.getState().currentNote = {
      path: 'docs/alpha.md',
      content: '![cover](../assets/cover.png)',
    };
    harness.getState().currentNoteRevision = 3;
    harness.getState().isDirty = true;
    harness.getState().openTabs = [{ path: 'docs/alpha.md', name: 'alpha', isDirty: true }];
    harness.getState().noteContentsCache = new Map([[
      'docs/alpha.md',
      { content: '![cover](../assets/cover.png)', modifiedAt: 1 },
    ]]);
    hoisted.collectImageReferenceContentUpdates.mockResolvedValue([{
      path: 'docs/alpha.md',
      baselineContent: '![cover](../assets/cover.png)',
      content: '![cover](../assets/renamed.png)',
    }]);

    await expect(harness.getState().renameImage('assets/cover.png', 'renamed.png')).resolves.toBe(
      'assets/renamed.png',
    );

    const state = harness.getState();
    expect(hoisted.storageAdapter.rename).toHaveBeenCalledWith(
      '/notesRoot/assets/cover.png',
      '/notesRoot/assets/renamed.png',
    );
    expect(hoisted.collectImageReferenceContentUpdates).toHaveBeenCalledWith(expect.objectContaining({
      oldImagePath: 'assets/cover.png',
      newImagePath: 'assets/renamed.png',
    }));
    expect(hoisted.saveNoteDocument).toHaveBeenCalledTimes(1);
    expect(state.currentNote).toEqual({
      path: 'docs/alpha.md',
      content: '![cover](../assets/renamed.png)',
    });
    expect(state.currentNoteRevision).toBe(4);
    expect(state.isDirty).toBe(false);
    expect(state.openTabs[0]).toMatchObject({ path: 'docs/alpha.md', isDirty: false });
    expect(state.rootFolder.children[0]).toMatchObject({
      path: 'assets/renamed.png',
      name: 'renamed.png',
    });
  });

  it('rolls the image rename back when the first reference save fails', async () => {
    const harness = createSliceHarness();
    harness.getState().notesPath = '/notesRoot';
    harness.getState().rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [{
        id: 'assets/cover.png',
        name: 'cover.png',
        path: 'assets/cover.png',
        isFolder: false,
        kind: 'image',
      }],
    };
    hoisted.collectImageReferenceContentUpdates.mockResolvedValue([{
      path: 'docs/alpha.md',
      baselineContent: '![cover](../assets/cover.png)',
      content: '![cover](../assets/renamed.png)',
    }]);
    hoisted.saveNoteDocument.mockRejectedValueOnce(new Error('write failed'));

    await expect(harness.getState().renameImage('assets/cover.png', 'renamed.png')).resolves.toBeNull();

    expect(hoisted.storageAdapter.rename).toHaveBeenNthCalledWith(
      1,
      '/notesRoot/assets/cover.png',
      '/notesRoot/assets/renamed.png',
    );
    expect(hoisted.storageAdapter.rename).toHaveBeenNthCalledWith(
      2,
      '/notesRoot/assets/renamed.png',
      '/notesRoot/assets/cover.png',
    );
    expect(hoisted.saveNoteDocument.mock.calls[0]?.[0].cache.get('docs/alpha.md')).toMatchObject({
      content: '![cover](../assets/cover.png)',
      modifiedAt: null,
    });
    expect(harness.getState().rootFolder.children[0]).toMatchObject({
      path: 'assets/cover.png',
      name: 'cover.png',
    });
    expect(harness.getState().error).toBe('write failed');
  });

  it('moves an image and saves rewritten note references', async () => {
    const harness = createSliceHarness();
    harness.getState().notesPath = '/notesRoot';
    harness.getState().rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [
        {
          id: 'assets/cover.png',
          name: 'cover.png',
          path: 'assets/cover.png',
          isFolder: false,
          kind: 'image',
        },
        {
          id: 'archive',
          name: 'archive',
          path: 'archive',
          isFolder: true,
          expanded: true,
          children: [],
        },
      ],
    };
    const absoluteNotePath = '/notesRoot/docs/alpha.md';
    harness.getState().currentNote = {
      path: absoluteNotePath,
      content: '![cover](../assets/cover.png)',
    };
    harness.getState().currentNoteRevision = 3;
    harness.getState().isDirty = true;
    harness.getState().openTabs = [{ path: absoluteNotePath, name: 'alpha', isDirty: true }];
    harness.getState().noteContentsCache = new Map([[
      absoluteNotePath,
      { content: '![cover](../assets/cover.png)', modifiedAt: 1 },
    ]]);
    hoisted.collectImageReferenceContentUpdates.mockResolvedValue([{
      path: 'docs/alpha.md',
      documentPath: absoluteNotePath,
      baselineContent: '![cover](../assets/cover.png)',
      content: '![cover](../archive/cover.png)',
    }]);

    await harness.getState().moveItem('assets/cover.png', 'archive');

    const state = harness.getState();
    expect(hoisted.storageAdapter.rename).toHaveBeenCalledWith(
      '/notesRoot/assets/cover.png',
      '/notesRoot/archive/cover.png',
    );
    expect(hoisted.collectImageReferenceContentUpdates).toHaveBeenCalledWith(expect.objectContaining({
      oldImagePath: 'assets/cover.png',
      newImagePath: 'archive/cover.png',
    }));
    expect(hoisted.saveNoteDocument).toHaveBeenCalledTimes(1);
    expect(hoisted.saveNoteDocument).toHaveBeenCalledWith(expect.objectContaining({
      currentNote: {
        path: absoluteNotePath,
        content: '![cover](../archive/cover.png)',
      },
    }));
    expect(state.currentNote).toEqual({
      path: absoluteNotePath,
      content: '![cover](../archive/cover.png)',
    });
    expect(state.currentNoteRevision).toBe(4);
    expect(state.isDirty).toBe(false);
    expect(state.openTabs[0]).toMatchObject({ path: absoluteNotePath, isDirty: false });
    expect(state.noteContentsCache.get('docs/alpha.md')).toMatchObject({
      content: '![cover](../archive/cover.png)',
      modifiedAt: 2,
    });
    expect(state.rootFolder.children.find((node: any) => node.path === 'archive').children[0]).toMatchObject({
      path: 'archive/cover.png',
      name: 'cover.png',
      kind: 'image',
    });
  });

  it('renames an absolute starred note and keeps the open editor state in sync', async () => {
    const harness = createSliceHarness();
    const oldPath = '/notes-root-b/docs/alpha.md';
    const newPath = '/notes-root-b/docs/beta.md';

    harness.getState().notesPath = '/notes-root-a';
    harness.getState().currentNote = { path: oldPath, content: '# alpha' };
    harness.getState().currentNoteRevision = 4;
    harness.getState().openTabs = [{ path: oldPath, name: 'alpha', isDirty: false }];
    harness.getState().recentNotes = [oldPath];
    harness.getState().displayNames = new Map([[oldPath, 'alpha']]);
    harness.getState().noteContentsCache = new Map([[oldPath, { content: '# alpha', modifiedAt: 1 }]]);
    harness.getState().noteMetadata = {
      version: 1,
      notes: {
        [oldPath]: { icon: 'sparkles' },
      },
    };
    harness.getState().starredEntries = [{
      id: 'starred-1',
      kind: 'note',
      notesRootPath: '/notes-root-b',
      relativePath: 'docs/alpha.md',
      addedAt: 1,
    }];

    await harness.getState().renameAbsoluteNote(oldPath, 'beta');
    const state = harness.getState();

    expect(hoisted.storageAdapter.rename).toHaveBeenCalledWith(oldPath, newPath);
    expect(state.currentNote).toEqual({ path: newPath, content: '# alpha' });
    expect(state.currentNoteRevision).toBe(5);
    expect(state.openTabs).toEqual([{ path: newPath, name: 'beta', isDirty: false }]);
    expect(state.recentNotes).toEqual([newPath]);
    expect(state.displayNames.get(newPath)).toBe('beta');
    expect(state.noteContentsCache.get(newPath)).toEqual({ content: '# alpha', modifiedAt: 1 });
    expect(state.noteMetadata.notes[newPath]).toEqual({ icon: 'sparkles' });
    expect(state.starredEntries[0]).toMatchObject({
      notesRootPath: '/notes-root-b',
      relativePath: 'docs/beta.md',
    });
    expect(hoisted.saveStarredRegistry).toHaveBeenCalledWith(state.starredEntries);
  });

  it('renames a root-notesRoot absolute starred note and keeps the starred entry relative', async () => {
    const harness = createSliceHarness();
    const oldPath = '/docs/alpha.md';
    const newPath = '/docs/beta.md';

    harness.getState().notesPath = '/notes-root-a';
    harness.getState().currentNote = { path: oldPath, content: '# alpha' };
    harness.getState().openTabs = [{ path: oldPath, name: 'alpha', isDirty: false }];
    harness.getState().noteContentsCache = new Map([[oldPath, { content: '# alpha', modifiedAt: 1 }]]);
    harness.getState().starredEntries = [{
      id: 'starred-root',
      kind: 'note',
      notesRootPath: '/',
      relativePath: 'docs/alpha.md',
      addedAt: 1,
    }];

    await harness.getState().renameAbsoluteNote(oldPath, 'beta');
    const state = harness.getState();

    expect(hoisted.storageAdapter.rename).toHaveBeenCalledWith(oldPath, newPath);
    expect(state.starredEntries[0]).toMatchObject({
      notesRootPath: '/',
      relativePath: 'docs/beta.md',
    });
    expect(hoisted.saveStarredRegistry).toHaveBeenCalledWith(state.starredEntries);
  });

  it('does not write a stale absolute rename result after the active notesRoot changes', async () => {
    let resolveRename: () => void;
    hoisted.storageAdapter.rename.mockImplementation(() => new Promise<undefined>((resolve) => {
      resolveRename = () => resolve(undefined);
    }));
    const harness = createSliceHarness();
    const oldPath = '/notes-root-b/docs/alpha.md';

    harness.getState().notesPath = '/notes-root-a';
    harness.getState().currentNote = { path: oldPath, content: '# alpha' };
    harness.getState().openTabs = [{ path: oldPath, name: 'alpha', isDirty: false }];
    harness.getState().noteContentsCache = new Map([[oldPath, { content: '# alpha', modifiedAt: 1 }]]);

    const rename = harness.getState().renameAbsoluteNote(oldPath, 'beta');
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.getState().notesPath = '/notes-root-c';
    resolveRename!();
    await rename;

    expect(harness.getState().notesPath).toBe('/notes-root-c');
    expect(harness.getState().currentNote).toEqual({ path: oldPath, content: '# alpha' });
    expect(harness.getState().openTabs).toEqual([{ path: oldPath, name: 'alpha', isDirty: false }]);
  });

  it('keeps edits made while an absolute rename is in flight', async () => {
    let resolveRename: () => void;
    hoisted.storageAdapter.rename.mockImplementation(() => new Promise<undefined>((resolve) => {
      resolveRename = () => resolve(undefined);
    }));
    const harness = createSliceHarness();
    const oldPath = '/notes-root-b/docs/alpha.md';
    const newPath = '/notes-root-b/docs/beta.md';

    harness.getState().notesPath = '/notes-root-a';
    harness.getState().currentNote = { path: oldPath, content: '# alpha' };
    harness.getState().currentNoteRevision = 4;
    harness.getState().isDirty = false;
    harness.getState().openTabs = [{ path: oldPath, name: 'alpha', isDirty: false }];
    harness.getState().noteContentsCache = new Map([[oldPath, { content: '# alpha', modifiedAt: 1 }]]);

    const rename = harness.getState().renameAbsoluteNote(oldPath, 'beta');
    await new Promise((resolve) => setTimeout(resolve, 0));

    harness.getState().currentNote = { path: oldPath, content: '# edited while renaming' };
    harness.getState().currentNoteRevision = 8;
    harness.getState().isDirty = true;
    harness.getState().openTabs = [{ path: oldPath, name: 'alpha', isDirty: true }];
    harness.getState().noteContentsCache = new Map([
      [oldPath, { content: '# edited while renaming', modifiedAt: 2 }],
    ]);

    resolveRename!();
    await rename;

    const state = harness.getState();
    expect(state.currentNote).toEqual({ path: newPath, content: '# edited while renaming' });
    expect(state.currentNoteRevision).toBe(9);
    expect(state.isDirty).toBe(true);
    expect(state.openTabs).toEqual([{ path: newPath, name: 'beta', isDirty: true }]);
    expect(state.noteContentsCache.has(oldPath)).toBe(false);
    expect(state.noteContentsCache.get(newPath)).toEqual({
      content: '# edited while renaming',
      modifiedAt: 2,
    });
  });

  it('flushes pending editor markdown before an absolute rename reads state', async () => {
    const harness = createSliceHarness();
    const oldPath = '/notes-root-b/docs/alpha.md';
    const newPath = '/notes-root-b/docs/beta.md';

    harness.getState().notesPath = '/notes-root-a';
    harness.getState().currentNote = { path: oldPath, content: '# alpha' };
    harness.getState().currentNoteRevision = 4;
    harness.getState().isDirty = false;
    harness.getState().openTabs = [{ path: oldPath, name: 'alpha', isDirty: false }];
    harness.getState().noteContentsCache = new Map([[oldPath, { content: '# alpha', modifiedAt: 1 }]]);
    setPendingEditorMarkdownFlusher(() => {
      harness.getState().currentNote = { path: oldPath, content: '# pending editor text' };
      harness.getState().currentNoteRevision = 5;
      harness.getState().isDirty = true;
      harness.getState().openTabs = [{ path: oldPath, name: 'alpha', isDirty: true }];
      harness.getState().noteContentsCache = new Map([
        [oldPath, { content: '# pending editor text', modifiedAt: 1 }],
      ]);
      return true;
    });

    await harness.getState().renameAbsoluteNote(oldPath, 'beta');

    const state = harness.getState();
    expect(hoisted.storageAdapter.rename).toHaveBeenCalledWith(oldPath, newPath);
    expect(state.currentNote).toEqual({ path: newPath, content: '# pending editor text' });
    expect(state.currentNoteRevision).toBe(6);
    expect(state.isDirty).toBe(true);
    expect(state.openTabs).toEqual([{ path: newPath, name: 'beta', isDirty: true }]);
    expect(state.noteContentsCache.get(newPath)).toEqual({
      content: '# pending editor text',
      modifiedAt: 1,
    });
  });

  it('rejects unsupported characters before an absolute rename reaches storage', async () => {
    const harness = createSliceHarness();
    const oldPath = '/notes-root-b/docs/alpha.md';

    harness.getState().notesPath = '/notes-root-a';
    harness.getState().currentNote = { path: oldPath, content: '# alpha' };

    await harness.getState().renameAbsoluteNote(oldPath, 'bad/name');

    expect(hoisted.storageAdapter.rename).not.toHaveBeenCalled();
    expect(harness.getState().error).toBe('File name contains unsupported characters.');
    expect(harness.getState().currentNote).toEqual({ path: oldPath, content: '# alpha' });
  });

  it('rejects absolute renames inside internal folders before reaching storage', async () => {
    const harness = createSliceHarness();

    harness.getState().notesPath = '/notes-root-a';
    harness.getState().currentNote = { path: '/notes-root-b/docs/alpha.md', content: '# alpha' };

    await harness.getState().renameAbsoluteNote('/notes-root-b/.vlaina/workspace.md', 'workspace');
    await harness.getState().renameAbsoluteNote('/notes-root-b/docs/.git/config.md', 'config');
    await harness.getState().renameAbsoluteNote('/notes-root-b/docs/.GIT/config.md', 'config');
    await harness.getState().renameAbsoluteNote('/notes-root-b/.VLAINA/workspace.md', 'workspace');

    expect(hoisted.storageAdapter.rename).not.toHaveBeenCalled();
    expect(harness.getState().error).toBe('Path must not be inside an internal notes folder.');
    expect(harness.getState().currentNote).toEqual({ path: '/notes-root-b/docs/alpha.md', content: '# alpha' });
  });

  it('rejects unsafe absolute rename source paths before reaching storage', async () => {
    const harness = createSliceHarness();

    harness.getState().notesPath = '/notes-root-a';
    harness.getState().currentNote = { path: '/notes-root-b/docs/alpha.md', content: '# alpha' };

    await harness.getState().renameAbsoluteNote('/notes-root-b/docs/secret\u202Egnp.md', 'beta');
    await harness.getState().renameAbsoluteNote('/notes-root-b/docs/secret\u001F.md', 'beta');

    expect(hoisted.storageAdapter.rename).not.toHaveBeenCalled();
    expect(harness.getState().error).toBe('Selected file path contains unsupported characters');
    expect(harness.getState().currentNote).toEqual({ path: '/notes-root-b/docs/alpha.md', content: '# alpha' });
  });

  it('preserves latest starred entries while a relative note rename is in flight', async () => {
    let resolveRename: () => void;
    hoisted.storageAdapter.rename.mockImplementation(() => new Promise<undefined>((resolve) => {
      resolveRename = () => resolve(undefined);
    }));
    const harness = createSliceHarness();

    harness.getState().notesPath = '/notes-root-a';
    harness.getState().rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [
        { id: 'docs/alpha.md', name: 'alpha', path: 'docs/alpha.md', isFolder: false },
      ],
    };
    harness.getState().starredEntries = [{
      id: 'old-star',
      kind: 'note',
      notesRootPath: '/notes-root-a',
      relativePath: 'docs/old.md',
      addedAt: 1,
    }];

    const rename = harness.getState().renameNote('docs/alpha.md', 'beta');
    await new Promise((resolve) => setTimeout(resolve, 0));

    harness.getState().starredEntries = [{
      id: 'new-star',
      kind: 'note',
      notesRootPath: '/notes-root-a',
      relativePath: 'docs/alpha.md',
      addedAt: 2,
    }];

    resolveRename!();
    await rename;

    const state = harness.getState();
    expect(state.starredEntries).toEqual([{
      id: 'new-star',
      kind: 'note',
      notesRootPath: '/notes-root-a',
      relativePath: 'docs/beta.md',
      addedAt: 2,
    }]);
    expect(hoisted.saveStarredRegistry).toHaveBeenCalledTimes(1);
    expect(hoisted.saveStarredRegistry).toHaveBeenCalledWith(state.starredEntries);
  });

  it('preserves latest starred entries while a folder rename is in flight', async () => {
    let resolveRename: () => void;
    hoisted.storageAdapter.rename.mockImplementation(() => new Promise<undefined>((resolve) => {
      resolveRename = () => resolve(undefined);
    }));
    const harness = createSliceHarness();

    harness.getState().notesPath = '/notes-root-a';
    harness.getState().rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [{
        id: 'docs',
        name: 'docs',
        path: 'docs',
        isFolder: true,
        expanded: true,
        children: [
          { id: 'docs/alpha.md', name: 'alpha', path: 'docs/alpha.md', isFolder: false },
        ],
      }],
    };
    harness.getState().starredEntries = [{
      id: 'old-star',
      kind: 'note',
      notesRootPath: '/notes-root-a',
      relativePath: 'other.md',
      addedAt: 1,
    }];

    const rename = harness.getState().renameFolder('docs', 'archive');
    await new Promise((resolve) => setTimeout(resolve, 0));

    harness.getState().starredEntries = [
      {
        id: 'folder-star',
        kind: 'folder',
        notesRootPath: '/notes-root-a',
        relativePath: 'docs',
        addedAt: 2,
      },
      {
        id: 'note-star',
        kind: 'note',
        notesRootPath: '/notes-root-a',
        relativePath: 'docs/alpha.md',
        addedAt: 3,
      },
    ];

    resolveRename!();
    await rename;

    const state = harness.getState();
    expect(state.starredEntries).toEqual([
      {
        id: 'folder-star',
        kind: 'folder',
        notesRootPath: '/notes-root-a',
        relativePath: 'archive',
        addedAt: 2,
      },
      {
        id: 'note-star',
        kind: 'note',
        notesRootPath: '/notes-root-a',
        relativePath: 'archive/alpha.md',
        addedAt: 3,
      },
    ]);
    expect(hoisted.saveStarredRegistry).toHaveBeenCalledTimes(1);
    expect(hoisted.saveStarredRegistry).toHaveBeenCalledWith(state.starredEntries);
  });

  it('preserves latest starred entries and tree nodes while a move is in flight', async () => {
    let resolveRename: () => void;
    hoisted.storageAdapter.rename.mockImplementation(() => new Promise<undefined>((resolve) => {
      resolveRename = () => resolve(undefined);
    }));
    const harness = createSliceHarness();

    harness.getState().notesPath = '/notes-root-a';
    harness.getState().rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [
        { id: 'alpha.md', name: 'alpha', path: 'alpha.md', isFolder: false },
        {
          id: 'target',
          name: 'target',
          path: 'target',
          isFolder: true,
          expanded: true,
          children: [],
        },
      ],
    };
    harness.getState().starredEntries = [{
      id: 'old-star',
      kind: 'note',
      notesRootPath: '/notes-root-a',
      relativePath: 'old.md',
      addedAt: 1,
    }];

    const move = harness.getState().moveItem('alpha.md', 'target');
    await new Promise((resolve) => setTimeout(resolve, 0));

    harness.getState().rootFolder = {
      ...harness.getState().rootFolder,
      children: [
        ...harness.getState().rootFolder.children,
        { id: 'late.md', name: 'late', path: 'late.md', isFolder: false },
      ],
    };
    harness.getState().starredEntries = [{
      id: 'new-star',
      kind: 'note',
      notesRootPath: '/notes-root-a',
      relativePath: 'alpha.md',
      addedAt: 2,
    }];

    resolveRename!();
    await move;

    const state = harness.getState();
    expect(state.starredEntries).toEqual([{
      id: 'new-star',
      kind: 'note',
      notesRootPath: '/notes-root-a',
      relativePath: 'target/alpha.md',
      addedAt: 2,
    }]);
    expect(state.rootFolder.children.some((node: any) => node.path === 'late.md')).toBe(true);
    expect(state.rootFolder.children.some((node: any) => node.path === 'alpha.md')).toBe(false);
    expect(state.rootFolder.children.find((node: any) => node.path === 'target').children).toEqual([
      { id: 'target/alpha.md', name: 'alpha', path: 'target/alpha.md', isFolder: false },
    ]);
    expect(hoisted.saveStarredRegistry).toHaveBeenCalledTimes(1);
    expect(hoisted.saveStarredRegistry).toHaveBeenCalledWith(state.starredEntries);
  });
});
