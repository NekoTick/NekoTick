import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { createAbbrUsagePattern, type AbbrDefinition } from '@/components/common/markdown/abbrMarkdown';
import {
  getTransactionChangedRanges,
  transactionChangedParentTextMatches,
  transactionChangedPreviousParentTextMatches,
  transactionInsertedTextMatches,
  transactionTouchesDecorations,
  type DecorationSetLike,
} from '../shared/transactionStepText';
import {
  MAX_ABBR_CHANGED_CONTEXT_CHARS,
  MAX_ABBR_DECORATIONS,
  MAX_ABBR_UPDATE_RANGE_SCAN_NODES,
  extractAbbrDefinitions,
  findAbbrUsages,
  findAbbrUsagesInRange,
} from './abbrScanning';
import { createAbbrDefinitionDecorations } from './abbrDefinitionDecorations';

export const abbrPluginKey = new PluginKey('abbr');

const ABBR_DEFINITION_TRIGGER_PATTERN = /(?:^\*\[|[\n\r]\*\[)/u;
const abbrDefinitionsByDecorationSet = new WeakMap<object, AbbrDefinition[]>();

function rememberAbbrDefinitions(decorationSet: DecorationSet, definitions: AbbrDefinition[]): DecorationSet {
  abbrDefinitionsByDecorationSet.set(decorationSet, definitions);
  return decorationSet;
}

function mapAbbrDecorations(
  previous: DecorationSet,
  tr: { mapping: Parameters<DecorationSet['map']>[0] },
  doc: any,
): DecorationSet {
  const mapped = previous.map(tr.mapping, doc);
  return rememberAbbrDefinitions(mapped, abbrDefinitionsByDecorationSet.get(previous) ?? []);
}

function createAbbrDecorations(doc: any): DecorationSet {
  const decorations = createAbbrDefinitionDecorations(doc);
  const definitions = extractAbbrDefinitions(doc);
  const usages = findAbbrUsages(doc, definitions);

  for (const usage of usages) {
    decorations.push(
      Decoration.inline(usage.start, usage.end, {
        nodeName: 'abbr',
        title: usage.fullText,
        class: 'abbr'
      })
    );
  }

  return rememberAbbrDefinitions(DecorationSet.create(doc, decorations), definitions);
}

export function transactionMayAffectAbbrDecorations(
  previous: DecorationSetLike,
  tr: unknown,
  oldDoc: any,
  newDoc: any,
): boolean {
  const definitions = abbrDefinitionsByDecorationSet.get(previous as object) ?? [];
  return transactionMayAffectAbbrDefinitions(tr, oldDoc, newDoc)
    || transactionMayAffectAbbrUsages(previous, tr, oldDoc, newDoc, definitions);
}

function transactionMayAffectAbbrDefinitions(
  tr: unknown,
  oldDoc: any,
  newDoc: any,
): boolean {
  return transactionInsertedTextMatches(tr, ABBR_DEFINITION_TRIGGER_PATTERN)
    || transactionChangedPreviousParentTextMatches(oldDoc, tr, ABBR_DEFINITION_TRIGGER_PATTERN)
    || transactionChangedParentTextMatches(newDoc, tr, ABBR_DEFINITION_TRIGGER_PATTERN);
}

function transactionChangedContextTextMatches(doc: any, tr: unknown, pattern: RegExp, side: 'old' | 'new'): boolean {
  if (typeof doc.resolve !== 'function' || typeof doc.textBetween !== 'function') return false;
  const docSize = typeof doc.content?.size === 'number' ? doc.content.size : 0;

  for (const range of getTransactionChangedRanges(tr)) {
    const positions = side === 'old'
      ? [range.oldFrom, range.oldTo]
      : [range.newFrom, range.newTo];

    for (const pos of positions) {
      const safePos = Math.max(0, Math.min(pos, docSize));
      try {
        const $pos = doc.resolve(safePos);
        for (let depth = $pos.depth; depth > 0; depth -= 1) {
          const node = $pos.node(depth);
          if (!node?.isTextblock) continue;
          const blockStart = $pos.start(depth);
          const blockEnd = $pos.end(depth);
          const from = Math.max(blockStart, safePos - MAX_ABBR_CHANGED_CONTEXT_CHARS);
          const to = Math.min(blockEnd, safePos + MAX_ABBR_CHANGED_CONTEXT_CHARS);
          if (from >= to) break;
          pattern.lastIndex = 0;
          if (pattern.test(doc.textBetween(from, to, '\n', '\ufffc'))) {
            return true;
          }
          break;
        }
      } catch {
      }
    }
  }

  return false;
}

function transactionMayAffectAbbrUsages(
  previous: DecorationSetLike,
  tr: unknown,
  oldDoc: any,
  newDoc: any,
  definitions: AbbrDefinition[],
): boolean {
  if (transactionTouchesDecorations(previous, tr)) {
    return true;
  }

  const usagePattern = createAbbrUsagePattern(definitions);
  if (!usagePattern) return false;

  return transactionChangedContextTextMatches(oldDoc, tr, usagePattern, 'old')
    || transactionChangedContextTextMatches(newDoc, tr, usagePattern, 'new');
}

type AbbrUpdateRange = {
  from: number;
  to: number;
};

function addTextblockRangeAt(doc: any, pos: number, ranges: AbbrUpdateRange[]): void {
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

function mergeAbbrUpdateRanges(ranges: AbbrUpdateRange[]): AbbrUpdateRange[] {
  if (ranges.length <= 1) return ranges;

  const sorted = [...ranges]
    .filter((range) => Number.isFinite(range.from) && Number.isFinite(range.to) && range.to > range.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: AbbrUpdateRange[] = [];

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

function collectAbbrUpdateRanges(
  doc: any,
  tr: unknown,
  maxScanNodes = MAX_ABBR_UPDATE_RANGE_SCAN_NODES,
): AbbrUpdateRange[] {
  const ranges: AbbrUpdateRange[] = [];
  const docSize = typeof doc.content?.size === 'number' ? doc.content.size : 0;
  let scannedNodes = 0;

  for (const range of getTransactionChangedRanges(tr)) {
    const from = Math.max(0, Math.min(range.newFrom, range.newTo, docSize));
    const to = Math.max(from, Math.min(Math.max(range.newFrom, range.newTo), docSize));

    addTextblockRangeAt(doc, from, ranges);
    addTextblockRangeAt(doc, to, ranges);

    if (to > from && typeof doc.nodesBetween === 'function') {
      let exhausted = false;
      doc.nodesBetween(from, to, (node: any, pos: number) => {
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

  return mergeAbbrUpdateRanges(ranges);
}

function createAbbrDecorationsFromUsages(usages: { start: number; end: number; fullText: string }[]): Decoration[] {
  const decorations: Decoration[] = [];
  for (const usage of usages) {
    if (decorations.length >= MAX_ABBR_DECORATIONS) break;
    decorations.push(
      Decoration.inline(usage.start, usage.end, {
        nodeName: 'abbr',
        title: usage.fullText,
        class: 'abbr'
      })
    );
  }
  return decorations;
}

function updateAbbrUsageDecorationsForTransaction(
  previous: DecorationSet,
  tr: { mapping: Parameters<DecorationSet['map']>[0] },
  doc: any,
  definitions: AbbrDefinition[],
): DecorationSet {
  const ranges = collectAbbrUpdateRanges(doc, tr);
  let next = previous.map(tr.mapping, doc);
  if (ranges.length === 0) {
    return rememberAbbrDefinitions(next, definitions);
  }

  const decorationsToRemove: Decoration[] = [];
  for (const range of ranges) {
    decorationsToRemove.push(...(next.find(range.from, range.to) as Decoration[]));
  }
  if (decorationsToRemove.length > 0) {
    next = next.remove(decorationsToRemove);
  }

  let remainingBudget = MAX_ABBR_DECORATIONS - next.find().filter((decoration) => (
    (decoration.type as any).attrs?.nodeName === 'abbr'
  )).length;
  for (const range of ranges) {
    if (remainingBudget <= 0) break;
    const usages = findAbbrUsagesInRange(doc, definitions, range.from, range.to);
    const decorations = createAbbrDecorationsFromUsages(usages).slice(0, remainingBudget);
    if (decorations.length === 0) continue;
    next = next.add(doc, decorations);
    remainingBudget -= decorations.length;
  }

  return rememberAbbrDefinitions(next, definitions);
}

export const abbrDecorationPlugin = $prose(() => {
  return new Plugin({
    key: abbrPluginKey,
    state: {
      init(_, { doc }) {
        return createAbbrDecorations(doc);
      },
      apply(tr, old, oldState, newState) {
        if (tr.docChanged) {
          if (transactionMayAffectAbbrDefinitions(tr, oldState.doc, newState.doc)) {
            return createAbbrDecorations(newState.doc);
          }

          const definitions = abbrDefinitionsByDecorationSet.get(old) ?? [];
          if (!transactionMayAffectAbbrUsages(old, tr, oldState.doc, newState.doc, definitions)) {
            return mapAbbrDecorations(old, tr, newState.doc);
          }

          return updateAbbrUsageDecorationsForTransaction(old, tr, newState.doc, definitions);
        }
        return old;
      }
    },
    props: {
      decorations(state) {
        return this.getState(state);
      }
    }
  });
});
