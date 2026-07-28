import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveNoteDocument = vi.hoisted(() => vi.fn());

vi.mock('./document/noteDocumentPersistence', () => ({
  saveNoteDocument,
}));

import { useNotesStore } from '@/stores/useNotesStore';
import { flushPendingEditorMarkdown, savePendingEditorMarkdown } from './pendingEditorMarkdown';

describe('flushPendingEditorMarkdown', () => {
  beforeEach(() => {
    saveNoteDocument.mockReset();
    saveNoteDocument.mockImplementation(async ({ currentNote, cache }) => ({
      content: currentNote.content,
      metadata: {},
      modifiedAt: 11,
      size: currentNote.content.length,
      nextCache: cache,
    }));
    useNotesStore.setState({
      currentNote: null,
      currentNoteRevision: 0,
      isDirty: false,
      openTabs: [],
      noteContentsCache: new Map(),
    });
  });

  it('flushes pending markdown into the active note before an editor instance is removed', () => {
    useNotesStore.setState({
      currentNote: { path: 'alpha.md', content: 'Old content' },
      currentNoteRevision: 3,
      isDirty: false,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['alpha.md', { content: 'Old content', modifiedAt: 7 }]]),
    });

    const didFlush = flushPendingEditorMarkdown('alpha.md', 'Unsaved content');

    const state = useNotesStore.getState();
    expect(didFlush).toBe(true);
    expect(state.currentNote).toEqual({ path: 'alpha.md', content: 'Unsaved content' });
    expect(state.currentNoteRevision).toBe(4);
    expect(state.isDirty).toBe(true);
    expect(state.openTabs).toEqual([{ path: 'alpha.md', name: 'alpha', isDirty: true }]);
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: 'Unsaved content',
      modifiedAt: 7,
    });
  });

  it('preserves user-authored reserved comments while normalizing serializer artifacts', () => {
    useNotesStore.setState({
      currentNote: { path: 'alpha.md', content: 'Old content' },
      currentNoteRevision: 3,
      isDirty: false,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['alpha.md', { content: 'Old content', modifiedAt: 7 }]]),
    });

    const didFlush = flushPendingEditorMarkdown('alpha.md', [
      '# Alpha',
      '<!--vlaina-markdown-blank-line-->',
      '&#x20; Pro:   \\$76.80 / year',
      '&#32 Max:   \\$191.90 / year',
    ].join('\n'));

    const expected = [
      '# Alpha',
      '<!--vlaina-markdown-blank-line-->',
      '  Pro:   \\$76.80 / year',
      ' Max:   \\$191.90 / year',
    ].join('\n');
    const state = useNotesStore.getState();
    expect(didFlush).toBe(true);
    expect(state.currentNote).toEqual({ path: 'alpha.md', content: expected });
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: expected,
      modifiedAt: 7,
    });
    expect(state.currentNote?.content).toContain('vlaina-markdown-blank-line');
    expect(state.currentNote?.content).not.toContain('&#x20');
    expect(state.currentNote?.content).not.toContain('&#32');
  });

  it('preserves a user-authored reserved comment after rendered HTML', () => {
    useNotesStore.setState({
      currentNote: { path: 'alpha.md', content: 'Old content' },
      currentNoteRevision: 3,
      isDirty: false,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['alpha.md', { content: 'Old content', modifiedAt: 7 }]]),
    });

    const didFlush = flushPendingEditorMarkdown('alpha.md', [
      '<img src="./assets/demo.svg" alt="Demo" />',
      '',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      'After image.',
    ].join('\n'));

    const expected = [
      '<img src="./assets/demo.svg" alt="Demo" />',
      '',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      'After image.',
    ].join('\n');
    const state = useNotesStore.getState();
    expect(didFlush).toBe(true);
    expect(state.currentNote).toEqual({ path: 'alpha.md', content: expected });
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: expected,
      modifiedAt: 7,
    });
    expect(state.currentNote?.content).toContain('vlaina-rendered-html-boundary-blank-line');
  });

  it('preserves user-authored rendered HTML boundary comments outside helper positions', () => {
    useNotesStore.setState({
      currentNote: { path: 'alpha.md', content: 'Old content' },
      currentNoteRevision: 3,
      isDirty: false,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['alpha.md', { content: 'Old content', modifiedAt: 7 }]]),
    });

    const expected = [
      'Before',
      '',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      'After',
    ].join('\n');
    const didFlush = flushPendingEditorMarkdown('alpha.md', expected);

    const state = useNotesStore.getState();
    expect(didFlush).toBe(true);
    expect(state.currentNote).toEqual({ path: 'alpha.md', content: expected });
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: expected,
      modifiedAt: 7,
    });
  });

  it('normalizes serializer-escaped html-like paragraph text before it enters note state', () => {
    useNotesStore.setState({
      currentNote: { path: 'alpha.md', content: 'Old content' },
      currentNoteRevision: 3,
      isDirty: false,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['alpha.md', { content: 'Old content', modifiedAt: 7 }]]),
    });

    const didFlush = flushPendingEditorMarkdown('alpha.md', '\\<p>');

    const state = useNotesStore.getState();
    expect(didFlush).toBe(true);
    expect(state.currentNote).toEqual({ path: 'alpha.md', content: '<p>' });
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: '<p>',
      modifiedAt: 7,
    });
  });

  it('normalizes serializer-escaped intraword underscores before they enter note state', () => {
    useNotesStore.setState({
      currentNote: { path: 'alpha.md', content: 'Old content' },
      currentNoteRevision: 3,
      isDirty: false,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['alpha.md', { content: 'Old content', modifiedAt: 7 }]]),
    });

    const didFlush = flushPendingEditorMarkdown('alpha.md', 'h\\_i and foo\\_\\_bar');

    const expected = 'h_i and foo__bar';
    const state = useNotesStore.getState();
    expect(didFlush).toBe(true);
    expect(state.currentNote).toEqual({ path: 'alpha.md', content: expected });
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: expected,
      modifiedAt: 7,
    });
  });

  it('keeps ordinary typed line breaks as ordinary markdown newlines during flush', () => {
    useNotesStore.setState({
      currentNote: { path: 'alpha.md', content: 'Old content' },
      currentNoteRevision: 3,
      isDirty: false,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['alpha.md', { content: 'Old content', modifiedAt: 7 }]]),
    });

    const didFlush = flushPendingEditorMarkdown('alpha.md', '1\n2');

    const state = useNotesStore.getState();
    expect(didFlush).toBe(true);
    expect(state.currentNote).toEqual({ path: 'alpha.md', content: '1\n2' });
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: '1\n2',
      modifiedAt: 7,
    });
  });

  it('treats a reserved standalone comment as user content', () => {
    const currentContent = [
      '# Alpha',
      '',
      '  Pro:   \\$76.80 / year',
      ' Max:   \\$191.90 / year',
    ].join('\n');

    useNotesStore.setState({
      currentNote: { path: 'alpha.md', content: currentContent },
      currentNoteRevision: 3,
      isDirty: false,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['alpha.md', { content: currentContent, modifiedAt: 7 }]]),
    });

    const didFlush = flushPendingEditorMarkdown('alpha.md', [
      '# Alpha',
      '<!--vlaina-markdown-blank-line-->',
      '&#x20; Pro:   \\$76.80 / year',
      '&#32 Max:   \\$191.90 / year',
    ].join('\n'));

    const state = useNotesStore.getState();
    const expected = [
      '# Alpha',
      '<!--vlaina-markdown-blank-line-->',
      '  Pro:   \\$76.80 / year',
      ' Max:   \\$191.90 / year',
    ].join('\n');
    expect(didFlush).toBe(true);
    expect(state.currentNoteRevision).toBe(4);
    expect(state.isDirty).toBe(true);
    expect(state.openTabs).toEqual([{ path: 'alpha.md', name: 'alpha', isDirty: true }]);
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: expected,
      modifiedAt: 7,
    });
  });

  it('keeps pending list spacing edits instead of treating them as save-normalization noise', () => {
    const savedContent = ['1. First item', '2. Second item', '3. Third item'].join('\n');
    const pendingContent = ['1. First item', '', '2. Second item', '3. Third item'].join('\n');

    useNotesStore.setState({
      currentNote: { path: 'alpha.md', content: savedContent },
      currentNoteRevision: 3,
      isDirty: false,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['alpha.md', { content: savedContent, modifiedAt: 7 }]]),
    });

    const didFlush = flushPendingEditorMarkdown('alpha.md', pendingContent);

    const state = useNotesStore.getState();
    expect(didFlush).toBe(true);
    expect(state.currentNote).toEqual({ path: 'alpha.md', content: pendingContent });
    expect(state.currentNoteRevision).toBe(4);
    expect(state.isDirty).toBe(true);
    expect(state.openTabs).toEqual([{ path: 'alpha.md', name: 'alpha', isDirty: true }]);
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: pendingContent,
      modifiedAt: 7,
    });
  });

  it('keeps pending list spacing edits for a background tab', () => {
    const savedContent = [
      '---',
      'vlaina_updated: "2026-05-08T08:05:50.781Z"',
      '---',
      '# 3',
      '',
      '1. First item',
      '2. Second item',
    ].join('\n');
    const pendingContent = [
      '---',
      'vlaina_updated: "2026-05-08T08:05:50.781Z"',
      '---',
      '# 3',
      '',
      '1. First item',
      '',
      '2. Second item',
    ].join('\n');

    useNotesStore.setState({
      currentNote: { path: 'beta.md', content: 'Beta content' },
      currentNoteRevision: 8,
      isDirty: false,
      openTabs: [
        { path: 'alpha.md', name: 'alpha', isDirty: false },
        { path: 'beta.md', name: 'beta', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['alpha.md', { content: savedContent, modifiedAt: 17 }],
        ['beta.md', { content: 'Beta content', modifiedAt: 3 }],
      ]),
    });

    const didFlush = flushPendingEditorMarkdown('alpha.md', pendingContent);

    const state = useNotesStore.getState();
    expect(didFlush).toBe(true);
    expect(state.currentNote).toEqual({ path: 'beta.md', content: 'Beta content' });
    expect(state.currentNoteRevision).toBe(8);
    expect(state.isDirty).toBe(false);
    expect(state.openTabs).toEqual([
      { path: 'alpha.md', name: 'alpha', isDirty: true },
      { path: 'beta.md', name: 'beta', isDirty: false },
    ]);
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: pendingContent,
      modifiedAt: 17,
    });
  });

  it('flushes pending markdown into a background tab without changing the active note', () => {
    useNotesStore.setState({
      currentNote: { path: 'beta.md', content: 'Beta content' },
      currentNoteRevision: 4,
      isDirty: false,
      openTabs: [
        { path: 'alpha.md', name: 'alpha', isDirty: false },
        { path: 'beta.md', name: 'beta', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['alpha.md', { content: 'Old alpha', modifiedAt: 2 }],
        ['beta.md', { content: 'Beta content', modifiedAt: 3 }],
      ]),
    });

    const didFlush = flushPendingEditorMarkdown('alpha.md', 'Unsaved alpha');

    const state = useNotesStore.getState();
    expect(didFlush).toBe(true);
    expect(state.currentNote).toEqual({ path: 'beta.md', content: 'Beta content' });
    expect(state.currentNoteRevision).toBe(4);
    expect(state.isDirty).toBe(false);
    expect(state.openTabs).toEqual([
      { path: 'alpha.md', name: 'alpha', isDirty: true },
      { path: 'beta.md', name: 'beta', isDirty: false },
    ]);
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: 'Unsaved alpha',
      modifiedAt: 2,
    });
  });

  it('saves pending markdown for a background tab without activating that tab', async () => {
    let resolveSave: () => void = () => {};
    saveNoteDocument.mockImplementationOnce(async ({ currentNote, cache }) => new Promise((resolve) => {
      resolveSave = () => resolve({
        content: currentNote.content,
        metadata: {},
        modifiedAt: 11,
        size: currentNote.content.length,
        nextCache: cache,
      });
    }));
    useNotesStore.setState({
      notesPath: '/notesRoot',
      currentNote: { path: 'beta.md', content: 'Beta content' },
      currentNoteRevision: 4,
      isDirty: false,
      openTabs: [
        { path: 'alpha.md', name: 'alpha', isDirty: false },
        { path: 'beta.md', name: 'beta', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['alpha.md', { content: 'Old alpha', modifiedAt: 2 }],
        ['beta.md', { content: 'Beta content', modifiedAt: 3 }],
      ]),
    });

    const savePromise = savePendingEditorMarkdown('alpha.md', 'Unsaved alpha');
    await Promise.resolve();

    expect(useNotesStore.getState().openTabs).toEqual([
      { path: 'alpha.md', name: 'alpha', isDirty: false },
      { path: 'beta.md', name: 'beta', isDirty: false },
    ]);
    expect(useNotesStore.getState().noteContentsCache.get('alpha.md')).toEqual({
      content: 'Unsaved alpha',
      modifiedAt: 2,
    });

    resolveSave();
    const didSave = await savePromise;

    const state = useNotesStore.getState();
    expect(didSave).toBe(true);
    expect(saveNoteDocument).toHaveBeenCalledWith({
      notesPath: '/notesRoot',
      currentNote: { path: 'alpha.md', content: 'Unsaved alpha' },
      cache: expect.any(Map),
    });
    expect(state.currentNote).toEqual({ path: 'beta.md', content: 'Beta content' });
    expect(state.currentNoteRevision).toBe(4);
    expect(state.isDirty).toBe(false);
    expect(state.openTabs).toEqual([
      { path: 'alpha.md', name: 'alpha', isDirty: false },
      { path: 'beta.md', name: 'beta', isDirty: false },
    ]);
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: 'Unsaved alpha',
      modifiedAt: 11,
    });
  });

  it('lets an explicit cross-note source save replace a stale editor flush', async () => {
    let resolveSave: () => void = () => {};
    saveNoteDocument.mockImplementationOnce(async ({ currentNote, cache }) => new Promise((resolve) => {
      resolveSave = () => resolve({
        content: currentNote.content,
        metadata: {},
        modifiedAt: 11,
        size: currentNote.content.length,
        nextCache: cache,
      });
    }));
    useNotesStore.setState({
      notesPath: '/notesRoot',
      currentNote: { path: 'beta.md', content: 'Beta content' },
      currentNoteRevision: 4,
      isDirty: false,
      openTabs: [
        { path: 'alpha.md', name: 'alpha', isDirty: false },
        { path: 'beta.md', name: 'beta', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['alpha.md', { content: 'Source before move', modifiedAt: 2 }],
        ['beta.md', { content: 'Beta content', modifiedAt: 3 }],
      ]),
    });

    const savePromise = savePendingEditorMarkdown(
      'alpha.md',
      'Source after move',
      { replaceConcurrentContentIfEqualTo: 'Source before move' },
    );
    await Promise.resolve();

    expect(flushPendingEditorMarkdown('alpha.md', 'Source before move')).toBe(true);
    expect(useNotesStore.getState().openTabs[0]?.isDirty).toBe(true);

    resolveSave();
    await expect(savePromise).resolves.toBe(true);

    const state = useNotesStore.getState();
    expect(state.currentNote).toEqual({ path: 'beta.md', content: 'Beta content' });
    expect(state.openTabs[0]?.isDirty).toBe(false);
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: 'Source after move',
      modifiedAt: 11,
    });
  });

  it('does not start a conditional source save after the source content has changed', async () => {
    useNotesStore.setState({
      notesPath: '/notesRoot',
      currentNote: { path: 'beta.md', content: 'Beta content' },
      currentNoteRevision: 4,
      isDirty: false,
      openTabs: [
        { path: 'alpha.md', name: 'alpha', isDirty: true },
        { path: 'beta.md', name: 'beta', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['alpha.md', { content: 'Source changed before drop save', modifiedAt: 2 }],
        ['beta.md', { content: 'Beta content', modifiedAt: 3 }],
      ]),
    });

    await expect(savePendingEditorMarkdown(
      'alpha.md',
      'Source after move',
      { replaceConcurrentContentIfEqualTo: 'Source before move' },
    )).resolves.toBe(false);

    expect(saveNoteDocument).not.toHaveBeenCalled();
    expect(useNotesStore.getState().noteContentsCache.get('alpha.md')).toEqual({
      content: 'Source changed before drop save',
      modifiedAt: 2,
    });
  });

  it('does not replace a genuine source edit made while a cross-note save is in flight', async () => {
    let resolveSave: () => void = () => {};
    saveNoteDocument.mockImplementationOnce(async ({ currentNote, cache }) => new Promise((resolve) => {
      resolveSave = () => resolve({
        content: currentNote.content,
        metadata: {},
        modifiedAt: 11,
        size: currentNote.content.length,
        nextCache: cache,
      });
    }));
    useNotesStore.setState({
      notesPath: '/notesRoot',
      currentNote: { path: 'beta.md', content: 'Beta content' },
      currentNoteRevision: 4,
      isDirty: false,
      openTabs: [
        { path: 'alpha.md', name: 'alpha', isDirty: false },
        { path: 'beta.md', name: 'beta', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['alpha.md', { content: 'Source before move', modifiedAt: 2 }],
        ['beta.md', { content: 'Beta content', modifiedAt: 3 }],
      ]),
    });

    const savePromise = savePendingEditorMarkdown(
      'alpha.md',
      'Source after move',
      { replaceConcurrentContentIfEqualTo: 'Source before move' },
    );
    await Promise.resolve();

    expect(flushPendingEditorMarkdown('alpha.md', 'Source after move plus user edit')).toBe(true);
    resolveSave();
    await expect(savePromise).resolves.toBe(false);

    const state = useNotesStore.getState();
    expect(state.openTabs[0]?.isDirty).toBe(true);
    const cached = state.noteContentsCache.get('alpha.md');
    expect(cached).toEqual({
      content: 'Source after move plus user edit',
      modifiedAt: 11,
    });
    expect(cached?.savedContent).toBe('Source after move');
    expect(cached?.size).toBe('Source after move'.length);
  });

  it('does not clear the active note save error when a background save succeeds', async () => {
    saveNoteDocument.mockImplementationOnce(async ({ currentNote, cache }) => ({
      content: currentNote.content,
      metadata: {},
      modifiedAt: 11,
      size: currentNote.content.length,
      nextCache: cache,
    }));
    useNotesStore.setState({
      notesPath: '/notesRoot',
      currentNote: { path: 'beta.md', content: 'Unsaved beta' },
      currentNoteRevision: 4,
      isDirty: true,
      error: 'beta save failed',
      saveError: 'beta save failed',
      saveErrorPath: 'beta.md',
      openTabs: [
        { path: 'alpha.md', name: 'alpha', isDirty: false },
        { path: 'beta.md', name: 'beta', isDirty: true },
      ],
      noteContentsCache: new Map([
        ['alpha.md', { content: 'Old alpha', modifiedAt: 2 }],
        ['beta.md', { content: 'Unsaved beta', modifiedAt: 3 }],
      ]),
    });

    const didSave = await savePendingEditorMarkdown('alpha.md', 'Unsaved alpha');

    expect(didSave).toBe(true);
    expect(useNotesStore.getState()).toMatchObject({
      currentNote: { path: 'beta.md', content: 'Unsaved beta' },
      isDirty: true,
      error: 'beta save failed',
      saveError: 'beta save failed',
      saveErrorPath: 'beta.md',
    });
  });

  it('keeps the file tree reference stable when pending autosave only changes mtime metadata under name sorting', async () => {
    const rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true as const,
      expanded: true,
      children: [
        { id: 'alpha.md', name: 'alpha', path: 'alpha.md', isFolder: false as const },
        { id: 'beta.md', name: 'beta', path: 'beta.md', isFolder: false as const },
      ],
    };
    saveNoteDocument.mockImplementationOnce(async ({ currentNote, cache }) => ({
      content: currentNote.content,
      metadata: { updatedAt: 11 },
      modifiedAt: 11,
      size: currentNote.content.length,
      nextCache: cache,
    }));
    useNotesStore.setState({
      notesPath: '/notesRoot',
      rootFolder,
      currentNote: { path: 'alpha.md', content: 'Old alpha' },
      currentNoteRevision: 4,
      isDirty: false,
      openTabs: [{ path: 'alpha.md', name: 'alpha', isDirty: false }],
      fileTreeSortMode: 'name-asc',
      noteMetadata: { version: 2, notes: {} },
      noteContentsCache: new Map([['alpha.md', { content: 'Old alpha', modifiedAt: 2 }]]),
    });

    const didSave = await savePendingEditorMarkdown('alpha.md', 'Unsaved alpha');

    const state = useNotesStore.getState();
    expect(didSave).toBe(true);
    expect(state.rootFolder).toBe(rootFolder);
    expect(state.noteMetadata?.notes['alpha.md']?.updatedAt).toBe(11);
    expect(state.openTabs).toEqual([{ path: 'alpha.md', name: 'alpha', isDirty: false }]);
  });

  it('restores a dirty tab if navigation already replaced it before the editor flushed', () => {
    useNotesStore.setState({
      currentNote: { path: 'beta.md', content: 'Beta content' },
      currentNoteRevision: 4,
      isDirty: false,
      openTabs: [{ path: 'beta.md', name: 'beta', isDirty: false }],
      noteContentsCache: new Map([['alpha.md', { content: 'Old alpha', modifiedAt: 2 }]]),
    });

    const didFlush = flushPendingEditorMarkdown('alpha.md', 'Unsaved alpha');

    const state = useNotesStore.getState();
    expect(didFlush).toBe(true);
    expect(state.currentNote).toEqual({ path: 'beta.md', content: 'Beta content' });
    expect(state.openTabs).toEqual([
      { path: 'beta.md', name: 'beta', isDirty: false },
      { path: 'alpha.md', name: 'alpha', isDirty: true },
    ]);
    expect(state.noteContentsCache.get('alpha.md')).toEqual({
      content: 'Unsaved alpha',
      modifiedAt: 2,
    });
  });

  it('ignores a stale editor flush after the workspace has been reset', () => {
    useNotesStore.setState({
      notesPath: '/next-notesRoot',
      currentNote: null,
      currentNoteRevision: 0,
      isDirty: false,
      openTabs: [],
      noteContentsCache: new Map(),
    });

    const didFlush = flushPendingEditorMarkdown('alpha.md', 'Old notesRoot draft');

    const state = useNotesStore.getState();
    expect(didFlush).toBe(false);
    expect(state.currentNote).toBeNull();
    expect(state.openTabs).toEqual([]);
    expect(state.noteContentsCache.size).toBe(0);
    expect(state.isDirty).toBe(false);
  });
});
