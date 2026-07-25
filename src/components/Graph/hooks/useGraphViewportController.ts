import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  type WheelEvent,
} from 'react';
import { themeGraphTokens } from '@/styles/themeTokens';
import {
  fitGraphViewportToNodes,
  getGraphViewportContentBounds,
  GRAPH_INITIAL_VIEWPORT,
  zoomGraphViewportAtPoint,
  type GraphPoint,
  type GraphViewport,
} from '../model/graphViewport';
import type { PositionedGraphNode } from '../model/graphLayout';
import { useGraphViewportActivity } from './useGraphViewportActivity';

export function useGraphViewportController(args: {
  canvasSize?: GraphPoint;
  nodeKey: string;
  nodes: PositionedGraphNode[];
  onViewportSettled?: () => void;
  selectedPath: string | null;
  svgRef: RefObject<SVGSVGElement | null>;
  active?: boolean;
  userPositionedViewportRef?: RefObject<boolean>;
}) {
  const nodesRef = useRef(args.nodes);
  const [viewport, setViewport] = useState(GRAPH_INITIAL_VIEWPORT);
  const viewportRef = useRef(viewport);
  const pendingWheelRef = useRef<{
    clientX: number;
    clientY: number;
    deltaY: number;
  } | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelSettleTimeoutRef = useRef<number | null>(null);
  const viewportAnimationFrameRef = useRef<number | null>(null);
  const previousCanvasSizeRef = useRef<GraphPoint | null>(null);
  const onViewportSettledRef = useRef(args.onViewportSettled);
  nodesRef.current = args.nodes;
  onViewportSettledRef.current = args.onViewportSettled;
  viewportRef.current = viewport;

  const cancelPendingFit = useCallback(() => {
    if (fitFrameRef.current !== null) window.cancelAnimationFrame(fitFrameRef.current);
    fitFrameRef.current = null;
  }, []);

  const cancelWheelSettle = useCallback(() => {
    if (wheelSettleTimeoutRef.current !== null) {
      window.clearTimeout(wheelSettleTimeoutRef.current);
    }
    wheelSettleTimeoutRef.current = null;
  }, []);

  const cancelWheelFrame = useCallback(() => {
    if (wheelFrameRef.current !== null) window.cancelAnimationFrame(wheelFrameRef.current);
    wheelFrameRef.current = null;
    pendingWheelRef.current = null;
    cancelWheelSettle();
  }, [cancelWheelSettle]);

  const cancelViewportAnimation = useCallback(() => {
    if (viewportAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(viewportAnimationFrameRef.current);
    }
    viewportAnimationFrameRef.current = null;
  }, []);

  const cancelViewportWork = useCallback(() => {
    cancelPendingFit();
    cancelWheelFrame();
    cancelViewportAnimation();
  }, [cancelPendingFit, cancelViewportAnimation, cancelWheelFrame]);
  const canAnimate = useGraphViewportActivity(args.active !== false, cancelViewportWork);

  const setViewportImmediately = useCallback<Dispatch<SetStateAction<GraphViewport>>>((value) => {
    cancelViewportWork();
    setViewport((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      viewportRef.current = next;
      return next;
    });
  }, [cancelViewportWork]);

  const animateViewportTo = useCallback((target: GraphViewport) => {
    if (!canAnimate) {
      cancelViewportWork();
      return;
    }
    cancelWheelFrame();
    cancelViewportAnimation();
    const start = viewportRef.current;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reducedMotion || (
      start.x === target.x && start.y === target.y && start.zoom === target.zoom
    )) {
      setViewportImmediately(target);
      onViewportSettledRef.current?.();
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
      viewportRef.current = next;
      setViewport(next);
      if (progress < 1) {
        viewportAnimationFrameRef.current = window.requestAnimationFrame(step);
      } else {
        viewportAnimationFrameRef.current = null;
        onViewportSettledRef.current?.();
      }
    };
    viewportAnimationFrameRef.current = window.requestAnimationFrame(step);
  }, [canAnimate, cancelViewportAnimation, cancelViewportWork, cancelWheelFrame, setViewportImmediately]);

  const getFittedViewport = useCallback((nextNodes: readonly GraphPoint[] = nodesRef.current) => {
    const rect = args.svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const viewportSize = { x: rect.width, y: rect.height };
    return fitGraphViewportToNodes(
      nextNodes,
      viewportSize,
      getGraphViewportContentBounds(viewportSize, false),
    );
  }, [args.svgRef]);

  const fitView = useCallback(() => {
    if (!canAnimate) return;
    cancelPendingFit();
    const next = getFittedViewport();
    if (next) animateViewportTo(next);
  }, [animateViewportTo, canAnimate, cancelPendingFit, getFittedViewport]);

  const zoomTo = useCallback((zoom: number) => {
    if (!canAnimate) return;
    const rect = args.svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const contentBounds = getGraphViewportContentBounds(
      { x: rect.width, y: rect.height },
      false,
    );
    const next = zoomGraphViewportAtPoint(
      viewportRef.current,
      {
        x: contentBounds.left + (contentBounds.right - contentBounds.left) / 2,
        y: contentBounds.top + (contentBounds.bottom - contentBounds.top) / 2,
      },
      zoom,
    );
    animateViewportTo(next);
  }, [animateViewportTo, args.svgRef, canAnimate]);

  const zoomIn = useCallback(() => {
    zoomTo(viewportRef.current.zoom * themeGraphTokens.zoomControlStep);
  }, [zoomTo]);

  const zoomOut = useCallback(() => {
    zoomTo(viewportRef.current.zoom / themeGraphTokens.zoomControlStep);
  }, [zoomTo]);

  const resetZoom = useCallback(() => {
    zoomTo(themeGraphTokens.defaultZoom);
  }, [zoomTo]);
  const getViewport = useCallback(() => viewportRef.current, []);

  useEffect(() => {
    if (!canAnimate || args.userPositionedViewportRef?.current) return;
    cancelPendingFit();
    fitFrameRef.current = window.requestAnimationFrame(() => {
      fitFrameRef.current = null;
      const next = getFittedViewport();
      if (next) {
        setViewportImmediately(next);
        onViewportSettledRef.current?.();
      }
    });
    return cancelPendingFit;
  }, [
    canAnimate,
    args.nodeKey,
    args.userPositionedViewportRef,
    cancelPendingFit,
    getFittedViewport,
    setViewportImmediately,
  ]);

  useLayoutEffect(() => {
    if (!canAnimate || !args.canvasSize) return;
    const previous = previousCanvasSizeRef.current;
    const next = args.canvasSize;
    if (next.x <= 0 || next.y <= 0) return;
    previousCanvasSizeRef.current = next;
    if (!previous || previous.x <= 0 || previous.y <= 0) return;
    if (previous.x === next.x && previous.y === next.y) return;
    if (!args.userPositionedViewportRef?.current) {
      cancelPendingFit();
      fitFrameRef.current = window.requestAnimationFrame(() => {
        fitFrameRef.current = null;
        const fitted = getFittedViewport();
        if (fitted) {
          setViewportImmediately(fitted);
          onViewportSettledRef.current?.();
        }
      });
      return;
    }
    setViewportImmediately((current) => ({
      ...current,
      x: current.x + (next.x - previous.x) / 2,
      y: current.y + (next.y - previous.y) / 2,
    }));
    onViewportSettledRef.current?.();
  }, [
    args.canvasSize?.x,
    args.canvasSize?.y,
    canAnimate,
    args.userPositionedViewportRef,
    cancelPendingFit,
    getFittedViewport,
    setViewportImmediately,
  ]);

  useEffect(() => () => cancelViewportWork(), [cancelViewportWork]);

  useEffect(() => {
    if (!canAnimate) {
      cancelViewportAnimation();
      return;
    }
    if (!args.selectedPath) {
      cancelViewportAnimation();
      return;
    }
    const node = nodesRef.current.find((item) => item.id === args.selectedPath);
    const rect = args.svgRef.current?.getBoundingClientRect();
    if (!node || !rect) return;
    const current = viewportRef.current;
    const screenX = current.x + node.x * current.zoom;
    const screenY = current.y + node.y * current.zoom;
    const contentBounds = getGraphViewportContentBounds(
      { x: rect.width, y: rect.height },
      false,
    );
    const inset = themeGraphTokens.fitViewPaddingPx;
    if (
      screenX >= contentBounds.left + inset
      && screenX <= contentBounds.right - inset
      && screenY >= contentBounds.top + inset
      && screenY <= contentBounds.bottom - inset
    ) {
      cancelViewportAnimation();
      return;
    }
    animateViewportTo({
      ...current,
      x: contentBounds.left + (contentBounds.right - contentBounds.left) / 2
        - node.x * current.zoom,
      y: contentBounds.top + (contentBounds.bottom - contentBounds.top) / 2
        - node.y * current.zoom,
    });
  }, [
    animateViewportTo,
    args.nodeKey,
    args.selectedPath,
    args.svgRef,
    canAnimate,
    cancelViewportAnimation,
  ]);

  const handleWheel = useCallback((event: WheelEvent<SVGSVGElement>) => {
    if (!canAnimate) return;
    event.preventDefault();
    cancelPendingFit();
    cancelViewportAnimation();
    cancelWheelSettle();
    const deltaUnit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? themeGraphTokens.wheelLineHeightPx
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
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
    if (wheelFrameRef.current !== null) return;
    wheelFrameRef.current = window.requestAnimationFrame(() => {
      wheelFrameRef.current = null;
      const pending = pendingWheelRef.current;
      pendingWheelRef.current = null;
      if (!pending) return;
      const rect = args.svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const current = viewportRef.current;
      const next = zoomGraphViewportAtPoint(
        current,
        { x: pending.clientX - rect.left, y: pending.clientY - rect.top },
        current.zoom * Math.exp(-pending.deltaY * themeGraphTokens.wheelZoomIntensity),
      );
      viewportRef.current = next;
      setViewport(next);
      wheelSettleTimeoutRef.current = window.setTimeout(() => {
        wheelSettleTimeoutRef.current = null;
        onViewportSettledRef.current?.();
      }, themeGraphTokens.wheelSettleDelayMs);
    });
  }, [
    args.svgRef,
    canAnimate,
    cancelPendingFit,
    cancelViewportAnimation,
    cancelWheelSettle,
  ]);

  return {
    cancelPendingFit,
    cancelViewportAnimation,
    cancelViewportWork,
    fitView,
    getViewport,
    handleWheel,
    resetZoom,
    setViewport: setViewportImmediately,
    viewport,
    zoomIn,
    zoomOut,
  };
}
