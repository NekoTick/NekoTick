import { AllSelection, PluginKey, TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { DecorationSet } from '@milkdown/kit/prose/view';
import { hasSelectedBlocks } from '../cursor/blockSelectionPluginState';
import { DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT } from '../shared/boundedProseNodeScan';

export const TEXT_SELECTION_OVERLAY_CLASS = 'editor-text-selection-overlay';
export const TEXT_SELECTION_OVERLAY_ACTIVE_CLASS = 'editor-text-selection-overlay-active';
export const POINTER_NATIVE_SELECTION_CLASS = 'editor-pointer-native-selection';
export const POINTER_SELECTION_ACTIVE_ATTRIBUTE = 'data-editor-pointer-selecting';
export const KEYBOARD_SELECTION_PENDING_CLASS = 'editor-keyboard-selection-pending';
export const KEY_EVENT_LISTENER_OPTIONS = { capture: true };
export const POINTER_NATIVE_SELECTION_META = 'editorTextSelectionPointerNative';
export const EDITOR_ONLY_TEXT_SELECTION_PLACEHOLDERS = new Set(['\u200B', '\u200C', '\u2800']);
export const VISIBLE_TEXT_PATTERN = /\S/u;
export const LINE_BREAK_PATTERN = /[\n\r\u2028\u2029]/u;
export const MAX_TEXT_SELECTION_OVERLAY_DECORATIONS = 1000;
export const MAX_TEXT_SELECTION_OVERLAY_SCAN_NODES = DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT;

export interface TextSelectionOverlayState {
  decorations: DecorationSet;
  decorationCount: number;
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

export function getNativeSelectionMetrics() {
  if (typeof window === 'undefined') {
    return null;
  }

  const selection = window.getSelection();
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

export function showTextSelectionOverlayForTransaction(tr: EditorState['tr']): EditorState['tr'] {
  return tr.setMeta(POINTER_NATIVE_SELECTION_META, false);
}
