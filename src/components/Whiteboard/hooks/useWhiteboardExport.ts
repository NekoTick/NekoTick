import { useCallback, type RefObject } from 'react';
import {
  copyWhiteboardImageToClipboard,
  exportWhiteboard,
  type WhiteboardExportFormat,
} from '@/components/Whiteboard/model/export/whiteboardExport';
import type { WhiteboardElement, WhiteboardPaperStyle, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';

interface WhiteboardExportOptions {
  elements: WhiteboardElement[];
  paper: WhiteboardPaperStyle;
  strokes: WhiteboardStroke[];
  viewportRef: RefObject<HTMLDivElement | null>;
}

export function useWhiteboardExport({
  elements,
  paper,
  strokes,
  viewportRef,
}: WhiteboardExportOptions) {
  const exportBoard = useCallback((format: WhiteboardExportFormat = 'png') => {
    void exportWhiteboard({
      elements,
      paper,
      root: viewportRef.current,
      strokes,
    }, format);
  }, [elements, paper, strokes, viewportRef]);

  const copyBoardToClipboard = useCallback(() => {
    void copyWhiteboardImageToClipboard({
      elements,
      paper,
      root: viewportRef.current,
      strokes,
    });
  }, [elements, paper, strokes, viewportRef]);

  return { copyBoardToClipboard, exportBoard };
}
