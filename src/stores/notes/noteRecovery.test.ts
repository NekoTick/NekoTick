import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCachedNoteContentEntry } from './document/noteContentCache';
import {
  resolveNoteRecovery,
  restoreDraftNoteRecoveries,
  stageNoteRecoveryForPath,
} from './noteRecovery';
import { useNotesStore } from '../useNotesStore';

const readNoteRecovery = vi.fn();
const clearNoteRecovery = vi.fn();
const listDraftNoteRecoveries = vi.fn();
const stageNoteRecovery = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).vlainaDesktop = {
    platform: 'electron',
    app: {
      clearNoteRecovery,
      listDraftNoteRecoveries,
      readNoteRecovery,
      stageNoteRecovery,
    },
  };
  useNotesStore.setState({
    currentNote: null,
    currentNoteRevision: 0,
    notesPath: '/notes',
    isDirty: false,
    openTabs: [],
    draftNotes: {},
    displayNames: new Map(),
    noteContentsCache: new Map(),
  });
});

afterEach(() => {
  delete (window as any).vlainaDesktop;
});

describe('note recovery renderer integration', () => {
  it('stages the current edit against its saved baseline', () => {
    const cached = createCachedNoteContentEntry('# Edited', 1, {
      baselineContent: '# Saved',
    });
    const state = {
      ...useNotesStore.getState(),
      currentNote: { path: 'alpha.md', content: '# Edited' },
      noteContentsCache: new Map([['alpha.md', cached]]),
    };

    stageNoteRecoveryForPath(state, 'alpha.md');

    expect(stageNoteRecovery).toHaveBeenCalledWith({
      notesPath: '/notes',
      notePath: 'alpha.md',
      content: '# Edited',
      baselineContent: '# Saved',
      draft: null,
    });
  });

  it('restores unsaved content directly when disk still matches the baseline', async () => {
    readNoteRecovery.mockResolvedValue({
      content: '# Recovered',
      diskMatchesBaseline: true,
      draft: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    });

    await expect(resolveNoteRecovery({
      notesPath: '/notes',
      notePath: 'alpha.md',
      diskContent: '# Saved',
    })).resolves.toEqual({ content: '# Recovered', conflictError: null });
  });

  it('preserves both versions when disk changed after the recovered edit began', async () => {
    readNoteRecovery.mockResolvedValue({
      content: '# Recovered',
      diskMatchesBaseline: false,
      draft: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    });

    const result = await resolveNoteRecovery({
      notesPath: '/notes',
      notePath: 'alpha.md',
      diskContent: '# Changed on disk',
    });

    expect(result?.content).toContain('# Recovered');
    expect(result?.content).toContain('# Changed on disk');
    expect(result?.conflictError).toContain('Review or edit');
  });

  it('clears a stale recovery that already matches disk', async () => {
    readNoteRecovery.mockResolvedValue({
      content: '# Saved',
      diskMatchesBaseline: false,
      draft: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    clearNoteRecovery.mockResolvedValue(true);

    await expect(resolveNoteRecovery({
      notesPath: '/notes',
      notePath: 'alpha.md',
      diskContent: '# Saved',
    })).resolves.toBeNull();
    expect(clearNoteRecovery).toHaveBeenCalledWith({
      notesPath: '/notes',
      notePath: 'alpha.md',
      expectedContent: '# Saved',
    });
  });

  it('restores draft content as a visible dirty tab', async () => {
    listDraftNoteRecoveries.mockResolvedValue([{
      notePath: 'draft:recovered',
      content: 'Recovered draft',
      draft: { parentPath: null, name: 'Recovered' },
      updatedAt: '2026-08-01T00:00:00.000Z',
    }]);

    await restoreDraftNoteRecoveries('/notes', useNotesStore);

    const state = useNotesStore.getState();
    expect(state.currentNote).toEqual({ path: 'draft:recovered', content: 'Recovered draft' });
    expect(state.isDirty).toBe(true);
    expect(state.openTabs).toContainEqual({
      path: 'draft:recovered',
      name: 'Recovered',
      isDirty: true,
    });
    expect(state.noteContentsCache.get('draft:recovered')?.content).toBe('Recovered draft');
  });
});
