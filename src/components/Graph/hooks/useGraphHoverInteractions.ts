import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { themeGraphTokens } from '@/styles/themeTokens';

export function useGraphHoverInteractions(graphTopologyKey: string) {
  const previousGraphKeyRef = useRef(graphTopologyKey);
  const hoveredGraphKeyRef = useRef(graphTopologyKey);
  const hoverClearTimeoutRef = useRef<number | null>(null);
  const suppressedHoverPathRef = useRef<string | null>(null);
  const suppressHoverUntilPointerMoveRef = useRef(false);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const visibleHoveredPath = hoveredGraphKeyRef.current === graphTopologyKey
    ? hoveredPath
    : null;

  useLayoutEffect(() => {
    if (previousGraphKeyRef.current === graphTopologyKey) return;
    previousGraphKeyRef.current = graphTopologyKey;
    hoveredGraphKeyRef.current = graphTopologyKey;
    setHoveredPath(null);
    suppressedHoverPathRef.current = null;
    suppressHoverUntilPointerMoveRef.current = false;
  }, [graphTopologyKey]);

  const handleHoverChange = useCallback((path: string | null) => {
    if (suppressHoverUntilPointerMoveRef.current && path) return;
    if (hoverClearTimeoutRef.current !== null) {
      window.clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }
    if (path) {
      if (suppressedHoverPathRef.current === path) return;
      hoveredGraphKeyRef.current = previousGraphKeyRef.current;
      setHoveredPath((current) => current === path ? current : path);
      return;
    }
    hoverClearTimeoutRef.current = window.setTimeout(() => {
      hoverClearTimeoutRef.current = null;
      setHoveredPath(null);
    }, themeGraphTokens.nodeHoverLeaveDelayMs);
  }, []);

  const handleFocusChange = useCallback((path: string) => {
    suppressHoverUntilPointerMoveRef.current = false;
    suppressedHoverPathRef.current = null;
    handleHoverChange(path);
  }, [handleHoverChange]);

  const clearPointerHover = useCallback((draggedNodeId: string | null) => {
    suppressHoverUntilPointerMoveRef.current = draggedNodeId !== null;
    suppressedHoverPathRef.current = draggedNodeId;
    if (hoverClearTimeoutRef.current !== null) {
      window.clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }
    setHoveredPath(null);
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (suppressHoverUntilPointerMoveRef.current) {
      suppressHoverUntilPointerMoveRef.current = false;
      suppressedHoverPathRef.current = null;
      return;
    }
    const suppressedPath = suppressedHoverPathRef.current;
    if (!suppressedPath) return;
    const target = event.target;
    const hoveredNode = target instanceof Element
      ? target.closest<SVGGElement>('[data-graph-node-position]')
      : null;
    if (hoveredNode?.dataset.graphNodePosition !== suppressedPath) {
      suppressedHoverPathRef.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (hoverClearTimeoutRef.current !== null) {
      window.clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }
    suppressHoverUntilPointerMoveRef.current = false;
    suppressedHoverPathRef.current = null;
    setHoveredPath(null);
  }, []);

  useEffect(() => () => {
    if (hoverClearTimeoutRef.current !== null) window.clearTimeout(hoverClearTimeoutRef.current);
  }, []);

  return {
    clearPointerHover,
    handleFocusChange,
    handleHoverChange,
    handlePointerLeave,
    handlePointerMove,
    visibleHoveredPath,
  };
}
