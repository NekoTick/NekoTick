import { Fragment } from '@milkdown/kit/prose/model';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  isEditableMarkdownBlankLineNode,
  isMarkdownBlankLinePlaceholderNode,
  MARKDOWN_BLANK_LINE_VALUE,
} from './markdownBlankLineShared';

function createHardBreak(view: EditorView): ProseNode | null {
  const hardBreakType = view.state.schema.nodes.hardbreak ?? view.state.schema.nodes.hard_break;
  return hardBreakType?.create() ?? null;
}

function createPlainTextFragmentFromFrontmatter(view: EditorView, node: ProseNode): Fragment {
  const frontmatterText = node.textContent.replace(/\r\n?/g, '\n');
  const lines = frontmatterText.length > 0 ? frontmatterText.split('\n') : [''];
  const paragraphType = view.state.schema.nodes.paragraph;
  if (!paragraphType) return Fragment.empty;

  const content: ProseNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      const hardBreak = createHardBreak(view);
      if (hardBreak) {
        content.push(hardBreak);
      }
    }
    if (line.length > 0) {
      content.push(view.state.schema.text(line));
    }
  });

  return Fragment.from(paragraphType.create(null, content));
}

export function convertMovedFrontmatterToPlainText(
  view: EditorView,
  content: Fragment,
  targetPos: number,
): Fragment {
  if (targetPos === 0) return content;

  let converted = Fragment.empty;
  content.forEach((child) => {
    converted = converted.append(
      child.type.name === 'frontmatter'
        ? createPlainTextFragmentFromFrontmatter(view, child)
        : Fragment.from(child)
    );
  });
  return converted;
}

function isExplicitBlankLineNode(node: ProseNode): boolean {
  return isMarkdownBlankLinePlaceholderNode(node)
    || isEditableMarkdownBlankLineNode(node)
    || (node.type.name === 'paragraph' && node.content.size === 0);
}

function getTopLevelBoundaryNeighbors(
  doc: ProseNode,
  targetPos: number,
): { after: ProseNode | null; before: ProseNode | null } {
  let after: ProseNode | null = null;
  let before: ProseNode | null = null;
  let offset = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    if (offset + node.nodeSize <= targetPos) {
      before = node;
    } else if (after === null && offset >= targetPos) {
      after = node;
    }
    offset += node.nodeSize;
  }
  return { after, before };
}

export function addMovedFrontmatterParagraphBoundaries(
  view: EditorView,
  doc: ProseNode,
  content: Fragment,
  targetPos: number,
): { content: Fragment; contentTailOffset: number } {
  const htmlBlockType = view.state.schema.nodes.html_block;
  if (!htmlBlockType) {
    return { content, contentTailOffset: content.size };
  }

  const { after, before } = getTopLevelBoundaryNeighbors(doc, targetPos);
  let boundedContent = content;
  let leadingBoundarySize = 0;
  if (before && !isExplicitBlankLineNode(before)) {
    const blankLine = htmlBlockType.create({ value: MARKDOWN_BLANK_LINE_VALUE });
    boundedContent = Fragment.from(blankLine).append(boundedContent);
    leadingBoundarySize = blankLine.nodeSize;
  }
  const contentTailOffset = leadingBoundarySize + content.size;
  if (after && !isExplicitBlankLineNode(after)) {
    boundedContent = boundedContent.append(Fragment.from(
      htmlBlockType.create({ value: MARKDOWN_BLANK_LINE_VALUE }),
    ));
  }

  return { content: boundedContent, contentTailOffset };
}
