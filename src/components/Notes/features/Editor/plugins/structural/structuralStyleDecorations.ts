import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, type Transaction } from '@milkdown/kit/prose/state';
import { DecorationSet, type Decoration as ProseDecoration } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { getTransactionChangedRanges } from '../shared/transactionStepText';
import {
  createStructuralDecoration,
  createStructuralStyleDecorations,
  isRelevantStructuralNode,
  MAX_STRUCTURAL_STYLE_DECORATIONS,
  MAX_STRUCTURAL_STYLE_RANGE_SCAN_NODES
} from './structuralStyleNodes';
export {
  collectStructuralStyleDecorations,
  createStructuralStyleDecorations,
  getStructuralStyleDecorationClass,
  MAX_STRUCTURAL_STYLE_DECORATIONS,
  MAX_STRUCTURAL_STYLE_RANGE_SCAN_NODES,
  MAX_STRUCTURAL_STYLE_SCAN_NODES,
  STRUCTURAL_EAGER_LAYOUT_PARAGRAPH_CLASS,
  STRUCTURAL_EMPTY_PARAGRAPH_CLASS,
  STRUCTURAL_LIST_ITEM_ALIGN_CENTER_CLASS,
  STRUCTURAL_LIST_ITEM_ALIGN_RIGHT_CLASS,
  STRUCTURAL_PARAGRAPH_HAS_IMAGE_BLOCK_CLASS,
  STRUCTURAL_PARAGRAPH_HAS_MULTIPLE_IMAGE_BLOCKS_CLASS
} from './structuralStyleNodes';

export interface StructuralStyleDecorationsState {
  decorations: DecorationSet;
  decorationCount: number;
}

type Range = {
  from: number;
  to: number;
};

export const structuralStyleDecorationsPluginKey =
  new PluginKey<StructuralStyleDecorationsState>('structuralStyleDecorations');

function clampDocPosition(doc: ProseNode, pos: number): number {
  return Math.max(0, Math.min(pos, doc.content.size));
}

function pushRange(ranges: Range[], from: number, to: number) {
  const normalizedFrom = Math.max(0, Math.min(from, to));
  const normalizedTo = Math.max(normalizedFrom, Math.max(from, to));
  ranges.push({ from: normalizedFrom, to: normalizedTo });
}

function addResolvedStructuralContextRanges(doc: ProseNode, pos: number, ranges: Range[]) {
  const safePos = clampDocPosition(doc, pos);
  const $pos = doc.resolve(safePos);

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (isRelevantStructuralNode(node)) {
      pushRange(ranges, $pos.before(depth), $pos.after(depth));

      const parent = $pos.node(depth - 1);
      const index = $pos.index(depth - 1);
      const before = $pos.before(depth);
      const after = $pos.after(depth);

      if (index > 0) {
        const previousSibling = parent.child(index - 1);
        if (isRelevantStructuralNode(previousSibling)) {
          pushRange(ranges, before - previousSibling.nodeSize, before);
        }
      }

      if (index + 1 < parent.childCount) {
        const nextSibling = parent.child(index + 1);
        if (isRelevantStructuralNode(nextSibling)) {
          pushRange(ranges, after, after + nextSibling.nodeSize);
        }
      }
    }
  }

  const nodeBefore = $pos.nodeBefore;
  if (nodeBefore && isRelevantStructuralNode(nodeBefore)) {
    pushRange(ranges, safePos - nodeBefore.nodeSize, safePos);
  }

  const nodeAfter = $pos.nodeAfter;
  if (nodeAfter && isRelevantStructuralNode(nodeAfter)) {
    pushRange(ranges, safePos, safePos + nodeAfter.nodeSize);
  }
}

