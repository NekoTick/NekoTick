import { $remark } from '@milkdown/kit/utils';
import { canTransformMarkdownAst } from '@/components/common/markdown/markdownAstBudget';

interface PositionedMarkdownNode {
  type?: string;
  children?: PositionedMarkdownNode[];
  data?: Record<string, unknown>;
  position?: {
    end?: { offset?: number };
    start?: { offset?: number };
  };
}

export const SOURCE_TIGHT_HTML_BEFORE_ATTR = 'vlainaSourceTightBefore';
export const SOURCE_HTML_BLANK_LINE_COUNT_AFTER_ATTR = 'vlainaSourceHtmlBlankLineCountAfter';

export function markSourceTightHtmlBoundaries(
  tree: PositionedMarkdownNode,
  markdown: string,
): void {
  if (!markdown || !canTransformMarkdownAst(tree)) return;

  const pending = [tree];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    if (node.type === 'html') {
      const blankLineCountAfter = getSourceBlankLineCountAfter(node, markdown);
      const sourceTightBefore = isSourceTightBlockStart(node, markdown);
      if (sourceTightBefore || blankLineCountAfter !== undefined) {
        node.data = {
          ...(node.data || {}),
          ...(sourceTightBefore
            ? { [SOURCE_TIGHT_HTML_BEFORE_ATTR]: true }
            : {}),
          ...(blankLineCountAfter === undefined
            ? {}
            : { [SOURCE_HTML_BLANK_LINE_COUNT_AFTER_ATTR]: blankLineCountAfter }),
        };
      }
    }
    if (node.children) pending.push(...node.children);
  }
}

function getSourceBlankLineCountAfter(
  node: PositionedMarkdownNode,
  markdown: string,
): number | undefined {
  const end = node.position?.end?.offset;
  if (typeof end !== 'number' || !Number.isSafeInteger(end) || end < 0 || end >= markdown.length) {
    return undefined;
  }

  const after = markdown.slice(end);
  const firstLineBreak = /^(?:\r\n|\r|\n)/.exec(after)?.[0];
  if (!firstLineBreak) return undefined;

  let blankLineCount = 0;
  let cursor = firstLineBreak.length;
  while (cursor < after.length) {
    const lineBreak = /\r\n|\r|\n/.exec(after.slice(cursor));
    if (!lineBreak) break;
    const line = after.slice(cursor, cursor + lineBreak.index);
    if (!isMarkdownContainerBlankLine(line)) break;
    blankLineCount += 1;
    cursor += lineBreak.index + lineBreak[0].length;
  }
  return blankLineCount;
}

function isMarkdownContainerBlankLine(line: string): boolean {
  return /^[ \t]*$/.test(line) || /^(?:[ \t]*>[ \t]*)+$/.test(line);
}

function isSourceTightBlockStart(node: PositionedMarkdownNode, markdown: string): boolean {
  const start = node.position?.start?.offset;
  if (typeof start !== 'number' || !Number.isSafeInteger(start) || start <= 0 || start > markdown.length) {
    return false;
  }

  const preceding = markdown.slice(0, start);
  const lineStart = preceding.lastIndexOf('\n') + 1;
  if (preceding.slice(lineStart).trim() !== '' || lineStart === 0) return false;

  const previousLineEnd = lineStart - 1;
  const previousLineStart = preceding.lastIndexOf('\n', previousLineEnd - 1) + 1;
  return preceding.slice(previousLineStart, previousLineEnd).trim() !== '';
}

export function remarkSourceTightHtmlBoundaries() {
  return (tree: PositionedMarkdownNode, file?: { value?: unknown }) => {
    markSourceTightHtmlBoundaries(
      tree,
      typeof file?.value === 'string' ? file.value : '',
    );
  };
}

export const remarkSourceTightHtmlBoundariesPlugin = $remark(
  'remarkSourceTightHtmlBoundaries',
  () => remarkSourceTightHtmlBoundaries,
);
