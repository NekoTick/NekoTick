import type { EditorView } from '@milkdown/kit/prose/view';
import {
  resolveSelectableBlockElement,
  type SelectableBlockTarget,
} from '../plugins/cursor/blockUnitResolver';
import { MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS } from './editorBlockPositionConstants';
import { createCurrentEditorBlockPositionControllerWithState } from './editorBlockPositionController';
import { createSnapshot } from './editorBlockPositionSnapshotFactory';
import {
  getCachedEditorBlockTargetByPosFromSnapshot,
  getCachedEditorBlockTargetNearYFromSnapshot,
  getCachedEditorBlockTargetsFromSnapshot,
  getCachedEditorBlockTargetsNearYFromSnapshot,
  getFreshCachedEditorBlockTargetsFromSnapshot,
} from './editorBlockPositionTargets';
import type {
  EditorBlockPositionController,
  EditorBlockPositionEntry,
  EditorBlockPositionSnapshot,
} from './editorBlockPositionTypes';

export {
  isEditorHiddenByToolbarPreview,
  isTooLargeForBlockPositionSnapshot,
  resolveToolbarPreviewRoot,
} from './editorBlockPositionSnapshotFactory';
export { MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS };
export type {
  EditorBlockPositionController,
  EditorBlockPositionEntry,
  EditorBlockPositionSnapshot,
  EditorHeadingPositionEntry,
} from './editorBlockPositionTypes';

let currentSnapshot: EditorBlockPositionSnapshot | null = null;
let currentVersion = 0;
const listeners = new Set<(snapshot: EditorBlockPositionSnapshot | null) => void>();

function nextSnapshotVersion(): number {
  currentVersion += 1;
  return currentVersion;
}

function publishSnapshot(snapshot: EditorBlockPositionSnapshot | null): void {
  currentSnapshot = snapshot;
  listeners.forEach((listener) => {
    listener(snapshot);
  });
}

export function setCurrentEditorBlockPositionSnapshot(
  snapshot: EditorBlockPositionSnapshot | null,
): void {
  publishSnapshot(snapshot);
}

export function clearCurrentEditorBlockPositionSnapshot(): void {
  publishSnapshot(null);
}

export function getCurrentEditorBlockPositionSnapshot(): EditorBlockPositionSnapshot | null {
  return currentSnapshot;
}

export function refreshCurrentEditorBlockPositionSnapshot(
  view: EditorView,
): EditorBlockPositionSnapshot | null {
  let snapshot: EditorBlockPositionSnapshot | null = null;
  try {
    snapshot = createSnapshot(view, nextSnapshotVersion);
  } catch {
    snapshot = null;
  }
  publishSnapshot(snapshot);
  return snapshot;
}

export function subscribeCurrentEditorBlockPositionSnapshot(
  listener: (snapshot: EditorBlockPositionSnapshot | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCachedEditorBlockTargets(
  view: EditorView,
  ranges?: readonly { from: number; to: number }[],
): SelectableBlockTarget[] | null {
  return getCachedEditorBlockTargetsFromSnapshot(currentSnapshot, view, ranges);
}

function resolveInteractionTargetElements(
  view: EditorView,
  targets: readonly SelectableBlockTarget[],
  forceCurrentElements = false,
): SelectableBlockTarget[] {
  return targets.map((target) => {
    if (!forceCurrentElements && view.dom.contains(target.element)) return target;
    const element = resolveSelectableBlockElement(view, target.range);
    return element ? { ...target, element } : target;
  });
}

export function getInteractionCachedEditorBlockTargets(
  view: EditorView,
  ranges?: readonly { from: number; to: number }[],
  options?: { resolveCurrentElements?: boolean },
): SelectableBlockTarget[] | null {
  const targets = getCachedEditorBlockTargetsFromSnapshot(currentSnapshot, view, ranges, false);
  if (!targets) return null;
  return resolveInteractionTargetElements(
    view,
    targets,
    options?.resolveCurrentElements ?? ranges !== undefined,
  );
}

export function getFreshCachedEditorBlockTargets(
  view: EditorView,
  scrollRoot: HTMLElement | null,
): SelectableBlockTarget[] | null {
  return getFreshCachedEditorBlockTargetsFromSnapshot(currentSnapshot, view, scrollRoot);
}

export function getCachedEditorBlockTargetByPos(
  view: EditorView,
  blockPos: number,
): SelectableBlockTarget | null {
  return getCachedEditorBlockTargetByPosFromSnapshot(currentSnapshot, view, blockPos);
}

export function getCachedEditorBlockTargetNearY(
  view: EditorView,
  clientY: number,
  predicate?: (block: EditorBlockPositionEntry) => boolean,
): SelectableBlockTarget | null {
  return getCachedEditorBlockTargetNearYFromSnapshot(currentSnapshot, view, clientY, predicate);
}

export function getInteractionCachedEditorBlockTargetNearY(
  view: EditorView,
  clientY: number,
  predicate?: (block: EditorBlockPositionEntry) => boolean,
): SelectableBlockTarget | null {
  const target = getCachedEditorBlockTargetNearYFromSnapshot(
    currentSnapshot,
    view,
    clientY,
    predicate,
    false,
  );
  return target ? resolveInteractionTargetElements(view, [target])[0] ?? null : null;
}

export function getCachedEditorBlockTargetsNearY(
  view: EditorView,
  clientY: number,
  isNearRect: (rect: Pick<DOMRect, 'top' | 'bottom' | 'height'>, clientY: number) => boolean,
  predicate?: (block: EditorBlockPositionEntry) => boolean,
): SelectableBlockTarget[] | null {
  return getCachedEditorBlockTargetsNearYFromSnapshot(
    currentSnapshot,
    view,
    clientY,
    isNearRect,
    predicate,
  );
}

export function getInteractionCachedEditorBlockTargetsNearY(
  view: EditorView,
  clientY: number,
  isNearRect: (rect: Pick<DOMRect, 'top' | 'bottom' | 'height'>, clientY: number) => boolean,
  predicate?: (block: EditorBlockPositionEntry) => boolean,
): SelectableBlockTarget[] | null {
  const targets = getCachedEditorBlockTargetsNearYFromSnapshot(
    currentSnapshot,
    view,
    clientY,
    isNearRect,
    predicate,
    false,
  );
  return targets ? resolveInteractionTargetElements(view, targets) : null;
}

export function getInteractionCachedEditorGeometry(
  view: EditorView,
): Pick<EditorBlockPositionSnapshot, 'editorRect' | 'scrollRootRect'> | null {
  const snapshot = currentSnapshot;
  if (
    !snapshot
    || snapshot.view !== view
    || snapshot.doc !== view.state.doc
    || snapshot.editorRoot !== view.dom
    || snapshot.scrollRoot !== view.dom.closest('[data-note-scroll-root="true"]')
    || !snapshot.editorRoot.isConnected
  ) {
    return null;
  }
  return {
    editorRect: snapshot.editorRect,
    scrollRootRect: snapshot.scrollRootRect,
  };
}

export function createCurrentEditorBlockPositionController(
  view: EditorView,
): EditorBlockPositionController {
  return createCurrentEditorBlockPositionControllerWithState({
    view,
    getCurrentSnapshot: () => currentSnapshot,
    publishSnapshot,
    nextVersion: nextSnapshotVersion,
  });
}
