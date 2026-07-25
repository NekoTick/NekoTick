import { useCallback, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import type { PositionedNoteGraph } from '../model/graphLayout';
import { resolveClosestGraphPointerNode } from '../model/graphPointerTarget';
import type { GraphViewport } from '../model/graphViewport';
import type { GraphNodePosition, GraphNodePositions } from '../store/useGraphUIStore';

export function useGraphNodePointerTarget(args: {
  getNodePosition: (path: string, fallback: GraphNodePosition) => GraphNodePosition;
  getViewport: () => GraphViewport;
  graphRef: RefObject<PositionedNoteGraph>;
  onHoverChange: (path: string | null) => void;
  onStartNodeDrag: (
    event: PointerEvent<SVGGElement>,
    path: string,
    position: GraphNodePosition,
  ) => void;
  positionsRef: RefObject<GraphNodePositions>;
  svgRef: RefObject<SVGSVGElement | null>;
}) {
  const resolveNodePointerTarget = useCallback((
    event: MouseEvent<SVGGElement> | PointerEvent<SVGGElement>,
    path: string,
    fallbackPosition: GraphNodePosition,
  ) => {
    const position = args.getNodePosition(path, fallbackPosition);
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('[data-graph-node-hit-target]')) {
      return { id: path, position };
    }
    const rect = args.svgRef.current?.getBoundingClientRect();
    if (!rect) return { id: path, position };
    return resolveClosestGraphPointerNode({
      fallbackId: path,
      fallbackPosition: position,
      nodes: args.graphRef.current.nodes,
      positions: args.positionsRef.current,
      screenPoint: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      viewport: args.getViewport(),
    });
  }, [args.getNodePosition, args.getViewport, args.graphRef, args.positionsRef, args.svgRef]);

  const handleHoverStart = useCallback((
    event: MouseEvent<SVGGElement>,
    path: string,
    position: GraphNodePosition,
  ) => {
    args.onHoverChange(resolveNodePointerTarget(event, path, position).id);
  }, [args.onHoverChange, resolveNodePointerTarget]);

  const handleStartDrag = useCallback((
    event: PointerEvent<SVGGElement>,
    path: string,
    position: GraphNodePosition,
  ) => {
    const target = resolveNodePointerTarget(event, path, position);
    args.onStartNodeDrag(event, target.id, target.position);
  }, [args.onStartNodeDrag, resolveNodePointerTarget]);

  return { handleHoverStart, handleStartDrag };
}
