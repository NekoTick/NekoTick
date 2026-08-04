import { useSyncExternalStore } from 'react';
import { isFileTreePointerDragActive } from './hooks/fileTreePointerDragStore';

export interface ImageFileHoverPreviewTarget {
  imagePath: string;
  notesPath: string;
}

let target: ImageFileHoverPreviewTarget | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function showImageFileHoverPreview(nextTarget: ImageFileHoverPreviewTarget) {
  if (isFileTreePointerDragActive()) {
    return;
  }
  target = nextTarget;
  emitChange();
}

export function hideImageFileHoverPreview(imagePath: string) {
  if (target?.imagePath !== imagePath) {
    return;
  }
  target = null;
  emitChange();
}

export function useImageFileHoverPreviewTarget() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => target,
    () => null,
  );
}
