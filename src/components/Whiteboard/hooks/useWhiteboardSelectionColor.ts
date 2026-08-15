import { useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type {
  WhiteboardElement,
  WhiteboardPaperStyle,
  WhiteboardStroke,
} from '../model/whiteboardModel';
import type { WhiteboardSnapshot } from './useWhiteboardHistory';

interface UseWhiteboardSelectionColorOptions {
  elements: WhiteboardElement[];
  paper: WhiteboardPaperStyle;
  pushHistory: (snapshot?: WhiteboardSnapshot) => void;
  selectedElementIds: string[];
  selectedStrokeIds: string[];
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  strokes: WhiteboardStroke[];
}

interface SelectedContentColorTargets {
  elementIds: Set<string>;
  hasChanged: boolean;
  strokeIds: Set<string>;
}

export function useWhiteboardSelectionColor({
  elements,
  paper,
  pushHistory,
  selectedElementIds,
  selectedStrokeIds,
  setElements,
  setStrokes,
  strokes,
}: UseWhiteboardSelectionColorOptions) {
  const previewSnapshotRef = useRef<WhiteboardSnapshot | null>(null);
  const setSelectedContentColor = useCallback((color: string) => {
    const targets = getSelectedContentColorTargets(elements, strokes, selectedElementIds, selectedStrokeIds, color);
    const previewSnapshot = previewSnapshotRef.current;
    const changedFromPreview = previewSnapshot
      ? getSelectedContentColorTargets(previewSnapshot.elements, previewSnapshot.strokes, selectedElementIds, selectedStrokeIds, color).hasChanged
      : targets.hasChanged;
    if (!changedFromPreview) {
      previewSnapshotRef.current = null;
      return;
    }
    pushHistory(previewSnapshot ?? undefined);
    previewSnapshotRef.current = null;
    if (targets.hasChanged) applySelectedContentColor(targets, color, setElements, setStrokes);
  }, [elements, pushHistory, selectedElementIds, selectedStrokeIds, setElements, setStrokes, strokes]);
  const previewSelectedContentColor = useCallback((color: string) => {
    const targets = getSelectedContentColorTargets(elements, strokes, selectedElementIds, selectedStrokeIds, color);
    if (!targets.hasChanged) return;
    previewSnapshotRef.current ??= { elements, paper, strokes };
    applySelectedContentColor(targets, color, setElements, setStrokes);
  }, [elements, paper, selectedElementIds, selectedStrokeIds, setElements, setStrokes, strokes]);
  const cancelSelectedContentColor = useCallback(() => {
    const snapshot = previewSnapshotRef.current;
    previewSnapshotRef.current = null;
    if (!snapshot) return;
    setElements(snapshot.elements);
    setStrokes(snapshot.strokes);
  }, [setElements, setStrokes]);
  const selectedContentColor = useMemo(() => {
    if (selectedStrokeIds.length + selectedElementIds.length !== 1) return null;
    if (selectedStrokeIds.length === 1) {
      return strokes.find((stroke) => stroke.id === selectedStrokeIds[0])?.color ?? null;
    }
    const element = elements.find((candidate) => candidate.id === selectedElementIds[0]);
    return element && element.type !== 'image'
      ? element.color ?? themeWhiteboardTokens.whiteboardTextDefaultColor
      : null;
  }, [elements, selectedElementIds, selectedStrokeIds, strokes]);

  return {
    cancelSelectedContentColor,
    previewSelectedContentColor,
    selectedContentColor,
    setSelectedContentColor,
  };
}

function getSelectedContentColorTargets(
  elements: WhiteboardElement[],
  strokes: WhiteboardStroke[],
  selectedElementIds: string[],
  selectedStrokeIds: string[],
  color: string,
): SelectedContentColorTargets {
  const selectedStrokeIdSet = new Set(selectedStrokeIds);
  const selectedElementIdSet = new Set(selectedElementIds);
  const strokeIds = new Set(
    strokes.filter((stroke) => selectedStrokeIdSet.has(stroke.id)).map((stroke) => stroke.id),
  );
  const elementIds = new Set(
    elements.filter((element) => selectedElementIdSet.has(element.id) && element.type !== 'image').map((element) => element.id),
  );
  return {
    elementIds,
    hasChanged: strokes.some((stroke) => strokeIds.has(stroke.id) && stroke.color !== color)
      || elements.some((element) => elementIds.has(element.id)
        && (element.color ?? themeWhiteboardTokens.whiteboardTextDefaultColor) !== color),
    strokeIds,
  };
}

function applySelectedContentColor(
  targets: SelectedContentColorTargets,
  color: string,
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>,
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>,
): void {
  if (targets.strokeIds.size > 0) {
    setStrokes((current) => current.map((stroke) => targets.strokeIds.has(stroke.id) ? { ...stroke, color } : stroke));
  }
  if (targets.elementIds.size > 0) {
    setElements((current) => current.map((element) => targets.elementIds.has(element.id) ? { ...element, color } : element));
  }
}
