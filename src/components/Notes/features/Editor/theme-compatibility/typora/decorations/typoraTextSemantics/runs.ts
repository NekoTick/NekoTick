import { hasAnyMark, hasMark, VLOOK_HIGHLIGHT_MARKS } from './marks';
import type { InlineTextRun } from './types';

export const MAX_THEME_COMPAT_TEXT_CONTENT_CHARS = 4096;

function isVisibleTextNode(node: any): boolean {
  return Boolean(node?.isText && node.text && !hasMark(node, 'markdownSyntax'));
}

export function getInlineTextRuns(node: any, pos: number): InlineTextRun[] {
  const runs: InlineTextRun[] = [];
  if (!node.isTextblock || typeof node.forEach !== 'function') {
    return runs;
  }

  node.forEach((child: any, offset: number) => {
    if (!child.isText || !child.text || typeof child.nodeSize !== 'number') return;
    const from = pos + 1 + offset;
    const to = from + child.nodeSize;
    runs.push({
      from,
      to,
      text: child.text ?? '',
      isMarkdownSyntax: hasMark(child, 'markdownSyntax'),
      hasEmphasis: hasMark(child, 'emphasis'),
      hasInlineCode: hasMark(child, 'inlineCode'),
      hasStrong: hasMark(child, 'strong'),
      hasSubscript: hasMark(child, 'subscript'),
      hasSuperscript: hasMark(child, 'superscript'),
      hasUnderline: hasMark(child, 'underline'),
      hasVlookHighlight: hasAnyMark(child, VLOOK_HIGHLIGHT_MARKS),
    });
  });

  return runs;
}

export function getTextContent(node: any): string {
  if (typeof node?.descendants === 'function') {
    let text = '';
    node.descendants((child: any) => {
      if (isVisibleTextNode(child)) {
        if (text.length < MAX_THEME_COMPAT_TEXT_CONTENT_CHARS) {
          text += child.text.slice(0, MAX_THEME_COMPAT_TEXT_CONTENT_CHARS - text.length);
        }
      } else if (child?.isBlock && text && !text.endsWith('\n')) {
        text += '\n';
      }
      return true;
    });
    return text.slice(0, MAX_THEME_COMPAT_TEXT_CONTENT_CHARS);
  }

  const contentSize = node?.content?.size;
  if (typeof node?.textBetween === 'function' && typeof contentSize === 'number') {
    const text = node.textBetween(0, Math.min(contentSize, MAX_THEME_COMPAT_TEXT_CONTENT_CHARS), '\n', '\n');
    return contentSize > MAX_THEME_COMPAT_TEXT_CONTENT_CHARS && text.trim() === '' ? ' ' : text;
  }

  return typeof node.textContent === 'string'
    ? node.textContent.slice(0, MAX_THEME_COMPAT_TEXT_CONTENT_CHARS)
    : '';
}
