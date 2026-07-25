import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  EMPTY_WHITEBOARD_ERASER_PREVIEW,
  createWhiteboardEraserSpatialIndex,
  getWhiteboardEraserCandidates,
  getWhiteboardEraserTargets,
  type WhiteboardEraserSpatialIndex,
  type WhiteboardEraserPreview,
  type WhiteboardEraserSample,
} from '../model/whiteboardEraser';
import type { WhiteboardElement, WhiteboardStroke } from '../model/whiteboardModel';

interface WhiteboardEraserGestureOptions {
  elements: WhiteboardElement[];
  pushHistory: () => void;
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  spatialIndex: WhiteboardEraserSpatialIndex;
  strokes: WhiteboardStroke[];
}

interface MutableEraserTargets {
  elementIds: Set<string>;
  strokeIds: Set<string>;
}

export function useWhiteboardEraserGesture({
  elements,
  pushHistory,
  setElements,
  setStrokes,
  spatialIndex,
  strokes,
}: WhiteboardEraserGestureOptions) {
  const [preview, setPreview] = useState<WhiteboardEraserPreview>(EMPTY_WHITEBOARD_ERASER_PREVIEW);
  const frameRef = useRef<number | null>(null);
  const trailFrameRef = useRef<number | null>(null);
  const lastTrailDecayRef = useRef(0);
  const lastSampleRef = useRef<WhiteboardEraserSample | null>(null);
  const pendingSamplesRef = useRef<WhiteboardEraserSample[]>([]);
  const spatialIndexRef = useRef(spatialIndex);
  const targetsRef = useRef<MutableEraserTargets>(createMutableTargets());
  const trailRef = useRef<WhiteboardEraserSample[]>([]);

  const applyPendingSamples = useCallback(() => {
    const pending = pendingSamplesRef.current;
    pendingSamplesRef.current = [];
    if (pending.length === 0) return;
    const sweepSamples = lastSampleRef.current ? [lastSampleRef.current, ...pending] : pending;
    lastSampleRef.current = pending.at(-1) ?? lastSampleRef.current;
    const candidates = getWhiteboardEraserCandidates(spatialIndexRef.current, sweepSamples);
    const hits = getWhiteboardEraserTargets(
      candidates.elements.filter((element) => !targetsRef.current.elementIds.has(element.id)),
      candidates.strokes.filter((stroke) => !targetsRef.current.strokeIds.has(stroke.id)),
      sweepSamples,
    );
    hits.elementIds.forEach((id) => targetsRef.current.elementIds.add(id));
    hits.strokeIds.forEach((id) => targetsRef.current.strokeIds.add(id));
    const latestSample = pending.at(-1);
    if (latestSample) trailRef.current = [...trailRef.current, latestSample];
    setPreview((current) => ({
      elementIds: hits.elementIds.length > 0 ? [...targetsRef.current.elementIds] : current.elementIds,
      strokeIds: hits.strokeIds.length > 0 ? [...targetsRef.current.strokeIds] : current.strokeIds,
      trail: trailRef.current,
    }));
  }, []);

  const publishPendingSamples = useCallback(() => {
    frameRef.current = null;
    applyPendingSamples();
  }, [applyPendingSamples]);

  const update = useCallback((samples: WhiteboardEraserSample[]) => {
    pendingSamplesRef.current.push(...samples);
    if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(publishPendingSamples);
  }, [publishPendingSamples]);

  const decayTrail = useCallback((now: number) => {
    if (
      now - lastTrailDecayRef.current >= themeWhiteboardTokens.eraserTrailDecayIntervalMs &&
      trailRef.current.length > 1
    ) {
      const removeCount = Math.ceil(trailRef.current.length * themeWhiteboardTokens.eraserTrailDecayFraction);
      trailRef.current = trailRef.current.slice(removeCount);
      lastTrailDecayRef.current = now;
      setPreview((current) => ({ ...current, trail: trailRef.current }));
    }
    trailFrameRef.current = window.requestAnimationFrame(decayTrail);
  }, []);

  const reset = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    if (trailFrameRef.current !== null) window.cancelAnimationFrame(trailFrameRef.current);
    frameRef.current = null;
    trailFrameRef.current = null;
    lastTrailDecayRef.current = 0;
    lastSampleRef.current = null;
    pendingSamplesRef.current = [];
    targetsRef.current = createMutableTargets();
    trailRef.current = [];
    setPreview(EMPTY_WHITEBOARD_ERASER_PREVIEW);
  }, []);

  const begin = useCallback((samples: WhiteboardEraserSample[]) => {
    reset();
    spatialIndexRef.current = spatialIndex.allElements === elements && spatialIndex.allStrokes === strokes
      ? spatialIndex
      : createWhiteboardEraserSpatialIndex(elements, strokes);
    lastTrailDecayRef.current = performance.now();
    trailFrameRef.current = window.requestAnimationFrame(decayTrail);
    update(samples);
  }, [decayTrail, elements, reset, spatialIndex, strokes, update]);

  const finish = useCallback((cancelled = false) => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    applyPendingSamples();
    const targets = targetsRef.current;
    const hasTargets = targets.elementIds.size > 0 || targets.strokeIds.size > 0;
    if (!cancelled && hasTargets) {
      pushHistory();
      setStrokes((current) => current.filter((stroke) => !targets.strokeIds.has(stroke.id)));
      setElements((current) => current.filter((element) => !targets.elementIds.has(element.id)));
    }
    reset();
  }, [applyPendingSamples, pushHistory, reset, setElements, setStrokes]);

  useEffect(() => reset, [reset]);

  return { begin, finish, preview, update };
}

function createMutableTargets(): MutableEraserTargets {
  return { elementIds: new Set(), strokeIds: new Set() };
}
