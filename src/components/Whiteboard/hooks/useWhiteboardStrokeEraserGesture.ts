import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  createWhiteboardEraserSpatialIndex,
  getWhiteboardStrokeEraserCandidates,
  type WhiteboardEraserSample,
  type WhiteboardEraserSpatialIndex,
} from '../model/whiteboardEraser';
import type { WhiteboardStroke } from '../model/whiteboardModel';
import { eraseWhiteboardStrokes } from '../model/whiteboardStrokeEraser';

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
  const [preview, setPreview] = useState<WhiteboardStroke[] | null>(null);
  const changedRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const lastSampleRef = useRef<WhiteboardEraserSample | null>(null);
  const pendingSamplesRef = useRef<WhiteboardEraserSample[]>([]);
  const sourceStrokeIdsRef = useRef(new Map<string, string>());
  const spatialIndexRef = useRef(spatialIndex);
  const workingStrokesBySourceIdRef = useRef(new Map<string, WhiteboardStroke[]>());
  const workingStrokesRef = useRef<WhiteboardStroke[]>([]);

  const applyPendingSamples = useCallback(() => {
    const pending = pendingSamplesRef.current;
    pendingSamplesRef.current = [];
    if (pending.length === 0) return;
    const samples = lastSampleRef.current ? [lastSampleRef.current, ...pending] : pending;
    lastSampleRef.current = pending.at(-1) ?? lastSampleRef.current;
    const candidateStrokes = getWhiteboardStrokeEraserCandidates(spatialIndexRef.current, samples).flatMap(
      (stroke) => workingStrokesBySourceIdRef.current.get(stroke.id) ?? [],
    );
    const candidateIds = new Set(candidateStrokes.map((stroke) => stroke.id));
    const next = eraseWhiteboardStrokes(workingStrokesRef.current, samples, candidateIds, candidateStrokes);
    if (next === workingStrokesRef.current) return;
    const sourceStrokeIds = updateSourceStrokeIds(sourceStrokeIdsRef.current, candidateIds, next);
    sourceStrokeIdsRef.current = sourceStrokeIds;
    workingStrokesBySourceIdRef.current = groupStrokesBySourceId(next, sourceStrokeIds);
    changedRef.current = true;
    workingStrokesRef.current = next;
    setPreview(next);
  }, []);

  const publishPendingSamples = useCallback(() => {
    frameRef.current = null;
    applyPendingSamples();
  }, [applyPendingSamples]);

  const update = useCallback((samples: WhiteboardEraserSample[]) => {
    pendingSamplesRef.current.push(...samples);
    if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(publishPendingSamples);
  }, [publishPendingSamples]);

  const reset = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    changedRef.current = false;
    frameRef.current = null;
    lastSampleRef.current = null;
    pendingSamplesRef.current = [];
    sourceStrokeIdsRef.current = new Map();
    workingStrokesBySourceIdRef.current = new Map();
    workingStrokesRef.current = [];
    setPreview(null);
  }, []);

  const begin = useCallback((samples: WhiteboardEraserSample[]) => {
    reset();
    spatialIndexRef.current = spatialIndex.allStrokes === strokes
      ? spatialIndex
      : createWhiteboardEraserSpatialIndex([], strokes);
    sourceStrokeIdsRef.current = new Map(strokes.map((stroke) => [stroke.id, stroke.id]));
    workingStrokesBySourceIdRef.current = new Map(strokes.map((stroke) => [stroke.id, [stroke]]));
    workingStrokesRef.current = strokes;
    update(samples);
  }, [reset, spatialIndex, strokes, update]);

  const finish = useCallback((cancelled = false) => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    applyPendingSamples();
    if (!cancelled && changedRef.current) {
      pushHistory();
      setStrokes(workingStrokesRef.current);
    }
    reset();
  }, [applyPendingSamples, pushHistory, reset, setStrokes]);

  useEffect(() => reset, [reset]);

  return { begin, finish, preview, update };
}

function updateSourceStrokeIds(
  previous: Map<string, string>,
  candidateIds: Set<string>,
  strokes: WhiteboardStroke[],
): Map<string, string> {
  const candidates = [...candidateIds].sort((first, second) => second.length - first.length);
  return new Map(strokes.map((stroke) => {
    const existingSource = previous.get(stroke.id);
    if (existingSource) return [stroke.id, existingSource];
    const parentId = candidates.find((id) => stroke.id.startsWith(`${id}-part-`));
    return [stroke.id, parentId ? previous.get(parentId) ?? parentId : stroke.id];
  }));
}

function groupStrokesBySourceId(
  strokes: WhiteboardStroke[],
  sourceStrokeIds: Map<string, string>,
): Map<string, WhiteboardStroke[]> {
  const groups = new Map<string, WhiteboardStroke[]>();
  strokes.forEach((stroke) => {
    const sourceId = sourceStrokeIds.get(stroke.id) ?? stroke.id;
    const group = groups.get(sourceId);
    if (group) group.push(stroke);
    else groups.set(sourceId, [stroke]);
  });
  return groups;
}
