import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  EMPTY_WHITEBOARD_ERASER_PREVIEW,
  createWhiteboardEraserSpatialIndexAsync,
  getWhiteboardEraserCandidates,
  getWhiteboardEraserTargets,
  type WhiteboardEraserSpatialIndex,
  type WhiteboardEraserPreview,
  type WhiteboardEraserSample,
} from '../model/whiteboardEraser';
import type { WhiteboardElement, WhiteboardStroke } from '../model/whiteboardModel';
import { removeWhiteboardItems } from '../model/whiteboardCollection';

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
  const finishRequestedRef = useRef<boolean | null>(null);
  const gestureTokenRef = useRef<object | null>(null);
  const indexReadyRef = useRef(false);
  const trailFrameRef = useRef<number | null>(null);
  const lastTrailDecayRef = useRef(0);
  const lastSampleRef = useRef<WhiteboardEraserSample | null>(null);
  const pendingSamplesRef = useRef<WhiteboardEraserSample[]>([]);
  const spatialIndexRef = useRef(spatialIndex);
  const touchingRef = useRef<MutableEraserTargets>(createMutableTargets());
  const targetsRef = useRef<MutableEraserTargets>(createMutableTargets());
  const trailRef = useRef<WhiteboardEraserSample[]>([]);

  const applyPendingSamples = useCallback(() => {
    const pending = pendingSamplesRef.current;
    pendingSamplesRef.current = [];
    if (pending.length === 0) return;
    let previous = lastSampleRef.current;
    for (const sample of pending) {
      const sweepSamples = previous ? [previous, sample] : [sample];
      const candidates = getWhiteboardEraserCandidates(spatialIndexRef.current, sweepSamples);
      const crossed = getWhiteboardEraserTargets(candidates.elements, candidates.strokes, sweepSamples);
      toggleNewCrossings(targetsRef.current.elementIds, touchingRef.current.elementIds, crossed.elementIds);
      toggleNewCrossings(targetsRef.current.strokeIds, touchingRef.current.strokeIds, crossed.strokeIds);

      // Keep each target latched until the eraser head has actually left it.
      const touchingCandidates = getWhiteboardEraserCandidates(spatialIndexRef.current, [sample]);
      const touching = getWhiteboardEraserTargets(
        touchingCandidates.elements,
        touchingCandidates.strokes,
        [sample],
      );
      touchingRef.current = {
        elementIds: new Set(touching.elementIds),
        strokeIds: new Set(touching.strokeIds),
      };
      previous = sample;
    }
    lastSampleRef.current = previous;
    const latestSample = pending.at(-1);
    if (latestSample) trailRef.current = [...trailRef.current, latestSample];
    setPreview({
      elementIds: [...targetsRef.current.elementIds],
      strokeIds: [...targetsRef.current.strokeIds],
      trail: trailRef.current,
    });
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
    finishRequestedRef.current = null;
    gestureTokenRef.current = null;
    indexReadyRef.current = false;
    trailFrameRef.current = null;
    lastTrailDecayRef.current = 0;
    lastSampleRef.current = null;
    pendingSamplesRef.current = [];
    touchingRef.current = createMutableTargets();
    targetsRef.current = createMutableTargets();
    trailRef.current = [];
    setPreview(EMPTY_WHITEBOARD_ERASER_PREVIEW);
  }, []);

  const complete = useCallback((cancelled: boolean) => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (!cancelled) applyPendingSamples();
    const targets = targetsRef.current;
    const hasTargets = targets.elementIds.size > 0 || targets.strokeIds.size > 0;
    if (!cancelled && hasTargets) {
      pushHistory();
      if (targets.strokeIds.size > 0) {
        setStrokes((current) => removeWhiteboardItems(current, targets.strokeIds));
      }
      if (targets.elementIds.size > 0) {
        setElements((current) => removeWhiteboardItems(current, targets.elementIds));
      }
    }
    reset();
  }, [applyPendingSamples, pushHistory, reset, setElements, setStrokes]);

  const begin = useCallback((samples: WhiteboardEraserSample[]) => {
    reset();
    const token = {};
    gestureTokenRef.current = token;
    if (hasCurrentSources(spatialIndex, elements, strokes)) {
      spatialIndexRef.current = spatialIndex;
      indexReadyRef.current = true;
    } else {
      void createWhiteboardEraserSpatialIndexAsync(
        elements,
        strokes,
        () => gestureTokenRef.current === token,
      ).then((index) => {
        if (!index || gestureTokenRef.current !== token) return;
        spatialIndexRef.current = index;
        indexReadyRef.current = true;
        const finishRequested = finishRequestedRef.current;
        if (finishRequested !== null) complete(finishRequested);
        else if (pendingSamplesRef.current.length > 0 && frameRef.current === null) {
          frameRef.current = window.requestAnimationFrame(publishPendingSamples);
        }
      });
    }
    lastTrailDecayRef.current = performance.now();
    trailFrameRef.current = window.requestAnimationFrame(decayTrail);
    update(samples);
  }, [complete, decayTrail, elements, publishPendingSamples, reset, spatialIndex, strokes, update]);

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

function createMutableTargets(): MutableEraserTargets {
  return { elementIds: new Set(), strokeIds: new Set() };
}

function toggleNewCrossings(
  targets: Set<string>,
  touching: Set<string>,
  crossedIds: string[],
): void {
  for (const id of crossedIds) {
    if (touching.has(id)) continue;
    if (targets.has(id)) targets.delete(id);
    else targets.add(id);
  }
}

function hasCurrentSources(
  index: WhiteboardEraserSpatialIndex,
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
): boolean {
  return (index.allElements === elements || (index.allElements.length === 0 && elements.length === 0))
    && (index.allStrokes === strokes || (index.allStrokes.length === 0 && strokes.length === 0));
}
