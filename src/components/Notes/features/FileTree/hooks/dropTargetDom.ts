import {
  isCurrentParentMoveTarget,
  isInvalidMoveTarget,
} from '@/stores/notes/utils/fs/moveValidation';

function resolveFolderDropTargetPathFromElements(elements: Element[]) {
  for (const element of elements) {
    const folderElement = element.closest<HTMLElement>('[data-file-tree-kind="folder"]');
    const targetPath = folderElement?.dataset.fileTreePath;
    if (targetPath) {
      return targetPath;
    }

    const treeItemElement = element.closest<HTMLElement>('[data-file-tree-path]');
    const parentFolderPath = treeItemElement?.dataset.fileTreeParentFolderPath;
    if (parentFolderPath !== undefined) {
      return parentFolderPath;
    }

    const rootDropTarget = element.closest<HTMLElement>('[data-file-tree-root-drop-target="true"]');
    if (rootDropTarget) {
      return '';
    }
  }

  return null;
}

export function resolveStarredDropTargetFromElements(elements: Element[]) {
  return elements.some((element) => (
    element.closest('[data-file-tree-starred-drop-target="true"]')
  ));
}

export function resolveExternalFolderDropTargetPath(clientX: number, clientY: number) {
  return resolveFolderDropTargetPathFromElements(document.elementsFromPoint(clientX, clientY));
}

export function resolveInternalMoveDropTargetPath(
  clientX: number,
  clientY: number,
  sourcePath: string,
) {
  return resolveInternalMoveDropTargetPathFromElements(
    document.elementsFromPoint(clientX, clientY),
    sourcePath,
  );
}

export function resolveInternalMoveDropTargetPathFromElements(
  elements: Element[],
  sourcePath: string,
) {
  const targetPath = resolveFolderDropTargetPathFromElements(elements);
  if (
    targetPath == null
    || (isInvalidMoveTarget(sourcePath, targetPath)
      && !isCurrentParentMoveTarget(sourcePath, targetPath))
  ) {
    return null;
  }
  return targetPath;
}
