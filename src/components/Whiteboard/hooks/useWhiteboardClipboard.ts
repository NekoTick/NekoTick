import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { isImageFileLike } from '@/lib/assets/core/naming';
import { isEditableTarget } from '../model/whiteboardInteractions';
import type { WhiteboardElement, WhiteboardStroke, WhiteboardTool } from '../model/whiteboardModel';
import { cloneElements, cloneStrokes } from '../model/whiteboardTransform';
import { appendWhiteboardItems } from '../model/whiteboardCollection';

interface WhiteboardClipboardPayload {
  elements: WhiteboardElement[];
  strokes: WhiteboardStroke[];
}

interface WhiteboardClipboardOptions {
  active: boolean;
  elements: WhiteboardElement[];
  importImage: (file: File) => void;
  pushHistory: () => void;
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setSelectedElementIds: Dispatch<SetStateAction<string[]>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  setTool: Dispatch<SetStateAction<WhiteboardTool>>;
  strokes: WhiteboardStroke[];
}

export function useWhiteboardClipboard({
  active,
  elements,
  importImage,
  pushHistory,
  selectedElementIds,
  selectedStrokeIds,
  setElements,
  setSelectedElementIds,
  setSelectedStrokeIds,
  setStrokes,
  setTool,
  strokes,
}: WhiteboardClipboardOptions) {
  const clipboardRef = useRef<WhiteboardClipboardPayload | null>(null);
  const pasteCountRef = useRef(0);

  const copySelection = useCallback(() => {
    const selectedElementIdSet = new Set(selectedElementIds);
    const selectedElements = elements.filter((element) => selectedElementIdSet.has(element.id));
    const selectedIds = new Set(selectedStrokeIds);
    const selectedStrokes = strokes.filter((stroke) => selectedIds.has(stroke.id));
    if (selectedElements.length === 0 && selectedStrokes.length === 0) return false;
    clipboardRef.current = {
      elements: selectedElements,
      strokes: selectedStrokes,
    };
    return true;
  }, [elements, selectedElementIds, selectedStrokeIds, strokes]);

  const pasteSelection = useCallback(() => {
    const payload = clipboardRef.current;
    if (!payload) return;
    pasteCountRef.current += 1;
    const idPrefix = `wb-paste-${Date.now()}-${pasteCountRef.current}`;
    const offset = 28 * pasteCountRef.current;
    const nextElements = cloneElements(payload.elements, offset, idPrefix);
    const nextStrokes = cloneStrokes(payload.strokes, offset, idPrefix);
    pushHistory();
    setElements((current) => appendWhiteboardItems(current, nextElements));
    setStrokes((current) => appendWhiteboardItems(current, nextStrokes));
    setSelectedElementIds(nextElements.map((element) => element.id));
    setSelectedStrokeIds(nextStrokes.map((stroke) => stroke.id));
    setTool('select');
  }, [pushHistory, setElements, setSelectedElementIds, setSelectedStrokeIds, setStrokes, setTool]);

  const duplicateSelection = useCallback(() => {
    if (copySelection()) pasteSelection();
  }, [copySelection, pasteSelection]);

  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || (!event.ctrlKey && !event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'c') {
        copySelection();
      } else if (key === 'v') {
        if (!clipboardRef.current) return;
        event.preventDefault();
        pasteSelection();
      } else if (key === 'd') {
        event.preventDefault();
        duplicateSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, copySelection, duplicateSelection, pasteSelection]);

  useEffect(() => {
    if (!active) return undefined;
    const handlePaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const imageFile = Array.from(event.clipboardData?.files ?? []).find(isImageFileLike);
      if (imageFile) {
        event.preventDefault();
        importImage(imageFile);
        return;
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [active, importImage]);

  return { copySelection, duplicateSelection, pasteSelection };
}
