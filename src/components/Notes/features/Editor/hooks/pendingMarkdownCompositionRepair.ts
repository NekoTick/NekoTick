import { type Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

import {
  MAX_COMPOSITION_REPAIR_LOOKBACK_CHARS,
  MAX_COMPOSITION_REPAIR_TEXT_LENGTH,
  hasNonAsciiText,
  isCompositionResidueText,
} from './pendingMarkdownAutosaveEvents';

function getCompositionResidueRepairRange(
  text: string,
  committedText: string,
  staleText: string,
): { fromOffset: number; toOffset: number } | null {
  let bestRange: { fromOffset: number; toOffset: number; residueLength: number } | null = null;
  let committedIndex = text.indexOf(committedText);

  while (committedIndex >= 0) {
    const committedEnd = committedIndex + committedText.length;
    let leftStart = committedIndex;
    while (
      leftStart > 0 &&
      committedIndex - leftStart < staleText.length &&
      isCompositionResidueText(text[leftStart - 1] ?? '')
    ) {
      leftStart -= 1;
    }

    let rightEnd = committedEnd;
    while (
      rightEnd < text.length &&
      rightEnd - committedEnd < staleText.length &&
      isCompositionResidueText(text[rightEnd] ?? '')
    ) {
      rightEnd += 1;
    }

    for (let fromOffset = leftStart; fromOffset <= committedIndex; fromOffset += 1) {
      for (let toOffset = committedEnd; toOffset <= rightEnd; toOffset += 1) {
        if (fromOffset === committedIndex && toOffset === committedEnd) {
          continue;
        }

        const residue = text.slice(fromOffset, committedIndex) + text.slice(committedEnd, toOffset);
        if (
          residue.length > staleText.length ||
          !isCompositionResidueText(residue) ||
          (!staleText.includes(residue) && !staleText.startsWith(residue))
        ) {
          continue;
        }

        if (!bestRange || residue.length > bestRange.residueLength) {
          bestRange = { fromOffset, toOffset, residueLength: residue.length };
        }
      }
    }

    committedIndex = text.indexOf(committedText, committedEnd);
  }

  if (!bestRange) {
    return null;
  }

  return {
    fromOffset: bestRange.fromOffset,
    toOffset: bestRange.toOffset,
  };
}

export function syncDomSelectionAtPosition(view: EditorView, pos: number): void {
  try {
    const ownerDocument = view.dom.ownerDocument;
    const selection = ownerDocument.getSelection();
    if (!selection) {
      return;
    }

    const { node, offset } = view.domAtPos(pos);
    const range = ownerDocument.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Native selection sync is best-effort; ProseMirror state remains authoritative.
  }
}

export function collapseSelectionAtPosition(view: EditorView, pos: number): boolean {
  try {
    const selectionPos = Math.max(0, Math.min(view.state.doc.content.size, pos));
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, selectionPos)),
    );
    syncDomSelectionAtPosition(view, selectionPos);
    return true;
  } catch {
    return false;
  }
}

