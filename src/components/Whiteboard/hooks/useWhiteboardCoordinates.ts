import { useCallback, type RefObject } from 'react';
import {
  screenPointToBoardPoint,
  type WhiteboardPoint,
  type WhiteboardViewport,
} from '@/components/Whiteboard/model/core/whiteboardModel';

export function useWhiteboardCoordinates(
  viewport: WhiteboardViewport,
  viewportRef: RefObject<HTMLDivElement | null>,
) {
  const getViewportPointFromRect = useCallback((
    clientX: number,
    clientY: number,
    rect: DOMRectReadOnly,
  ): WhiteboardPoint => ({ x: clientX - rect.left, y: clientY - rect.top }), []);

  const getBoardPointFromRect = useCallback((
    clientX: number,
    clientY: number,
    rect: DOMRectReadOnly,
  ): WhiteboardPoint => screenPointToBoardPoint(
    getViewportPointFromRect(clientX, clientY, rect),
    viewport,
  ), [getViewportPointFromRect, viewport]);

  const getViewportPoint = useCallback((clientX: number, clientY: number): WhiteboardPoint => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return rect ? getViewportPointFromRect(clientX, clientY, rect) : { x: 0, y: 0 };
  }, [getViewportPointFromRect, viewportRef]);

  const getBoardPoint = useCallback((clientX: number, clientY: number): WhiteboardPoint => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return rect ? getBoardPointFromRect(clientX, clientY, rect) : { x: 0, y: 0 };
  }, [getBoardPointFromRect, viewportRef]);

  return { getBoardPoint, getBoardPointFromRect, getViewportPoint };
}
