import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet, type Decoration as ProseDecoration } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { collectHtmlTagRanges } from '@/lib/markdown/markdownRanges';
import {
  DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT,
  STOP_PROSE_SCAN,
  scanProseDescendants,
} from '../shared/boundedProseNodeScan';
import {
  getTransactionChangedRanges,
  transactionTouchesDecorations,
} from '../shared/transactionStepText';
import { collectHtmlInlineSourceTokens } from './htmlInlineSourceTokens';

export const htmlInlineSourceTextPluginKey = new PluginKey<DecorationSet>('htmlInlineSourceText');
export const MAX_HTML_INLINE_SOURCE_TEXT_DECORATIONS = 2000;
export const MAX_HTML_INLINE_SOURCE_TEXT_SCAN_NODES = DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT;
export const MAX_HTML_INLINE_SOURCE_TEXT_UPDATE_RANGE_SCAN_NODES = MAX_HTML_INLINE_SOURCE_TEXT_SCAN_NODES;
export const MAX_HTML_INLINE_SOURCE_TEXT_CHARS = 1024 * 1024;
export const MAX_HTML_INLINE_SOURCE_TEXT_CHANGED_CONTEXT_CHARS = 512;

const HTML_INLINE_SOURCE_TEXT_CLASS = 'md-html-inline md-html-source-text';
const SKIPPED_TEXT_PARENT_TYPES = new Set(['code_block', 'html_block']);
const SKIPPED_MARK_TYPES = new Set(['inlineCode', 'code']);

function textMayContainHtmlInlineSourceText(text: string): boolean {
  if (!text.includes('<')) return false;
  const scan = collectHtmlTagRanges(text, { start: 0, end: text.length }, 1);
  return scan.ranges.length > 0 || scan.protectedRanges.length > 0;
}

function transactionChangedContextMayContainHtmlInlineSourceText(doc: ProseNode, tr: unknown): boolean {
  if (typeof doc.textBetween !== 'function') return true;

  const docSize = typeof doc.content?.size === 'number' ? doc.content.size : 0;
  const ranges = getTransactionChangedRanges(tr);
  if (ranges.length === 0) return true;

  for (const range of ranges) {
    for (const pos of [range.newFrom, range.newTo]) {
      const safePos = Math.max(0, Math.min(pos, docSize));
      const from = Math.max(0, safePos - MAX_HTML_INLINE_SOURCE_TEXT_CHANGED_CONTEXT_CHARS);
      const to = Math.min(docSize, safePos + MAX_HTML_INLINE_SOURCE_TEXT_CHANGED_CONTEXT_CHARS);
      if (from >= to) continue;
      if (textMayContainHtmlInlineSourceText(doc.textBetween(from, to, '\n', '\ufffc'))) {
        return true;
      }
    }
  }

  return false;
}

function collectHtmlInlineSourceTextDecorationsFromTextNode(
  node: ProseNode,
  pos: number,
  parent: ProseNode | null | undefined,
  decorations: ProseDecoration[],
  maxDecorations: number,
) {
  if (decorations.length >= maxDecorations) return;
  if (parent?.type?.name && SKIPPED_TEXT_PARENT_TYPES.has(parent.type.name)) return;
  if (node.marks.some((mark) => SKIPPED_MARK_TYPES.has(mark.type.name))) return;

  const text = (node.text ?? '').slice(0, MAX_HTML_INLINE_SOURCE_TEXT_CHARS);
  if (!text.includes('<')) return;

  const scan = collectHtmlTagRanges(text, { start: 0, end: text.length }, maxDecorations - decorations.length);
  for (const range of [...scan.ranges, ...scan.protectedRanges]) {
    if (range.end <= range.start) continue;
    decorations.push(Decoration.inline(pos + range.start, pos + range.end, {
      class: HTML_INLINE_SOURCE_TEXT_CLASS,
    }));
    for (const token of collectHtmlInlineSourceTokens(text, range.start, range.end)) {
      if (decorations.length >= maxDecorations) break;
      decorations.push(Decoration.inline(pos + token.start, pos + token.end, {
        class: token.className,
      }));
    }
    if (decorations.length >= maxDecorations) break;
  }
}

export function collectHtmlInlineSourceTextDecorations(
  doc: ProseNode,
  maxDecorations = MAX_HTML_INLINE_SOURCE_TEXT_DECORATIONS,
  maxScanNodes = MAX_HTML_INLINE_SOURCE_TEXT_SCAN_NODES,
): ProseDecoration[] {
  const decorations: ProseDecoration[] = [];

  scanProseDescendants(doc, (node, pos, parent) => {
    if (decorations.length >= maxDecorations) {
      return STOP_PROSE_SCAN;
    }

    const typedNode = node as ProseNode;
    if (typedNode.isText) {
      collectHtmlInlineSourceTextDecorationsFromTextNode(
        typedNode,
        pos,
        parent as ProseNode | null,
        decorations,
        maxDecorations,
      );
    }

    return decorations.length < maxDecorations ? undefined : STOP_PROSE_SCAN;
  }, maxScanNodes);

  return decorations;
}

function createHtmlInlineSourceTextDecorations(doc: ProseNode): DecorationSet {
  const decorations = collectHtmlInlineSourceTextDecorations(doc);
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

type HtmlInlineSourceTextUpdateRange = {
  from: number;
  to: number;
};

function addTextblockRangeAt(doc: ProseNode, pos: number, ranges: HtmlInlineSourceTextUpdateRange[]): void {
  if (typeof doc.resolve !== 'function') return;
  const docSize = typeof doc.content?.size === 'number' ? doc.content.size : 0;
  const safePos = Math.max(0, Math.min(pos, docSize));

  try {
    const $pos = doc.resolve(safePos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth);
      if (!node?.isTextblock) continue;
      ranges.push({
        from: $pos.start(depth),
        to: $pos.end(depth),
      });
      return;
    }
  } catch {
  }
}

