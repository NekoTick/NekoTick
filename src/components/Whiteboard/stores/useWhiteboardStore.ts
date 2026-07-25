import { create } from 'zustand';
import {
  createWhiteboardEntry,
  deleteWhiteboardEntry,
  loadWhiteboardIndex,
  readWhiteboardBoard,
  writeWhiteboardAsset,
  writeWhiteboardBoard,
  writeWhiteboardIndex,
  type WhiteboardIndexEntry,
} from '../model/whiteboardRepository';
import { normalizeWhiteboardSnapshot, type WhiteboardSnapshot } from '../model/whiteboardDocument';
import { queueWhiteboardSnapshotWrite, waitForWhiteboardSnapshotWrites } from './whiteboardSnapshotQueue';

export type WhiteboardSaveResult =
  | { ok: true; byteLength: number }
  | { ok: false; byteLength: number; reason: 'storage-unavailable' | 'write-failed' };

interface WhiteboardStore {
  activeBoardId: string | null;
  activeSnapshot: WhiteboardSnapshot | null;
  boards: WhiteboardIndexEntry[];
  error: string | null;
  loadedNotesRootPath: string | null;
  loading: boolean;
  createBoard: (title?: string) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;
  loadForNotesRoot: (notesRootPath: string | null) => Promise<void>;
  renameBoard: (id: string, title: string) => Promise<void>;
  saveActiveSnapshot: (snapshot: WhiteboardSnapshot, boardId?: string | null, notesRootPath?: string | null) => Promise<WhiteboardSaveResult | null>;
  selectBoard: (id: string) => Promise<void>;
  setActiveSnapshotDraft: (snapshot: WhiteboardSnapshot) => void;
  writeActiveAsset: (file: File) => Promise<string | null>;
}

let activeSnapshotDraft: { boardId: string | null; notesRootPath: string; snapshot: WhiteboardSnapshot } | null = null;
let whiteboardLoadSequence = 0;
let whiteboardMutationSequence = 0;

