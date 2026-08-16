import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { isEditableTarget } from '@/components/Whiteboard/model/interaction/whiteboardInteractions';
import type { WhiteboardElement, WhiteboardPaperStyle, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';

export interface WhiteboardSnapshot {
  elements: WhiteboardElement[];
  paper: WhiteboardPaperStyle;
  strokes: WhiteboardStroke[];
}

interface WhiteboardHistoryEntry extends WhiteboardSnapshot {
  retainedBytes: number;
}

const HISTORY_MAX_ENTRIES = 100;
const HISTORY_RETAINED_BYTE_BUDGET = 64 * 1024 * 1024;
const ARRAY_ENTRY_BYTES = 8;
const ELEMENT_BYTES = 256;
const POINT_BYTES = 80;
const STROKE_BYTES = 128;
const HISTORY_ESTIMATE_SLICE_MS = 4;

interface WhiteboardHistoryOptions extends WhiteboardSnapshot {
  active: boolean;
  historyKey: string | null;
  setPaper: Dispatch<SetStateAction<WhiteboardPaperStyle>>;
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
}

export function useWhiteboardHistory({
  active,
  elements,
  historyKey,
  paper,
  setElements,
  setPaper,
  setStrokes,
  strokes,
}: WhiteboardHistoryOptions) {
  const undoStackRef = useRef<WhiteboardHistoryEntry[]>([]);
  const redoStackRef = useRef<WhiteboardHistoryEntry[]>([]);
  const pendingEntryRef = useRef<WhiteboardHistoryEntry | null>(null);
  const generationRef = useRef(0);
  const [version, setVersion] = useState(0);
  const historyKeyRef = useRef(historyKey);

  useEffect(() => {
    if (historyKeyRef.current === historyKey) return;
    historyKeyRef.current = historyKey;
    generationRef.current += 1;
    undoStackRef.current = [];
    redoStackRef.current = [];
    pendingEntryRef.current = null;
    setVersion((current) => current + 1);
  }, [historyKey]);

  const getSnapshot = useCallback(() => ({
    elements,
    paper,
    strokes,
  }), [elements, paper, strokes]);

  const schedulePendingEntry = useCallback(() => {
    const pending = pendingEntryRef.current;
    if (!pending) return;
    const current = getSnapshot();
    if (hasSameDocument(pending, current)) return;
    pendingEntryRef.current = null;
    const generation = generationRef.current;
    scheduleAfterPaint(() => {
      void estimateRetainedBytes(pending, current).then((retainedBytes) => {
        if (generationRef.current !== generation || !undoStackRef.current.includes(pending)) return;
        pending.retainedBytes = retainedBytes;
        trimHistory(undoStackRef.current);
      });
    });
  }, [getSnapshot]);

  useEffect(() => schedulePendingEntry(), [schedulePendingEntry]);
  useEffect(() => () => {
    generationRef.current += 1;
  }, []);

  const applySnapshot = useCallback((snapshot: WhiteboardSnapshot) => {
    setElements(snapshot.elements);
    setPaper(snapshot.paper);
    setStrokes(snapshot.strokes);
  }, [setElements, setPaper, setStrokes]);

  const pushHistory = useCallback((snapshot: WhiteboardSnapshot = getSnapshot()) => {
    schedulePendingEntry();
    if (pendingEntryRef.current) {
      undoStackRef.current = undoStackRef.current.filter((entry) => entry !== pendingEntryRef.current);
    }
    const entry = { ...snapshot, retainedBytes: 0 };
    undoStackRef.current = [...undoStackRef.current.slice(-(HISTORY_MAX_ENTRIES - 1)), entry];
    pendingEntryRef.current = entry;
    redoStackRef.current = [];
    setVersion((current) => current + 1);
  }, [getSnapshot, schedulePendingEntry]);

  const undo = useCallback(() => {
    schedulePendingEntry();
    let discardedPendingEntry = false;
    if (pendingEntryRef.current) {
      undoStackRef.current = undoStackRef.current.filter((entry) => entry !== pendingEntryRef.current);
      pendingEntryRef.current = null;
      discardedPendingEntry = true;
    }
    const previous = undoStackRef.current.pop();
    if (!previous) {
      if (discardedPendingEntry) setVersion((current) => current + 1);
      return;
    }
    redoStackRef.current.push({ ...getSnapshot(), retainedBytes: 0 });
    applySnapshot(previous);
    setVersion((current) => current + 1);
  }, [applySnapshot, getSnapshot, schedulePendingEntry]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    const entry = { ...getSnapshot(), retainedBytes: 0 };
    undoStackRef.current.push(entry);
    pendingEntryRef.current = entry;
    applySnapshot(next);
    setVersion((current) => current + 1);
  }, [applySnapshot, getSnapshot]);

  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || (!event.ctrlKey && !event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, redo, undo]);

  return {
    canRedo: redoStackRef.current.length > 0,
    canUndo: undoStackRef.current.length > 0,
    pushHistory,
    redo,
    undo,
    version,
  };
}

