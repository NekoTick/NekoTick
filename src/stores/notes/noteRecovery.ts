import { getElectronBridge } from '@/lib/electron/bridge';
import { setCachedNoteContent } from './document/noteContentCache';
import type { DraftNoteEntry, NotesStore } from './types';

export const NOTE_RECOVERY_CONFLICT_ERROR =
  'Recovered unsaved edits conflict with the current disk content. Review or edit the note before saving.';

function getNoteContent(state: NotesStore, notePath: string): string | undefined {
  return state.currentNote?.path === notePath
    ? state.currentNote.content
    : state.noteContentsCache.get(notePath)?.content;
}

export function stageNoteRecoveryForPath(state: NotesStore, notePath: string): void {
  const content = getNoteContent(state, notePath);
  if (content === undefined) return;

  const cached = state.noteContentsCache.get(notePath);
  getElectronBridge()?.app?.stageNoteRecovery?.({
    notesPath: state.notesPath,
    notePath,
    content,
    baselineContent: cached?.savedContent ?? cached?.content ?? content,
    draft: state.draftNotes[notePath] ?? null,
  });
}

export async function clearNoteRecovery(
  notesPath: string,
  notePath: string,
  expectedContent?: string,
): Promise<boolean> {
  const clear = getElectronBridge()?.app?.clearNoteRecovery;
  if (!clear) return false;
  try {
    return await clear({ notesPath, notePath, expectedContent });
  } catch {
    return false;
  }
}

export async function flushNoteRecovery(): Promise<void> {
  await getElectronBridge()?.app?.flushNoteRecovery?.();
}

export async function migrateDraftNoteRecovery(input: {
  notesPath: string;
  draftPath: string;
  savedPath: string;
  sourceContent: string;
  savedContent: string;
  latestContent: string;
  state: NotesStore;
}): Promise<void> {
  const bridge = getElectronBridge()?.app;
  if (!bridge?.clearNoteRecovery) return;

  if (input.latestContent !== input.savedContent) {
    stageNoteRecoveryForPath(input.state, input.savedPath);
    try {
      await bridge.flushNoteRecovery?.();
    } catch {
      return;
    }
  }

  await clearNoteRecovery(
    input.notesPath,
    input.draftPath,
    input.latestContent === input.savedContent ? input.sourceContent : input.latestContent,
  );
}

function buildRecoveryConflict(recoveredContent: string, diskContent: string): string {
  return [
    '<!-- vlaina recovered unsaved edits. Review both sections before saving. -->',
    '<<<<<<< recovered unsaved edits',
    recoveredContent,
    '=======',
    diskContent,
    '>>>>>>> current disk content',
  ].join('\n');
}

export async function resolveNoteRecovery(input: {
  notesPath: string;
  notePath: string;
  diskContent: string;
}): Promise<{ content: string; conflictError: string | null } | null> {
  const read = getElectronBridge()?.app?.readNoteRecovery;
  if (!read) return null;

  const recovered = await read({
    notesPath: input.notesPath,
    notePath: input.notePath,
    currentDiskContent: input.diskContent,
  });
  if (!recovered || recovered.draft) return null;

  if (recovered.content === input.diskContent) {
    await clearNoteRecovery(input.notesPath, input.notePath, recovered.content);
    return null;
  }

  if (recovered.diskMatchesBaseline) {
    return { content: recovered.content, conflictError: null };
  }

  return {
    content: buildRecoveryConflict(recovered.content, input.diskContent),
    conflictError: NOTE_RECOVERY_CONFLICT_ERROR,
  };
}

export async function restoreDraftNoteRecoveries(
  notesPath: string,
  store: {
    getState(): NotesStore;
    setState(updater: (state: NotesStore) => Partial<NotesStore>): void;
  },
): Promise<void> {
  const listDrafts = getElectronBridge()?.app?.listDraftNoteRecoveries;
  if (!listDrafts) return;

  const recoveries = await listDrafts(notesPath);
  if (recoveries.length === 0) return;

  store.setState((state) => {
    if (state.notesPath !== notesPath) return {};

    const draftNotes = { ...state.draftNotes };
    const openTabs = [...state.openTabs];
    const displayNames = new Map(state.displayNames);
    let noteContentsCache = state.noteContentsCache;
    let currentNote = state.currentNote;
    let currentNoteRevision = state.currentNoteRevision;
    let isDirty = state.isDirty;

    for (const recovery of recoveries) {
      if (draftNotes[recovery.notePath]) continue;

      const draft = recovery.draft as DraftNoteEntry;
      draftNotes[recovery.notePath] = draft;
      displayNames.set(recovery.notePath, draft.name);
      noteContentsCache = setCachedNoteContent(
        noteContentsCache,
        recovery.notePath,
        recovery.content,
        null,
        { baselineContent: '' },
      );
      if (!openTabs.some((tab) => tab.path === recovery.notePath)) {
        openTabs.push({
          path: recovery.notePath,
          name: draft.name,
          isDirty: true,
        });
      }
      if (!currentNote) {
        currentNote = { path: recovery.notePath, content: recovery.content };
        currentNoteRevision += 1;
        isDirty = true;
      }
    }

    return {
      currentNote,
      currentNoteRevision,
      isDirty,
      draftNotes,
      openTabs,
      displayNames,
      noteContentsCache,
    };
  });
}
