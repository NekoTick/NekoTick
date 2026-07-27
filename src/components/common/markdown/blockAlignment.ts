import { canTransformMarkdownAst } from './markdownAstBudget';

export type TextAlignment = 'left' | 'center' | 'right';
export type AlignmentCommentPlacement = 'before' | 'after';

export interface AlignmentAwareMdastNode {
  type: string;
  value?: string;
  children?: AlignmentAwareMdastNode[];
  align?: TextAlignment;
  data?: {
    hProperties?: Record<string, unknown>;
    vlainaAlignmentBlankLineCountBefore?: number;
    vlainaAlignmentBlankLineCountAfter?: number;
    vlainaAlignmentCommentPlacement?: AlignmentCommentPlacement;
  };
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
}

const ALIGNMENT_COMMENT_PATTERN = /^<!--\s*align:(left|center|right)\s*-->$/;
const MAX_ALIGNMENT_COMMENT_CHARS = 128;
export const DEFAULT_ALIGNMENT_COMMENT_BLANK_LINE_COUNT = 1;

export function isTextAlignment(value: unknown): value is TextAlignment {
  return value === 'left' || value === 'center' || value === 'right';
}

export function getTextAlignmentComment(alignment: TextAlignment): string {
  return `<!--align:${alignment}-->`;
}

export function extractTextAlignmentComment(value: unknown): TextAlignment | null {
  if (typeof value !== 'string') {
    return null;
  }
  if (value.length > MAX_ALIGNMENT_COMMENT_CHARS) {
    return null;
  }

  const match = value.trim().match(ALIGNMENT_COMMENT_PATTERN);
  if (!match) {
    return null;
  }

  return match[1] as TextAlignment;
}

export function readMarkdownNodeAlignment(node: { align?: unknown } | null | undefined): TextAlignment {
  if (node && isTextAlignment(node.align)) {
    return node.align;
  }

  return 'left';
}

function isAlignableNode(node: AlignmentAwareMdastNode | undefined): node is AlignmentAwareMdastNode {
  return !!node && (node.type === 'paragraph' || node.type === 'heading');
}

function getBlankLineCountBetween(
  left: AlignmentAwareMdastNode | undefined,
  right: AlignmentAwareMdastNode | undefined,
  markdown: string,
): number {
  const leftEnd = left?.position?.end?.offset;
  const rightStart = right?.position?.start?.offset;
  if (
    !markdown
    || typeof leftEnd !== 'number'
    || !Number.isSafeInteger(leftEnd)
    || typeof rightStart !== 'number'
    || !Number.isSafeInteger(rightStart)
    || leftEnd < 0
    || rightStart < leftEnd
    || rightStart > markdown.length
  ) {
    return DEFAULT_ALIGNMENT_COMMENT_BLANK_LINE_COUNT;
  }

  const lineBreakCount = markdown
    .slice(leftEnd, rightStart)
    .match(/\r\n|\r|\n/g)?.length ?? 0;
  return Math.max(0, lineBreakCount - 1);
}

function applyAlignmentToNode(
  node: AlignmentAwareMdastNode,
  alignment: TextAlignment,
  blankLineCountBefore: number,
  blankLineCountAfter: number,
  placement: AlignmentCommentPlacement,
): void {
  node.align = alignment;
  node.data = {
    ...(node.data || {}),
    vlainaAlignmentBlankLineCountBefore: blankLineCountBefore,
    vlainaAlignmentBlankLineCountAfter: blankLineCountAfter,
    vlainaAlignmentCommentPlacement: placement,
    ...(alignment === 'left'
      ? {}
      : {
          hProperties: {
            ...(node.data?.hProperties || {}),
            dataTextAlign: alignment,
            style: `text-align: ${alignment}`,
          },
        }),
  };
}

function visitAlignmentComments(node: AlignmentAwareMdastNode, markdown: string): void {
  if (!node.children?.length) {
    return;
  }

  const nextChildren: AlignmentAwareMdastNode[] = [];

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const childAlignment = child.type === 'html'
      ? extractTextAlignmentComment(child.value)
      : null;

    if (childAlignment) {
      const previousSibling = nextChildren[nextChildren.length - 1];
      const nextSibling = node.children[index + 1];
      const blankLineCountBefore = getBlankLineCountBetween(previousSibling, child, markdown);
      const blankLineCountAfter = getBlankLineCountBetween(child, nextSibling, markdown);
      let applied = false;

      if (isAlignableNode(previousSibling) && !isTextAlignment(previousSibling.align)) {
        applyAlignmentToNode(
          previousSibling,
          childAlignment,
          blankLineCountBefore,
          blankLineCountAfter,
          'after',
        );
        applied = true;
      } else if (isAlignableNode(nextSibling) && !isTextAlignment(nextSibling.align)) {
        applyAlignmentToNode(
          nextSibling,
          childAlignment,
          blankLineCountBefore,
          blankLineCountAfter,
          'before',
        );
        applied = true;
      }

      if (!applied) {
        child.data = {
          ...(child.data || {}),
          vlainaAlignmentBlankLineCountBefore: blankLineCountBefore,
          vlainaAlignmentBlankLineCountAfter: blankLineCountAfter,
        };
        nextChildren.push(child);
      }
      continue;
    }

    visitAlignmentComments(child, markdown);
    nextChildren.push(child);
  }

  node.children = nextChildren;
}

export function applyAlignmentCommentsToTree(
  tree: AlignmentAwareMdastNode,
  markdown = '',
): void {
  if (!canTransformMarkdownAst(tree)) {
    return;
  }

  visitAlignmentComments(tree, markdown);
}

export function remarkBlockAlignment() {
  return (tree: unknown, file?: { value?: unknown }) => {
    applyAlignmentCommentsToTree(
      tree as AlignmentAwareMdastNode,
      typeof file?.value === 'string' ? file.value : '',
    );
  };
}
