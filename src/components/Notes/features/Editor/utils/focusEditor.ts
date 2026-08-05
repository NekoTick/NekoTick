import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  clearCurrentEditorBlockSelection,
  getCurrentEditorView,
} from './editorViewRegistry';
import {
  createDocumentFirstLineEndTextSelection,
  createDocumentStartTextSelection,
} from './editorSelection';

const FIRST_VISUAL_LINE_TOLERANCE_PX = 4;
const MAX_FIRST_LINE_END_SCAN_POSITIONS = 20_000;

function getEditorElement(): HTMLElement | null {
  return document.querySelector('.milkdown .ProseMirror[contenteditable="true"]');
}

function focusSourceEditorInitialPosition(): boolean {
  const sourceEditor = document.querySelector<HTMLTextAreaElement>('[data-note-source-editor="true"]');
  if (!sourceEditor) return false;
  const firstLineBreak = sourceEditor.value.search(/[\r\n]/);
  const initialPosition = firstLineBreak < 0 ? sourceEditor.value.length : firstLineBreak;
  sourceEditor.focus({ preventScroll: true });
  sourceEditor.setSelectionRange(initialPosition, initialPosition);
  return true;
}

function focusEditorDomStart(editorEl: HTMLElement): void {
  editorEl.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(editorEl);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function focusSelectionAtStart(view: EditorView): void {
  const tr = view.state.tr
    .setSelection(createDocumentStartTextSelection(view.state.doc))
    .scrollIntoView();
  view.dispatch(tr);
  view.focus();
}

function focusSelectionAtInitialPosition(view: EditorView): void {
  clearCurrentEditorBlockSelection();
  const tr = view.state.tr
    .setSelection(createDocumentFirstLineEndTextSelection(view.state.doc))
    .scrollIntoView();
  view.dispatch(tr);
  view.focus();
}

function isInlineLineBreakNode(node: { type?: { name?: string } }): boolean {
  const nodeName = node.type?.name;
  return (
    nodeName === 'hardbreak' ||
    nodeName === 'hard_break' ||
    nodeName === 'softbreak' ||
    nodeName === 'soft_break'
  );
}

function shouldUseTextblockAsFirstLineTarget(node: {
  content: { size: number };
  forEach: (
    callback: (
      child: { isText?: boolean; text?: string | null; type?: { name?: string } },
      offset: number,
      index: number
    ) => void
  ) => void;
}): boolean {
  if (node.content.size === 0) {
    return true;
  }

  let hasEditableLineContent = false;
  node.forEach((child) => {
    if (hasEditableLineContent) return;
    if (child.isText && (child.text ?? '').length > 0) {
      hasEditableLineContent = true;
      return;
    }

    if (!isInlineLineBreakNode(child) && child.type?.name !== 'image') {
      hasEditableLineContent = true;
    }
  });

  return hasEditableLineContent;
}

function canCreateCollapsedTextSelection(view: EditorView, pos: number): boolean {
  try {
    return view.state.doc.resolve(pos).parent.inlineContent;
  } catch {
    return false;
  }
}

function isSameVisualLine(
  baseRect: { top: number; bottom: number },
  rect: { top: number; bottom: number }
): boolean {
  const verticalOverlap = Math.min(baseRect.bottom, rect.bottom) - Math.max(baseRect.top, rect.top);
  if (verticalOverlap > 0) {
    return true;
  }

  const baseMiddle = (baseRect.top + baseRect.bottom) / 2;
  const middle = (rect.top + rect.bottom) / 2;
  const baseHeight = Math.max(1, baseRect.bottom - baseRect.top);
  const tolerance = Math.min(FIRST_VISUAL_LINE_TOLERANCE_PX, baseHeight * 0.2);
  return Math.abs(middle - baseMiddle) <= tolerance;
}

function resolveFirstVisualLineEndPos(
  view: EditorView,
  contentStart: number,
  contentEnd: number
): number | null {
  if (contentEnd <= contentStart) {
    return canCreateCollapsedTextSelection(view, contentStart) ? contentStart : null;
  }

  if (contentEnd - contentStart > MAX_FIRST_LINE_END_SCAN_POSITIONS) {
    return null;
  }

  let firstRect: { top: number; bottom: number };
  try {
    firstRect = view.coordsAtPos(contentStart);
  } catch {
    return null;
  }

  let lastTextPos = canCreateCollapsedTextSelection(view, contentStart) ? contentStart : null;
  for (let pos = contentStart + 1; pos <= contentEnd; pos += 1) {
    let rect: { top: number; bottom: number };
    try {
      rect = view.coordsAtPos(pos);
    } catch {
      continue;
    }

    if (!isSameVisualLine(firstRect, rect)) {
      break;
    }

    if (canCreateCollapsedTextSelection(view, pos)) {
      lastTextPos = pos;
    }
  }

  return lastTextPos;
}

function resolveFirstTextblockLineBounds(view: EditorView): { contentStart: number; textualLineEnd: number } | null {
  let lineBounds: { contentStart: number; textualLineEnd: number } | null = null;

  view.state.doc.descendants((node, pos) => {
    if (lineBounds !== null) return false;
    if (node.isTextblock) {
      if (!shouldUseTextblockAsFirstLineTarget(node)) {
        return true;
      }

      let lineEndOffset = 0;
      let foundLineBreak = false;

      node.forEach((child) => {
        if (foundLineBreak) return;

        if (child.isText) {
          const text = child.text ?? '';
          const newlineIndex = text.indexOf('\n');
          if (newlineIndex >= 0) {
            lineEndOffset += newlineIndex;
            foundLineBreak = true;
            return;
          }
        }

        if (isInlineLineBreakNode(child)) {
          foundLineBreak = true;
          return;
        }

        lineEndOffset += child.nodeSize;
      });

      const contentStart = pos + 1;
      lineBounds = {
        contentStart,
        textualLineEnd: contentStart + lineEndOffset,
      };
      return false;
    }
    return true;
  });

  return lineBounds;
}

function resolveFirstTextblockLineEndPos(view: EditorView): number | null {
  const lineBounds = resolveFirstTextblockLineBounds(view);
  if (!lineBounds) {
    return null;
  }

  return (
    resolveFirstVisualLineEndPos(view, lineBounds.contentStart, lineBounds.textualLineEnd) ??
    lineBounds.textualLineEnd
  );
}

function focusSelectionAtFirstLineEnd(view: EditorView): void {
  const textSelectionPos = resolveFirstTextblockLineEndPos(view);
  let selection: Selection = createDocumentStartTextSelection(view.state.doc);
  if (textSelectionPos !== null) {
    const $textSelectionPos = view.state.doc.resolve(textSelectionPos);
    if ($textSelectionPos.parent.inlineContent) {
      selection = TextSelection.create(view.state.doc, textSelectionPos);
    } else {
      selection = Selection.near($textSelectionPos, -1);
    }
  }

  const tr = view.state.tr
    .setSelection(selection)
    .scrollIntoView();
  view.dispatch(tr);
  view.focus();
}

export function focusEditorToFirstLineStart(): void {
  const view = getCurrentEditorView();
  if (view) {
    focusSelectionAtStart(view);
    return;
  }

  const editorEl = getEditorElement();
  if (!editorEl) return;
  focusEditorDomStart(editorEl);
}

export function focusEditorToInitialPosition(): void {
  if (focusSourceEditorInitialPosition()) return;

  const view = getCurrentEditorView();
  if (view) {
    focusSelectionAtInitialPosition(view);
    return;
  }

  const editorEl = getEditorElement();
  if (!editorEl) return;
  focusEditorDomStart(editorEl);
}

export function focusEditorToFirstLineEnd(): void {
  const view = getCurrentEditorView();
  if (view) {
    focusSelectionAtFirstLineEnd(view);
    return;
  }

  const editorEl = getEditorElement();
  if (!editorEl) return;
  focusEditorDomStart(editorEl);
}

export function focusEditorAtTop(): void {
  const view = getCurrentEditorView();

  if (view) {
    const firstChild = view.state.doc.firstChild;
    const hasTopEmptyParagraph =
      firstChild?.type === view.state.schema.nodes.paragraph && firstChild.content.size === 0;

    let tr = view.state.tr;
    if (!hasTopEmptyParagraph) {
      const paragraphType = view.state.schema.nodes.paragraph;
      if (paragraphType) {
        tr = tr.insert(0, paragraphType.create());
      }
    }

    tr = tr
      .setSelection(Selection.atStart(tr.doc))
      .scrollIntoView();
    view.dispatch(tr);
    view.focus();
    return;
  }

  const editorEl = getEditorElement();
  if (!editorEl) return;
  focusEditorDomStart(editorEl);
}
