import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  findGraphNodeInDirection,
  type GraphNavigationDirection,
} from '../model/graphKeyboardNavigation';
import type { PositionedGraphNode } from '../model/graphLayout';

export function useGraphKeyboardNavigation(args: {
  currentPath: string | null;
  nodes: PositionedGraphNode[];
  onFocusChange: (path: string) => void;
  onSelectPath: (path: string | null) => void;
  selectedPath: string | null;
  svgRef: RefObject<SVGSVGElement | null>;
}) {
  const nodesRef = useRef(args.nodes);
  const focusRequestRef = useRef<string | null>(null);
  const defaultPath = args.selectedPath
    ?? args.currentPath
    ?? args.nodes[0]?.id
    ?? null;
  const [focusablePath, setFocusablePath] = useState(defaultPath);
  nodesRef.current = args.nodes;

  useLayoutEffect(() => {
    const next = args.selectedPath
      ?? (focusablePath && args.nodes.some((node) => node.id === focusablePath)
        ? focusablePath
        : args.currentPath ?? args.nodes[0]?.id ?? null);
    if (next !== focusablePath) setFocusablePath(next);
  }, [args.currentPath, args.nodes, args.selectedPath, focusablePath]);

  useLayoutEffect(() => {
    const requestedPath = focusRequestRef.current;
    if (!requestedPath) return;
    focusRequestRef.current = null;
    const elements = args.svgRef.current
      ?.querySelectorAll<SVGGElement>('[data-graph-node-position]');
    const target = elements
      ? [...elements].find((element) => element.dataset.graphNodePosition === requestedPath)
      : null;
    target?.focus();
  }, [args.svgRef, focusablePath]);

  const handleSelectPath = useCallback((path: string | null) => {
    if (path) setFocusablePath(path);
    args.onSelectPath(path);
  }, [args.onSelectPath]);

  const handleFocusChange = useCallback((path: string) => {
    setFocusablePath(path);
    args.onFocusChange(path);
  }, [args.onFocusChange]);

  const handleNavigate = useCallback((
    path: string,
    direction: GraphNavigationDirection,
  ) => {
    const target = findGraphNodeInDirection(nodesRef.current, path, direction);
    if (!target) return;
    focusRequestRef.current = target.id;
    setFocusablePath(target.id);
    args.onSelectPath(target.id);
  }, [args.onSelectPath]);

  return {
    focusablePath,
    handleFocusChange,
    handleNavigate,
    handleSelectPath,
  };
}
