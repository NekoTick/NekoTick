import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { EditorView as CodeMirror } from '@codemirror/view';

export type CreateCodeBlockKeymapOptions = {
  getCodeMirror: () => CodeMirror | undefined;
  view: EditorView;
  getNode: () => Node;
  getPos: () => number | undefined;
  flushPendingChanges?: () => void;
};
