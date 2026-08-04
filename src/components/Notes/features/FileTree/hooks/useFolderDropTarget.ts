import { useIsFileTreePointerFolderDropTarget } from './fileTreePointerDragState';
import { useExternalFileTreeDropState } from './externalFileTreeDropState';

export function useFolderDropTarget(path: string, enabled = true) {
  const isInternalDragOver = useIsFileTreePointerFolderDropTarget(path, enabled);
  const isExternalDragOver = useExternalFileTreeDropState(
    (state) => enabled && state.dropTargetPath === path,
  );

  return {
    isInternalDragOver,
    isExternalDragOver,
    isDragOver: isInternalDragOver || isExternalDragOver,
  };
}
