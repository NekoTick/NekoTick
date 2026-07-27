import * as proseState from '@milkdown/kit/prose/state';
import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { DOMEventHandlers, EditorView as CodeMirror } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { writeTextToClipboard } from '../../cursor/blockSelectionCommands';
import { getCodeBlockSourceText } from '../codeBlockText';
import { mapCodeBlockEditorOffsetToDocumentOffset } from './codeBlockEditorUtils';
import type { CreateCodeBlockKeymapOptions } from './codeBlockEditorKeymapTypes';
import {
  preventImageClipboardTextPaste,
  preventImageDataTransferTextDrop,
} from '@/lib/clipboardImagePayload';

const { TextSelection } = proseState;

function getSelectedCodeMirrorText(cm: CodeMirror): string {
  return cm.state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => cm.state.sliceDoc(range.from, range.to))
    .join('\n');
}

function isCodeMirrorSelectionStillCurrent(
  cm: CodeMirror,
  originalDoc: CodeMirror['state']['doc'],
  originalSelection: CodeMirror['state']['selection'],
  originalText: string
): boolean {
  const currentDoc = cm.state.doc as { eq?: (other: unknown) => boolean } | undefined;
  if (typeof currentDoc?.eq === 'function' && !currentDoc.eq(originalDoc)) {
    return false;
  }

  const currentSelection = cm.state.selection as { eq?: (other: unknown) => boolean } | undefined;
  if (typeof currentSelection?.eq === 'function') {
    return currentSelection.eq(originalSelection);
  }

  return getSelectedCodeMirrorText(cm) === originalText;
}

function collapseCodeMirrorSelection(cm: CodeMirror) {
  const { main } = cm.state.selection;
  cm.dispatch({
    selection: {
      anchor: main.to,
      head: main.to,
    },
  });
}

function collapseProseMirrorSelectionToCodeMirrorHead(
  cm: CodeMirror,
  view: EditorView,
  getNode: () => Node,
  getPos: () => number | undefined
) {
  const pos = getPos();
  if (pos === undefined) {
    return;
  }

  const node = getNode();
  const rawText = getCodeBlockSourceText(node);
  const codeBlockStart = pos + 1;
  const head = codeBlockStart + mapCodeBlockEditorOffsetToDocumentOffset(
    rawText,
    cm.state.selection.main.head
  );
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, head)).scrollIntoView());
}

export function copyCodeMirrorSelection(
  getCodeMirror: () => CodeMirror | undefined,
  view: EditorView,
  getNode: () => Node,
  getPos: () => number | undefined,
  event?: ClipboardEvent
) {
  const cm = getCodeMirror();
  if (!cm) {
    return false;
  }

  const text = getSelectedCodeMirrorText(cm);
  if (!text) {
    return false;
  }

  if (event?.clipboardData) {
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
    collapseCodeMirrorSelection(cm);
    collapseProseMirrorSelectionToCodeMirrorHead(cm, view, getNode, getPos);
    view.focus();
    return true;
  }

  event?.preventDefault();
  const originalDoc = cm.state.doc;
  const originalSelection = cm.state.selection;
  void writeTextToClipboard(text).then((didCopy) => {
    if (!didCopy || !isCodeMirrorSelectionStillCurrent(cm, originalDoc, originalSelection, text)) {
      return;
    }

    collapseCodeMirrorSelection(cm);
    collapseProseMirrorSelectionToCodeMirrorHead(cm, view, getNode, getPos);
    view.focus();
  }).catch(() => undefined);
  return true;
}

export function cutCodeMirrorSelection(
  getCodeMirror: () => CodeMirror | undefined,
  view: EditorView,
  getNode: () => Node,
  getPos: () => number | undefined,
  event?: ClipboardEvent
) {
  const cm = getCodeMirror();
  if (!cm || !view.editable) {
    return false;
  }

  const text = getSelectedCodeMirrorText(cm);
  if (!text) {
    return false;
  }

  const deleteSelection = () => {
    cm.dispatch(
      cm.state.changeByRange((range) => ({
        changes: range.empty ? [] : { from: range.from, to: range.to, insert: '' },
        range: range.empty ? range : EditorSelection.cursor(range.from),
      }))
    );
    collapseProseMirrorSelectionToCodeMirrorHead(cm, view, getNode, getPos);
    cm.focus();
  };

  if (event?.clipboardData) {
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
    deleteSelection();
    return true;
  }

  event?.preventDefault();
  const originalDoc = cm.state.doc;
  const originalSelection = cm.state.selection;
  void writeTextToClipboard(text).then((didCopy) => {
    if (!didCopy || !isCodeMirrorSelectionStillCurrent(cm, originalDoc, originalSelection, text)) {
      return;
    }

    deleteSelection();
  }).catch(() => undefined);
  return true;
}

export function createCodeBlockEditorClipboardHandlers({
  view,
  getNode,
  getPos,
}: Omit<CreateCodeBlockKeymapOptions, 'getCodeMirror'>): DOMEventHandlers<unknown> {
  return {
    paste(event) {
      return preventImageClipboardTextPaste(event);
    },
    drop(event) {
      return preventImageDataTransferTextDrop(event);
    },
    copy(event, cm) {
      return copyCodeMirrorSelection(() => cm, view, getNode, getPos, event);
    },
    cut(event, cm) {
      return cutCodeMirrorSelection(() => cm, view, getNode, getPos, event);
    },
  };
}
