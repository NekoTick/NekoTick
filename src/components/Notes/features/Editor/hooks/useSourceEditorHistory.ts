import { useCallback, useRef, type RefObject } from 'react';
import { resolveDocumentHistoryShortcut } from '../plugins/floating-toolbar/floatingToolbarPluginViewUtils';

type SourceSelectionDirection = 'forward' | 'backward' | 'none';

export interface SourceEditorSnapshot {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  selectionDirection: SourceSelectionDirection;
}

interface SourceEditorHistoryEntry {
  current: SourceEditorSnapshot;
  lastInput: { inputType: string; recordedAt: number } | null;
  redo: SourceEditorSnapshot[];
  undo: SourceEditorSnapshot[];
}

const HISTORY_LIMIT = 100;
const INPUT_GROUP_DELAY_MS = 1_000;
const GROUPABLE_INPUT_TYPES = new Set([
  'deleteContentBackward',
  'deleteContentForward',
  'insertText',
]);

function snapshotTextarea(textarea: HTMLTextAreaElement, value = textarea.value): SourceEditorSnapshot {
  return {
    value,
    selectionStart: Math.min(textarea.selectionStart, value.length),
    selectionEnd: Math.min(textarea.selectionEnd, value.length),
    selectionDirection: textarea.selectionDirection ?? 'none',
  };
}

function createEntry(value: string): SourceEditorHistoryEntry {
  const selection = value.length;
  return {
    current: {
      value,
      selectionStart: selection,
      selectionEnd: selection,
      selectionDirection: 'none',
    },
    lastInput: null,
    redo: [],
    undo: [],
  };
}

function applySnapshot(textarea: HTMLTextAreaElement, snapshot: SourceEditorSnapshot): void {
  textarea.value = snapshot.value;
  textarea.setSelectionRange(
    snapshot.selectionStart,
    snapshot.selectionEnd,
    snapshot.selectionDirection,
  );
}

export function useSourceEditorHistory({
  currentNoteContent,
  currentNotePath,
  textareaRef,
}: {
  currentNoteContent: string;
  currentNotePath: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const historiesRef = useRef(new Map<string, SourceEditorHistoryEntry>());
  const activePathRef = useRef(currentNotePath);
  const beforeInputRef = useRef<{ path: string; snapshot: SourceEditorSnapshot } | null>(null);
  const compositionStartRef = useRef<{ path: string; snapshot: SourceEditorSnapshot } | null>(null);

  const getCurrentEntry = useCallback((fallbackValue: string) => {
    let entry = historiesRef.current.get(currentNotePath);
    if (!entry || entry.current.value !== fallbackValue) {
      entry = createEntry(fallbackValue);
      historiesRef.current.set(currentNotePath, entry);
    }
    return entry;
  }, [currentNotePath]);

  const syncCurrentContent = useCallback((): SourceEditorSnapshot | null => {
    const existing = historiesRef.current.get(currentNotePath);
    const canRestoreSelection = activePathRef.current !== currentNotePath
      && existing?.current.value === currentNoteContent;
    if (!existing || existing.current.value !== currentNoteContent) {
      historiesRef.current.set(currentNotePath, createEntry(currentNoteContent));
    }
    activePathRef.current = currentNotePath;
    beforeInputRef.current = null;
    compositionStartRef.current = null;
    return canRestoreSelection ? existing.current : null;
  }, [currentNoteContent, currentNotePath]);

  const captureBeforeInput = useCallback((textarea: HTMLTextAreaElement) => {
    beforeInputRef.current = {
      path: currentNotePath,
      snapshot: snapshotTextarea(textarea),
    };
  }, [currentNotePath]);

  const recordChange = useCallback((
    previousValue: string,
    textarea: HTMLTextAreaElement,
    inputType: string,
  ) => {
    const entry = getCurrentEntry(previousValue);
    const pendingBeforeInput = beforeInputRef.current;
    const previous = pendingBeforeInput?.path === currentNotePath
      && pendingBeforeInput.snapshot.value === previousValue
      ? pendingBeforeInput.snapshot
      : { ...entry.current, value: previousValue };
    const next = snapshotTextarea(textarea);
    const now = Date.now();
    const continuesInputGroup = GROUPABLE_INPUT_TYPES.has(inputType)
      && entry.lastInput?.inputType === inputType
      && now - entry.lastInput.recordedAt <= INPUT_GROUP_DELAY_MS
      && previous.selectionStart === entry.current.selectionStart
      && previous.selectionEnd === entry.current.selectionEnd;

    if (!continuesInputGroup) {
      entry.undo.push(previous);
      if (entry.undo.length > HISTORY_LIMIT) {
        entry.undo.shift();
      }
    }
    entry.current = next;
    entry.redo = [];
    entry.lastInput = { inputType, recordedAt: now };
    beforeInputRef.current = null;
  }, [currentNotePath, getCurrentEntry]);

  const beginComposition = useCallback((textarea: HTMLTextAreaElement) => {
    compositionStartRef.current = {
      path: currentNotePath,
      snapshot: snapshotTextarea(textarea),
    };
  }, [currentNotePath]);

  const commitComposition = useCallback((textarea: HTMLTextAreaElement) => {
    const start = compositionStartRef.current;
    compositionStartRef.current = null;
    if (!start || start.path !== currentNotePath || start.snapshot.value === textarea.value) {
      return;
    }
    beforeInputRef.current = start;
    recordChange(start.snapshot.value, textarea, 'insertCompositionText');
  }, [currentNotePath, recordChange]);

  const takeHistoryShortcut = useCallback((event: KeyboardEvent): {
    handled: boolean;
    snapshot: SourceEditorSnapshot | null;
  } => {
    const action = resolveDocumentHistoryShortcut(event);
    if (!action) {
      return { handled: false, snapshot: null };
    }

    const textarea = textareaRef.current;
    if (!textarea) {
      return { handled: true, snapshot: null };
    }
    const entry = getCurrentEntry(textarea.value);
    const source = action === 'undo' ? entry.undo : entry.redo;
    const target = source.pop() ?? null;
    if (!target) {
      return { handled: true, snapshot: null };
    }

    const destination = action === 'undo' ? entry.redo : entry.undo;
    destination.push(entry.current);
    entry.current = target;
    entry.lastInput = null;
    beforeInputRef.current = null;
    compositionStartRef.current = null;
    applySnapshot(textarea, target);
    return { handled: true, snapshot: target };
  }, [getCurrentEntry, textareaRef]);

  return {
    beginComposition,
    captureBeforeInput,
    commitComposition,
    recordChange,
    syncCurrentContent,
    takeHistoryShortcut,
  };
}
