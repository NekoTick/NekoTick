import { useSyncExternalStore } from 'react';
import type { FileTreePointerDragSnapshot } from './fileTreePointerDragTypes';

let snapshot: FileTreePointerDragSnapshot = {
  activeSourcePath: null,
  dropTargetPath: null,
  dropTargetKind: null,
};

const listeners = new Set<() => void>();

function emitSnapshot() {
  listeners.forEach((listener) => listener());
}

export function setFileTreePointerDragSnapshot(nextSnapshot: FileTreePointerDragSnapshot) {
  if (
    snapshot.activeSourcePath === nextSnapshot.activeSourcePath &&
    snapshot.dropTargetPath === nextSnapshot.dropTargetPath &&
    snapshot.dropTargetKind === nextSnapshot.dropTargetKind
  ) {
    return;
  }

  snapshot = nextSnapshot;
  emitSnapshot();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFileTreePointerDragSnapshot() {
  return snapshot;
}

export function isFileTreePointerDragActive() {
  return snapshot.activeSourcePath !== null;
}

export function useFileTreePointerDragState<T>(selector: (snapshot: FileTreePointerDragSnapshot) => T) {
  const currentSnapshot = useSyncExternalStore(
    subscribe,
    getFileTreePointerDragSnapshot,
    getFileTreePointerDragSnapshot,
  );
  return selector(currentSnapshot);
}

export function useIsFileTreePointerDragSource(path: string) {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.activeSourcePath === path,
    () => snapshot.activeSourcePath === path,
  );
}

export function useIsFileTreePointerDragActive() {
  return useSyncExternalStore(
    subscribe,
    isFileTreePointerDragActive,
    isFileTreePointerDragActive,
  );
}

export function useIsFileTreePointerFolderDropTarget(path: string, enabled = true) {
  return useSyncExternalStore(
    subscribe,
    () => enabled && snapshot.dropTargetKind === 'folder' && snapshot.dropTargetPath === path,
    () => enabled && snapshot.dropTargetKind === 'folder' && snapshot.dropTargetPath === path,
  );
}

export function useIsFileTreePointerStarredDropTarget() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.dropTargetKind === 'starred',
    () => snapshot.dropTargetKind === 'starred',
  );
}
