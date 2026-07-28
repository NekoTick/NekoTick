import * as proseState from '@milkdown/kit/prose/state';
import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { DOMEventHandlers, EditorView as CodeMirror } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { tryWriteTextToClipboardSynchronously } from '@/lib/clipboard';
import { getCodeBlockSourceText } from '../codeBlockText';
import { mapCodeBlockEditorOffsetToDocumentOffset } from './codeBlockEditorUtils';
import type { CreateCodeBlockKeymapOptions } from './codeBlockEditorKeymapTypes';
import {
  preventImageClipboardTextPaste,
  preventImageDataTransferTextDrop,
} from '@/lib/clipboardImagePayload';

const { TextSelection } = proseState;

type CapturedCodeMirrorClipboardSelection = {
  doc: CodeMirror['state']['doc'];
  selection: CodeMirror['state']['selection'];
  text: string;
};

const capturedClipboardSelections = new WeakMap<CodeMirror, CapturedCodeMirrorClipboardSelection>();

function getSelectedCodeMirrorText(cm: CodeMirror): string {
  return cm.state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => cm.state.sliceDoc(range.from, range.to))
    .join('\n');
}

export function trackCodeBlockEditorClipboardKeydown(event: KeyboardEvent, cm: CodeMirror): void {
  const key = event.key.toLowerCase();
  if (event.isComposing || event.altKey) {
    capturedClipboardSelections.delete(cm);
    return;
  }

  if (key === 'control' || key === 'meta') {
    const text = getSelectedCodeMirrorText(cm);
    if (text) {
      capturedClipboardSelections.set(cm, {
        doc: cm.state.doc,
        selection: cm.state.selection,
        text,
      });
    } else {
      capturedClipboardSelections.delete(cm);
    }
    return;
  }

  const isClipboardKey =
    ((event.ctrlKey || event.metaKey) && (key === 'c' || key === 'x')) ||
    (event.ctrlKey && !event.metaKey && key === 'insert') ||
    (!event.ctrlKey && !event.metaKey && event.shiftKey && key === 'delete');
  if (!isClipboardKey) {
    capturedClipboardSelections.delete(cm);
  }
}

export function clearCodeBlockEditorClipboardCapture(cm: CodeMirror): void {
  capturedClipboardSelections.delete(cm);
}

function takeCapturedClipboardSelection(cm: CodeMirror): CapturedCodeMirrorClipboardSelection | null {
  const captured = capturedClipboardSelections.get(cm) ?? null;
  capturedClipboardSelections.delete(cm);
  const currentDoc = cm.state.doc as { eq?: (other: unknown) => boolean } | undefined;
  if (captured && typeof currentDoc?.eq === 'function' && !currentDoc.eq(captured.doc)) {
    return null;
  }
  return captured;
}

function collapseCodeMirrorSelection(
  cm: CodeMirror,
  selection: CodeMirror['state']['selection'],
) {
  const { main } = selection;
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

  const currentText = getSelectedCodeMirrorText(cm);
  const captured = event ? null : takeCapturedClipboardSelection(cm);
  const selection = currentText ? cm.state.selection : captured?.selection;
  const text = currentText || captured?.text || '';
  if (!text || !selection) {
    return false;
  }

  if (event?.clipboardData) {
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
    collapseCodeMirrorSelection(cm, selection);
    collapseProseMirrorSelectionToCodeMirrorHead(cm, view, getNode, getPos);
    view.focus();
    return true;
  }

  if (!tryWriteTextToClipboardSynchronously(text)) {
    return false;
  }

  event?.preventDefault();
  collapseCodeMirrorSelection(cm, selection);
  collapseProseMirrorSelectionToCodeMirrorHead(cm, view, getNode, getPos);
  view.focus();
  return true;
}

export function cutCodeMirrorSelection(
  getCodeMirror: () => CodeMirror | undefined,
  view: EditorView,
  event?: ClipboardEvent
) {
  const cm = getCodeMirror();
  if (!cm || !view.editable) {
    return false;
  }

  const currentText = getSelectedCodeMirrorText(cm);
  const captured = event ? null : takeCapturedClipboardSelection(cm);
  const selection = currentText ? cm.state.selection : captured?.selection;
  const text = currentText || captured?.text || '';
  if (!text || !selection) {
    return false;
  }
  const deleteSelection = () => {
    cm.focus();
    cm.dispatch({ selection });
    cm.dispatch(
      cm.state.changeByRange((range) => ({
        changes: range.empty ? [] : { from: range.from, to: range.to, insert: '' },
        range: range.empty ? range : EditorSelection.cursor(range.from),
      }))
    );
  };

  if (event?.clipboardData) {
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
    deleteSelection();
    return true;
  }

  if (!tryWriteTextToClipboardSynchronously(text)) {
    return false;
  }

  event?.preventDefault();
  deleteSelection();
  return true;
}

export function createCodeBlockEditorClipboardHandlers({
  view,
  getNode,
  getPos,
  onCut,
}: Omit<CreateCodeBlockKeymapOptions, 'getCodeMirror'> & {
  onCut?: () => void;
}): DOMEventHandlers<unknown> {
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
      const didCut = cutCodeMirrorSelection(() => cm, view, event);
      if (didCut) {
        onCut?.();
      }
      return didCut;
    },
  };
}
