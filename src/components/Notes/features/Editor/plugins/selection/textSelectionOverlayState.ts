import { AllSelection, PluginKey, TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { DecorationSet } from '@milkdown/kit/prose/view';
import { hasSelectedBlocks } from '../cursor/blockSelectionPluginState';
import { DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT } from '../shared/boundedProseNodeScan';

export const TEXT_SELECTION_OVERLAY_CLASS = 'editor-text-selection-overlay';
export const TEXT_SELECTION_OVERLAY_ACTIVE_CLASS = 'editor-text-selection-overlay-active';
export const POINTER_NATIVE_SELECTION_CLASS = 'editor-pointer-native-selection';
export const LARGE_SELECTION_CLASS = 'editor-large-all-selection';
export const LARGE_SELECTION_HIGHLIGHT_NAME = 'editor-large-all-selection';
export const LARGE_SELECTION_VISIBLE_ELEMENT_CLASS = 'editor-large-selection-visible';
export const POINTER_SELECTION_ACTIVE_ATTRIBUTE = 'data-editor-pointer-selecting';
export const KEYBOARD_SELECTION_PENDING_CLASS = 'editor-keyboard-selection-pending';
export const KEY_EVENT_LISTENER_OPTIONS = { capture: true };
export const POINTER_NATIVE_SELECTION_META = 'editorTextSelectionPointerNative';
export const TEXT_SELECTION_INLINE_DECORATIONS_META = 'editorTextSelectionInlineDecorations';
export const TEXT_SELECTION_INLINE_PAINT_CLASS = 'editor-text-selection-inline-paint';
export const VISIBLE_TEXT_PATTERN = /\S/u;
export const MAX_TEXT_SELECTION_OVERLAY_DECORATIONS = 1000;
export const MAX_TEXT_SELECTION_OVERLAY_SCAN_NODES = DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT;
export const LARGE_SELECTION_MIN_RANGE_SIZE = 100_000;
export const LARGE_SELECTION_MIN_SELECTED_NODES = 500;

const STOP_LARGE_SELECTION_NODE_SCAN = Symbol('stopLargeSelectionNodeScan');
const largeSelectionNodeScanCache = new WeakMap<object, {
  from: number;
  isLarge: boolean;
  to: number;
}>();

export interface TextSelectionOverlayState {
  decorations: DecorationSet;
  decorationCount: number;
  renderInlineDecorations: boolean;
  usePointerNativeSelection: boolean;
}

export const textSelectionOverlayPluginKey = new PluginKey<TextSelectionOverlayState>('editorTextSelectionOverlay');

export const NAVIGATION_KEYS_THAT_CLEAR_NATIVE_SELECTION = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
]);

export function isModifiedNavigationKey(event: KeyboardEvent): boolean {
  return event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;
}

export function getNativeSelectionMetrics(view: EditorView) {
  const selection = view.dom.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();

  return {
    isCollapsed: selection.isCollapsed,
    rectCount: rects.length,
  };
}

export function clearNativeSelectionRange(view: EditorView): void {
  const domObserver = (view as unknown as {
    domObserver?: {
      setCurSelection: () => void;
      suppressSelectionUpdates: () => void;
    };
  }).domObserver;
  domObserver?.suppressSelectionUpdates();
  view.dom.ownerDocument.defaultView?.getSelection()?.removeAllRanges();
  domObserver?.setCurSelection();
}

export function isTextSelectionOverlayEligible(state: EditorState): boolean {
  const { selection } = state;
  if (selection.empty) return false;
  if (!(selection instanceof TextSelection) && !(selection instanceof AllSelection)) return false;
  if (hasSelectedBlocks(state)) return false;
  return true;
}

export function isStructurallyLargeEditorSelectionRange(
  doc: EditorState['doc'],
  selection: EditorState['selection'],
): boolean {
  if (selection.to - selection.from < LARGE_SELECTION_MIN_SELECTED_NODES) {
    return false;
  }

  const cached = largeSelectionNodeScanCache.get(doc);
  if (cached?.from === selection.from && cached.to === selection.to) {
    return cached.isLarge;
  }

  let selectedNodes = 0;
  let isLarge = false;
  try {
    doc.nodesBetween(selection.from, selection.to, () => {
      selectedNodes += 1;
      if (selectedNodes >= LARGE_SELECTION_MIN_SELECTED_NODES) {
        isLarge = true;
        throw STOP_LARGE_SELECTION_NODE_SCAN;
      }
    });
  } catch (error) {
    if (error !== STOP_LARGE_SELECTION_NODE_SCAN) throw error;
  }

  largeSelectionNodeScanCache.set(doc, {
    from: selection.from,
    isLarge,
    to: selection.to,
  });
  return isLarge;
}

export function isLargeEditorSelectionRange(
  doc: EditorState['doc'],
  selection: EditorState['selection'],
): boolean {
  return (
    selection.to - selection.from >= LARGE_SELECTION_MIN_RANGE_SIZE
    || isStructurallyLargeEditorSelectionRange(doc, selection)
  );
}

export function isLargeEditorAllSelection(state: EditorState): boolean {
  return (
    state.selection instanceof AllSelection
    && isLargeEditorSelectionRange(state.doc, state.selection)
  );
}

export function isLargeEditorTextSelection(state: EditorState): boolean {
  return (
    state.selection instanceof TextSelection
    && !state.selection.empty
    && isLargeEditorSelectionRange(state.doc, state.selection)
  );
}

export function isLargeEditorSelection(state: EditorState): boolean {
  return isLargeEditorAllSelection(state) || isLargeEditorTextSelection(state);
}

export function showTextSelectionOverlayForTransaction(tr: EditorState['tr']): EditorState['tr'] {
  return tr.setMeta(POINTER_NATIVE_SELECTION_META, false);
}

export function setTextSelectionInlineDecorationsForTransaction(
  tr: EditorState['tr'],
  enabled: boolean,
): EditorState['tr'] {
  return tr.setMeta(TEXT_SELECTION_INLINE_DECORATIONS_META, enabled);
}
