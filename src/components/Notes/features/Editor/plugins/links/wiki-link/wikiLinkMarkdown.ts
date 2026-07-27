import { remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import type { MdastNode } from '@/components/common/markdown/remarkNotesTypes';
import { findDelimitedTextMatches } from '@/components/common/markdown/delimitedMarkdown';
import {
  createMarkdownTextSliceNode,
  createMarkdownTextSourceMap,
} from '@/components/common/markdown/markdownSourcePosition';

export const MAX_WIKI_LINK_TEXT_CHARS = 512;

type WikiLinkNode = MdastNode & {
  target: string;
};

const WIKI_LINK_PATTERN = /(?<!!)\[\[([^\]|\n]{1,512})(?:\|([^\]\n]{1,512}))?\]\]/g;

function createWikiLinkNode(target: string, label: string): WikiLinkNode {
  return {
    type: 'wikiLink',
    target,
    children: [{ type: 'text', value: label }],
  };
}

function createReadonlyWikiLinkNode(_target: string, label: string): MdastNode {
  return {
    type: 'link',
    url: '',
    data: {
      hName: 'span',
      hProperties: { className: ['internal-link', 'wiki-link'] },
    },
    children: [{ type: 'text', value: label }],
  } as MdastNode;
}

function transformWikiLinksWithFactory(
  tree: MdastNode,
  markdown: string,
  createNode: (target: string, label: string) => MdastNode,
): void {
  const visit = (node: MdastNode): void => {
    if (node.type === 'link' || node.type === 'linkReference') return;
    if (!node.children) return;

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child.type !== 'text' || !child.value) {
        visit(child);
        continue;
      }

      const matches = findDelimitedTextMatches(child.value, WIKI_LINK_PATTERN, {
        markdown,
        position: child.position,
        openDelimiterLength: 2,
      });
      if (matches.length === 0) continue;

      const sourceMap = markdown
        ? createMarkdownTextSourceMap(child.value, markdown, child.position)
        : null;
      const replacements: MdastNode[] = [];
      let lastEnd = 0;
      for (const match of matches) {
        const source = child.value.slice(match.start, match.end);
        const parsed = WIKI_LINK_PATTERN.exec(source);
        WIKI_LINK_PATTERN.lastIndex = 0;
        const target = parsed?.[1]?.trim();
        const label = (parsed?.[2] ?? parsed?.[1])?.trim();
        if (!target || !label) continue;

        if (match.start > lastEnd) {
          replacements.push(createMarkdownTextSliceNode(child, sourceMap, lastEnd, match.start));
        }
        replacements.push(createNode(target, label));
        lastEnd = match.end;
      }

      if (replacements.length === 0) continue;
      if (lastEnd < child.value.length) {
        replacements.push(createMarkdownTextSliceNode(child, sourceMap, lastEnd, child.value.length));
      }
      node.children.splice(index, 1, ...replacements);
    }
  };

  visit(tree);
}

export function transformWikiLinks(tree: MdastNode, markdown = ''): void {
  transformWikiLinksWithFactory(tree, markdown, createWikiLinkNode);
}

export function transformReadonlyWikiLinks(tree: MdastNode, markdown = ''): void {
  transformWikiLinksWithFactory(tree, markdown, createReadonlyWikiLinkNode);
}

export function remarkWikiLinks() {
  return (tree: MdastNode, file?: { value?: unknown }) => {
    transformWikiLinks(tree, typeof file?.value === 'string' ? file.value : '');
  };
}

export function remarkReadonlyWikiLinks() {
  return (tree: MdastNode, file?: { value?: unknown }) => {
    transformReadonlyWikiLinks(tree, typeof file?.value === 'string' ? file.value : '');
  };
}

export const wikiLinkStringifyPlugin: MilkdownPlugin = (ctx) => {
  return () => {
    ctx.update(remarkStringifyOptionsCtx, (options) => ({
      ...options,
      handlers: {
        ...(options.handlers ?? {}),
        wikiLink: (node: WikiLinkNode, _parent: unknown, state: any, info: any) => {
          const target = node.target.trim().slice(0, MAX_WIKI_LINK_TEXT_CHARS);
          const label = state.containerPhrasing(node, info).trim();
          const aliasSeparator = state.stack?.includes('tableCell') ? '\\|' : '|';
          return label === target ? `[[${target}]]` : `[[${target}${aliasSeparator}${label}]]`;
        },
        wikiLinkSource: (node: MdastNode, _parent: unknown, state: any) => {
          const source = node.children?.map((child) => child.value ?? '').join('') ?? '';
          if (!state.stack?.includes('tableCell')) return source;

          const match = WIKI_LINK_PATTERN.exec(source);
          WIKI_LINK_PATTERN.lastIndex = 0;
          return match?.[2] === undefined
            ? source
            : `[[${match[1]}\\|${match[2].replaceAll('|', '\\|')}]]`;
        },
      },
    }));
  };
};