function mergeRanges(ranges: Range[], doc: ProseNode): Range[] {
  if (ranges.length === 0) {
    return [];
  }

  const docSize = doc.content.size;
  const sorted = ranges
    .map((range) => ({
      from: clampDocPosition(doc, range.from),
      to: clampDocPosition(doc, Math.max(range.from, range.to)),
    }))
    .filter((range) => range.from <= docSize && range.to >= 0)
    .sort((a, b) => a.from - b.from || a.to - b.to);

  const merged: Range[] = [];
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

export function getStructuralDecorationContextRanges(
  doc: ProseNode,
  from: number,
  to: number,
  maxScanNodes = MAX_STRUCTURAL_STYLE_RANGE_SCAN_NODES,
): Range[] {
  const docSize = doc.content.size;
  const start = clampDocPosition(doc, Math.min(from, to));
  const end = clampDocPosition(doc, Math.max(from, to));
  const ranges: Range[] = [];
  const scanFrom = clampDocPosition(doc, Math.max(0, start - 1));
  const scanTo = clampDocPosition(doc, Math.min(docSize, Math.max(end, start) + 1));

  addResolvedStructuralContextRanges(doc, start, ranges);
  addResolvedStructuralContextRanges(doc, end, ranges);

  if (scanFrom <= scanTo) {
    let scannedNodes = 0;
    let exhausted = false;
    doc.nodesBetween(scanFrom, scanTo, (node, pos) => {
      scannedNodes += 1;
      if (scannedNodes > maxScanNodes) {
        exhausted = true;
        return false;
      }
      if (!isRelevantStructuralNode(node)) {
        return true;
      }
      pushRange(ranges, pos, pos + node.nodeSize);
      return node.type.name !== 'paragraph';
    });
    if (exhausted) {
      return [{ from: 0, to: docSize }];
    }
  }

  return mergeRanges(ranges, doc);
}

function collectStructuralStyleDecorationsBetween(
  doc: ProseNode,
  from: number,
  to: number,
  maxDecorations = MAX_STRUCTURAL_STYLE_DECORATIONS,
  maxScanNodes = MAX_STRUCTURAL_STYLE_RANGE_SCAN_NODES,
): ProseDecoration[] {
  const decorations: ProseDecoration[] = [];
  let scannedNodes = 0;
  doc.nodesBetween(clampDocPosition(doc, from), clampDocPosition(doc, to), (node, pos) => {
    scannedNodes += 1;
    if (scannedNodes > maxScanNodes) {
      return false;
    }
    if (decorations.length >= maxDecorations) {
      return false;
    }
    if (!isRelevantStructuralNode(node)) {
      return true;
    }
    const decoration = createStructuralDecoration(node, pos);
    if (decoration) {
      decorations.push(decoration);
    }
    return node.type.name !== 'paragraph';
  });
  return decorations;
}

function createStructuralStyleDecorationsState(doc: ProseNode): StructuralStyleDecorationsState {
  const decorations = createStructuralStyleDecorations(doc);
  return {
    decorations,
    decorationCount: decorations.find().length,
  };
}

export function applyStructuralStyleDecorationsState(
  tr: Transaction,
  previous: StructuralStyleDecorationsState,
  newDoc: ProseNode,
): StructuralStyleDecorationsState {
  if (!tr.docChanged) {
    return previous;
  }

  const changedRanges = getTransactionChangedRanges(tr);
  if (changedRanges.length === 0) {
    return createStructuralStyleDecorationsState(newDoc);
  }

  const affectedRanges = mergeRanges(
    changedRanges.flatMap((range) => (
      getStructuralDecorationContextRanges(newDoc, range.newFrom, range.newTo)
    )),
    newDoc,
  );

  if (affectedRanges.length === 0) {
    const decorations = previous.decorations.map(tr.mapping, newDoc);
    return {
      decorationCount: previous.decorationCount,
      decorations,
    };
  }

  let decorations = previous.decorations.map(tr.mapping, newDoc);
  const nextDecorations: ProseDecoration[] = [];
  let removedDecorationCount = 0;

  for (const range of affectedRanges) {
    const staleDecorations = (decorations.find(range.from, range.to) as ProseDecoration[])
      .filter((decoration) => decoration.from < range.to && decoration.to > range.from);
    if (staleDecorations.length > 0) {
      decorations = decorations.remove(staleDecorations);
      removedDecorationCount += staleDecorations.length;
    }

    if (nextDecorations.length >= MAX_STRUCTURAL_STYLE_DECORATIONS) {
      continue;
    }

    nextDecorations.push(
      ...collectStructuralStyleDecorationsBetween(
        newDoc,
        range.from,
        range.to,
        MAX_STRUCTURAL_STYLE_DECORATIONS - nextDecorations.length,
      ),
    );
  }

  if (nextDecorations.length > 0) {
    decorations = decorations.add(newDoc, nextDecorations);
  }

  return {
    decorationCount: Math.max(0, previous.decorationCount - removedDecorationCount + nextDecorations.length),
    decorations,
  };
}

export const structuralStyleDecorationsPlugin = $prose(() => {
  return new Plugin({
    key: structuralStyleDecorationsPluginKey,
    state: {
      init(_config, state) {
        return createStructuralStyleDecorationsState(state.doc);
      },
      apply(tr, previous, _oldState, newState) {
        return applyStructuralStyleDecorationsState(tr, previous, newState.doc);
      },
    },
    props: {
      decorations(state) {
        return structuralStyleDecorationsPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
});
