import { parserCtx, serializerCtx } from '@milkdown/kit/core';
import type { Mark, MarkType, Node as ProseNode } from '@milkdown/kit/prose/model';
import { AllSelection, TextSelection, type EditorState, type Transaction } from '@milkdown/kit/prose/state';
import { transactionTouchesMarkdownSyntax } from './markdownSyntaxTransaction';

const REPARSE_META = 'markdownSyntaxReparse';

function usesMarkdownSyntaxDelimiters(markType: MarkType | undefined): boolean {
  return markType?.spec.markdownSyntaxDelimited === true;
}

interface TextblockRange {
  from: number;
  node: ProseNode;
}

function findTextblockAt(doc: ProseNode, pos: number): TextblockRange | null {
  const resolved = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.isTextblock) return { from: resolved.before(depth), node };
  }
  return null;
}

function collectSelectionTextblocks(state: EditorState): TextblockRange[] {
  const { doc, selection } = state;
  if (selection.empty) {
    const textblock = findTextblockAt(doc, selection.head);
    return textblock ? [textblock] : [];
  }

  const textblocks = new Map<number, TextblockRange>();
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (!node.isTextblock) return true;
    textblocks.set(pos, { from: pos, node });
    return false;
  });
  return [...textblocks.values()];
}

function hasSyntaxMark(node: ProseNode, kind?: string, edge?: string): boolean {
  return node.marks.some((mark) => (
    mark.type.name === 'markdownSyntax'
    && (kind === undefined || mark.attrs.kind === kind)
    && (edge === undefined || mark.attrs.edge === edge)
  ));
}

function textblockNeedsSyntax(node: ProseNode): boolean {
  const expectedHeadingPrefix = node.type.name === 'heading'
    ? `${'#'.repeat(Math.max(1, Math.min(6, Number(node.attrs.level) || 1)))} `
    : null;
  const firstChild = node.firstChild;
  if (expectedHeadingPrefix !== null && (
    !firstChild?.isText
    || firstChild.text !== expectedHeadingPrefix
    || !hasSyntaxMark(firstChild, 'heading', 'prefix')
  )) return true;

  let previousMarks = new Map<string, Mark>();
  const pendingOpenings = new Map<string, number>();
  const pendingClosings = new Map<string, number>();
  const increment = (counts: Map<string, number>, name: string) => {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  };
  const hasValidBoundary = (currentMarks: Map<string, Mark>) => {
    const names = new Set([
      ...previousMarks.keys(),
      ...currentMarks.keys(),
      ...pendingOpenings.keys(),
      ...pendingClosings.keys(),
    ]);
    for (const name of names) {
      const previous = previousMarks.get(name);
      const current = currentMarks.get(name);
      const changed = Boolean(previous && current && !previous.eq(current));
      const expectedOpening = Boolean((!previous && current) || changed) ? 1 : 0;
      const expectedClosing = Boolean((previous && !current) || changed) ? 1 : 0;
      const extraOpenings = (pendingOpenings.get(name) ?? 0) - expectedOpening;
      const extraClosings = (pendingClosings.get(name) ?? 0) - expectedClosing;
      if (extraOpenings < 0 || extraClosings < 0 || extraOpenings !== extraClosings) {
        return false;
      }
    }
    pendingOpenings.clear();
    pendingClosings.clear();
    previousMarks = currentMarks;
    return true;
  };

  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (!child.isText) continue;
    const syntaxMark = child.marks.find((mark) => mark.type.name === 'markdownSyntax');
    if (syntaxMark) {
      const edge = String(syntaxMark.attrs.edge ?? '');
      const kind = String(syntaxMark.attrs.kind ?? '');
      if (edge === 'prefix') {
        if (kind !== 'heading' || expectedHeadingPrefix === null || index !== 0) return true;
        continue;
      }
      if (!usesMarkdownSyntaxDelimiters(node.type.schema.marks[kind])) return true;
      if (edge === 'open') increment(pendingOpenings, kind);
      else if (edge === 'close') increment(pendingClosings, kind);
      else return true;
      continue;
    }

    const currentMarks = new Map<string, Mark>();
    for (const mark of child.marks) {
      if (!usesMarkdownSyntaxDelimiters(mark.type)) continue;
      currentMarks.set(mark.type.name, mark);
    }
    if (!hasValidBoundary(currentMarks)) return true;
  }

  if (!hasValidBoundary(new Map())) return true;
  return false;
}

function isPlainTextblock(node: ProseNode): boolean {
  for (let index = 0; index < node.childCount; index += 1) {
    if (!node.child(index).isText) return false;
  }
  return true;
}

function preserveTextblockAttrs(source: ProseNode, parsed: ProseNode): ProseNode {
  if (source.type !== parsed.type || source.attrs.align == null) return parsed;
  return parsed.type.create(
    { ...parsed.attrs, align: source.attrs.align },
    parsed.content,
    parsed.marks,
  );
}

