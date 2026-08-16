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
  if (selection.empty) {
    const textblock = findTextblockAt(doc, selection.head);
    return textblock ? [textblock] : [];
  }

  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (!node.isTextblock) return true;
    blocks.set(pos, { from: pos, node });
    return false;
  });
  return [...blocks.values()];
}

function isEmptyHeading(node: ProseNode): boolean {
  if (node.type.name !== 'heading') return false;

  let hasContent = false;
  node.forEach((child) => {
    if (hasContent) return;
    if (!child.isText) {
      hasContent = true;
      return;
    }
    if (child.marks.some((mark) => mark.type.name === 'markdownSyntax')) return;
    hasContent = Boolean(child.text?.trim());
  });
  return !hasContent;
}

function createExpandedDecorations(
  textblocks: readonly TextblockRange[],
  doc: ProseNode,
  selection: Selection,
): DecorationSet {
  const decorations: Decoration[] = [];
  const expandedPositions = new Set<number>();
  textblocks.forEach(({ from, node }) => {
    expandedPositions.add(from);
    const classes = ['markdown-source-expanded'];
    if (isEmptyHeading(node)) classes.push('markdown-empty-heading');
    decorations.push(Decoration.node(from, from + node.nodeSize, {
      class: classes.join(' '),
      'data-markdown-source-expanded': 'true',
    }));

    if (selection.empty) return;
    node.forEach((child, offset) => {
      if (
        !child.isText
        || !child.text
        || !child.marks.some((mark) => mark.type.name === 'markdownSyntax')
      ) return;
      decorations.push(Decoration.inline(
        from + 1 + offset,
        from + 1 + offset + child.nodeSize,
        { class: 'markdown-syntax-selected' },
      ));
    });
  });
  doc.descendants((node, pos) => {
    if (isEmptyHeading(node) && !expandedPositions.has(pos)) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, {
        class: 'markdown-empty-heading',
      }));
    }
    return true;
  });
  return decorations.length > 0
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty;
}

export const markdownSyntaxPlugin = $prose((ctx) => {
  let cachedDoc: EditorState['doc'] | null = null;
  let cachedTextblockPositions: number[] = [];
  let cachedSelectionWasNonEmpty = false;
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
          && cachedSelectionWasNonEmpty === !state.selection.empty
        ) {
          return cachedDecorations;
        }
        cachedDoc = state.doc;
        cachedTextblockPositions = positions;
        cachedSelectionWasNonEmpty = !state.selection.empty;
        cachedDecorations = createExpandedDecorations(textblocks, state.doc, state.selection);
        return cachedDecorations;
      },
    },
  });
});
