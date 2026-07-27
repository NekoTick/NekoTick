import type { Fragment } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { pruneContainedBlockRanges, type BlockRange } from './blockSelectionUtils';
import { createBlockMovePlan } from './blockControlsUtils';
import {
  buildDeleteRangesFromSelectedListItems,
  collectSelectedListItemInfo,
  type SelectedListItemInfo,
} from './listBlockUtils';
import {
  expandMovedFrontmatterDeleteRanges,
  expandMoveDeleteRangesWithAdjacentBlankLines,
  hasMovedNonBlankContent,
  removeAdjacentBlankLinesForMoveTarget,
} from './blockControlsMoveBlankLines';
import {
  buildLiftedSourceFragment,
  buildMovedContent,
  collectSourceResidualInsertions,
  isInsertionInsideList,
} from './blockControlsMoveContent';
import {
  addMovedFrontmatterParagraphBoundaries,
  convertMovedFrontmatterToPlainText,
} from './blockControlsMoveFrontmatter';

export interface BlockMoveContext {
  selectedRanges: BlockRange[];
  listItemInfoByRangeKey: Map<string, SelectedListItemInfo>;
  deleteRanges: BlockRange[];
  targetPos: number;
}

export interface PreparedBlockMove {
  tr: EditorView['state']['tr'];
  targetPos: number;
  movedContent: Fragment;
  contentTailOffset: number;
}

export { convertMovedFrontmatterToPlainText };

function isInsertPosInsideRanges(insertPos: number, ranges: readonly BlockRange[]): boolean {
  return ranges.some((range) => insertPos >= range.from && insertPos <= range.to);
}

function resolveAdjustedTargetPos(insertPos: number, deleteRanges: readonly BlockRange[]): number {
  const deletedBeforeInsert = deleteRanges.reduce((total, range) => (
    range.to <= insertPos ? total + (range.to - range.from) : total
  ), 0);
  return insertPos - deletedBeforeInsert;
}

export function resolveBlockMoveContext(
  view: EditorView,
  selectedRanges: readonly BlockRange[],
  insertPos: number,
): BlockMoveContext | null {
  const movePlan = createBlockMovePlan(pruneContainedBlockRanges(selectedRanges), insertPos);
  if (!movePlan) return null;

  const listItemInfoByRangeKey = collectSelectedListItemInfo(view.state, movePlan.selectedRanges);
  const baseDeleteRanges = expandMovedFrontmatterDeleteRanges(
    view.state.doc,
    movePlan.selectedRanges,
    buildDeleteRangesFromSelectedListItems(movePlan.selectedRanges, listItemInfoByRangeKey),
    insertPos,
  );
  const deleteRanges = expandMoveDeleteRangesWithAdjacentBlankLines(
    view.state.doc,
    movePlan.selectedRanges,
    baseDeleteRanges,
  );
  if (deleteRanges.length === 0) return null;
  if (isInsertPosInsideRanges(insertPos, deleteRanges)) return null;

  const targetPos = resolveAdjustedTargetPos(insertPos, deleteRanges);
  if (targetPos === deleteRanges[0].from) return null;

  return {
    selectedRanges: movePlan.selectedRanges,
    listItemInfoByRangeKey,
    deleteRanges,
    targetPos,
  };
}

export function prepareBlockMove(
  view: EditorView,
  moveContext: BlockMoveContext,
): PreparedBlockMove | null {
  const { state } = view;
  const { selectedRanges, listItemInfoByRangeKey, deleteRanges } = moveContext;

  let tr = state.tr;
  for (let i = deleteRanges.length - 1; i >= 0; i -= 1) {
    const range = deleteRanges[i];
    tr = tr.delete(range.from, range.to);
  }

  let safeTargetPos = Math.max(0, Math.min(moveContext.targetPos, tr.doc.content.size));

  const sourceResidualInsertions = collectSourceResidualInsertions(selectedRanges, listItemInfoByRangeKey)
    .map((insertion) => ({
      pos: tr.mapping.map(insertion.from, -1),
      groups: insertion.groups,
    }))
    .sort((a, b) => a.pos - b.pos);

  let sourceInsertionOffset = 0;
  for (const insertion of sourceResidualInsertions) {
    const pos = Math.max(0, Math.min(insertion.pos + sourceInsertionOffset, tr.doc.content.size));
    const fragment = buildLiftedSourceFragment(insertion.groups, isInsertionInsideList(tr.doc, pos));
    if (fragment.size === 0) continue;

    const $pos = tr.doc.resolve(pos);
    const index = $pos.index();
    if (!$pos.parent.canReplace(index, index, fragment)) continue;

    tr = tr.insert(pos, fragment);
    sourceInsertionOffset += fragment.size;
    if (pos <= safeTargetPos) {
      safeTargetPos += fragment.size;
    }
  }

  safeTargetPos = Math.max(0, Math.min(safeTargetPos, tr.doc.content.size));
  if (hasMovedNonBlankContent(state.doc, selectedRanges)) {
    const cleaned = removeAdjacentBlankLinesForMoveTarget(tr, safeTargetPos);
    tr = cleaned.tr;
    safeTargetPos = cleaned.targetPos;
  }

  const insertInsideList = isInsertionInsideList(tr.doc, safeTargetPos);
  const $target = tr.doc.resolve(safeTargetPos);
  const targetIndex = $target.index();
  const movesFrontmatterIntoTopLevelBody = safeTargetPos > 0
    && $target.depth === 0
    && selectedRanges.some((range) => state.doc.nodeAt(range.from)?.type.name === 'frontmatter');
  let movedContent = convertMovedFrontmatterToPlainText(
    view,
    buildMovedContent(view, selectedRanges, listItemInfoByRangeKey, insertInsideList),
    safeTargetPos,
  );
  let contentTailOffset = movedContent.size;
  if (movesFrontmatterIntoTopLevelBody) {
    const bounded = addMovedFrontmatterParagraphBoundaries(
      view,
      tr.doc,
      movedContent,
      safeTargetPos,
    );
    movedContent = bounded.content;
    contentTailOffset = bounded.contentTailOffset;
  }
  if (movedContent.size === 0) return null;

  if (!$target.parent.canReplace(targetIndex, targetIndex, movedContent)) {
    let fallbackContent = convertMovedFrontmatterToPlainText(
      view,
      buildMovedContent(view, selectedRanges, listItemInfoByRangeKey, !insertInsideList),
      safeTargetPos,
    );
    if (movesFrontmatterIntoTopLevelBody) {
      const bounded = addMovedFrontmatterParagraphBoundaries(
        view,
        tr.doc,
        fallbackContent,
        safeTargetPos,
      );
      fallbackContent = bounded.content;
      contentTailOffset = bounded.contentTailOffset;
    } else {
      contentTailOffset = fallbackContent.size;
    }
    if (fallbackContent.size === 0) return null;
    if (!$target.parent.canReplace(targetIndex, targetIndex, fallbackContent)) return null;
    movedContent = fallbackContent;
  }

  return {
    tr,
    targetPos: safeTargetPos,
    movedContent,
    contentTailOffset,
  };
}
