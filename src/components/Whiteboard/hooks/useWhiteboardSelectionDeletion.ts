import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import { isEditableTarget } from '../model/whiteboardInteractions';
import type { WhiteboardElement, WhiteboardStroke } from '../model/whiteboardModel';
import { removeWhiteboardItems } from '../model/whiteboardCollection';

interface WhiteboardSelectionDeletionOptions {
  active: boolean;
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setSelectedElementIds: Dispatch<SetStateAction<string[]>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  pushHistory: () => void;
}

export function useWhiteboardSelectionDeletion({
  active,
  pushHistory,
  selectedElementIds,
  selectedStrokeIds,
  setElements,
  setSelectedElementIds,
  setSelectedStrokeIds,
  setStrokes,
}: WhiteboardSelectionDeletionOptions) {
  const deleteSelection = useCallback(() => {
    if (selectedElementIds.length === 0 && selectedStrokeIds.length === 0) return;
    pushHistory();
    if (selectedElementIds.length > 0) {
      const selectedIds = new Set(selectedElementIds);
      setElements((current) => removeWhiteboardItems(current, selectedIds));
      setSelectedElementIds([]);
    }
    if (selectedStrokeIds.length > 0) {
      const selectedIds = new Set(selectedStrokeIds);
      setStrokes((current) => removeWhiteboardItems(current, selectedIds));
      setSelectedStrokeIds([]);
    }
  }, [
    pushHistory, selectedElementIds, selectedStrokeIds, setElements,
    setSelectedElementIds, setSelectedStrokeIds, setStrokes,
  ]);

  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || (event.key !== 'Backspace' && event.key !== 'Delete')) return;
      event.preventDefault();
      deleteSelection();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, deleteSelection]);

  return deleteSelection;
}
