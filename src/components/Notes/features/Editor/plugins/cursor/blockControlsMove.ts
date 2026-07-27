import { Selection } from '@milkdown/kit/prose/state';
import { Fragment } from '@milkdown/kit/prose/model';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { EditorState } from '@milkdown/kit/prose/state';
import { normalizeBlockRanges, type BlockRange } from './blockSelectionUtils';
import {
  convertMovedFrontmatterToPlainText,
  prepareBlockMove,
  resolveBlockMoveContext,
} from './blockControlsMoveCore';
import { isInlineSelectableBlockRange, mapRangesToSelectableBlocks } from './blockUnitResolver';
import { markEditorUserInput } from '../shared/userInputEvents';

interface TopLevelRange {
  from: number;
  to: number;
  name: string;
}

function resolveTopLevelRangeInDoc(doc: EditorState['doc'], pos: number): TopLevelRange | null {
  let result: TopLevelRange | null = null;
  doc.forEach((node, offset) => {
    if (result) return;
    const from = offset;
    const to = offset + node.nodeSize;
    if (pos < from || pos >= to) return;
    result = { from, to, name: node.type.name };
  });
  return result;
}

function resolveTopLevelRangeAtPos(view: EditorView, pos: number): TopLevelRange | null {
  return resolveTopLevelRangeInDoc(view.state.doc, pos);
}

function isInsertPosInsideRanges(insertPos: number, ranges: readonly BlockRange[]): boolean {
  return ranges.some((range) => insertPos >= range.from && insertPos <= range.to);
}

function resolveInlineParagraphInsertTarget(view: EditorView, insertPos: number): TopLevelRange | null {
  const paragraph = resolveTopLevelRangeAtPos(view, insertPos);
  if (!paragraph || paragraph.name !== 'paragraph') return null;
  if (insertPos <= paragraph.from || insertPos >= paragraph.to) return null;
  return paragraph;
}

function resolveInlineLineMoveRanges(view: EditorView, selectedRanges: readonly BlockRange[]): BlockRange[] | null {
  const ranges = normalizeBlockRanges(mapRangesToSelectableBlocks(view.state.doc, selectedRanges));
  if (ranges.length === 0) return null;
  if (!ranges.every((range) => isInlineSelectableBlockRange(view.state.doc, range))) return null;

  const firstTopLevel = resolveTopLevelRangeAtPos(view, ranges[0].from);
  if (!firstTopLevel || firstTopLevel.name !== 'paragraph') return null;
  const sameParagraph = ranges.every((range) => {
    const topLevel = resolveTopLevelRangeAtPos(view, range.from);
    return topLevel?.from === firstTopLevel.from && topLevel.to === firstTopLevel.to;
  });
  return sameParagraph ? ranges : null;
}

function canApplyInlineLineMove(view: EditorView, selectedRanges: readonly BlockRange[], insertPos: number): boolean {
  const ranges = resolveInlineLineMoveRanges(view, selectedRanges);
  if (!ranges || isInsertPosInsideRanges(insertPos, ranges)) return false;

  const paragraph = resolveTopLevelRangeAtPos(view, ranges[0].from);
  if (!paragraph) return false;
  if (insertPos > paragraph.from && insertPos < paragraph.to) return true;

  const movedContent = buildInlineLineBlockFragment(view, ranges);
  if (movedContent.size === 0) return false;
  try {
    const $target = view.state.doc.resolve(Math.max(0, Math.min(insertPos, view.state.doc.content.size)));
    const index = $target.index();
    return $target.parent.canReplace(index, index, movedContent);
  } catch {
    return false;
  }
}

function setSelectionAtMovedContentTail(
  tr: EditorState['tr'],
  insertedFrom: number,
  insertedSize: number,
): EditorState['tr'] {
  const anchor = Math.max(0, Math.min(insertedFrom + insertedSize, tr.doc.content.size));
  const $anchor = tr.doc.resolve(anchor);
  const backwardSelection = Selection.near($anchor, -1);
  const selectionParent = backwardSelection.$from.parent;
  const isImageOnlyParagraph = selectionParent.type.name === 'paragraph'
    && selectionParent.childCount > 0
    && Array.from({ length: selectionParent.childCount }, (_, index) => selectionParent.child(index))
      .every((child) => child.type.name === 'image');
  if (!isImageOnlyParagraph) {
    return tr.setSelection(backwardSelection);
  }

  const forwardSelection = Selection.near($anchor, 1);
  if (forwardSelection.$from.parent !== selectionParent) {
    return tr.setSelection(forwardSelection);
  }

  const paragraphType = tr.doc.type.schema.nodes.paragraph;
  const insertIndex = $anchor.index();
  if (paragraphType && $anchor.parent.canReplaceWith(insertIndex, insertIndex, paragraphType)) {
    tr.insert(anchor, paragraphType.create());
    return tr.setSelection(Selection.near(tr.doc.resolve(anchor), 1));
  }

  return tr.setSelection(backwardSelection);
}

