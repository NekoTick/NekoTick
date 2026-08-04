import {
  resolveInternalMoveDropTargetPathFromElements,
  resolveStarredDropTargetFromElements,
} from './dropTargetDom';
import { isSupportedMarkdownPath } from '@/lib/notes/markdownFile';
import type { FileTreePointerDragSession, FileTreePointerDropTargetKind } from './fileTreePointerDragTypes';

interface FileTreePointerDragDropTargetResult {
  dropTargetPath: string | null;
  dropTargetKind: FileTreePointerDropTargetKind;
  pendingStarredDrop: boolean;
}

export function resolveFileTreePointerDragDropTarget(
  session: FileTreePointerDragSession,
): FileTreePointerDragDropTargetResult {
  const elements = document.elementsFromPoint(session.lastClientX, session.lastClientY);
  const canStarSource = session.sourceKind === 'folder' || isSupportedMarkdownPath(session.sourcePath);
  const isStarredDropTarget = canStarSource && resolveStarredDropTargetFromElements(elements);

  if (isStarredDropTarget) {
    return {
      dropTargetPath: null,
      dropTargetKind: 'starred',
      pendingStarredDrop: true,
    };
  }

  const folderDropTargetPath = resolveInternalMoveDropTargetPathFromElements(
    elements,
    session.sourcePath,
  );
  return {
    dropTargetPath: folderDropTargetPath,
    dropTargetKind: folderDropTargetPath == null ? null : 'folder',
    pendingStarredDrop: false,
  };
}
