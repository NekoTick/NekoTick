const pendingBlockSelectionRoots = new WeakSet<HTMLElement>();
const blockSelectionPointerDownEvents = new WeakSet<MouseEvent>();
const previewElementsByRoot = new WeakMap<HTMLElement, readonly HTMLElement[]>();

export const BLOCK_SELECTION_PREVIEW_CHANGE_EVENT = 'editor-block-selection-preview-change';
export const BLOCK_SELECTION_INTERACTION_CHANGE_EVENT = 'editor-block-selection-interaction-change';
export const BLOCK_SELECTION_PREVIEW_SURFACE_CLASS = 'editor-block-selection-preview-surface';

export function markBlockSelectionPointerDown(event: MouseEvent): void {
  blockSelectionPointerDownEvents.add(event);
}

export function didPointerDownStartWithBlockSelection(event: MouseEvent): boolean {
  return blockSelectionPointerDownEvents.has(event);
}

export function setBlockSelectionInteractionPending(root: HTMLElement, pending: boolean): void {
  if (pendingBlockSelectionRoots.has(root) === pending) return;
  if (pending) {
    pendingBlockSelectionRoots.add(root);
  } else {
    pendingBlockSelectionRoots.delete(root);
  }
  root.dispatchEvent(new Event(BLOCK_SELECTION_INTERACTION_CHANGE_EVENT));
}

export function isBlockSelectionInteractionPending(root: HTMLElement): boolean {
  return pendingBlockSelectionRoots.has(root);
}

export function getBlockSelectionPreviewElements(root: HTMLElement): readonly HTMLElement[] | null {
  return previewElementsByRoot.get(root) ?? null;
}

export function setBlockSelectionPreviewElements(
  root: HTMLElement,
  elements: readonly HTMLElement[] | null,
): void {
  const previous = previewElementsByRoot.get(root) ?? null;
  const unchanged = previous === elements || Boolean(
    previous
    && elements
    && previous.length === elements.length
    && previous.every((element, index) => element === elements[index])
  );
  if (unchanged) return;

  if (elements) {
    previewElementsByRoot.set(root, elements);
  } else {
    previewElementsByRoot.delete(root);
  }
  root.dispatchEvent(new Event(BLOCK_SELECTION_PREVIEW_CHANGE_EVENT));
}