function hasSameDocument(first: WhiteboardSnapshot, second: WhiteboardSnapshot): boolean {
  return first.elements === second.elements && first.paper === second.paper && first.strokes === second.strokes;
}

async function estimateRetainedBytes(previous: WhiteboardSnapshot, current: WhiteboardSnapshot): Promise<number> {
  let bytes = 0;
  let sliceStartedAt = performance.now();
  if (previous.elements !== current.elements) {
    bytes += previous.elements.length * ARRAY_ENTRY_BYTES;
    let currentElements: Map<string, WhiteboardElement> | null = null;
    for (let index = 0; index < previous.elements.length; index += 1) {
      const element = previous.elements[index];
      const aligned = current.elements[index];
      if (aligned?.id === element.id) {
        if (aligned !== element) bytes += ELEMENT_BYTES;
        continue;
      }
      currentElements ??= await createItemMap(current.elements);
      if (currentElements.get(element.id) !== element) bytes += ELEMENT_BYTES;
      if (shouldYield(index, sliceStartedAt)) {
        await yieldToMainThread();
        sliceStartedAt = performance.now();
      }
    }
  }
  if (previous.strokes !== current.strokes) {
    bytes += previous.strokes.length * ARRAY_ENTRY_BYTES;
    let currentStrokes: Map<string, WhiteboardStroke> | null = null;
    for (let index = 0; index < previous.strokes.length; index += 1) {
      const stroke = previous.strokes[index];
      const aligned = current.strokes[index];
      if (aligned?.id !== stroke.id) {
        currentStrokes ??= await createItemMap(current.strokes);
      }
      const currentStroke = aligned?.id === stroke.id ? aligned : currentStrokes?.get(stroke.id);
      if (currentStroke === stroke) continue;
      bytes += STROKE_BYTES;
      if (currentStroke?.points !== stroke.points) {
        bytes += stroke.points.length * (ARRAY_ENTRY_BYTES + POINT_BYTES);
      }
      if (shouldYield(index, sliceStartedAt)) {
        await yieldToMainThread();
        sliceStartedAt = performance.now();
      }
    }
  }
  return bytes;
}

async function createItemMap<T extends { id: string }>(items: T[]): Promise<Map<string, T>> {
  const itemMap = new Map<string, T>();
  let sliceStartedAt = performance.now();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    itemMap.set(item.id, item);
    if (shouldYield(index, sliceStartedAt)) {
      await yieldToMainThread();
      sliceStartedAt = performance.now();
    }
  }
  return itemMap;
}

function shouldYield(index: number, sliceStartedAt: number): boolean {
  return index % 1024 === 1023 && performance.now() - sliceStartedAt >= HISTORY_ESTIMATE_SLICE_MS;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function scheduleAfterPaint(callback: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => setTimeout(callback, 0));
    return;
  }
  setTimeout(callback, 0);
}

function trimHistory(entries: WhiteboardHistoryEntry[]): void {
  let retainedBytes = entries.reduce((total, entry) => total + entry.retainedBytes, 0);
  while (entries.length > 1 && (entries.length > HISTORY_MAX_ENTRIES || retainedBytes > HISTORY_RETAINED_BYTE_BUDGET)) {
    retainedBytes -= entries.shift()?.retainedBytes ?? 0;
  }
}
