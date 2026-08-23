import {
  GFM_BLOCK_HTML_TEXT_TAGS,
  HTML_VOID_TEXT_TAGS,
  MAX_INLINE_HTML_CONTAINER_CHILDREN,
} from './remarkHtmlConstants';
import type { MdastNode } from './remarkNotesTypes';

const PLAIN_UNCLOSED_HTML_BLOCK_TEXT_PATTERN =
  /^(?: {0,3})<([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*)?>(?:[^<]*)$/;
const PLAIN_EMPTY_PAIRED_HTML_TEXT_PATTERN =
  /^(?: {0,3})<([A-Za-z][A-Za-z0-9-]*)\s*>\s*<\/\1\s*>$/i;
const PLAIN_EMPTY_HTML_OPEN_TEXT_PATTERN =
  /^<([A-Za-z][A-Za-z0-9-]*)\s*>$/i;
const PLAIN_EMPTY_HTML_CLOSE_TEXT_PATTERN =
  /^<\/([A-Za-z][A-Za-z0-9-]*)\s*>$/i;
const HTML_OPEN_TAG_TEXT_PATTERN =
  /^<([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*)?>$/i;
const INLINE_EMBEDDED_HTML_EXAMPLE_PATTERN =
  /^<(video|audio|iframe)\b[^>\n]*>[^<\n]*<\/\1>$|^<(img|source|track|video|audio|iframe)\b[^>\n]*\/?>$/i;
const INLINE_EMBEDDED_HTML_EXAMPLE_TAGS = new Set([
  'audio',
  'iframe',
  'img',
  'source',
  'track',
  'video',
]);
const INCOMPLETE_HTML_TAG_FRAGMENT_PATTERN = /<\/?[A-Za-z][^<>]*(?=<|$)/;

function isIncompleteHtmlTagFragment(value: string | null | undefined): value is string {
  return Boolean(value && !value.includes('\n') && INCOMPLETE_HTML_TAG_FRAGMENT_PATTERN.test(value));
}

function isPlainUnclosedHtmlBlockText(value: string | null | undefined): value is string {
  if (!value || value.includes('\n')) return false;
  const emptyPairTagName = PLAIN_EMPTY_PAIRED_HTML_TEXT_PATTERN.exec(value)?.[1]?.toLowerCase();
  if (emptyPairTagName) return !HTML_VOID_TEXT_TAGS.has(emptyPairTagName);

  const match = PLAIN_UNCLOSED_HTML_BLOCK_TEXT_PATTERN.exec(value);
  const tagName = match?.[1]?.toLowerCase();
  if (!tagName || !GFM_BLOCK_HTML_TEXT_TAGS.has(tagName)) return false;
  if (HTML_VOID_TEXT_TAGS.has(tagName)) return false;
  return !new RegExp(`</${tagName}\\s*>`, 'i').test(value) && !/\/>\s*$/.test(value);
}

function getPlainEmptyHtmlOpenTagName(value: string | null | undefined): string | null {
  if (!value || value.includes('\n')) return null;

  return PLAIN_EMPTY_HTML_OPEN_TEXT_PATTERN.exec(value.trim())?.[1]?.toLowerCase() ?? null;
}

function getHtmlOpenTagName(value: string | null | undefined): string | null {
  if (!value || value.includes('\n')) return null;

  return HTML_OPEN_TAG_TEXT_PATTERN.exec(value.trim())?.[1]?.toLowerCase() ?? null;
}

function getHtmlBlockOpenTagName(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trimStart();
  const openMatch = /^<([A-Za-z][A-Za-z0-9-]*)(?:\s|>|$)/i.exec(trimmed);
  const tagName = openMatch?.[1]?.toLowerCase();
  if (!tagName || /\/>\s*$/.test(openMatch?.[0] ?? '')) return null;
  return new RegExp(`</${tagName}\\s*>`, 'i').test(trimmed) ? null : tagName;
}

function getPlainEmptyHtmlCloseTagName(value: string | null | undefined): string | null {
  if (!value || value.includes('\n')) return null;

  return PLAIN_EMPTY_HTML_CLOSE_TEXT_PATTERN.exec(value.trim())?.[1]?.toLowerCase() ?? null;
}

function isInlineEmbeddedHtmlExampleText(value: string | null | undefined): value is string {
  if (!value || value.includes('\n')) return false;

  return INLINE_EMBEDDED_HTML_EXAMPLE_PATTERN.test(value.trim());
}

function isStandaloneHtmlLineNode(node: MdastNode): boolean {
  const startLine = node.position?.start?.line;
  const startColumn = node.position?.start?.column;
  const endLine = node.position?.end?.line;
  return (
    typeof startLine === 'number' &&
    typeof endLine === 'number' &&
    startLine === endLine &&
    typeof startColumn === 'number' &&
    startColumn <= 4
  );
}

function hasVisibleTextSibling(
  children: readonly MdastNode[],
  excludedIndexes: readonly number[]
): boolean {
  const excluded = new Set(excludedIndexes);
  return children.some((child, index) =>
    !excluded.has(index)
    && child.type === 'text'
    && typeof child.value === 'string'
    && /\S/u.test(child.value)
  );
}

function findPlainHtmlCloseAfter(
  children: readonly MdastNode[],
  openIndex: number,
  tagName: string
): number {
  const maxIndex = Math.min(children.length - 1, openIndex + MAX_INLINE_HTML_CONTAINER_CHILDREN + 1);
  for (let index = openIndex + 1; index <= maxIndex; index += 1) {
    const child = children[index];
    if (child?.type !== 'html') continue;
    const closeTagName = getPlainEmptyHtmlCloseTagName(child.value);
    if (closeTagName === tagName) return index;
  }
  return -1;
}

function hasHtmlOpenBefore(
  children: readonly MdastNode[],
  closeIndex: number,
  tagName: string
): boolean {
  const minIndex = Math.max(0, closeIndex - MAX_INLINE_HTML_CONTAINER_CHILDREN - 1);
  let hasContentBetween = false;
  for (let index = closeIndex - 1; index >= minIndex; index -= 1) {
    const child = children[index];
    if (child?.type === 'text') {
      hasContentBetween ||= typeof child.value === 'string' && /\S/u.test(child.value);
    } else if (child?.type !== 'html') {
      hasContentBetween = true;
    }
    if (child?.type !== 'html') continue;
    const closeTagName = getPlainEmptyHtmlCloseTagName(child.value);
    if (closeTagName === tagName) return false;
    const openTagName = getHtmlOpenTagName(child.value) ?? getHtmlBlockOpenTagName(child.value);
    if (openTagName === tagName) return hasContentBetween;
  }
  return false;
}

function createPlainHtmlTextReplacement(
  parent: MdastNode,
  value: string,
  position?: MdastNode['position']
): MdastNode {
  const textNode = position ? { type: 'text', value, position } : { type: 'text', value };
  return parent.type === 'paragraph'
    ? textNode
    : position
      ? {
          type: 'paragraph',
          children: [textNode],
          position,
        }
      : {
          type: 'paragraph',
          children: [textNode],
        };
}

export function applyPlainHtmlBlockTextToTree(tree: MdastNode) {
  const stack: MdastNode[] = [tree];

  while (stack.length > 0) {
    const node = stack.pop()!;
    const children = node.children;
    if (!children) continue;

    const hasIncompleteHtmlText = node.type === 'paragraph' && children.some((candidate) => (
      candidate.type === 'text'
      && typeof candidate.value === 'string'
      && isIncompleteHtmlTagFragment(candidate.value)
    ));

    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (!child) continue;

      if (
        node.type === 'paragraph' &&
        child.type === 'html' &&
        isInlineEmbeddedHtmlExampleText(child.value) &&
        !isStandaloneHtmlLineNode(child) &&
        hasVisibleTextSibling(children, [index])
      ) {
        children[index] = createPlainHtmlTextReplacement(node, child.value, child.position);
        continue;
      }

      if (child.type === 'html' && typeof child.value === 'string') {
        if (hasIncompleteHtmlText || isIncompleteHtmlTagFragment(child.value)) {
          children[index] = createPlainHtmlTextReplacement(node, child.value, child.position);
          continue;
        }

        const openTagName = getHtmlOpenTagName(child.value);
        const plainOpenTagName = getPlainEmptyHtmlOpenTagName(child.value);
        const closeChild = children[index + 1];
        const closeTagName = closeChild?.type === 'html'
          ? getPlainEmptyHtmlCloseTagName(closeChild.value)
          : null;

        if (
          node.type === 'paragraph' &&
          openTagName &&
          closeTagName === openTagName &&
          (
            (plainOpenTagName && !HTML_VOID_TEXT_TAGS.has(plainOpenTagName)) ||
            (
              node.type === 'paragraph' &&
              INLINE_EMBEDDED_HTML_EXAMPLE_TAGS.has(openTagName) &&
              hasVisibleTextSibling(children, [index, index + 1])
            )
          )
        ) {
          const position = child.position || closeChild?.position
            ? {
                start: child.position?.start,
                end: closeChild?.position?.end,
              }
            : undefined;
          children.splice(
            index,
            2,
            createPlainHtmlTextReplacement(node, `${child.value}${closeChild?.value ?? ''}`, position)
          );
          continue;
        }
      }

      if (child.type === 'html' && isPlainUnclosedHtmlBlockText(child.value)) {
        children[index] = createPlainHtmlTextReplacement(node, child.value, child.position);
        continue;
      }

      if (child.type === 'html' && typeof child.value === 'string') {
        const openTagName = getPlainEmptyHtmlOpenTagName(child.value);
        if (
          openTagName &&
          GFM_BLOCK_HTML_TEXT_TAGS.has(openTagName) &&
          !HTML_VOID_TEXT_TAGS.has(openTagName) &&
          findPlainHtmlCloseAfter(children, index, openTagName) < 0
        ) {
          children[index] = createPlainHtmlTextReplacement(node, child.value, child.position);
          continue;
        }

        const closeTagName = getPlainEmptyHtmlCloseTagName(child.value);
        if (
          closeTagName &&
          GFM_BLOCK_HTML_TEXT_TAGS.has(closeTagName) &&
          !HTML_VOID_TEXT_TAGS.has(closeTagName) &&
          !hasHtmlOpenBefore(children, index, closeTagName)
        ) {
          children[index] = createPlainHtmlTextReplacement(node, child.value, child.position);
          continue;
        }
      }

      stack.push(child);
    }
  }
}