function mergeHtmlInlineSourceTextUpdateRanges(
  ranges: HtmlInlineSourceTextUpdateRange[],
): HtmlInlineSourceTextUpdateRange[] {
  if (ranges.length <= 1) return ranges;

  const sorted = [...ranges]
    .filter((range) => Number.isFinite(range.from) && Number.isFinite(range.to) && range.to > range.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: HtmlInlineSourceTextUpdateRange[] = [];

  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.from > previous.to + 1) {
      merged.push({ ...range });
      continue;
    }
    previous.to = Math.max(previous.to, range.to);
  }

  return merged;
}

export function collectHtmlInlineSourceTextUpdateRanges(
  doc: ProseNode,
  tr: unknown,
  maxScanNodes = MAX_HTML_INLINE_SOURCE_TEXT_UPDATE_RANGE_SCAN_NODES,
): HtmlInlineSourceTextUpdateRange[] {
  const ranges: HtmlInlineSourceTextUpdateRange[] = [];
  const docSize = typeof doc.content?.size === 'number' ? doc.content.size : 0;
  let scannedNodes = 0;

  for (const range of getTransactionChangedRanges(tr)) {
    const from = Math.max(0, Math.min(range.newFrom, range.newTo, docSize));
    const to = Math.max(from, Math.min(Math.max(range.newFrom, range.newTo), docSize));

    addTextblockRangeAt(doc, from, ranges);
    addTextblockRangeAt(doc, to, ranges);

    if (to > from && typeof doc.nodesBetween === 'function') {
      let exhausted = false;
      doc.nodesBetween(from, to, (node: ProseNode, pos: number) => {
        scannedNodes += 1;
        if (scannedNodes > maxScanNodes) {
          exhausted = true;
          return false;
        }
        if (!node.isTextblock || typeof node.nodeSize !== 'number') return true;
        ranges.push({
          from: pos + 1,
          to: Math.max(pos + 1, pos + node.nodeSize - 1),
        });
        return true;
      });
      if (exhausted) {
        return [{ from: 0, to: docSize }];
      }
    }
  }

  return mergeHtmlInlineSourceTextUpdateRanges(ranges);
}

export function collectHtmlInlineSourceTextDecorationsInRange(
  doc: ProseNode,
  from: number,
  to: number,
  maxDecorations = MAX_HTML_INLINE_SOURCE_TEXT_DECORATIONS,
  maxScanNodes = MAX_HTML_INLINE_SOURCE_TEXT_UPDATE_RANGE_SCAN_NODES,
): ProseDecoration[] {
  const decorations: ProseDecoration[] = [];
  const docSize = typeof doc.content?.size === 'number' ? doc.content.size : 0;
  const start = Math.max(0, Math.min(from, docSize));
  const end = Math.max(start, Math.min(to, docSize));
  if (start >= end || typeof doc.nodesBetween !== 'function') {
    return decorations;
  }

  let scannedNodes = 0;
  doc.nodesBetween(start, end, (node: ProseNode, pos: number, parent?: ProseNode) => {
    scannedNodes += 1;
    if (scannedNodes > maxScanNodes) return false;
    if (decorations.length >= maxDecorations) return false;
    if (!node.isText) return true;
    collectHtmlInlineSourceTextDecorationsFromTextNode(
      node,
      pos,
      parent,
      decorations,
      maxDecorations,
    );
    return decorations.length < maxDecorations;
  });

  return decorations;
}

export function updateHtmlInlineSourceTextDecorationsForTransaction(
  previous: DecorationSet,
  tr: unknown,
  doc: ProseNode,
): DecorationSet {
  const mapped = previous.map((tr as { mapping: any }).mapping, doc);
  const ranges = collectHtmlInlineSourceTextUpdateRanges(doc, tr);
  if (ranges.length === 0) {
    return mapped;
  }

  const decorationsToRemove: ProseDecoration[] = [];
  for (const range of ranges) {
    decorationsToRemove.push(...mapped.find(range.from, range.to) as ProseDecoration[]);
  }

  let next = decorationsToRemove.length > 0
    ? mapped.remove(decorationsToRemove)
    : mapped;
  let remainingBudget = MAX_HTML_INLINE_SOURCE_TEXT_DECORATIONS - next.find().length;
  if (remainingBudget <= 0) {
    return next;
  }

  for (const range of ranges) {
    if (remainingBudget <= 0) break;
    const decorations = collectHtmlInlineSourceTextDecorationsInRange(
      doc,
      range.from,
      range.to,
      remainingBudget,
    );
    if (decorations.length === 0) continue;
    next = next.add(doc, decorations);
    remainingBudget -= decorations.length;
  }

  return next;
}

export const htmlInlineSourceTextPlugin = $prose(() => new Plugin({
  key: htmlInlineSourceTextPluginKey,
  state: {
    init(_, { doc }) {
      return createHtmlInlineSourceTextDecorations(doc);
    },
    apply(tr, old) {
      if (!tr.docChanged) {
        return old;
      }
      if (
        !transactionTouchesDecorations(old, tr)
        && !transactionChangedContextMayContainHtmlInlineSourceText(tr.doc, tr)
      ) {
        return old.map(tr.mapping, tr.doc);
      }
      return updateHtmlInlineSourceTextDecorationsForTransaction(old, tr, tr.doc);
    },
  },
  props: {
    decorations(state) {
      return this.getState(state);
    },
  },
}));
