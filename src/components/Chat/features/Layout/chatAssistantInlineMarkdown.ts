import {
  prepareRichInline,
  type PreparedRichInline,
  type RichInlineItem,
} from '@/lib/text-layout';
import {
  MARKDOWN_INLINE_CODE_EXTRA_WIDTH,
  MARKDOWN_INLINE_CODE_FONT,
} from '@/components/common/markdown/markdownMetrics';
import { normalizeMarkdownInlineTextForMeasurement } from '@/components/common/markdown/plainText';
import {
  getVariantBaseFont,
  resolveInlineFont,
  type InlineMarks,
} from './chatAssistantInlineFonts';
import type { TextBlockVariant } from './chatAssistantMarkdownTypes';
import {
  setCacheEntry,
  touchCacheEntry,
} from '@/lib/cache/lru';

const LINK_TOKEN_RE = /\[([^\]]+)\]\(([^)]+)\)/;
const INLINE_CODE_TOKEN_RE = /`([^`]+)`/;
const STRONG_TOKEN_RE = /(\*\*|__)([\s\S]+?)\1/;
const EMPHASIS_TOKEN_RE = /(\*|_)([^*_][\s\S]*?)\1/;
const STRIKE_TOKEN_RE = /~~([\s\S]+?)~~/;
const PREPARED_TEXT_BLOCK_CACHE_LIMIT = 400;
const MAX_CACHED_INLINE_MARKDOWN_CHARS = 20_000;
export const MAX_TOKENIZED_INLINE_MARKDOWN_CHARS = 100_000;
export const MAX_INLINE_MARKDOWN_TOKEN_DEPTH = 16;
export const MAX_INLINE_MARKDOWN_TOKEN_ITEMS = 1024;

const preparedTextBlockCache = new Map<string, PreparedRichInline>();

interface InlineTokenizeBudget {
  itemCount: number;
}

function pushRichInlineItem(
  target: RichInlineItem[],
  item: RichInlineItem,
  budget: InlineTokenizeBudget,
): boolean {
  if (!item.text) {
    return true;
  }

  const previous = target[target.length - 1];
  if (
    previous &&
    previous.font === item.font &&
    previous.break === item.break &&
    (previous.extraWidth ?? 0) === (item.extraWidth ?? 0)
  ) {
    previous.text += item.text;
    return true;
  }

  if (budget.itemCount >= MAX_INLINE_MARKDOWN_TOKEN_ITEMS) {
    if (previous) {
      previous.text += item.text;
    }
    return false;
  }

  target.push(item);
  budget.itemCount += 1;
  return true;
}

function pushTextInlineItem(
  target: RichInlineItem[],
  text: string,
  variant: TextBlockVariant,
  marks: InlineMarks,
  budget: InlineTokenizeBudget,
): boolean {
  return pushRichInlineItem(target, {
    text,
    font: resolveInlineFont(variant, marks),
  }, budget);
}

function tokenizeInlineMarkdownInto(
  text: string,
  variant: TextBlockVariant,
  marks: InlineMarks,
  depth: number,
  budget: InlineTokenizeBudget,
  items: RichInlineItem[],
): boolean {
  if (depth >= MAX_INLINE_MARKDOWN_TOKEN_DEPTH) {
    return pushTextInlineItem(items, text, variant, marks, budget);
  }

  let remaining = text;

  while (remaining.length > 0) {
    if (budget.itemCount >= MAX_INLINE_MARKDOWN_TOKEN_ITEMS) {
      return pushTextInlineItem(items, remaining, variant, marks, budget);
    }

    const candidates = [
      { kind: 'link', match: LINK_TOKEN_RE.exec(remaining) },
      { kind: 'code', match: INLINE_CODE_TOKEN_RE.exec(remaining) },
      { kind: 'strong', match: STRONG_TOKEN_RE.exec(remaining) },
      { kind: 'strike', match: STRIKE_TOKEN_RE.exec(remaining) },
      { kind: 'emphasis', match: EMPHASIS_TOKEN_RE.exec(remaining) },
    ]
      .filter((candidate): candidate is { kind: string; match: RegExpExecArray } => candidate.match !== null)
      .sort((a, b) => a.match.index - b.match.index)[0];

    if (!candidates) {
      pushTextInlineItem(items, remaining, variant, marks, budget);
      break;
    }

    const { kind, match } = candidates;
    const matchIndex = match.index;
    if (matchIndex > 0) {
      if (!pushTextInlineItem(items, remaining.slice(0, matchIndex), variant, marks, budget)) {
        return false;
      }
    }

    if (kind === 'code') {
      if (!pushRichInlineItem(items, {
        text: match[1] ?? '',
        font: MARKDOWN_INLINE_CODE_FONT,
        extraWidth: MARKDOWN_INLINE_CODE_EXTRA_WIDTH,
      }, budget)) {
        pushTextInlineItem(items, remaining.slice(matchIndex + match[0].length), variant, marks, budget);
        return false;
      }
    } else if (kind === 'link') {
      if (!tokenizeInlineMarkdownInto(match[1] ?? '', variant, { ...marks, link: true }, depth + 1, budget, items)) {
        pushTextInlineItem(items, remaining.slice(matchIndex + match[0].length), variant, marks, budget);
        return false;
      }
    } else if (kind === 'strong') {
      if (!tokenizeInlineMarkdownInto(match[2] ?? '', variant, { ...marks, bold: true }, depth + 1, budget, items)) {
        pushTextInlineItem(items, remaining.slice(matchIndex + match[0].length), variant, marks, budget);
        return false;
      }
    } else if (kind === 'emphasis') {
      if (!tokenizeInlineMarkdownInto(match[2] ?? '', variant, { ...marks, italic: true }, depth + 1, budget, items)) {
        pushTextInlineItem(items, remaining.slice(matchIndex + match[0].length), variant, marks, budget);
        return false;
      }
    } else {
      if (!tokenizeInlineMarkdownInto(match[1] ?? '', variant, marks, depth + 1, budget, items)) {
        pushTextInlineItem(items, remaining.slice(matchIndex + match[0].length), variant, marks, budget);
        return false;
      }
    }

    remaining = remaining.slice(matchIndex + match[0].length);
  }

  return true;
}

function tokenizeInlineMarkdown(
  text: string,
  variant: TextBlockVariant,
  marks: InlineMarks = { bold: false, italic: false, link: false },
): RichInlineItem[] {
  const items: RichInlineItem[] = [];
  const budget = { itemCount: 0 };
  if (text.length > MAX_TOKENIZED_INLINE_MARKDOWN_CHARS) {
    pushTextInlineItem(items, text, variant, marks, budget);
  } else {
    tokenizeInlineMarkdownInto(text, variant, marks, 0, budget, items);
  }

  if (items.length === 0) {
    return [{
      text: text || ' ',
      font: getVariantBaseFont(variant),
    }];
  }

  return items;
}

export function normalizeInlineMarkdownForMeasurement(content: string): string {
  return normalizeMarkdownInlineTextForMeasurement(content);
}

export function getPreparedMarkdownTextBlock(
  text: string,
  variant: TextBlockVariant,
): PreparedRichInline {
  if (text.length > MAX_CACHED_INLINE_MARKDOWN_CHARS) {
    return prepareRichInline(tokenizeInlineMarkdown(text, variant));
  }

  const key = `${variant}\u0000${text}`;
  const cached = touchCacheEntry(preparedTextBlockCache, key);
  if (cached) {
    return cached;
  }

  const prepared = prepareRichInline(tokenizeInlineMarkdown(text, variant));
  setCacheEntry(preparedTextBlockCache, key, prepared, PREPARED_TEXT_BLOCK_CACHE_LIMIT);
  return prepared;
}
