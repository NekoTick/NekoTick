import { NodeSelection, Selection, TextSelection } from '@milkdown/kit/prose/state';

const MARKDOWN_BLANK_LINE_VALUE = '<!--vlaina-markdown-blank-line-->';
const RENDERED_HTML_BOUNDARY_BLANK_LINE_VALUE = '<!--vlaina-rendered-html-boundary-blank-line-->';
const EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER = '\u200B';

export function findInsertedNodePos(args: {
  doc: { content: { size: number }; nodesBetween: (...args: any[]) => void; nodeAt: (pos: number) => any };
  preferredPos: number;
  nodeTypeName: string;
}) {
  const { doc, preferredPos, nodeTypeName } = args;
  const directNode = doc.nodeAt(preferredPos);
  if (directNode?.type?.name === nodeTypeName) {
    return preferredPos;
  }

  let nodePos = -1;
  const from = Math.max(0, preferredPos - 2);
  const to = Math.min(doc.content.size, preferredPos + 4);
  doc.nodesBetween(from, to, (node: any, pos: number) => {
    if (nodePos >= 0) return false;
    if (node.type?.name === nodeTypeName) {
      nodePos = pos;
      return false;
    }
    return undefined;
  });

  return nodePos >= 0 ? nodePos : preferredPos;
}

function isMarkdownBlankLineBlock(node: any): boolean {
  return node?.type?.name === 'html_block' && (
    node.attrs?.value === MARKDOWN_BLANK_LINE_VALUE ||
    node.attrs?.value === RENDERED_HTML_BOUNDARY_BLANK_LINE_VALUE
  );
}

function setTextSelectionSafely(tr: any, pos: number) {
  const safePos = Math.max(0, Math.min(pos, tr.doc.content.size));
  try {
    const $safePos = tr.doc.resolve(safePos);
    if ($safePos.parent.inlineContent) {
      return tr.setSelection(TextSelection.create(tr.doc, safePos));
    }
    return tr.setSelection(Selection.near($safePos, 1));
  } catch {
    return tr;
  }
}

function setInsertedNodeSelectionSafely(tr: any, nodePos: number) {
  try {
    const node = tr.doc.nodeAt(nodePos);
    if (node && !node.isText && node.type?.spec?.selectable !== false) {
      return tr.setSelection(NodeSelection.create(tr.doc, nodePos));
    }
    return tr.setSelection(Selection.near(tr.doc.resolve(nodePos), -1));
  } catch {
    return tr;
  }
}

export function moveSelectionAfterInsertedNode(args: {
  tr: any;
  nodePos: number;
  insertedNodeFallback?: { nodeSize?: number; isInline?: boolean } | null;
  paragraphType?: { create: (attrs?: any, content?: any) => any } | null;
  convertFollowingMarkdownBlankLine?: boolean;
}) {
  const { tr, nodePos, insertedNodeFallback, paragraphType, convertFollowingMarkdownBlankLine = true } = args;
  if (nodePos < 0 || !tr?.doc || typeof tr.doc.nodeAt !== 'function') {
    return tr;
  }

  const insertedNode = tr.doc.nodeAt(nodePos) ?? insertedNodeFallback;
  const nodeSize = insertedNode?.nodeSize;
  if (typeof nodeSize !== 'number' || nodeSize <= 0) {
    return tr;
  }

  const afterNodePos = nodePos + nodeSize;
  if (insertedNode?.isInline) {
    return setTextSelectionSafely(tr, afterNodePos);
  }

  const nextNode = tr.doc.nodeAt(afterNodePos);
  if (nextNode?.isTextblock) {
    if (nextNode.type?.name !== 'paragraph') {
      return setInsertedNodeSelectionSafely(tr, nodePos);
    }
    return setTextSelectionSafely(tr, afterNodePos + 1);
  }

  if (convertFollowingMarkdownBlankLine && isMarkdownBlankLineBlock(nextNode)) {
    if (paragraphType) {
      try {
        const paragraph = paragraphType.create(
          null,
          tr.doc.type.schema.text(EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER)
        );
        tr.replaceWith(afterNodePos, afterNodePos + Math.max(1, nextNode.nodeSize ?? 1), paragraph);
        return setTextSelectionSafely(tr, afterNodePos + 1 + EDITABLE_MARKDOWN_BLANK_LINE_PLACEHOLDER.length);
      } catch {
      }
    }
    return tr;
  }

  if (isMarkdownBlankLineBlock(nextNode)) {
    return setInsertedNodeSelectionSafely(tr, nodePos);
  }

  if (nextNode) {
    return setInsertedNodeSelectionSafely(tr, nodePos);
  }

  if (paragraphType) {
    try {
      tr.insert(afterNodePos, paragraphType.create());
      return setTextSelectionSafely(tr, afterNodePos + 1);
    } catch {
    }
  }

  return setInsertedNodeSelectionSafely(tr, nodePos);
}
