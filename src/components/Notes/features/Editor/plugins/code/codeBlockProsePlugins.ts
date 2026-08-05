import { $prose } from '@milkdown/kit/utils';
import { type Node } from '@milkdown/kit/prose/model';
import { Plugin } from '@milkdown/kit/prose/state';
import { type EditorView } from '@milkdown/kit/prose/view';
import { CodeBlockNodeView } from './CodeBlockNodeView';
import { moveSelectionAfterNode } from './codeBlockSelectionUtils';

const EAGER_INITIAL_CODE_BLOCK_COUNT = 3;
const DENSE_CODE_BLOCK_PASSIVE_INITIALIZATION_THRESHOLD = 40;

export function shouldDeferPassiveCodeMirrorInitialization(doc: Node): boolean {
  let codeBlockCount = 0;
  doc.descendants((node) => {
    if (node.type.name === 'code_block') {
      codeBlockCount += 1;
    }
    return codeBlockCount < DENSE_CODE_BLOCK_PASSIVE_INITIALIZATION_THRESHOLD;
  });
  return codeBlockCount >= DENSE_CODE_BLOCK_PASSIVE_INITIALIZATION_THRESHOLD;
}

export function findCodeBlockContext(state: EditorView['state']) {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'code_block') {
      return {
        node,
        pos: $from.before(depth),
      };
    }
  }

  return null;
}

export function createCollapsedCodeBlockSelectionGuardTransaction(
  state: EditorView['state']
) {
  const context = findCodeBlockContext(state);
  if (!context || !context.node.attrs.collapsed) {
    return null;
  }

  const { node, pos } = context;
  const tr = state.tr;
  moveSelectionAfterNode(tr, pos, node.nodeSize);
  return tr.scrollIntoView();
}

export const codeBlockNodeViewPlugin = $prose(() => {
  let currentDoc: Node | null = null;
  let eagerCodeBlocksRemaining = EAGER_INITIAL_CODE_BLOCK_COUNT;
  let deferPassiveCodeMirrorInitialization = false;

  return new Plugin({
    props: {
      nodeViews: {
        code_block: (node: Node, view: EditorView, getPos: () => number | undefined) => {
          if (currentDoc !== view.state.doc) {
            currentDoc = view.state.doc;
            deferPassiveCodeMirrorInitialization = shouldDeferPassiveCodeMirrorInitialization(currentDoc);
            eagerCodeBlocksRemaining = deferPassiveCodeMirrorInitialization
              ? 0
              : EAGER_INITIAL_CODE_BLOCK_COUNT;
          }

          const shouldInitializeEagerly = eagerCodeBlocksRemaining > 0;
          if (shouldInitializeEagerly) {
            eagerCodeBlocksRemaining -= 1;
          }

          const nodeView = new CodeBlockNodeView(node, view, getPos, {
            lazyCodeMirror: !shouldInitializeEagerly,
            passiveLazyCodeMirror: !deferPassiveCodeMirrorInitialization,
          });
          return nodeView;
        },
      },
    },
  });
});

export const collapsedCodeBlockSelectionGuardPlugin = $prose(() => {
  return new Plugin({
    appendTransaction: (_transactions, _oldState, newState) => {
      return createCollapsedCodeBlockSelectionGuardTransaction(newState);
    },
  });
});
