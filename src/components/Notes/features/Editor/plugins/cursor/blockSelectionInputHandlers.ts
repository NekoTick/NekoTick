import type { EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { tryWriteTextToClipboardSynchronously } from '@/lib/clipboard';
import {
  writeTextToClipboard,
} from './blockSelectionCommands';
import { clearBlockSelection, getBlockSelectionPluginState } from './blockSelectionPluginState';
import type { BlockRange } from './blockSelectionUtils';

type SerializeSelectedBlocks = (
  state: EditorState,
  selectedBlocks: readonly BlockRange[]
) => string;

type DeleteSelectedBlocks = (
  view: EditorView,
  selectedBlocks: readonly BlockRange[]
) => boolean;

interface BlockSelectionInputHandlerOptions {
  view: EditorView;
  selectedBlocks: readonly BlockRange[];
  serializeSelectedBlocks: SerializeSelectedBlocks;
  deleteSelectedBlocks: DeleteSelectedBlocks;
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function areSameBlockRanges(a: readonly BlockRange[], b: readonly BlockRange[]): boolean {
  return a.length === b.length && a.every((range, index) => (
    range.from === b[index]?.from && range.to === b[index]?.to
  ));
}

function clearCapturedBlockSelection(view: EditorView, selectedBlocks: readonly BlockRange[], doc: EditorState['doc']): void {
  if (!view.state.doc.eq(doc)) return;
  if (!areSameBlockRanges(getBlockSelectionPluginState(view.state).selectedBlocks, selectedBlocks)) return;
  clearBlockSelection(view);
}

function isLegacyClipboardCopyShortcut(event: KeyboardEvent): boolean {
  if (event.isComposing) return false;
  if (event.altKey) return false;

  const key = event.key.toLowerCase();
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    key === 'insert'
  );
}

function isLegacyClipboardCutShortcut(event: KeyboardEvent): boolean {
  if (event.isComposing) return false;
  if (event.altKey) return false;

  const key = event.key.toLowerCase();
  return (
    (!(event.metaKey || event.ctrlKey) && event.shiftKey && key === 'delete')
  );
}

function isStandardClipboardShortcut(event: KeyboardEvent, key: 'c' | 'x'): boolean {
  return (
    !event.isComposing &&
    !event.altKey &&
    !event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === key
  );
}

function isBlockSelectionDeleteKey(event: KeyboardEvent): boolean {
  return (
    event.key === 'Delete' ||
    event.key === 'Backspace' ||
    event.code === 'Delete' ||
    event.code === 'Backspace'
  );
}

export function isTextEditingElement(element: HTMLElement, editorDom: HTMLElement): boolean {
  if (element === editorDom) return false;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return true;
  }

  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(element.type.toLowerCase());
  }

  return element.isContentEditable;
}

function isTextEditingEventTarget(event: Event, editorDom: HTMLElement): boolean {
  const target = event.target;
  return target instanceof HTMLElement && isTextEditingElement(target, editorDom);
}

export function isClipboardEvent(event: Event): event is ClipboardEvent {
  return 'clipboardData' in event;
}

export function handleBlockSelectionKeyDown(
  event: KeyboardEvent,
  {
    view,
    selectedBlocks,
    serializeSelectedBlocks,
    deleteSelectedBlocks,
  }: BlockSelectionInputHandlerOptions,
): boolean {
  if (selectedBlocks.length === 0) return false;
  if (event.isComposing) return false;
  if (isTextEditingEventTarget(event, view.dom)) return false;

  const isStandardCopy = isStandardClipboardShortcut(event, 'c');
  const isStandardCut = isStandardClipboardShortcut(event, 'x');
  if (isStandardCopy || isStandardCut) {
    const text = serializeSelectedBlocks(view.state, selectedBlocks);
    if (text.length === 0 || !tryWriteTextToClipboardSynchronously(text)) {
      return false;
    }

    event.preventDefault();
    if (isStandardCut) {
      deleteSelectedBlocks(view, selectedBlocks);
    } else {
      clearBlockSelection(view);
    }
    return true;
  }

  if (isLegacyClipboardCopyShortcut(event)) {
    const text = serializeSelectedBlocks(view.state, selectedBlocks);
    if (text.length === 0) return false;
    if (tryWriteTextToClipboardSynchronously(text)) {
      event.preventDefault();
      clearBlockSelection(view);
      return true;
    }

    const doc = view.state.doc;
    event.preventDefault();
    void writeTextToClipboard(text).then((didCopy) => {
      if (didCopy) {
        clearCapturedBlockSelection(view, selectedBlocks, doc);
      }
    }).catch(() => undefined);
    return true;
  }

  if (isLegacyClipboardCutShortcut(event)) {
    const text = serializeSelectedBlocks(view.state, selectedBlocks);
    if (text.length === 0) return false;
    if (tryWriteTextToClipboardSynchronously(text)) {
      event.preventDefault();
      deleteSelectedBlocks(view, selectedBlocks);
      return true;
    }

    const doc = view.state.doc;
    event.preventDefault();
    void writeTextToClipboard(text).then((didCopy) => {
      if (didCopy && view.state.doc.eq(doc)) {
        deleteSelectedBlocks(view, selectedBlocks);
      }
    }).catch(() => undefined);
    return true;
  }

  if (isBlockSelectionDeleteKey(event)) {
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    event.preventDefault();
    return deleteSelectedBlocks(view, selectedBlocks);
  }

  return false;
}

export function handleBlockSelectionCopy(
  event: ClipboardEvent,
  {
    view,
    selectedBlocks,
    serializeSelectedBlocks,
  }: Omit<BlockSelectionInputHandlerOptions, 'deleteSelectedBlocks'>,
): boolean {
  if (selectedBlocks.length === 0) return false;
  if (isTextEditingEventTarget(event, view.dom)) return false;

  const text = serializeSelectedBlocks(view.state, selectedBlocks);
  const doc = view.state.doc;
  event.preventDefault();
  if (event.clipboardData) {
    event.clipboardData.setData('text/plain', text);
    clearBlockSelection(view);
    return true;
  }

  void writeTextToClipboard(text).then((didCopy) => {
    if (didCopy) {
      clearCapturedBlockSelection(view, selectedBlocks, doc);
    }
  }).catch(() => undefined);
  return true;
}

export function handleBlockSelectionCut(
  event: ClipboardEvent,
  {
    view,
    selectedBlocks,
    serializeSelectedBlocks,
    deleteSelectedBlocks,
  }: BlockSelectionInputHandlerOptions,
): boolean {
  if (selectedBlocks.length === 0) return false;
  if (isTextEditingEventTarget(event, view.dom)) return false;

  const text = serializeSelectedBlocks(view.state, selectedBlocks);
  const doc = view.state.doc;
  event.preventDefault();
  if (event.clipboardData) {
    event.clipboardData.setData('text/plain', text);
    return deleteSelectedBlocks(view, selectedBlocks);
  }

  void writeTextToClipboard(text).then((didCopy) => {
    if (didCopy && view.state.doc.eq(doc)) {
      deleteSelectedBlocks(view, selectedBlocks);
    }
  }).catch(() => undefined);
  return true;
}
