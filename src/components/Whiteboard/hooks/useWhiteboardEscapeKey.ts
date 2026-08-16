import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { isEditableTarget, type WhiteboardDragState } from '@/components/Whiteboard/model/interaction/whiteboardInteractions';
import type { WhiteboardTool } from '@/components/Whiteboard/model/core/whiteboardModel';

interface WhiteboardEscapeKeyOptions {
  active: boolean;
  cancelEraserGesture: () => void;
  clearDraftStroke: () => void;
  setDragState: Dispatch<SetStateAction<WhiteboardDragState | null>>;
  setSelectedElementId: Dispatch<SetStateAction<string | null>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setTool: Dispatch<SetStateAction<WhiteboardTool>>;
}

export function useWhiteboardEscapeKey({
  active,
  cancelEraserGesture,
  clearDraftStroke,
  setDragState,
  setSelectedElementId,
  setSelectedStrokeIds,
  setTool,
}: WhiteboardEscapeKeyOptions) {
  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isEditableTarget(event.target)) return;
      cancelEraserGesture();
      clearDraftStroke();
      setDragState(null);
      setSelectedElementId(null);
      setSelectedStrokeIds([]);
      setTool('select');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    active, cancelEraserGesture, clearDraftStroke, setDragState,
    setSelectedElementId, setSelectedStrokeIds, setTool,
  ]);
}
