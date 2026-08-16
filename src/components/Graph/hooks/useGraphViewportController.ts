import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { themeGraphTokens } from '@/styles/themeTokens';
import {
  fitGraphViewportToNodes,
  getGraphViewportContentBounds,
  GRAPH_INITIAL_VIEWPORT,
  zoomGraphViewportAtPoint,
  type GraphPoint,
} from '../model/graphViewport';
import type { PositionedGraphNode } from '../model/graphLayout';
import { useGraphViewportAnimation } from './useGraphViewportAnimation';

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
  const fitFrameRef = useRef<number | null>(null);
  const previousCanvasSizeRef = useRef<GraphPoint | null>(null);
  const onViewportSettledRef = useRef(args.onViewportSettled);
  nodesRef.current = args.nodes;
  onViewportSettledRef.current = args.onViewportSettled;
  viewportRef.current = viewport;

  const cancelPendingFit = useCallback(() => {
    if (fitFrameRef.current !== null) window.cancelAnimationFrame(fitFrameRef.current);
    fitFrameRef.current = null;
  }, []);

  const {
    animateViewportTo,
    canAnimate,
    cancelViewportAnimation,
    cancelViewportWork,
    handleWheel,
    setViewportImmediately,
    startPanInertia,
    viewportAnimationTargetRef,
  } = useGraphViewportAnimation({
    active: args.active !== false,
    cancelPendingFit,
    onViewportSettledRef,
    setViewport,
    svgRef: args.svgRef,
    viewportRef,
  });

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
    const zoom = viewportAnimationTargetRef.current?.zoom ?? viewportRef.current.zoom;
    zoomTo(zoom * themeGraphTokens.zoomControlStep);
  }, [zoomTo]);

  const zoomOut = useCallback(() => {
    const zoom = viewportAnimationTargetRef.current?.zoom ?? viewportRef.current.zoom;
    zoomTo(zoom / themeGraphTokens.zoomControlStep);
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

  return {
    cancelPendingFit,
    cancelViewportAnimation,
    cancelViewportWork,
    fitView,
    getViewport,
    handleWheel,
    resetZoom,
    setViewport: setViewportImmediately,
    startPanInertia,
    viewport,
    zoomIn,
    zoomOut,
  };
}
