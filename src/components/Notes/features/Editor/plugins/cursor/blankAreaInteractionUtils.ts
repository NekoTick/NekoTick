import type { EditorView } from '@milkdown/kit/prose/view';

export const DRAG_THRESHOLD = 4;
export const DRAG_BOX_COLOR = 'var(--vlaina-color-editor-block-selection-drag-box)';
export const BLOCK_SELECTION_PREVIEW_COLOR = 'var(--vlaina-block-selection-color-default)';
export const DRAG_SESSION_CURSOR = 'crosshair';
export const SCROLL_ROOT_SELECTOR = '[data-note-scroll-root="true"]';

export function resolvePosAtCoordsForBlankClick(view: EditorView, event: MouseEvent) {
  try {
    return view.posAtCoords({ left: event.clientX, top: event.clientY });
  } catch {
    return null;
  }
}

export function isSameEditorScrollRoot(view: EditorView, target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  if (view.dom.contains(target)) return true;
  const targetElement = target instanceof Element ? target : target.parentElement;
  if (!targetElement) return false;
  const editorScrollRoot = view.dom.closest(SCROLL_ROOT_SELECTOR);
  return !!editorScrollRoot && targetElement.closest(SCROLL_ROOT_SELECTOR) === editorScrollRoot;
}
