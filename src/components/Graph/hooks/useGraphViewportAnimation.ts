import {
  useCallback,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  type WheelEvent,
} from 'react';
import { themeGraphTokens } from '@/styles/themeTokens';
import {
  clampGraphZoom,
  zoomGraphViewportAtPoint,
  type GraphPoint,
  type GraphViewport,
} from '../model/graphViewport';
import { stepGraphViewportSpring } from '../model/graphViewportSpring';
import { useGraphViewportActivity } from './useGraphViewportActivity';

export function useGraphViewportAnimation(args: {
  active: boolean;
  cancelPendingFit: () => void;
  onViewportSettledRef: RefObject<(() => void) | undefined>;
  setViewport: Dispatch<SetStateAction<GraphViewport>>;
  svgRef: RefObject<SVGSVGElement | null>;
  viewportRef: RefObject<GraphViewport>;
}) {
  const viewportAnimationFrameRef = useRef<number | null>(null);
  const viewportAnimationTargetRef = useRef<GraphViewport | null>(null);
  const pendingWheelRef = useRef<{
    clientX: number;
    clientY: number;
    deltaY: number;
  } | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelLastFrameAtRef = useRef<number | null>(null);
  const wheelTargetRef = useRef<GraphViewport | null>(null);
  const wheelVelocityRef = useRef<GraphViewport>({ x: 0, y: 0, zoom: 0 });
  const wheelSettleTimeoutRef = useRef<number | null>(null);

  const cancelWheelSettle = useCallback(() => {
    if (wheelSettleTimeoutRef.current !== null) {
      window.clearTimeout(wheelSettleTimeoutRef.current);
    }
    wheelSettleTimeoutRef.current = null;
  }, []);

  const cancelWheelFrame = useCallback(() => {
    if (wheelFrameRef.current !== null) window.cancelAnimationFrame(wheelFrameRef.current);
    wheelFrameRef.current = null;
    wheelLastFrameAtRef.current = null;
    wheelTargetRef.current = null;
    wheelVelocityRef.current = { x: 0, y: 0, zoom: 0 };
    pendingWheelRef.current = null;
    cancelWheelSettle();
  }, [cancelWheelSettle]);

  const cancelViewportAnimation = useCallback(() => {
    if (viewportAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(viewportAnimationFrameRef.current);
    }
    viewportAnimationFrameRef.current = null;
    viewportAnimationTargetRef.current = null;
  }, []);

  const cancelViewportWork = useCallback(() => {
    args.cancelPendingFit();
    cancelWheelFrame();
    cancelViewportAnimation();
  }, [args.cancelPendingFit, cancelViewportAnimation, cancelWheelFrame]);
  const canAnimate = useGraphViewportActivity(args.active, cancelViewportWork);

  const setViewportImmediately = useCallback<Dispatch<SetStateAction<GraphViewport>>>((value) => {
    cancelViewportWork();
    args.setViewport((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      args.viewportRef.current = next;
      return next;
    });
  }, [args.setViewport, args.viewportRef, cancelViewportWork]);

  const animateViewportTo = useCallback((target: GraphViewport) => {
    if (!canAnimate) {
      cancelViewportWork();
      return;
    }
    cancelWheelFrame();
    cancelViewportAnimation();
    viewportAnimationTargetRef.current = target;
    const start = args.viewportRef.current;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reducedMotion || (
      start.x === target.x && start.y === target.y && start.zoom === target.zoom
    )) {
      setViewportImmediately(target);
      args.onViewportSettledRef.current?.();
      return;
    }

    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0,
        (now - startedAt) / themeGraphTokens.viewportAnimationDurationMs));
      const eased = 1 - (1 - progress) ** 3;
      const next = {
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        zoom: start.zoom + (target.zoom - start.zoom) * eased,
      };
      args.viewportRef.current = next;
      args.setViewport(next);
      if (progress < 1) {
        viewportAnimationFrameRef.current = window.requestAnimationFrame(step);
      } else {
        viewportAnimationFrameRef.current = null;
        viewportAnimationTargetRef.current = null;
        args.onViewportSettledRef.current?.();
      }
    };
    viewportAnimationFrameRef.current = window.requestAnimationFrame(step);
  }, [
    args.onViewportSettledRef,
    args.setViewport,
    args.viewportRef,
    canAnimate,
    cancelWheelFrame,
    cancelViewportAnimation,
    cancelViewportWork,
    setViewportImmediately,
  ]);

  const startPanInertia = useCallback((velocity: GraphPoint): boolean => {
    if (!canAnimate) return false;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const speed = Math.hypot(velocity.x, velocity.y);
    if (reducedMotion || speed < themeGraphTokens.panInertiaMinVelocityPxPerMs) return false;
    cancelViewportWork();
    const velocityScale = Math.min(1, themeGraphTokens.panInertiaMaxVelocityPxPerMs / speed);
    let velocityX = velocity.x * velocityScale;
    let velocityY = velocity.y * velocityScale;
    let lastFrameAt: number | null = null;
    const step = (now: number) => {
      const elapsed = lastFrameAt === null || now <= lastFrameAt
        ? themeGraphTokens.viewportMotionFrameFallbackMs
        : Math.min(now - lastFrameAt, themeGraphTokens.viewportMotionMaxFrameMs);
      lastFrameAt = now;
      const decay = Math.exp(-elapsed / themeGraphTokens.panInertiaTimeConstantMs);
      const travelTime = themeGraphTokens.panInertiaTimeConstantMs * (1 - decay);
      const current = args.viewportRef.current;
      const next = {
        ...current,
        x: current.x + velocityX * travelTime,
        y: current.y + velocityY * travelTime,
      };
      velocityX *= decay;
      velocityY *= decay;
      args.viewportRef.current = next;
      args.setViewport(next);
      if (Math.hypot(velocityX, velocityY) >= themeGraphTokens.panInertiaMinVelocityPxPerMs) {
        viewportAnimationFrameRef.current = window.requestAnimationFrame(step);
      } else {
        viewportAnimationFrameRef.current = null;
        args.onViewportSettledRef.current?.();
      }
    };
    viewportAnimationFrameRef.current = window.requestAnimationFrame(step);
    return true;
  }, [
    args.onViewportSettledRef,
    args.setViewport,
    args.viewportRef,
    canAnimate,
    cancelViewportWork,
  ]);

  const runWheelFrame = useCallback(function runWheelFrame(now: number) {
    wheelFrameRef.current = null;
    const pending = pendingWheelRef.current;
    pendingWheelRef.current = null;
    let target = wheelTargetRef.current ?? args.viewportRef.current;
    if (pending) {
      const rect = args.svgRef.current?.getBoundingClientRect();
      if (rect) {
        target = zoomGraphViewportAtPoint(
          target,
          { x: pending.clientX - rect.left, y: pending.clientY - rect.top },
          target.zoom * Math.exp(-pending.deltaY * themeGraphTokens.wheelZoomIntensity),
        );
        const currentZoomDirection = target.zoom - args.viewportRef.current.zoom;
        if (currentZoomDirection * wheelVelocityRef.current.zoom < 0) {
          wheelVelocityRef.current = { x: 0, y: 0, zoom: 0 };
        }
      }
      wheelTargetRef.current = target;
    }

    const current = args.viewportRef.current;
    const previousFrameAt = wheelLastFrameAtRef.current;
    const elapsed = previousFrameAt === null || now <= previousFrameAt
      ? themeGraphTokens.viewportMotionFrameFallbackMs
      : Math.min(now - previousFrameAt, themeGraphTokens.viewportMotionMaxFrameMs);
    wheelLastFrameAtRef.current = now;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const stepped = reducedMotion
      ? { viewport: target, velocity: { x: 0, y: 0, zoom: 0 } }
      : stepGraphViewportSpring(
        current,
        target,
        wheelVelocityRef.current,
        elapsed,
        themeGraphTokens.wheelZoomSpringResponseMs,
      );
    let next = stepped.viewport;
    const clampedZoom = clampGraphZoom(next.zoom);
    wheelVelocityRef.current = clampedZoom === next.zoom
      ? stepped.velocity
      : { x: 0, y: 0, zoom: 0 };
    next = { ...next, zoom: clampedZoom };
    const complete = Math.abs(target.x - next.x) <= themeGraphTokens.wheelMotionPositionEpsilonPx
      && Math.abs(target.y - next.y) <= themeGraphTokens.wheelMotionPositionEpsilonPx
      && Math.abs(target.zoom - next.zoom) <= themeGraphTokens.wheelMotionZoomEpsilon;
    if (complete && pendingWheelRef.current === null) {
      next = target;
      wheelLastFrameAtRef.current = null;
      wheelTargetRef.current = null;
      wheelVelocityRef.current = { x: 0, y: 0, zoom: 0 };
    }
    args.viewportRef.current = next;
    args.setViewport(next);
    if (!complete || pendingWheelRef.current !== null) {
      wheelFrameRef.current = window.requestAnimationFrame(runWheelFrame);
      return;
    }
    wheelSettleTimeoutRef.current = window.setTimeout(() => {
      wheelSettleTimeoutRef.current = null;
      args.onViewportSettledRef.current?.();
    }, themeGraphTokens.wheelSettleDelayMs);
  }, [args.onViewportSettledRef, args.setViewport, args.svgRef, args.viewportRef]);

  const handleWheel = useCallback((event: WheelEvent<SVGSVGElement>) => {
    if (!canAnimate) return;
    event.preventDefault();
    args.cancelPendingFit();
    cancelViewportAnimation();
    cancelWheelSettle();
    const deltaUnit = event.deltaMode === globalThis.WheelEvent.DOM_DELTA_LINE
      ? themeGraphTokens.wheelLineHeightPx
      : event.deltaMode === globalThis.WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
    const normalizedDelta = Math.max(
      -themeGraphTokens.wheelDeltaMaxPx,
      Math.min(themeGraphTokens.wheelDeltaMaxPx, event.deltaY * deltaUnit),
    );
    const previous = pendingWheelRef.current;
    pendingWheelRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      deltaY: (previous?.deltaY ?? 0) + normalizedDelta,
    };
    if (wheelFrameRef.current === null) {
      wheelFrameRef.current = window.requestAnimationFrame(runWheelFrame);
    }
  }, [
    args.cancelPendingFit,
    canAnimate,
    cancelViewportAnimation,
    cancelWheelSettle,
    runWheelFrame,
  ]);

  return {
    animateViewportTo,
    canAnimate,
    cancelViewportAnimation,
    cancelViewportWork,
    handleWheel,
    setViewportImmediately,
    startPanInertia,
    viewportAnimationTargetRef,
  };
}
