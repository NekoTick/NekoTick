import {
  findDelimitedTextMatches,
  isUnescapedMarkdownTextRange,
} from './delimitedMarkdown';
import {
  countMarkdownAstNodes,
  countMarkdownAstNodeList,
  createMarkdownAstGrowthBudget,
  type MarkdownAstGrowthBudget,
} from './markdownAstBudget';
import {
  createMarkdownTextSliceNode,
  createMarkdownTextSourceMap,
} from './markdownSourcePosition';
import { createInlineElementNode } from './remarkInlineMarkNodes';
import type { MdastNode } from './remarkNotesTypes';

export function replaceDelimitedTextMark(
  tree: MdastNode,
  type: string,
  regex: RegExp,
  markdown: string,
  delimiterLength: number,
  growthBudget: MarkdownAstGrowthBudget = createMarkdownAstGrowthBudget(tree)
) {
  function visit(node: MdastNode, parent?: MdastNode, index?: number): void {
    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        visit(node.children[i], node, i);
      }
    }

    if (node.type !== 'text' || !node.value || !parent || index === undefined) return;

    const matches = findDelimitedTextMatches(node.value, regex, {
      markdown,
      position: node.position,
      openDelimiterLength: delimiterLength,
    });
    if (matches.length === 0) return;

    const sourceMap = markdown
      ? createMarkdownTextSourceMap(node.value, markdown, node.position)
      : null;
    const nextChildren: MdastNode[] = [];
    let lastEnd = 0;

    for (const item of matches) {
      if (item.start > lastEnd) {
        nextChildren.push(createMarkdownTextSliceNode(node, sourceMap, lastEnd, item.start));
      }

      nextChildren.push(createInlineElementNode(type, [
        createMarkdownTextSliceNode(node, sourceMap, item.start + delimiterLength, item.end - delimiterLength),
      ]));
      lastEnd = item.end;
    }

    if (lastEnd < node.value.length) {
      nextChildren.push(createMarkdownTextSliceNode(node, sourceMap, lastEnd, node.value.length));
    }

    if (!growthBudget.consume(countMarkdownAstNodeList(nextChildren) - 1)) return;
    parent.children?.splice(index, 1, ...nextChildren);
  }

  visit(tree);
}

const MAX_DELIMITED_CONTAINER_CHILDREN = 2048;

function findUnescapedDelimiter(
  node: MdastNode,
  delimiter: string,
  markdown: string,
  from: number,
): number {
  const value = node.value ?? '';
  let index = value.indexOf(delimiter, from);
  while (index >= 0) {
    if (isUnescapedMarkdownTextRange(value, index, delimiter.length, {
      markdown,
      position: node.position,
    })) return index;
    index = value.indexOf(delimiter, index + delimiter.length);
  }
  return -1;
}

export function replaceDelimitedContainerMark(
  tree: MdastNode,
  type: string,
  delimiter: string,
  markdown: string,
  growthBudget: MarkdownAstGrowthBudget = createMarkdownAstGrowthBudget(tree),
): void {
  function visit(node: MdastNode): void {
    if (!node.children?.length) return;
    for (const child of node.children) visit(child);
    if (node.children.length > MAX_DELIMITED_CONTAINER_CHILDREN) return;

    for (let openChildIndex = 0; openChildIndex < node.children.length; openChildIndex += 1) {
      const openChild = node.children[openChildIndex];
      if (openChild.type !== 'text' || !openChild.value) continue;
      const openIndex = findUnescapedDelimiter(openChild, delimiter, markdown, 0);
      if (openIndex < 0) continue;

      for (let closeChildIndex = openChildIndex + 1; closeChildIndex < node.children.length; closeChildIndex += 1) {
        const closeChild = node.children[closeChildIndex];
        if (closeChild.type !== 'text' || !closeChild.value) continue;
        const closeIndex = findUnescapedDelimiter(closeChild, delimiter, markdown, 0);
        if (closeIndex < 0) continue;

        const openSourceMap = markdown
          ? createMarkdownTextSourceMap(openChild.value, markdown, openChild.position)
          : null;
        const closeSourceMap = markdown
          ? createMarkdownTextSourceMap(closeChild.value, markdown, closeChild.position)
          : null;
        const content: MdastNode[] = [];
        if (openIndex + delimiter.length < openChild.value.length) {
          content.push(createMarkdownTextSliceNode(
            openChild,
            openSourceMap,
            openIndex + delimiter.length,
            openChild.value.length,
          ));
        }
        content.push(...node.children.slice(openChildIndex + 1, closeChildIndex));
        if (closeIndex > 0) {
          content.push(createMarkdownTextSliceNode(closeChild, closeSourceMap, 0, closeIndex));
        }
        const firstText = content[0]?.type === 'text' ? content[0].value ?? '' : '';
        const lastText = content.at(-1)?.type === 'text' ? content.at(-1)?.value ?? '' : '';
        if ((!firstText && content.length === 0) || /^\s/.test(firstText) || /\s$/.test(lastText)) {
          break;
        }

        const replacement: MdastNode[] = [];
        if (openIndex > 0) {
          replacement.push(createMarkdownTextSliceNode(openChild, openSourceMap, 0, openIndex));
        }
        replacement.push(createInlineElementNode(type, content));
        const closeEnd = closeIndex + delimiter.length;
        if (closeEnd < closeChild.value.length) {
          replacement.push(createMarkdownTextSliceNode(
            closeChild,
            closeSourceMap,
            closeEnd,
            closeChild.value.length,
          ));
        }

        const replaced = node.children.slice(openChildIndex, closeChildIndex + 1);
        const growth = countMarkdownAstNodeList(replacement)
          - replaced.reduce((count, child) => count + countMarkdownAstNodes(child), 0);
        if (!growthBudget.consume(growth)) return;
        node.children.splice(openChildIndex, replaced.length, ...replacement);
        openChildIndex = Math.max(-1, openChildIndex - 1);
        break;
      }
    }
  }

  visit(tree);
}

export function replaceSingleTildeDeleteMark(tree: MdastNode, markdown: string) {
  function visit(node: MdastNode, parent?: MdastNode, index?: number): void {
    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        visit(node.children[i], node, i);
      }
    }

    if (node.type !== 'delete' || !parent || index === undefined) return;

    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (typeof start !== 'number' || typeof end !== 'number') return;

    const source = markdown.slice(start, end);
    if (!source.startsWith('~') || source.startsWith('~~') || !source.endsWith('~') || source.endsWith('~~')) {
      return;
    }

    parent.children?.splice(index, 1, createInlineElementNode('subscript', node.children ?? []));
  }

  visit(tree);
}
