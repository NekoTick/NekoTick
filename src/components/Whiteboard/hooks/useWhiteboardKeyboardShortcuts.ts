import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { isEditableTarget } from '../model/whiteboardInteractions';
import type { WhiteboardBrushTool, WhiteboardElement, WhiteboardStroke, WhiteboardTool } from '../model/whiteboardModel';
import { translateStroke } from '../model/whiteboardSelection';
import { markWhiteboardSparseUpdate } from '../model/whiteboardCollection';
import type { WhiteboardEraserSpatialIndex } from '../model/whiteboardEraser';

interface WhiteboardKeyboardShortcutsOptions {
  active: boolean;
  pushHistory: () => void;
  resizeBrush: (tool: WhiteboardBrushTool, deltaY: number) => void;
  selectAll: () => void;
  selectedBrushTool: WhiteboardBrushTool | null;
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  setTool: (tool: WhiteboardTool) => void;
  spatialIndex: WhiteboardEraserSpatialIndex;
  viewportZoom: number;
}

const TOOL_KEYS: Partial<Record<string, WhiteboardTool>> = {
  '1': 'select',
  '2': 'hand',
  '3': 'pen',
  '4': 'pencil',
  '5': 'marker',
  '6': 'eraser',
  e: 'eraser',
  h: 'hand',
  m: 'marker',
  p: 'pen',
  v: 'select',
};

export function useWhiteboardKeyboardShortcuts({
  active,
  pushHistory,
  resizeBrush,
  selectAll,
  selectedBrushTool,
  selectedElementIds,
  selectedStrokeIds,
  setElements,
  setStrokes,
  setTool,
  spatialIndex,
  viewportZoom,
}: WhiteboardKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const nudge = getNudge(event.key, event.shiftKey, viewportZoom);
      if (nudge && (selectedElementIds.length > 0 || selectedStrokeIds.length > 0)) {
        event.preventDefault();
        if (!event.repeat) pushHistory();
        nudgeSelection(selectedElementIds, selectedStrokeIds, setElements, setStrokes, spatialIndex, nudge.x, nudge.y);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'a') {
        event.preventDefault();
        selectAll();
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const nextTool = TOOL_KEYS[key];
        if (nextTool) {
          event.preventDefault();
          setTool(nextTool);
          return;
        }
        if (selectedBrushTool && (event.key === '[' || event.key === ']')) {
          event.preventDefault();
          resizeBrush(selectedBrushTool, event.key === '[' ? 1 : -1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    active, pushHistory, resizeBrush, selectAll, selectedBrushTool,
    selectedElementIds, selectedStrokeIds, setElements, setStrokes, setTool, spatialIndex, viewportZoom,
  ]);
}

function getNudge(key: string, large: boolean, zoom: number): { x: number; y: number } | null {
  const step = (large ? 10 : 1) / Math.max(0.01, zoom);
  if (key === 'ArrowLeft') return { x: -step, y: 0 };
  if (key === 'ArrowRight') return { x: step, y: 0 };
  if (key === 'ArrowUp') return { x: 0, y: -step };
  if (key === 'ArrowDown') return { x: 0, y: step };
  return null;
}

function nudgeSelection(
  selectedElementIds: string[],
  selectedStrokeIds: string[],
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>,
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>,
  spatialIndex: WhiteboardEraserSpatialIndex,
  dx: number,
  dy: number,
) {
  if (selectedElementIds.length > 0) setElements((current) => {
    const changedItems: WhiteboardElement[] = [];
    const next = current.slice();
    if (spatialIndex.allElements === current) {
      for (const id of selectedElementIds) {
        const index = spatialIndex.elementOrder.get(id);
        if (index === undefined) continue;
        const element = current[index];
        if (!element || element.id !== id) continue;
        const moved = { ...element, x: element.x + dx, y: element.y + dy };
        next[index] = moved;
        changedItems.push(moved);
      }
    } else {
      const selectedIds = new Set(selectedElementIds);
      for (let index = 0; index < current.length; index += 1) {
        const element = current[index];
        if (!selectedIds.has(element.id)) continue;
        const moved = { ...element, x: element.x + dx, y: element.y + dy };
        next[index] = moved;
        changedItems.push(moved);
      }
    }
    return markWhiteboardSparseUpdate(current, next, changedItems);
  });
  if (selectedStrokeIds.length > 0) setStrokes((current) => {
    const changedItems: WhiteboardStroke[] = [];
    const next = current.slice();
    if (spatialIndex.allStrokes === current) {
      for (const id of selectedStrokeIds) {
        const index = spatialIndex.strokeOrder.get(id);
        if (index === undefined) continue;
        const stroke = current[index];
        if (!stroke || stroke.id !== id) continue;
        const moved = translateStroke(stroke, dx, dy);
        next[index] = moved;
        changedItems.push(moved);
      }
    } else {
      const selectedIds = new Set(selectedStrokeIds);
      for (let index = 0; index < current.length; index += 1) {
        const stroke = current[index];
        if (!selectedIds.has(stroke.id)) continue;
        const moved = translateStroke(stroke, dx, dy);
        next[index] = moved;
        changedItems.push(moved);
      }
    }
    return markWhiteboardSparseUpdate(current, next, changedItems);
  });
}
