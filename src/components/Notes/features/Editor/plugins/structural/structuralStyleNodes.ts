import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Decoration, DecorationSet, type Decoration as ProseDecoration } from '@milkdown/kit/prose/view';
import {
  DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT,
  SKIP_PROSE_DESCENDANTS,
  STOP_PROSE_SCAN,
  scanProseDescendants,
} from '../shared/boundedProseNodeScan';

export const STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS = 'editor-paragraph-has-image-block';
export const STRUCTURAL_PARAGRAPH_HAS_MULTIPLE_IMAGE_BLOCKS_CLASS = 'editor-paragraph-has-multiple-image-blocks';
export const STRUCTURAL_EAGER_LAYOUT_PARAGRAPH_CLASS = 'editor-eager-layout-paragraph';
export const STRUCTURAL_EMPTY_PARAGRAPH_CLASS = 'editor-empty-paragraph';
export const STRUCTURAL_LIST_ITEM_ALIGN_CENTER_CLASS = 'editor-list-item-align-center';
export const STRUCTURAL_LIST_ITEM_ALIGN_RIGHT_CLASS = 'editor-list-item-align-right';

export const MAX_STRUCTURAL_STYLE_DECORATIONS = 4000;
export const MAX_STRUCTURAL_STYLE_SCAN_NODES = DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT;
export const MAX_STRUCTURAL_STYLE_RANGE_SCAN_NODES = MAX_STRUCTURAL_STYLE_SCAN_NODES;

const STRUCTURAL_STYLE_NODE_TYPES = new Set(['paragraph', 'list_item']);
const EAGER_LAYOUT_INLINE_NODE_TYPES = new Set(['footnote_ref', 'footnote_reference', 'html']);
const EAGER_LAYOUT_MARK_TYPES = new Set(['subscript', 'superscript']);
const EAGER_LAYOUT_PARAGRAPH_MIN_CONTENT_SIZE = 2000;
const EAGER_LAYOUT_PARAGRAPH_MIN_CHILD_COUNT = 12;

export function isRelevantStructuralNode(node: ProseNode): boolean {
  return STRUCTURAL_STYLE_NODE_TYPES.has(node.type.name);
}

function getDirectImageChildCount(node: ProseNode): number {
  let count = 0;
  for (let index = 0; index < node.childCount; index += 1) {
    if (node.child(index).type.name === 'image') {
      count += 1;
    }
  }
  return count;
}

function paragraphHasOverflowProneInlineContent(node: ProseNode): boolean {
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (EAGER_LAYOUT_INLINE_NODE_TYPES.has(child.type.name)) {
      return true;
    }
    if (
      child.type.name === 'image'
      && typeof child.attrs?.src === 'string'
      && child.attrs.src.includes('#shadow')
    ) {
      return true;
    }
    if (child.marks.some((mark) => EAGER_LAYOUT_MARK_TYPES.has(mark.type.name))) {
      return true;
    }
  }
  return false;
}

function getDirectListItemTextAlignment(node: ProseNode): 'center' | 'right' | null {
  let hasCenter = false;

  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    const align = child.attrs?.align;
    if (align === 'right') {
      return 'right';
    }
    if (align === 'center') {
      hasCenter = true;
    }
  }

  return hasCenter ? 'center' : null;
}

export function getStructuralStyleDecorationClass(node: ProseNode): string | null {
  const classes: string[] = [];

  if (node.type.name === 'paragraph') {
    if (node.content.size === 0) {
      classes.push(STRUCTURAL_EMPTY_PARAGRAPH_CLASS);
    }
    if (
      paragraphHasOverflowProneInlineContent(node)
      || (
        node.content.size >= EAGER_LAYOUT_PARAGRAPH_MIN_CONTENT_SIZE
        && node.childCount >= EAGER_LAYOUT_PARAGRAPH_MIN_CHILD_COUNT
      )
    ) {
      classes.push(STRUCTURAL_EAGER_LAYOUT_PARAGRAPH_CLASS);
    }

    const imageChildCount = getDirectImageChildCount(node);
    const containsOnlyImages = imageChildCount > 0 && imageChildCount === node.childCount;
    if (containsOnlyImages) {
      classes.push(STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS);
    }
    if (containsOnlyImages && imageChildCount > 1) {
      classes.push(STRUCTURAL_PARAGRAPH_HAS_MULTIPLE_IMAGE_BLOCKS_CLASS);
    }
  }

  if (node.type.name === 'list_item') {
    const align = getDirectListItemTextAlignment(node);
    if (align === 'center') {
      classes.push(STRUCTURAL_LIST_ITEM_ALIGN_CENTER_CLASS);
    } else if (align === 'right') {
      classes.push(STRUCTURAL_LIST_ITEM_ALIGN_RIGHT_CLASS);
    }
  }

  return classes.length > 0 ? classes.join(' ') : null;
}

export function createStructuralDecoration(node: ProseNode, pos: number): ProseDecoration | null {
  const className = getStructuralStyleDecorationClass(node);
  if (!className) {
    return null;
  }
  return Decoration.node(pos, pos + node.nodeSize, { class: className });
}

export function collectStructuralStyleDecorations(
  doc: ProseNode,
  maxDecorations = MAX_STRUCTURAL_STYLE_DECORATIONS,
  maxScanNodes = MAX_STRUCTURAL_STYLE_SCAN_NODES,
): ProseDecoration[] {
  const decorations: ProseDecoration[] = [];

  scanProseDescendants(doc, (node, pos) => {
    if (decorations.length >= maxDecorations) {
      return STOP_PROSE_SCAN;
    }

    const typedNode = node as ProseNode;
    if (!isRelevantStructuralNode(typedNode)) {
      return true;
    }

    const decoration = createStructuralDecoration(typedNode, pos);
    if (decoration) {
      decorations.push(decoration);
    }

    if (typedNode.type.name === 'paragraph') {
      return SKIP_PROSE_DESCENDANTS;
    }

    return decorations.length < maxDecorations ? true : STOP_PROSE_SCAN;
  }, maxScanNodes);

  return decorations;
}

export function createStructuralStyleDecorations(doc: ProseNode): DecorationSet {
  const decorations = collectStructuralStyleDecorations(doc);
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}
