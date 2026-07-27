import type { MarkdownSourcePosition } from './delimitedMarkdown';
import {
  createMarkdownTextSourceMap,
  replaceMarkdownTextNodeWithSlice,
} from './markdownSourcePosition';

export interface DefinitionListMdastNode {
  type: string;
  value?: string;
  children?: DefinitionListMdastNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
    vlainaEscapedBlockSyntax?: string;
    vlainaDefinitionBlankLineCount?: number;
  };
  position?: MarkdownSourcePosition;
}

const MAX_DEFINITION_TERM_CHARS = 80;
const MAX_DEFINITION_DESC_PREFIX_CHARS = 2;

export function isParagraph(node: DefinitionListMdastNode | undefined): node is DefinitionListMdastNode {
  return node?.type === 'paragraph';
}

function getNodeTextPrefix(node: DefinitionListMdastNode, maxChars: number): string {
  const parts: string[] = [];
  const stack = [node];
  let remainingChars = maxChars;

  while (stack.length > 0 && remainingChars > 0) {
    const current = stack.pop()!;
    if (typeof current.value === 'string') {
      const value = current.value.slice(0, remainingChars);
      parts.push(value);
      remainingChars -= value.length;
      continue;
    }

    const children = current.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }

  return parts.join('');
}

function getTrimStartNodeTextPrefix(node: DefinitionListMdastNode, maxChars: number): string {
  const parts: string[] = [];
  const stack = [node];
  let remainingChars = maxChars;
  let trimming = true;

  while (stack.length > 0 && remainingChars > 0) {
    const current = stack.pop()!;
    if (typeof current.value === 'string') {
      const source = trimming ? current.value.trimStart() : current.value;
      if (source.length === 0) {
        continue;
      }

      trimming = false;
      const value = source.slice(0, remainingChars);
      parts.push(value);
      remainingChars -= value.length;
      continue;
    }

    const children = current.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }

  return parts.join('');
}

export function getDefinitionTermText(node: DefinitionListMdastNode): string {
  return getNodeTextPrefix(node, MAX_DEFINITION_TERM_CHARS).trim();
}

export function hasDefinitionDescriptionPrefix(
  node: DefinitionListMdastNode | undefined
): node is DefinitionListMdastNode {
  return isParagraph(node) && getTrimStartNodeTextPrefix(node, MAX_DEFINITION_DESC_PREFIX_CHARS) === ': ';
}

function replaceTextNodeWithSlice(
  node: DefinitionListMdastNode,
  markdown: string,
  start: number,
  end: number
): void {
  const sourceMap = markdown
    ? createMarkdownTextSourceMap(node.value || '', markdown, node.position)
    : null;
  replaceMarkdownTextNodeWithSlice(node, sourceMap, start, end);
}

function stripDefinitionPrefix(
  children: readonly DefinitionListMdastNode[],
  markdown = ''
): DefinitionListMdastNode[] {
  const nextChildren = children.map((child) => ({ ...child }));

  let strippingPrefix = true;
  let strippingPostMarkerWhitespace = false;
  for (const child of nextChildren) {
    if (child.type !== 'text' || typeof child.value !== 'string') {
      if (strippingPostMarkerWhitespace) {
        strippingPostMarkerWhitespace = false;
      }
      continue;
    }

    if (strippingPrefix) {
      const markerMatch = /^(\s*):/.exec(child.value);
      if (!markerMatch) {
        if (/^\s*$/.test(child.value)) {
          replaceTextNodeWithSlice(child, markdown, child.value.length, child.value.length);
          continue;
        }
        return nextChildren;
      }

      replaceTextNodeWithSlice(child, markdown, markerMatch[0].length, child.value.length);
      strippingPrefix = false;
      strippingPostMarkerWhitespace = true;
    }

    if (strippingPostMarkerWhitespace) {
      const whitespaceLength = child.value.match(/^\s*/)?.[0].length ?? 0;
      if (whitespaceLength > 0) {
        replaceTextNodeWithSlice(child, markdown, whitespaceLength, child.value.length);
      }
      if (child.value.length > 0) {
        strippingPostMarkerWhitespace = false;
      }
    }
  }
  return nextChildren;
}

export function createDefinitionListNode(
  termChildren: readonly DefinitionListMdastNode[],
  descChildren: readonly DefinitionListMdastNode[],
  markdown = '',
  blankLineCount = 0
): DefinitionListMdastNode {
  return {
    type: 'definitionList',
    data: {
      hName: 'dl',
      hProperties: { className: ['definition-list'] },
    },
    children: [
      {
        type: 'definitionTerm',
        data: {
          hName: 'dt',
          hProperties: { className: ['definition-term'] },
        },
        children: [...termChildren],
      },
      {
        type: 'definitionDescription',
        data: {
          hName: 'dd',
          hProperties: { className: ['definition-desc'] },
          vlainaDefinitionBlankLineCount: blankLineCount,
        },
        children: [{
          type: 'paragraph',
          children: stripDefinitionPrefix(descChildren, markdown),
        }],
      },
    ],
  };
}