function stripTerminalHardBreak(content: Fragment): Fragment {
  const children: ProseNode[] = [];
  content.forEach((child) => {
    children.push(child);
  });
  if (children[children.length - 1]?.type.name === 'hardbreak') {
    children.pop();
  }
  return Fragment.fromArray(children);
}

function buildInlineLineBlockFragment(view: EditorView, ranges: readonly BlockRange[]): Fragment {
  const paragraphType = view.state.schema.nodes.paragraph;
  if (!paragraphType) return Fragment.empty;

  let content = Fragment.empty;
  for (const range of ranges) {
    const lineContent = stripTerminalHardBreak(view.state.doc.slice(range.from, range.to).content);
    content = content.append(Fragment.from(paragraphType.create(null, lineContent as unknown as ProseNode[])));
  }
  return content;
}

function applyInlineLineMoveWithinParagraph(
  view: EditorView,
  ranges: readonly BlockRange[],
  insertPos: number,
  paragraph: TopLevelRange,
): boolean {
  if (insertPos <= paragraph.from || insertPos >= paragraph.to) return false;

  const movedContent = ranges.reduce(
    (content, range) => content.append(view.state.doc.slice(range.from, range.to).content),
    Fragment.empty,
  );
  if (movedContent.size === 0) return false;

  const deletedBeforeInsert = ranges.reduce((total, range) => (
    range.to <= insertPos ? total + (range.to - range.from) : total
  ), 0);
  const targetPos = insertPos - deletedBeforeInsert;
  if (targetPos === ranges[0].from) return false;

  let tr = view.state.tr;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    tr = tr.delete(ranges[index].from, ranges[index].to);
  }
  tr = tr.insert(targetPos, movedContent);
  const selectionAnchor = Math.max(0, Math.min(targetPos + movedContent.size, tr.doc.content.size));
  tr = tr.setSelection(Selection.near(tr.doc.resolve(selectionAnchor), 1)).scrollIntoView();
  markEditorUserInput(view);
  view.dispatch(tr);
  view.focus();
  return true;
}

function applyInlineLineMoveToBlockBoundary(
  view: EditorView,
  ranges: readonly BlockRange[],
  insertPos: number,
): boolean {
  const movedContent = buildInlineLineBlockFragment(view, ranges);
  if (movedContent.size === 0) return false;

  const deletedBeforeInsert = ranges.reduce((total, range) => (
    range.to <= insertPos ? total + (range.to - range.from) : total
  ), 0);
  const targetPos = insertPos - deletedBeforeInsert;
  if (targetPos === ranges[0].from) return false;

  let tr = view.state.tr;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    tr = tr.delete(ranges[index].from, ranges[index].to);
  }

  const safeTargetPos = Math.max(0, Math.min(targetPos, tr.doc.content.size));
  const $target = tr.doc.resolve(safeTargetPos);
  const targetIndex = $target.index();
  if (!$target.parent.canReplace(targetIndex, targetIndex, movedContent)) return false;

  tr = tr.insert(safeTargetPos, movedContent);
  const selectionAnchor = Math.max(0, Math.min(safeTargetPos + movedContent.size, tr.doc.content.size));
  tr = tr.setSelection(Selection.near(tr.doc.resolve(selectionAnchor), 1)).scrollIntoView();
  markEditorUserInput(view);
  view.dispatch(tr);
  view.focus();
  return true;
}

function applyInlineLineMove(view: EditorView, selectedRanges: readonly BlockRange[], insertPos: number): boolean {
  const ranges = resolveInlineLineMoveRanges(view, selectedRanges);
  if (!ranges || isInsertPosInsideRanges(insertPos, ranges)) return false;

  const paragraph = resolveTopLevelRangeAtPos(view, ranges[0].from);
  if (!paragraph) return false;

  try {
    return insertPos > paragraph.from && insertPos < paragraph.to
      ? applyInlineLineMoveWithinParagraph(view, ranges, insertPos, paragraph)
      : applyInlineLineMoveToBlockBoundary(view, ranges, insertPos);
  } catch {
    return false;
  }
}