export function replaceRecentCompositionText(
  view: EditorView,
  staleText: string | null,
  committedText: string,
): boolean {
  if (
    !staleText ||
    !committedText ||
    staleText === committedText ||
    staleText.length > MAX_COMPOSITION_REPAIR_TEXT_LENGTH ||
    committedText.length > MAX_COMPOSITION_REPAIR_TEXT_LENGTH
  ) {
    return false;
  }

  try {
    const { state } = view;
    const anchor = state.selection.from;
    const searchFrom = Math.max(0, anchor - staleText.length - MAX_COMPOSITION_REPAIR_LOOKBACK_CHARS);
    const searchTo = Math.min(
      state.doc.content.size,
      anchor + staleText.length + MAX_COMPOSITION_REPAIR_LOOKBACK_CHARS,
    );
    const match: { current: { from: number; to: number; distance: number } | null } = { current: null };
    const mixedResidueMatch: { current: { from: number; to: number; distance: number } | null } = { current: null };

    state.doc.nodesBetween(searchFrom, searchTo, (node, pos) => {
      if (!node.isText) return;
      const text = node.text ?? '';
      const fromOffset = Math.max(0, searchFrom - pos);
      const toOffset = Math.min(text.length, searchTo - pos);
      if (fromOffset >= toOffset) return;

      const searchedText = text.slice(fromOffset, toOffset);
      let index = searchedText.indexOf(staleText);
      while (index >= 0) {
        const committedStart = searchedText.lastIndexOf(committedText, index);
        const alreadyCommitted = committedStart >= 0 &&
          committedStart + committedText.length >= index + staleText.length;
        if (alreadyCommitted) {
          index = searchedText.indexOf(staleText, index + 1);
          continue;
        }

        const from = pos + fromOffset + index;
        const to = from + staleText.length;
        const distance = Math.min(Math.abs(anchor - from), Math.abs(anchor - to));
        if (!match.current || distance < match.current.distance) {
          match.current = { from, to, distance };
        }
        index = searchedText.indexOf(staleText, index + 1);
      }

      if (hasNonAsciiText(committedText) && isCompositionResidueText(staleText)) {
        const residueRange = getCompositionResidueRepairRange(searchedText, committedText, staleText);
        if (residueRange) {
          const from = pos + fromOffset + residueRange.fromOffset;
          const to = pos + fromOffset + residueRange.toOffset;
          const distance = Math.min(Math.abs(anchor - from), Math.abs(anchor - to));
          if (!mixedResidueMatch.current || distance < mixedResidueMatch.current.distance) {
            mixedResidueMatch.current = {
              from,
              to,
              distance,
            };
          }
        }
      }
    });

    const matchRange = !match.current
      ? mixedResidueMatch.current
      : !mixedResidueMatch.current || match.current.distance <= mixedResidueMatch.current.distance
        ? match.current
        : mixedResidueMatch.current;
    if (!matchRange) return false;
    view.dispatch(view.state.tr.insertText(committedText, matchRange.from, matchRange.to));
    return true;
  } catch {
    return false;
  }
}

export function collapseCommittedCompositionSelection(
  view: EditorView,
  committedText: string,
  collapseTo?: number,
): boolean {
  if (!committedText || committedText.length > MAX_COMPOSITION_REPAIR_TEXT_LENGTH) {
    return false;
  }

  try {
    const { state } = view;
    const { selection } = state;
    if (selection.empty) return false;
    if (selection.to - selection.from > MAX_COMPOSITION_REPAIR_TEXT_LENGTH) return false;

    const selectedText = state.doc.textBetween(selection.from, selection.to, '\n');
    if (selectedText !== committedText) return false;
    const selectionPos = resolveCompositionSelectionEnd(selection, collapseTo);

    view.dispatch(
      state.tr.setSelection(TextSelection.create(state.doc, selectionPos)),
    );
    syncDomSelectionAtPosition(view, selectionPos);
    return true;
  } catch {
    return false;
  }
}

export function resolveCompositionSelectionEnd(
  selection: Selection,
  collapseTo?: number,
): number {
  const selectionEnd = selection.to;
  if (typeof collapseTo !== 'number') return selectionEnd;

  const doc = selection.$to.doc;
  const candidate = Math.max(0, Math.min(doc.content.size, collapseTo));
  try {
    const candidatePosition = doc.resolve(candidate);
    if (
      candidate >= selectionEnd &&
      candidatePosition.parent === selection.$to.parent &&
      candidate <= selection.$to.end()
    ) {
      return candidate;
    }
  } catch {
    return selectionEnd;
  }
  return selectionEnd;
}

export function replaceSelectedTextWithCommittedComposition(
  view: EditorView,
  committedText: string,
): boolean {
  if (!committedText || committedText.length > MAX_COMPOSITION_REPAIR_TEXT_LENGTH) {
    return false;
  }

  try {
    const { state } = view;
    const { selection } = state;
    if (selection.empty) return false;
    if (selection.to - selection.from > MAX_COMPOSITION_REPAIR_TEXT_LENGTH) return false;

    const selectedText = state.doc.textBetween(selection.from, selection.to, '\n');
    if (
      !selectedText ||
      selectedText === committedText ||
      selectedText.includes('\n') ||
      selectedText.length > MAX_COMPOSITION_REPAIR_TEXT_LENGTH
    ) {
      return false;
    }

    const tr = state.tr.insertText(committedText, selection.from, selection.to);
    const selectionPos = Math.min(tr.doc.content.size, selection.from + committedText.length);
    view.dispatch(
      tr.setSelection(TextSelection.create(tr.doc, selectionPos)),
    );
    syncDomSelectionAtPosition(view, selectionPos);
    return true;
  } catch {
    return false;
  }
}
