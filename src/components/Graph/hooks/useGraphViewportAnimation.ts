import {
  useCallback,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { themeGraphTokens } from '@/styles/themeTokens';
import type { GraphViewport } from '../model/graphViewport';
import { useGraphViewportActivity } from './useGraphViewportActivity';

export function useGraphViewportAnimation(args: {
  active: boolean;
  cancelPendingFit: () => void;
  cancelWheelFrame: () => void;
  onViewportSettledRef: RefObject<(() => void) | undefined>;
  setViewport: Dispatch<SetStateAction<GraphViewport>>;
  viewportRef: RefObject<GraphViewport>;
}) {
  const viewportAnimationFrameRef = useRef<number | null>(null);
  const viewportAnimationTargetRef = useRef<GraphViewport | null>(null);

  const cancelViewportAnimation = useCallback(() => {
    if (viewportAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(viewportAnimationFrameRef.current);
    }
    viewportAnimationFrameRef.current = null;
    viewportAnimationTargetRef.current = null;
  }, []);

  const cancelViewportWork = useCallback(() => {
    args.cancelPendingFit();
    args.cancelWheelFrame();
    cancelViewportAnimation();
  }, [args.cancelPendingFit, args.cancelWheelFrame, cancelViewportAnimation]);
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
    args.cancelWheelFrame();
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
    args.cancelWheelFrame,
    args.onViewportSettledRef,
    args.setViewport,
    args.viewportRef,
    canAnimate,
    cancelViewportAnimation,
    cancelViewportWork,
    setViewportImmediately,
  ]);

  return {
    animateViewportTo,
    canAnimate,
    cancelViewportAnimation,
    cancelViewportWork,
    setViewportImmediately,
    viewportAnimationTargetRef,
  };
}