export const useWhiteboardStore = create<WhiteboardStore>((set, get) => ({
  activeBoardId: null,
  activeSnapshot: null,
  boards: [],
  error: null,
  loadedNotesRootPath: null,
  loading: false,

  createBoard: async (title = 'Board') => {
    const notesRootPath = get().loadedNotesRootPath;
    if (!notesRootPath || get().loading) return;
    whiteboardMutationSequence += 1;
    whiteboardLoadSequence += 1;
    set({ loading: true });
    try {
      await flushActiveSnapshot(get);
      const emptySnapshot = normalizeWhiteboardSnapshot({});
      const { entry, index } = await createWhiteboardEntry(notesRootPath, title === 'Board' ? getNextBoardTitle(get().boards) : title);
      setSnapshotDraft(notesRootPath, entry.id, emptySnapshot);
      set({
        activeBoardId: entry.id,
        activeSnapshot: emptySnapshot,
        boards: index.boards,
        error: null,
        loading: false,
      });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  deleteBoard: async (id) => {
    const { activeBoardId, boards, loadedNotesRootPath } = get();
    const board = boards.find((item) => item.id === id);
    if (!loadedNotesRootPath || !board || get().loading) return;
    whiteboardMutationSequence += 1;
    whiteboardLoadSequence += 1;
    set({ loading: true });
    try {
      await flushActiveSnapshot(get);
      let nextBoards = boards.filter((item) => item.id !== id);
      if (nextBoards.length === 0) {
        const created = await createWhiteboardEntry(loadedNotesRootPath);
        nextBoards = created.index.boards.filter((item) => item.id !== id);
      }
      const deletedIndex = boards.findIndex((item) => item.id === id);
      const nextActiveId = activeBoardId === id
        ? nextBoards[Math.min(deletedIndex, nextBoards.length - 1)]?.id ?? nextBoards[0].id
        : activeBoardId ?? nextBoards[0].id;
      const nextActiveBoard = nextBoards.find((item) => item.id === nextActiveId) ?? nextBoards[0];
      await writeWhiteboardIndex(loadedNotesRootPath, {
        activeBoardId: nextActiveBoard.id,
        boards: nextBoards,
        version: 1,
      });
      await deleteWhiteboardEntry(loadedNotesRootPath, board)
        .catch(() => deleteWhiteboardEntry(loadedNotesRootPath, board))
        .catch(() => undefined);
      const snapshot = activeBoardId === id
        ? await readWhiteboardBoard(loadedNotesRootPath, nextActiveBoard) ?? normalizeWhiteboardSnapshot({})
        : get().activeSnapshot ?? normalizeWhiteboardSnapshot({});
      setSnapshotDraft(loadedNotesRootPath, nextActiveBoard.id, snapshot);
      set({
        activeBoardId: nextActiveBoard.id,
        activeSnapshot: snapshot,
        boards: nextBoards,
        error: null,
        loading: false,
      });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  loadForNotesRoot: async (notesRootPath) => {
    if (get().loadedNotesRootPath === notesRootPath && get().boards.length > 0) return;
    const loadSequence = ++whiteboardLoadSequence;
    const mutationSequence = whiteboardMutationSequence;
    set({ loading: true });
    try {
      if (!notesRootPath) {
        await flushActiveSnapshot(get);
        if (loadSequence !== whiteboardLoadSequence || mutationSequence !== whiteboardMutationSequence) return;
        set({ activeBoardId: null, activeSnapshot: null, boards: [], error: null, loadedNotesRootPath: null, loading: false });
        setSnapshotDraft(null, null, null);
        return;
      }
      const index = await loadWhiteboardIndex(notesRootPath);
      const activeBoard = index.boards.find((board) => board.id === index.activeBoardId) ?? index.boards[0];
      const storedSnapshot = await readWhiteboardBoard(notesRootPath, activeBoard);
      const snapshot = storedSnapshot ?? normalizeWhiteboardSnapshot({});
      if (loadSequence !== whiteboardLoadSequence || mutationSequence !== whiteboardMutationSequence) return;
      if (get().loadedNotesRootPath && get().loadedNotesRootPath !== notesRootPath) {
        await flushActiveSnapshot(get);
      }
      if (loadSequence !== whiteboardLoadSequence || mutationSequence !== whiteboardMutationSequence) return;
      await writeWhiteboardIndex(notesRootPath, index);
      if (!storedSnapshot) {
        await writeWhiteboardBoard(notesRootPath, activeBoard, snapshot);
      }
      if (loadSequence !== whiteboardLoadSequence || mutationSequence !== whiteboardMutationSequence) return;
      setSnapshotDraft(notesRootPath, activeBoard.id, snapshot);
      set({
        activeBoardId: activeBoard.id,
        activeSnapshot: snapshot,
        boards: index.boards,
        error: null,
        loadedNotesRootPath: notesRootPath,
        loading: false,
      });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  renameBoard: async (id, title) => {
    const { activeBoardId, boards, loadedNotesRootPath } = get();
    const nextTitle = title.trim().slice(0, 120);
    if (!loadedNotesRootPath || !nextTitle || get().loading) return;
    const board = boards.find((item) => item.id === id);
    if (!board || board.title === nextTitle) return;
    const nextBoards = boards.map((item) => (
      item.id === id ? { ...item, title: nextTitle, updatedAt: new Date().toISOString() } : item
    ));
    whiteboardMutationSequence += 1;
    whiteboardLoadSequence += 1;
    set({ boards: nextBoards, loading: true });
    try {
      await writeWhiteboardIndex(loadedNotesRootPath, {
        activeBoardId: activeBoardId && nextBoards.some((item) => item.id === activeBoardId)
          ? activeBoardId
          : nextBoards[0].id,
        boards: nextBoards,
        version: 1,
      });
      set({ error: null, loading: false });
    } catch (error) {
      set((state) => ({
        boards: state.boards === nextBoards ? boards : state.boards,
        error: getErrorMessage(error),
        loading: false,
      }));
    }
  },

  saveActiveSnapshot: async (snapshot, boardId, notesRootPath) => {
    const { activeBoardId, boards, loadedNotesRootPath } = get();
    const mutationSequence = whiteboardMutationSequence;
    const targetBoardId = boardId ?? activeBoardId;
    const targetNotesRootPath = notesRootPath ?? loadedNotesRootPath;
    if (!targetNotesRootPath) return null;
    if (
      targetNotesRootPath !== loadedNotesRootPath ||
      activeSnapshotDraft?.notesRootPath !== targetNotesRootPath ||
      activeSnapshotDraft?.boardId !== targetBoardId ||
      activeSnapshotDraft.snapshot !== snapshot
    ) return { byteLength: 0, ok: true };
    const activeBoard = boards.find((board) => board.id === targetBoardId);
    if (!activeBoard) return null;
    try {
      const byteLength = await queueWhiteboardSnapshotWrite(targetNotesRootPath, activeBoard, snapshot);
      if (
        get().loadedNotesRootPath !== targetNotesRootPath ||
        mutationSequence !== whiteboardMutationSequence ||
        activeSnapshotDraft?.notesRootPath !== targetNotesRootPath ||
        activeSnapshotDraft.boardId !== targetBoardId ||
        activeSnapshotDraft.snapshot !== snapshot
      ) {
        return { byteLength, ok: true };
      }
      const updatedBoard = { ...activeBoard, updatedAt: new Date().toISOString() };
      const latestBoards = get().boards;
      const baseBoards = latestBoards.some((board) => board.id === updatedBoard.id) ? latestBoards : boards;
      const nextBoards = baseBoards.map((board) => (board.id === updatedBoard.id ? updatedBoard : board));
      set({ boards: nextBoards });
      const currentActiveBoardId = get().activeBoardId;
      await writeWhiteboardIndex(targetNotesRootPath, {
        activeBoardId: currentActiveBoardId && nextBoards.some((board) => board.id === currentActiveBoardId)
          ? currentActiveBoardId
          : updatedBoard.id,
        boards: nextBoards,
        version: 1,
      });
      return { byteLength, ok: true };
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return { byteLength: 0, ok: false, reason: 'write-failed' };
    }
  },

  selectBoard: async (id) => {
    const { boards, loadedNotesRootPath } = get();
    if (!loadedNotesRootPath || get().loading) return;
    const board = boards.find((item) => item.id === id);
    if (!board) return;
    whiteboardMutationSequence += 1;
    whiteboardLoadSequence += 1;
    set({ loading: true });
    try {
      await flushActiveSnapshot(get);
      const index = await loadWhiteboardIndex(loadedNotesRootPath);
      await writeWhiteboardIndex(loadedNotesRootPath, { ...index, activeBoardId: id });
      const snapshot = await readWhiteboardBoard(loadedNotesRootPath, board) ?? normalizeWhiteboardSnapshot({});
      setSnapshotDraft(loadedNotesRootPath, id, snapshot);
      set({ activeBoardId: id, activeSnapshot: snapshot, error: null, loading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  setActiveSnapshotDraft: (snapshot) => {
    setSnapshotDraft(get().loadedNotesRootPath, get().activeBoardId, snapshot);
  },

  writeActiveAsset: async (file) => {
    const { activeBoardId, boards, loadedNotesRootPath } = get();
    const activeBoard = boards.find((board) => board.id === activeBoardId);
    if (!loadedNotesRootPath || !activeBoard) return null;
    try {
      const assetPath = await writeWhiteboardAsset(loadedNotesRootPath, activeBoard, file);
      return get().loadedNotesRootPath === loadedNotesRootPath && get().activeBoardId === activeBoardId ? assetPath : null;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },
}));

export async function flushWhiteboardStorage(): Promise<void> {
  await flushActiveSnapshot(useWhiteboardStore.getState);
  await waitForWhiteboardSnapshotWrites();
}

async function flushActiveSnapshot(get: () => WhiteboardStore): Promise<void> {
  const { activeBoardId, activeSnapshot, boards, loadedNotesRootPath } = get();
  const activeBoard = boards.find((board) => board.id === activeBoardId);
  const snapshot = activeSnapshotDraft?.notesRootPath === loadedNotesRootPath && activeSnapshotDraft.boardId === activeBoardId
    ? activeSnapshotDraft.snapshot
    : activeSnapshot;
  if (!loadedNotesRootPath || !activeBoard || !snapshot) return;
  await queueWhiteboardSnapshotWrite(loadedNotesRootPath, activeBoard, snapshot);
}

function setSnapshotDraft(
  notesRootPath: string | null,
  boardId: string | null,
  snapshot: WhiteboardSnapshot | null,
): void {
  activeSnapshotDraft = notesRootPath && snapshot ? { boardId, notesRootPath, snapshot } : null;
}

function getNextBoardTitle(boards: WhiteboardIndexEntry[]): string {
  const used = new Set(boards.map((board) => board.title));
  if (!used.has('Board')) return 'Board';
  for (let index = 2; index < 10000; index += 1) {
    const title = `Board ${index}`;
    if (!used.has(title)) return title;
  }
  return `Board ${Date.now()}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Whiteboard storage failed';
}
