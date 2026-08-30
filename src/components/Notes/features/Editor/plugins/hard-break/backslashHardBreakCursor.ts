import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { isBackslashHardBreakSourceTextNode, isNonInlineHardBreakNode } from './backslashHardBreakNodes';
import { markEditorUserInput } from '../shared/userInputEvents';

export const backslashHardBreakCursorPluginKey = new PluginKey('backslashHardBreakCursor');
const MAX_TYPED_BACKSLASH_RUN_CHARS = 256;

export function handleTypedBackslashHardBreakEnter(view: EditorView, event: KeyboardEvent): boolean {
  if (
    event.key !== 'Enter'
    || event.shiftKey
    || event.altKey
    || event.metaKey
    || event.ctrlKey
    || event.isComposing
    || !view.state.selection.empty
  ) {
    return false;
  }

  const { state } = view;
  const { selection } = state;
  const parent = selection.$from.parent;
  if (!parent.inlineContent || parent.type.spec.code || selection.$from.parentOffset === 0) {
    return false;
  }

  const scanFrom = Math.max(0, selection.$from.parentOffset - MAX_TYPED_BACKSLASH_RUN_CHARS);
  const textBefore = parent.textBetween(scanFrom, selection.$from.parentOffset, '', '');
  const slashRun = /\\+$/.exec(textBefore)?.[0];
  if (!slashRun || slashRun.length % 2 === 0) return false;
  if (scanFrom > 0 && slashRun.length === MAX_TYPED_BACKSLASH_RUN_CHARS) return false;
  if (textBefore.slice(0, -slashRun.length).trim() === '') return false;

  const sourceMark = state.schema.marks.backslash_hard_break_source_text;
  const hardbreakType = state.schema.nodes.hardbreak;
  if (!sourceMark || !hardbreakType) return false;

  const slashPos = selection.from - 1;
  let tr = state.tr
    .addMark(slashPos, selection.from, sourceMark.create())
    .insert(selection.from, hardbreakType.create({ isInline: false }));
  tr = tr
    .setSelection(TextSelection.create(tr.doc, selection.from + 1))
    .scrollIntoView();
  markEditorUserInput(view);
  view.dispatch(tr);
  event.preventDefault();
  return true;
}

const TEXT_BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6';

function resolvePointerTextBlockRange(
  view: EditorView,
  target: EventTarget | null,
): { from: number; to: number } | null {
  const targetElement = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;
  const textBlock = targetElement?.closest(TEXT_BLOCK_SELECTOR);
  if (!(textBlock instanceof HTMLElement) || !view.dom.contains(textBlock)) return null;

  try {
    const from = view.posAtDOM(textBlock, 0, -1);
    const to = view.posAtDOM(textBlock, textBlock.childNodes.length, 1);
    return { from: Math.min(from, to), to: Math.max(from, to) };
  } catch {
    return null;
  }
}

export function findBackslashHardBreakArrowLeftTarget(doc: ProseNode, pos: number): number | null {
  if (pos < 0 || pos > doc.content.size) return null;

  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.inlineContent) return null;

  const parentStart = $pos.start();
  let childStart = parentStart;

  for (let index = 0; index < parent.childCount; index += 1) {
    const child = parent.child(index);
    const childEnd = childStart + child.nodeSize;
    const previous = index > 0 ? parent.child(index - 1) : null;
    const previousStart = previous ? childStart - previous.nodeSize : null;
    const next = index + 1 < parent.childCount ? parent.child(index + 1) : null;

    if (
      pos === childEnd
      && isNonInlineHardBreakNode(child)
      && isBackslashHardBreakSourceTextNode(previous)
      && previousStart !== null
    ) {
      return previousStart;
    }

    if (
      pos === childStart
      && isNonInlineHardBreakNode(child)
      && isBackslashHardBreakSourceTextNode(previous)
      && previousStart !== null
    ) {
      return previousStart;
    }

    if (
      pos === childEnd
      && isBackslashHardBreakSourceTextNode(child)
      && isNonInlineHardBreakNode(next)
    ) {
      return childStart;
    }

    childStart = childEnd;
  }

  return null;
}

function handleBackslashHardBreakArrowLeft(view: EditorView, event: KeyboardEvent): boolean {
  if (
    event.key !== 'ArrowLeft'
    || event.shiftKey
    || event.altKey
    || event.metaKey
    || event.ctrlKey
    || event.isComposing
    || view.composing
    || !view.state.selection.empty
  ) {
    return false;
  }

  const target = findBackslashHardBreakArrowLeftTarget(view.state.doc, view.state.selection.from);
  if (target === null) return false;

  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation();
  }
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, target))
      .scrollIntoView(),
  );
  return true;
}

function isEditorKeyboardEvent(view: EditorView, event: KeyboardEvent): boolean {
  const target = event.target;
  if (target instanceof Node && (target === view.dom || view.dom.contains(target))) {
    return true;
  }

  const selection = document.getSelection();
  return Boolean(
    view.hasFocus()
    || (
      selection
      && (
        (selection.anchorNode && view.dom.contains(selection.anchorNode))
        || (selection.focusNode && view.dom.contains(selection.focusNode))
      )
    )
  );
}

export function findBackslashHardBreakBlankClickTarget(view: EditorView, event: MouseEvent): number | null {
  if (
    event.button !== 0
    || event.shiftKey
    || event.altKey
    || event.metaKey
    || event.ctrlKey
  ) {
    return null;
  }

  const { doc } = view.state;
  const targetRange = resolvePointerTextBlockRange(view, event.target);
  let target: number | null = null;

  doc.descendants((node, pos) => {
    if (target !== null) return false;
    if (!node.inlineContent) return true;

    let childStart = pos + 1;
    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index);
      const childEnd = childStart + child.nodeSize;
      const next = index + 1 < node.childCount ? node.child(index + 1) : null;

      if (
        isBackslashHardBreakSourceTextNode(child)
        && isNonInlineHardBreakNode(next)
        && (!targetRange || (childEnd >= targetRange.from && childEnd <= targetRange.to))
      ) {
        const coords = view.coordsAtPos(childEnd);
        const verticalTolerance = Math.max(4, (coords.bottom - coords.top) / 2);
        if (
          event.clientX >= coords.left - 1
          && event.clientY >= coords.top - verticalTolerance
          && event.clientY <= coords.bottom + verticalTolerance
        ) {
          target = childEnd;
          return false;
        }
      }

      childStart = childEnd;
    }

    return true;
  });

  return target;
}

export const backslashHardBreakCursorPlugin = $prose(() => new Plugin({
  key: backslashHardBreakCursorPluginKey,
  view(view) {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isEditorKeyboardEvent(view, event)) return;
      handleBackslashHardBreakArrowLeft(view, event);
    };

    view.dom.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return {
      destroy() {
        view.dom.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keydown', handleKeyDown, true);
      },
    };
  },
  props: {
    handleDOMEvents: {
      click(view, event) {
        if (!(event instanceof MouseEvent)) return false;

        const target = findBackslashHardBreakBlankClickTarget(view, event);
        if (target === null) return false;

        event.preventDefault();
        event.stopPropagation();
        view.dispatch(
          view.state.tr
            .setSelection(TextSelection.create(view.state.doc, target))
            .scrollIntoView(),
        );
        view.focus();
        return true;
      },
    },
    handleKeyDown(view, event) {
      if (handleTypedBackslashHardBreakEnter(view, event)) return true;
      return handleBackslashHardBreakArrowLeft(view, event);
    },
  },
}));
