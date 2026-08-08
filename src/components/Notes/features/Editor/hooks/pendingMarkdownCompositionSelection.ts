import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

import {
  MAX_COMPOSITION_REPAIR_TEXT_LENGTH,
  getEventData,
  isInputEvent,
} from './pendingMarkdownAutosaveEvents';
import type { CompositionStartSelection } from './pendingMarkdownAutosaveTypes';
import {
  collapseSelectionAtPosition,
  resolveCompositionSelectionEnd,
  syncDomSelectionAtPosition,
} from './pendingMarkdownCompositionRepair';

export function captureCompositionStartSelection(view: EditorView): CompositionStartSelection | null {
  try {
    const { selection } = view.state;
    if (
      selection.empty ||
      selection.to - selection.from > MAX_COMPOSITION_REPAIR_TEXT_LENGTH
    ) return null;

    const selectedText = view.state.doc.textBetween(selection.from, selection.to, '\n');
    if (
      !selectedText ||
      selectedText.includes('\n') ||
      selectedText.length > MAX_COMPOSITION_REPAIR_TEXT_LENGTH
    ) {
      return null;
    }

    return {
      from: selection.from,
      to: selection.to,
      text: selectedText,
    };
  } catch {
    return null;
  }
}

export function replaceCompositionStartSelectionWithCommittedText(
  view: EditorView,
  startSelection: CompositionStartSelection | null,
  committedText: string,
): boolean {
  if (
    !startSelection ||
    !committedText ||
    committedText.length > MAX_COMPOSITION_REPAIR_TEXT_LENGTH
  ) {
    return false;
  }

  try {
    const { state } = view;
    const from = Math.max(0, Math.min(state.doc.content.size, startSelection.from));
    const to = Math.max(from, Math.min(state.doc.content.size, startSelection.to));
    if (from === to) return false;

    const selectedText = state.doc.textBetween(from, to, '\n');
    if (selectedText !== startSelection.text || selectedText === committedText) {
      return false;
    }

    const tr = state.tr.insertText(committedText, from, to);
    const selectionPos = Math.min(tr.doc.content.size, from + committedText.length);
    view.dispatch(
      tr.setSelection(TextSelection.create(tr.doc, selectionPos)),
    );
    syncDomSelectionAtPosition(view, selectionPos);
    return true;
  } catch {
    return false;
  }
}

export function getSelectedCompositionText(view: EditorView): string | null {
  try {
    const { state } = view;
    const { selection } = state;
    if (
      selection.empty ||
      selection.to - selection.from > MAX_COMPOSITION_REPAIR_TEXT_LENGTH
    ) return null;

    const selectedText = state.doc.textBetween(selection.from, selection.to, '\n');
    return selectedText.length > 0 ? selectedText : null;
  } catch {
    return null;
  }
}

export function getCompositionSelectionAppend(
  view: EditorView,
  event: Event,
  compositionEnded: boolean,
  committedText: string | null,
  appendPos: number | null,
): { pos: number; text: string } | null {
  if (
    !compositionEnded ||
    !isInputEvent(event) ||
    event.isComposing ||
    event.inputType !== 'insertText' ||
    !event.cancelable
  ) {
    return null;
  }

  const text = getEventData(event);
  if (!text) {
    return null;
  }

  if (appendPos !== null) {
    const { selection } = view.state;
    if (selection.empty) {
      return selection.from === appendPos ? { pos: appendPos, text } : null;
    }

    const selectedText = getSelectedCompositionText(view);
    if (
      selectedText &&
      !selectedText.includes('\n') &&
      selectedText.length <= MAX_COMPOSITION_REPAIR_TEXT_LENGTH &&
      (committedText === null || selectedText === committedText)
    ) {
      return { pos: appendPos, text };
    }

    return null;
  }

  const { selection } = view.state;
  if (selection.empty) {
    return null;
  }

  const selectedText = getSelectedCompositionText(view);
  if (
    !selectedText ||
    selectedText.includes('\n') ||
    selectedText.length > MAX_COMPOSITION_REPAIR_TEXT_LENGTH ||
    (committedText !== null && selectedText !== committedText)
  ) {
    return null;
  }

  return { pos: selection.to, text };
}

export function insertCompositionAppendText(
  view: EditorView,
  append: { pos: number; text: string },
): number | null {
  try {
    const { pos, text } = append;
    const tr = view.state.tr.insertText(text, pos, pos);
    const selectionPos = Math.min(tr.doc.content.size, pos + text.length);
    view.dispatch(
      tr.setSelection(TextSelection.create(tr.doc, selectionPos)),
    );
    syncDomSelectionAtPosition(view, selectionPos);
    return selectionPos;
  } catch {
    return null;
  }
}

export function splitBlockAfterCommittedCompositionSelection(
  view: EditorView,
  event: Event,
  committedText: string | null,
  collapseTo?: number,
): number | null {
  if (
    !(event instanceof KeyboardEvent) ||
    event.key !== 'Enter' ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  ) {
    return null;
  }

  const { selection } = view.state;
  if (selection.empty) {
    return null;
  }

  const selectedText = getSelectedCompositionText(view);
  if (
    !selectedText ||
    selectedText.includes('\n') ||
    selectedText.length > MAX_COMPOSITION_REPAIR_TEXT_LENGTH ||
    (committedText !== null && selectedText !== committedText)
  ) {
    return null;
  }

  const stateBeforeSplit = view.state;
  const selectionPos = resolveCompositionSelectionEnd(selection, collapseTo);
  if (event.cancelable) {
    event.preventDefault();
  }
  event.stopImmediatePropagation();

  try {
    let tr = stateBeforeSplit.tr.setSelection(TextSelection.create(stateBeforeSplit.doc, selectionPos));
    tr = tr.split(selectionPos);
    const mappedSelectionPos = tr.mapping.map(selectionPos, 1);
    tr = tr
      .setSelection(TextSelection.create(tr.doc, mappedSelectionPos))
      .scrollIntoView();
    view.dispatch(tr);
    view.focus();
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, mappedSelectionPos)),
    );
    syncDomSelectionAtPosition(view, mappedSelectionPos);
    return mappedSelectionPos;
  } catch {
    if (collapseSelectionAtPosition(view, selectionPos)) {
      return selectionPos;
    }
  }
  return selectionPos;
}