function getSemanticOffset(node: ProseNode, contentOffset: number): number {
  let rawOffset = 0;
  let semanticOffset = 0;
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    const childEnd = rawOffset + child.nodeSize;
    if (!hasSyntaxMark(child)) {
      semanticOffset += Math.max(0, Math.min(contentOffset, childEnd) - rawOffset);
    }
    if (contentOffset <= childEnd) break;
    rawOffset = childEnd;
  }
  return semanticOffset;
}

function getContentOffsetForSemanticOffset(
  node: ProseNode,
  target: number,
  association: 'end' | 'start',
): number {
  let rawOffset = 0;
  let semanticOffset = 0;
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (hasSyntaxMark(child)) {
      if (semanticOffset === target && association === 'end') {
        return rawOffset;
      }
      rawOffset += child.nodeSize;
      continue;
    }

    const nextSemanticOffset = semanticOffset + child.nodeSize;
    if (
      target < nextSemanticOffset
      || (target === nextSemanticOffset && association === 'end')
    ) return rawOffset + Math.max(0, target - semanticOffset);
    semanticOffset = nextSemanticOffset;
    rawOffset += child.nodeSize;
  }
  return rawOffset;
}

export function reparseEditedMarkdownSyntax(
  ctx: any,
  transactions: readonly Transaction[],
  _oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  if (
    transactions.some((transaction) => transaction.getMeta(REPARSE_META))
    || !transactions.some((transaction) => transaction.docChanged)
  ) return null;

  const isTextSelection = newState.selection instanceof TextSelection;
  if (!isTextSelection && !(newState.selection instanceof AllSelection)) return null;
  const textblocks = collectSelectionTextblocks(newState)
    .filter(({ node }) => isPlainTextblock(node));
  if (textblocks.length === 0) return null;
  const touchedSyntax = transactions.some(transactionTouchesMarkdownSyntax);
  const parser = ctx.get(parserCtx);
  const serializer = ctx.get(serializerCtx);
  const reparsed = textblocks.flatMap((textblock) => {
    const needsSyntax = textblockNeedsSyntax(textblock.node);
    if (!touchedSyntax && !needsSyntax) return [];
    const source = touchedSyntax
      ? textblock.node.textBetween(0, textblock.node.content.size, '', '')
      : serializer(newState.schema.topNodeType.create(null, [textblock.node]))
        .replace(/\n+$/u, '');
    const parsedDoc = parser(source);
    if (parsedDoc.childCount !== 1 || !parsedDoc.firstChild?.isTextblock) return [];
    const parsed = preserveTextblockAttrs(textblock.node, parsedDoc.firstChild);
    return parsed.eq(textblock.node) ? [] : [{ ...textblock, parsed }];
  });
  if (reparsed.length === 0) return null;

  if (!isTextSelection) {
    const transaction = newState.tr.setMeta(REPARSE_META, true);
    for (const { from, node, parsed } of [...reparsed].sort((left, right) => right.from - left.from)) {
      transaction.replaceWith(from, from + node.nodeSize, parsed);
    }
    transaction.setSelection(new AllSelection(transaction.doc));
    return transaction;
  }

  const originalAnchor = newState.selection.anchor;
  const originalHead = newState.selection.head;
  const selectionIsForward = newState.selection.anchor <= newState.selection.head;
  const selectionIsCollapsed = originalAnchor === originalHead;
  const activeStoredMark = (newState.storedMarks ?? newState.selection.$head.marks())
    .some((mark) => usesMarkdownSyntaxDelimiters(mark.type));
  const endpointAssociation = (endpoint: 'anchor' | 'head') => {
    if (selectionIsCollapsed) return activeStoredMark ? 'end' : 'start';
    if (endpoint === 'anchor') return selectionIsForward ? 'start' : 'end';
    return selectionIsForward ? 'end' : 'start';
  };
  const transaction = newState.tr.setMeta(REPARSE_META, true);
  for (const { from, node, parsed } of [...reparsed].sort((left, right) => right.from - left.from)) {
    transaction.replaceWith(from, from + node.nodeSize, parsed);
  }
  const mapEndpoint = (pos: number, endpoint: 'anchor' | 'head') => {
    const replacement = reparsed.find(({ from, node }) => (
      pos >= from + 1 && pos <= from + 1 + node.content.size
    ));
    if (!replacement) return transaction.mapping.map(pos, endpointAssociation(endpoint) === 'start' ? 1 : -1);

    const oldOffset = pos - replacement.from - 1;
    const mappedOffset = touchedSyntax
      ? oldOffset
      : getContentOffsetForSemanticOffset(
        replacement.parsed,
        getSemanticOffset(replacement.node, oldOffset),
        endpointAssociation(endpoint),
      );
    const nextContentFrom = transaction.mapping.map(replacement.from, -1) + 1;
    return Math.max(
      nextContentFrom,
      Math.min(nextContentFrom + mappedOffset, nextContentFrom + replacement.parsed.content.size),
    );
  };
  const anchor = mapEndpoint(originalAnchor, 'anchor');
  const head = mapEndpoint(originalHead, 'head');
  transaction.setSelection(TextSelection.create(transaction.doc, anchor, head));
  if (newState.storedMarks) transaction.setStoredMarks(newState.storedMarks);
  return transaction;
}
