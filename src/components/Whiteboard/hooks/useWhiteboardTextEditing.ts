import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { appendWhiteboardItems, markWhiteboardSparseUpdate, removeWhiteboardItems } from '../model/whiteboardCollection';
import { findElementAtPoint } from '../model/whiteboardSelection';
import {
  createWhiteboardTextElement,
  finalizeWhiteboardTextElement,
  loadWhiteboardTextFonts,
} from '../model/whiteboardText';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardTool } from '../model/whiteboardModel';

export interface WhiteboardTextEditingState {
  element: WhiteboardElement;
  initialCaretPoint?: WhiteboardPoint;
  original: WhiteboardElement | null;
}

interface WhiteboardTextEditingOptions {
  elements: WhiteboardElement[];
  pushHistory: () => void;
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setSelectedElementIds: Dispatch<SetStateAction<string[]>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setTool: Dispatch<SetStateAction<WhiteboardTool>>;
}

export function useWhiteboardTextEditing({
  elements,
  pushHistory,
  setElements,
  setSelectedElementIds,
  setSelectedStrokeIds,
  setTool,
}: WhiteboardTextEditingOptions) {
  const [editing, setEditing] = useState<WhiteboardTextEditingState | null>(null);
  const valueRef = useRef('');
  const editingSessionRef = useRef(0);
  const committingSessionRef = useRef<number | null>(null);

  const startTextEditing = useCallback((point: WhiteboardPoint, color: string) => {
    editingSessionRef.current += 1;
    committingSessionRef.current = null;
    const existing = findTextAtPoint(elements, point);
    valueRef.current = existing?.text ?? '';
    setEditing(existing
      ? { element: existing, initialCaretPoint: point, original: existing }
      : { element: createWhiteboardTextElement(point, color), original: null });
    setSelectedElementIds([]);
    setSelectedStrokeIds([]);
  }, [elements, setSelectedElementIds, setSelectedStrokeIds]);

  const editTextElement = useCallback((element: WhiteboardElement, initialCaretPoint?: WhiteboardPoint) => {
    if (element.type !== 'text') return;
    editingSessionRef.current += 1;
    committingSessionRef.current = null;
    valueRef.current = element.text;
    setEditing({ element, ...(initialCaretPoint ? { initialCaretPoint } : {}), original: element });
    setSelectedElementIds([]);
    setSelectedStrokeIds([]);
  }, [setSelectedElementIds, setSelectedStrokeIds]);

  const editTextAtPoint = useCallback((point: WhiteboardPoint) => {
    const element = findTextAtPoint(elements, point);
    if (!element) return false;
    editTextElement(element, point);
    return true;
  }, [editTextElement, elements]);

  const updateTextEditing = useCallback((value: string) => {
    valueRef.current = value;
  }, []);

  const commitTextEditing = useCallback(() => {
    if (!editing) return;
    const session = editingSessionRef.current;
    if (committingSessionRef.current === session) return;
    committingSessionRef.current = session;
    const value = valueRef.current;
    const finish = () => {
      if (editingSessionRef.current !== session) return;
      const finalized = finalizeWhiteboardTextElement(editing.element, value);
      if (editing.original) {
        const original = editing.original;
        if (!finalized || finalized.text !== original.text) pushHistory();
        setElements((current) => {
          const index = current.findIndex((element) => element.id === original.id);
          if (index < 0) return current;
          if (!finalized) return removeWhiteboardItems(current, new Set([original.id]));
          if (
            finalized.text === current[index].text &&
            finalized.fontSize === current[index].fontSize &&
            finalized.height === current[index].height &&
            finalized.lineHeight === current[index].lineHeight &&
            finalized.width === current[index].width
          ) return current;
          const next = current.slice();
          next[index] = finalized;
          return markWhiteboardSparseUpdate(current, next, [finalized]);
        });
      } else if (finalized) {
        pushHistory();
        setElements((current) => appendWhiteboardItems(current, [finalized]));
      }
      committingSessionRef.current = null;
      setEditing(null);
      if (finalized) {
        setSelectedElementIds([finalized.id]);
        setTool('select');
      }
    };
    const fontLoad = value.trim()
      ? loadWhiteboardTextFonts(value, editing.element.fontSize)
      : null;
    if (fontLoad) void fontLoad.then(finish, finish);
    else finish();
  }, [editing, pushHistory, setElements, setSelectedElementIds, setTool]);

  return { commitTextEditing, editTextAtPoint, editTextElement, editing, startTextEditing, updateTextEditing };
}

function findTextAtPoint(elements: WhiteboardElement[], point: WhiteboardPoint): WhiteboardElement | null {
  return findElementAtPoint(elements.filter((element) => element.type === 'text'), point);
}