function canApplyBlockMoveIntoInlineParagraph(
  view: EditorView,
  selectedRanges: readonly BlockRange[],
  insertPos: number,
): boolean {
  if (!resolveInlineParagraphInsertTarget(view, insertPos)) return false;
  if (resolveInlineLineMoveRanges(view, selectedRanges)) return false;
  return resolveBlockMoveContext(view, selectedRanges, insertPos) !== null;
}

function applyBlockMoveIntoInlineParagraph(
  view: EditorView,
  selectedRanges: readonly BlockRange[],
  insertPos: number,
): boolean {
  const targetParagraph = resolveInlineParagraphInsertTarget(view, insertPos);
  if (!targetParagraph) return false;

  const moveContext = resolveBlockMoveContext(view, selectedRanges, insertPos);
  if (!moveContext) return false;

  try {
    let movedContent = Fragment.empty;
    for (const range of moveContext.selectedRanges) {
      movedContent = movedContent.append(view.state.doc.slice(range.from, range.to).content);
    }
    movedContent = convertMovedFrontmatterToPlainText(view, movedContent, moveContext.targetPos);
    if (movedContent.size === 0) return false;

    let tr = view.state.tr;
    for (let index = moveContext.deleteRanges.length - 1; index >= 0; index -= 1) {
      const range = moveContext.deleteRanges[index];
      tr = tr.delete(range.from, range.to);
    }

    const mappedInsertPos = Math.max(0, Math.min(moveContext.targetPos, tr.doc.content.size));
    const mappedParagraph = resolveTopLevelRangeInDoc(tr.doc, mappedInsertPos);
    if (!mappedParagraph || mappedParagraph.name !== 'paragraph') return false;

    const paragraphNode = tr.doc.nodeAt(mappedParagraph.from);
    if (!paragraphNode || paragraphNode.type.name !== 'paragraph') return false;

    const paragraphContentFrom = mappedParagraph.from + 1;
    const splitOffset = Math.max(0, Math.min(mappedInsertPos - paragraphContentFrom, paragraphNode.content.size));
    const paragraphContent = paragraphNode.content as unknown as Fragment;
    const beforeContent = paragraphContent.cut(0, splitOffset);
    const afterContent = paragraphContent.cut(splitOffset);
    const beforeParagraph = paragraphNode.type.create(paragraphNode.attrs, beforeContent);
    let replacement = Fragment.from(beforeParagraph);
    replacement = replacement.append(movedContent);
    replacement = replacement.append(Fragment.from(paragraphNode.type.create(paragraphNode.attrs, afterContent)));

    tr = tr.replaceWith(mappedParagraph.from, mappedParagraph.to, replacement);
    tr = setSelectionAtMovedContentTail(tr, mappedParagraph.from + beforeParagraph.nodeSize, movedContent.size)
      .scrollIntoView();
    markEditorUserInput(view);
    view.dispatch(tr);
    view.focus();
    return true;
  } catch {
    return false;
  }
}

export function canApplyBlockMove(view: EditorView, selectedRanges: readonly BlockRange[], insertPos: number): boolean {
  if (canApplyInlineLineMove(view, selectedRanges, insertPos)) return true;
  if (canApplyBlockMoveIntoInlineParagraph(view, selectedRanges, insertPos)) return true;

  const moveContext = resolveBlockMoveContext(view, selectedRanges, insertPos);
  if (!moveContext) return false;
  return prepareBlockMove(view, moveContext) !== null;
}

export function applyBlockMove(view: EditorView, selectedRanges: readonly BlockRange[], insertPos: number): boolean {
  if (applyInlineLineMove(view, selectedRanges, insertPos)) return true;
  if (applyBlockMoveIntoInlineParagraph(view, selectedRanges, insertPos)) return true;

  const moveContext = resolveBlockMoveContext(view, selectedRanges, insertPos);
  if (!moveContext) return false;

  try {
    const preparedMove = prepareBlockMove(view, moveContext);
    if (!preparedMove) return false;

    let tr = preparedMove.tr.insert(preparedMove.targetPos, preparedMove.movedContent);
    tr = setSelectionAtMovedContentTail(tr, preparedMove.targetPos, preparedMove.contentTailOffset).scrollIntoView();
    markEditorUserInput(view);
    view.dispatch(tr);
    view.focus();
    return true;
  } catch {
    return false;
  }
}
