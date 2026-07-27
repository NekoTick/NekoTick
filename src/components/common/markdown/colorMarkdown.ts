import { decodeMarkdownHtmlText } from '@/lib/notes/markdown/markdownHtmlText';
import { findDelimitedTextMatches, type MarkdownSourcePosition } from './delimitedMarkdown';
import {
  canTransformMarkdownAst,
  countMarkdownAstNodeList,
  countMarkdownAstNodes,
  createMarkdownAstGrowthBudget,
  type MarkdownAstGrowthBudget,
} from './markdownAstBudget';
import {
  createMarkdownTextSliceNode,
  createMarkdownTextSourceMap,
} from './markdownSourcePosition';

export interface ColorMarkdownMdastNode {
  type: string;
  value?: string;
  children?: ColorMarkdownMdastNode[];
  color?: string;
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
  position?: MarkdownSourcePosition;
}

export const MAX_INLINE_COLOR_HTML_CHARS = 8192;
const MAX_INLINE_COLOR_STYLE_CHARS = 1024;
const MAX_INLINE_COLOR_TEXT_CHARS = 8192;
const MAX_INLINE_COLOR_VALUE_CHARS = 80;

export function extractCssColorDeclaration(style: string, property: string): string | null {
  if (style.length > MAX_INLINE_COLOR_STYLE_CHARS) return null;

  for (const declaration of style.split(';')) {
    const separatorIndex = declaration.indexOf(':');
    if (separatorIndex < 0) continue;
    const name = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const value = declaration.slice(separatorIndex + 1).trim();
    if (name === property && value) return sanitizeCssColorValue(value);
  }
  return null;
}

export function sanitizeCssColorValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length > MAX_INLINE_COLOR_VALUE_CHARS) return null;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_INLINE_COLOR_VALUE_CHARS ||
    /[\u0000-\u001F\u007F;{}<>"'\\]/.test(trimmed) ||
    /\b(?:url|expression|import)\s*\(/i.test(trimmed)
  ) {
    return null;
  }

  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed;
  if (/^(?:rgb|rgba|hsl|hsla)\(\s*[-+.\d%]+\s*(?:,\s*[-+.\d%]+\s*){2,3}\)$/i.test(trimmed)) return trimmed;
  if (/^var\(--[A-Za-z0-9_-]+\)$/.test(trimmed)) return trimmed;
  if (/^[A-Za-z]+$/.test(trimmed)) return trimmed;
  return null;
}

export function createUnderlineMdastNode(children: ColorMarkdownMdastNode[]): ColorMarkdownMdastNode {
  return {
    type: 'underline',
    children,
    data: { hName: 'u', hProperties: { className: ['underline'] } },
  };
}

export function createTextColorMdastNode(
  color: string,
  children: ColorMarkdownMdastNode[]
): ColorMarkdownMdastNode {
  return {
    type: 'textColor',
    color,
    children,
    data: {
      hName: 'span',
      hProperties: {
        dataTextColor: color,
        style: `color: ${color}`,
      },
    },
  };
}

export function createBgColorMdastNode(
  color: string,
  children: ColorMarkdownMdastNode[]
): ColorMarkdownMdastNode {
  return {
    type: 'bgColor',
    color,
    children,
    data: {
      hName: 'mark',
      hProperties: {
        dataBgColor: color,
        style: `background-color: ${color}`,
      },
    },
  };
}

function parseInlineColorHtml(value: string): ColorMarkdownMdastNode | null {
  if (value.length > MAX_INLINE_COLOR_HTML_CHARS) return null;

  const underlineMatch = value.match(/^<u>([\s\S]*?)<\/u>$/i);
  if (underlineMatch) {
    if (containsRawHtmlTag(underlineMatch[1])) return null;
    return createUnderlineMdastNode([{ type: 'text', value: decodeMarkdownHtmlText(underlineMatch[1]) }]);
  }

  const textColorMatch = value.match(/^<span\b[^>]*\bstyle=["']([^"']+)["'][^>]*>([\s\S]*?)<\/span>$/i);
  if (textColorMatch) {
    if (containsRawHtmlTag(textColorMatch[2])) return null;
    const color = extractCssColorDeclaration(textColorMatch[1], 'color');
    if (!color) return null;
    return createTextColorMdastNode(color, [{ type: 'text', value: decodeMarkdownHtmlText(textColorMatch[2]) }]);
  }

  const bgColorMatch = value.match(/^<mark\b[^>]*\bstyle=["']([^"']+)["'][^>]*>([\s\S]*?)<\/mark>$/i);
  if (bgColorMatch) {
    if (containsRawHtmlTag(bgColorMatch[2])) return null;
    const color = extractCssColorDeclaration(bgColorMatch[1], 'background-color');
    if (!color) return null;
    return createBgColorMdastNode(color, [{ type: 'text', value: decodeMarkdownHtmlText(bgColorMatch[2]) }]);
  }

  return null;
}

