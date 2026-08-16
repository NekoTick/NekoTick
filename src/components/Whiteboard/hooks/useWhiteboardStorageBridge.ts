import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { WHITEBOARD_SYSTEM_STORAGE_SCOPE } from '@/lib/storage/whiteboardStoragePaths';
import { useImageCacheGeneration } from '@/hooks/useImageCacheGeneration';
import { getNextWhiteboardIdSequence } from '@/components/Whiteboard/model/core/whiteboardIds';
import { refreshWhiteboardAssetUrls } from '@/components/Whiteboard/model/persistence/whiteboardRepository';
import type {
  WhiteboardElement,
  WhiteboardPaperStyle,
  WhiteboardStroke,
  WhiteboardViewport,
} from '@/components/Whiteboard/model/core/whiteboardModel';
import { useWhiteboardStore } from '../stores/useWhiteboardStore';

interface WhiteboardStorageBridgeOptions {
  active: boolean;
  appliedBoardKeyRef: MutableRefObject<string | null>;
  elements: WhiteboardElement[];
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setPaper: Dispatch<SetStateAction<WhiteboardPaperStyle>>;
  setSelectedElementIds: Dispatch<SetStateAction<string[]>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setStrokes: Dispatch<SetStateAction<WhiteboardStroke[]>>;
  setViewport: Dispatch<SetStateAction<WhiteboardViewport>>;
  strokeIdRef: MutableRefObject<number>;
}

export function useWhiteboardStorageBridge({
  active,
  appliedBoardKeyRef,
  elements,
  setElements,
  setPaper,
  setSelectedElementIds,
  setSelectedStrokeIds,
  setStrokes,
  setViewport,
  strokeIdRef,
}: WhiteboardStorageBridgeOptions) {
  const notesRootPath = useNotesRootStore((state) => state.currentNotesRoot?.path ?? WHITEBOARD_SYSTEM_STORAGE_SCOPE);
  const activeBoardId = useWhiteboardStore((state) => state.activeBoardId);
  const activeSnapshot = useWhiteboardStore((state) => state.activeSnapshot);
  const loadedNotesRootPath = useWhiteboardStore((state) => state.loadedNotesRootPath);
  const loadWhiteboards = useWhiteboardStore((state) => state.loadForNotesRoot);
  const imageCacheGeneration = useImageCacheGeneration();
  const elementsRef = useRef(elements);
  const appliedImageCacheGenerationRef = useRef(imageCacheGeneration);
  elementsRef.current = elements;

  useEffect(() => {
    if (!active) return;
    void loadWhiteboards(notesRootPath).catch(() => undefined);
  }, [active, loadWhiteboards, notesRootPath]);

  useEffect(() => {
    const boardKey = activeBoardId && loadedNotesRootPath ? `${loadedNotesRootPath}\n${activeBoardId}` : null;
    if (loadedNotesRootPath !== notesRootPath || !activeSnapshot || !boardKey || appliedBoardKeyRef.current === boardKey) return;
    appliedBoardKeyRef.current = boardKey;
    setElements(activeSnapshot.elements);
    setPaper(activeSnapshot.paper ?? 'dots');
    setStrokes(activeSnapshot.strokes);
    setViewport(activeSnapshot.viewport);
    setSelectedElementIds([]);
    setSelectedStrokeIds([]);
    strokeIdRef.current = getNextWhiteboardIdSequence(
      [...activeSnapshot.strokes, ...activeSnapshot.elements],
      'wb-stroke-',
    );
  }, [
    activeBoardId, activeSnapshot, appliedBoardKeyRef, loadedNotesRootPath, notesRootPath,
    setElements, setPaper, setSelectedElementIds, setSelectedStrokeIds, setStrokes,
    setViewport, strokeIdRef,
  ]);

  useEffect(() => {
    if (!active || appliedImageCacheGenerationRef.current === imageCacheGeneration) return;
    appliedImageCacheGenerationRef.current = imageCacheGeneration;
    const refreshState = useWhiteboardStore.getState();
    const refreshBoardId = refreshState.activeBoardId;
    const board = refreshState.boards.find((item) => item.id === refreshBoardId);
    if (!board || refreshState.loadedNotesRootPath !== notesRootPath) return;
    let current = true;
    void refreshWhiteboardAssetUrls(notesRootPath, board, elementsRef.current).then((refreshed) => {
      const latestState = useWhiteboardStore.getState();
      if (
        !current ||
        latestState.activeBoardId !== refreshBoardId ||
        latestState.loadedNotesRootPath !== notesRootPath
      ) return;
      setElements((latest) => {
        const refreshedSrcById = new Map(refreshed.map((element) => [element.id, element.imageSrc]));
        return latest.map((element) => {
          const imageSrc = refreshedSrcById.get(element.id);
          return imageSrc && imageSrc !== element.imageSrc ? { ...element, imageSrc } : element;
        });
      });
    }).catch(() => undefined);
    return () => {
      current = false;
    };
  }, [active, imageCacheGeneration, notesRootPath, setElements]);
}
