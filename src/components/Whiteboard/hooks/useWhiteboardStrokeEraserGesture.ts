import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  createWhiteboardEraserSpatialIndexAsync,
  getWhiteboardStrokeEraserCandidates,
  type WhiteboardEraserSample,
  type WhiteboardEraserSpatialIndex,
} from '../model/whiteboardEraser';
import type { WhiteboardStroke } from '../model/whiteboardModel';
import type { WhiteboardMutableIdSet } from '../model/whiteboardStrokeSegments';
import { markWhiteboardSpliceUpdate, type WhiteboardSpliceEdit } from '../model/whiteboardCollection';
import {
  eraseWhiteboardStrokes,
  type WhiteboardStrokeEraserPreview,
} from '../model/whiteboardStrokeEraser';

interface WhiteboardStrokeEraserGestureOptions {
  pushHistory: () => void;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  spatialIndex: WhiteboardEraserSpatialIndex;
  strokes: WhiteboardStroke[];
}

export function useWhiteboardStrokeEraserGesture({
  pushHistory,
  setStrokes,
  spatialIndex,
  strokes,
}: WhiteboardStrokeEraserGestureOptions) {
  const [preview, setPreview] = useState<WhiteboardStrokeEraserPreview | null>(null);
  const changedRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const finishRequestedRef = useRef<boolean | null>(null);
  const gestureTokenRef = useRef<object | null>(null);
  const indexReadyRef = useRef(false);
  const lastSampleRef = useRef<WhiteboardEraserSample | null>(null);
  const pendingSamplesRef = useRef<WhiteboardEraserSample[]>([]);
  const replacementsRef = useRef(new Map<string, WhiteboardStroke[]>());
  const sourceStrokesRef = useRef<WhiteboardStroke[]>([]);
  const spatialIndexRef = useRef(spatialIndex);
  const usedStrokeIdsRef = useRef<WhiteboardMutableIdSet>(createUsedStrokeIds());

  const applyPendingSamples = useCallback(() => {
    const pending = pendingSamplesRef.current;
    pendingSamplesRef.current = [];
    if (pending.length === 0) return;
    const samples = lastSampleRef.current ? [lastSampleRef.current, ...pending] : pending;
    lastSampleRef.current = pending.at(-1) ?? lastSampleRef.current;
    let nextReplacements: Map<string, WhiteboardStroke[]> | null = null;
    for (const source of getWhiteboardStrokeEraserCandidates(spatialIndexRef.current, samples)) {
      const current = replacementsRef.current.get(source.id) ?? [source];
      const next = eraseWhiteboardStrokes(
        current,
        samples,
        undefined,
        undefined,
        usedStrokeIdsRef.current,
      );
      if (next === current) continue;
      nextReplacements ??= new Map(replacementsRef.current);
      nextReplacements.set(source.id, next);
    }
    if (!nextReplacements) return;
    replacementsRef.current = nextReplacements;
    changedRef.current = true;
    setPreview({ replacements: nextReplacements });
  }, []);

  const publishPendingSamples = useCallback(() => {
    frameRef.current = null;
    applyPendingSamples();
  }, [applyPendingSamples]);

  const update = useCallback((samples: WhiteboardEraserSample[]) => {
    pendingSamplesRef.current.push(...samples);
    if (indexReadyRef.current && frameRef.current === null) {
      frameRef.current = window.requestAnimationFrame(publishPendingSamples);
    }
  }, [publishPendingSamples]);

  const reset = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    changedRef.current = false;
    frameRef.current = null;
    finishRequestedRef.current = null;
    gestureTokenRef.current = null;
    indexReadyRef.current = false;
    lastSampleRef.current = null;
    pendingSamplesRef.current = [];
    replacementsRef.current = new Map();
    sourceStrokesRef.current = [];
    usedStrokeIdsRef.current = createUsedStrokeIds();
    setPreview(null);
  }, []);

  const complete = useCallback((cancelled: boolean) => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (!cancelled) applyPendingSamples();
    if (!cancelled && changedRef.current) {
      pushHistory();
      setStrokes(applyStrokeReplacements(sourceStrokesRef.current, replacementsRef.current));
    }
    reset();
  }, [applyPendingSamples, pushHistory, reset, setStrokes]);

  const begin = useCallback((samples: WhiteboardEraserSample[]) => {
    reset();
    const token = {};
    gestureTokenRef.current = token;
    sourceStrokesRef.current = strokes;
    if (spatialIndex.allStrokes === strokes || (spatialIndex.allStrokes.length === 0 && strokes.length === 0)) {
      spatialIndexRef.current = spatialIndex;
      usedStrokeIdsRef.current = createUsedStrokeIds(spatialIndex.strokeOrder);
      indexReadyRef.current = true;
    } else {
      void createWhiteboardEraserSpatialIndexAsync([], strokes, () => gestureTokenRef.current === token)
        .then((index) => {
          if (!index || gestureTokenRef.current !== token) return;
          spatialIndexRef.current = index;
          usedStrokeIdsRef.current = createUsedStrokeIds(index.strokeOrder);
          indexReadyRef.current = true;
          const finishRequested = finishRequestedRef.current;
          if (finishRequested !== null) complete(finishRequested);
          else if (pendingSamplesRef.current.length > 0 && frameRef.current === null) {
            frameRef.current = window.requestAnimationFrame(publishPendingSamples);
          }
        });
    }
    update(samples);
  }, [complete, publishPendingSamples, reset, spatialIndex, strokes, update]);

  const finish = useCallback((cancelled = false) => {
    if (!cancelled && gestureTokenRef.current && !indexReadyRef.current) {
      finishRequestedRef.current = false;
      return;
    }
    complete(cancelled);
  }, [complete]);

  useEffect(() => reset, [reset]);

  return { begin, finish, preview, update };
}

function applyStrokeReplacements(
  strokes: WhiteboardStroke[],
  replacements: ReadonlyMap<string, WhiteboardStroke[]>,
): WhiteboardStroke[] {
  let nextLength = strokes.length;
  for (const replacement of replacements.values()) nextLength += replacement.length - 1;
  const next = new Array<WhiteboardStroke>(nextLength);
  const edits: WhiteboardSpliceEdit<WhiteboardStroke>[] = [];
  let writeIndex = 0;
  for (let index = 0; index < strokes.length; index += 1) {
    const stroke = strokes[index];
    const replacement = replacements.get(stroke.id);
    if (!replacement) {
      next[writeIndex] = stroke;
      writeIndex += 1;
      continue;
    }
    edits.push({ index, items: replacement });
    for (const fragment of replacement) {
      next[writeIndex] = fragment;
      writeIndex += 1;
    }
  }
  return markWhiteboardSpliceUpdate(strokes, next, edits);
}

function createUsedStrokeIds(order?: { get: (id: string) => number | undefined }): WhiteboardMutableIdSet {
  const additions = new Set<string>();
  return {
    add: (id) => { additions.add(id); },
    has: (id) => additions.has(id) || order?.get(id) !== undefined,
  };
}