export function containsRawHtmlTag(value: string): boolean {
  if (value.length > MAX_INLINE_COLOR_TEXT_CHARS) return true;

  return (
    /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s[^<>]*)?>/.test(value) ||
    /&lt;\/?[A-Za-z][A-Za-z0-9:-]*(?:\s[^&<>]*)?&gt;/i.test(value)
  );
}

function parseSplitInlineColorHtmlMark(
  children: ColorMarkdownMdastNode[],
  index: number
): ColorMarkdownMdastNode | null {
  const open = children[index];
  const text = children[index + 1];
  const close = children[index + 2];
  if (
    open?.type !== 'html' ||
    text?.type !== 'text' ||
    close?.type !== 'html' ||
    typeof open.value !== 'string' ||
    typeof text.value !== 'string' ||
    typeof close.value !== 'string'
  ) {
    return null;
  }
  const parsed = parseInlineColorHtml(`${open.value}${text.value}${close.value}`);
  if (!parsed) return null;

  return {
    ...parsed,
    children: [{ ...text, value: decodeMarkdownHtmlText(text.value) }],
  };
}

export function replaceInlineColorHtmlMark(
  tree: ColorMarkdownMdastNode,
  growthBudget: MarkdownAstGrowthBudget = createMarkdownAstGrowthBudget(tree)
): void {
  if (!canTransformMarkdownAst(tree)) return;

  function visit(node: ColorMarkdownMdastNode): void {
    if (!node.children?.length) return;

    for (let index = 0; index < node.children.length; index += 1) {
      const child = node.children[index];
      if (child.type === 'html' && typeof child.value === 'string') {
        const singleNode = parseInlineColorHtml(child.value.trim());
        const splitNode = singleNode ? null : parseSplitInlineColorHtmlMark(node.children, index);
        const nextNode = singleNode ?? splitNode;
        if (nextNode) {
          const replacedNodeCount = splitNode ? 3 : 1;
          const additionalNodes = countMarkdownAstNodes(nextNode) - replacedNodeCount;
          if (!growthBudget.consume(additionalNodes)) {
            continue;
          }
          node.children.splice(index, splitNode ? 3 : 1, nextNode);
          continue;
        }
      }
      visit(child);
    }
  }

  visit(tree);
}

export function remarkInlineColorHtml() {
  return (tree: ColorMarkdownMdastNode) => {
    replaceInlineColorHtmlMark(tree);
  };
}

export function replaceUnderlineMarkdown(
  tree: ColorMarkdownMdastNode,
  markdown = '',
  growthBudget: MarkdownAstGrowthBudget = createMarkdownAstGrowthBudget(tree)
): void {
  if (!canTransformMarkdownAst(tree)) return;

  const underlineRegex = /(?<!\+)\+\+([^+\s](?:[^+]*?[^+\s])?)\+\+(?!\+)/g;

  function visitNode(node: ColorMarkdownMdastNode, parent?: ColorMarkdownMdastNode, index?: number): void {
    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        visitNode(node.children[i], node, i);
      }
    }

    if (node.type !== 'text' || !node.value || !parent || index === undefined) return;

    const matches = findDelimitedTextMatches(node.value, underlineRegex, {
      markdown,
      position: node.position,
      openDelimiterLength: 2,
    });
    if (matches.length === 0) return;

    const sourceMap = markdown
      ? createMarkdownTextSourceMap(node.value, markdown, node.position)
      : null;
    const nextNodes: ColorMarkdownMdastNode[] = [];
    let lastEnd = 0;

    for (const item of matches) {
      if (item.start > lastEnd) {
        nextNodes.push(createMarkdownTextSliceNode(node, sourceMap, lastEnd, item.start));
      }
      nextNodes.push(createUnderlineMdastNode([
        createMarkdownTextSliceNode(node, sourceMap, item.start + 2, item.end - 2),
      ]));
      lastEnd = item.end;
    }

    if (lastEnd < node.value.length) {
      nextNodes.push(createMarkdownTextSliceNode(node, sourceMap, lastEnd, node.value.length));
    }

    if (!growthBudget.consume(countMarkdownAstNodeList(nextNodes) - 1)) return;
    parent.children?.splice(index, 1, ...nextNodes);
  }

  visitNode(tree);
}

export function remarkUnderline() {
  return (tree: ColorMarkdownMdastNode, file?: { value?: unknown }) => {
    replaceUnderlineMarkdown(tree, typeof file?.value === 'string' ? file.value : '');
  };
}
