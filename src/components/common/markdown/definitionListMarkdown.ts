import {
  isUnescapedMarkdownTextRange,
} from './delimitedMarkdown';
import { markEscapedMarkdownBlockSyntax } from './escapedBlockSyntax';
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
import {
  createDefinitionListNode,
  getDefinitionTermText,
  hasDefinitionDescriptionPrefix,
  isParagraph,
  type DefinitionListMdastNode,
} from './definitionListNodes';

export type { DefinitionListMdastNode } from './definitionListNodes';

function getDefinitionMarkerTextNode(
  node: DefinitionListMdastNode
): { node: DefinitionListMdastNode; index: number } | null {
  for (const child of node.children ?? []) {
    if (child.type !== 'text' || typeof child.value !== 'string') return null;
    const index = child.value.search(/\S/);
    if (index < 0) continue;
    return child.value[index] === ':' ? { node: child, index } : null;
  }

  return null;
}

function hasUnescapedDefinitionMarker(
  node: DefinitionListMdastNode,
  markdown = ''
): boolean {
  const marker = getDefinitionMarkerTextNode(node);
  return !!marker && isUnescapedMarkdownTextRange(marker.node.value || '', marker.index, 1, {
    markdown,
    position: marker.node.position,
  });
}

function hasEscapedDefinitionMarker(
  node: DefinitionListMdastNode,
  markdown = ''
): boolean {
  const marker = getDefinitionMarkerTextNode(node);
  return !!marker && !isUnescapedMarkdownTextRange(marker.node.value || '', marker.index, 1, {
    markdown,
    position: marker.node.position,
  });
}

function splitCombinedDefinitionParagraph(
  node: DefinitionListMdastNode,
  markdown = ''
): DefinitionListMdastNode | null {
  if (!isParagraph(node) || !node.children?.length) return null;

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (child.type !== 'text' || typeof child.value !== 'string') continue;

    const match = /^([^\n]*)\n:\s+([\s\S]*)$/.exec(child.value);
    if (!match) continue;
    if (!isUnescapedMarkdownTextRange(child.value, match[1].length + 1, 1, {
      markdown,
      position: child.position,
    })) {
      markEscapedMarkdownBlockSyntax(node, 'definitionListDescription');
      return null;
    }

    const sourceMap = markdown
      ? createMarkdownTextSourceMap(child.value, markdown, child.position)
      : null;
    const termChildren = [
      ...node.children.slice(0, index),
      ...(match[1]
        ? [createMarkdownTextSliceNode(child, sourceMap, 0, match[1].length)]
        : []),
    ];
    const descStart = match[0].length - match[2].length;
    const descriptionChildren = [
      ...(match[2]
        ? [createMarkdownTextSliceNode(child, sourceMap, descStart, match[0].length)]
        : []),
      ...node.children.slice(index + 1),
    ];
    const termText = getDefinitionTermText({ type: 'paragraph', children: termChildren });
    if (
      !termText
      || termText.length >= 80
      || hasMultilineHtmlChild(termChildren)
      || hasSourceLineBreak(termChildren)
      || descriptionChildren.length === 0
    ) return null;

    return createDefinitionListNode(termChildren, descriptionChildren, markdown);
  }

  return null;
}

function getDefinitionBlankLineCount(
  term: DefinitionListMdastNode,
  description: DefinitionListMdastNode,
  markdown: string
): number {
  const termEnd = term.position?.end?.offset;
  const descriptionStart = description.position?.start?.offset;
  if (
    !markdown
    || typeof termEnd !== 'number'
    || !Number.isInteger(termEnd)
    || typeof descriptionStart !== 'number'
    || !Number.isInteger(descriptionStart)
    || termEnd < 0
    || descriptionStart < termEnd
    || descriptionStart > markdown.length
  ) {
    return 1;
  }

  const lineBreakCount = markdown
    .slice(termEnd, descriptionStart)
    .match(/\r\n|\r|\n/g)?.length ?? 0;
  return Math.max(0, lineBreakCount - 1);
}

function hasMultilineHtmlChild(children: readonly DefinitionListMdastNode[]): boolean {
  const stack = [...children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === 'html' && typeof node.value === 'string' && node.value.includes('\n')) {
      return true;
    }
    stack.push(...(node.children ?? []));
  }
  return false;
}

function hasSourceLineBreak(children: readonly DefinitionListMdastNode[]): boolean {
  const stack = [...children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (typeof node.value === 'string' && /\r|\n/.test(node.value)) {
      return true;
    }
    stack.push(...(node.children ?? []));
  }
  return false;
}

export function applyDefinitionListsToTree(
  tree: DefinitionListMdastNode,
  markdown = '',
  growthBudget: MarkdownAstGrowthBudget = createMarkdownAstGrowthBudget(tree)
): void {
  if (!canTransformMarkdownAst(tree)) {
    return;
  }

  function visit(node: DefinitionListMdastNode): void {
    if (!node.children?.length) return;

    for (let index = 0; index < node.children.length; index += 1) {
      const child = node.children[index];
      const canReplaceAtIndex = node.type !== 'listItem' || index > 0;
      const combined = canReplaceAtIndex ? splitCombinedDefinitionParagraph(child, markdown) : null;
      if (combined) {
        if (!growthBudget.consume(countMarkdownAstNodes(combined) - countMarkdownAstNodes(child))) {
          continue;
        }
        node.children.splice(index, 1, combined);
        continue;
      }

      const next = node.children[index + 1];
      const termText = isParagraph(child) ? getDefinitionTermText(child) : '';
      const hasDescriptionPrefix = hasDefinitionDescriptionPrefix(next);
      if (hasDescriptionPrefix && hasEscapedDefinitionMarker(next, markdown)) {
        markEscapedMarkdownBlockSyntax(next, 'definitionListDescription');
      }
      if (
        canReplaceAtIndex &&
        termText.length > 0 &&
        termText.length < 80 &&
        hasDescriptionPrefix &&
        hasUnescapedDefinitionMarker(next, markdown) &&
        child.children &&
        !hasMultilineHtmlChild(child.children) &&
        next?.children
      ) {
        const definitionList = createDefinitionListNode(
          child.children,
          next.children,
          markdown,
          getDefinitionBlankLineCount(child, next, markdown)
        );
        if (!growthBudget.consume(
          countMarkdownAstNodes(definitionList) - countMarkdownAstNodeList([child, next])
        )) {
          continue;
        }
        node.children.splice(index, 2, definitionList);
        continue;
      }

      visit(child);
    }
  }

  visit(tree);
}

export function remarkDefinitionLists() {
  return (tree: DefinitionListMdastNode, file?: { value?: unknown }) => {
    applyDefinitionListsToTree(tree, typeof file?.value === 'string' ? file.value : '');
  };
}
