import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorState, Selection } from '@milkdown/kit/prose/state';
import { Plugin } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { reparseEditedMarkdownSyntax } from './markdownSyntaxReparse';

interface TextblockRange {
  from: number;
  node: ProseNode;
}

function findTextblockAt(doc: ProseNode, pos: number): TextblockRange | null {
  const resolved = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.isTextblock) return { from: resolved.before(depth), node };
  }
  if (resolved.nodeAfter?.isTextblock) return { from: resolved.pos, node: resolved.nodeAfter };
  if (resolved.nodeBefore?.isTextblock) {
    return { from: resolved.pos - resolved.nodeBefore.nodeSize, node: resolved.nodeBefore };
  }
  return null;
}

function collectExpandedTextblocks(doc: ProseNode, selection: Selection): TextblockRange[] {
  const blocks = new Map<number, TextblockRange>();
  const anchor = findTextblockAt(doc, selection.anchor);
  const head = findTextblockAt(doc, selection.head);
  if (anchor) blocks.set(anchor.from, anchor);
  if (head) blocks.set(head.from, head);
  return [...blocks.values()];
}

function createExpandedDecorations(textblocks: readonly TextblockRange[], doc: ProseNode): DecorationSet {
  const decorations = textblocks.map(({ from, node }) => (
    Decoration.node(from, from + node.nodeSize, {
      class: 'markdown-source-expanded',
      'data-markdown-source-expanded': 'true',
    })
  ));
  return decorations.length > 0
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty;
}

export const markdownSyntaxPlugin = $prose((ctx) => {
  let cachedDoc: EditorState['doc'] | null = null;
  let cachedTextblockPositions: number[] = [];
  let cachedDecorations = DecorationSet.empty;

  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      return reparseEditedMarkdownSyntax(ctx, transactions, oldState, newState);
    },
    props: {
      decorations(state) {
        const textblocks = collectExpandedTextblocks(state.doc, state.selection);
        const positions = textblocks.map(({ from }) => from);
        if (
          cachedDoc === state.doc
          && positions.length === cachedTextblockPositions.length
          && positions.every((position, index) => position === cachedTextblockPositions[index])
        ) {
          return cachedDecorations;
        }
        cachedDoc = state.doc;
        cachedTextblockPositions = positions;
        cachedDecorations = createExpandedDecorations(textblocks, state.doc);
        return cachedDecorations;
      },
    },
  });
});
