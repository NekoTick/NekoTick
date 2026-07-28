import { $prose } from '@milkdown/kit/utils';
import type { Node as ProseNode, ResolvedPos } from '@milkdown/kit/prose/model';
import { Plugin, Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

type ShiftSelectionDirection = 'up' | 'down';

type TextblockBoundary = {
  contentEnd: number;
  contentStart: number;
  rootIndex: number;
  $pos: ResolvedPos;
};

function getShiftSelectionDirection(event: KeyboardEvent): ShiftSelectionDirection | null {
  if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
    return null;
  }

  if (event.key === 'ArrowUp') return 'up';
  if (event.key === 'ArrowDown') return 'down';
  return null;
}

function getModifiedShiftSelectionDirection(event: KeyboardEvent): ShiftSelectionDirection | null {
  if (
    event.defaultPrevented ||
    !event.shiftKey ||
    (!event.ctrlKey && !event.metaKey) ||
    event.altKey ||
    event.isComposing
  ) {
    return null;
  }

  if (event.key === 'ArrowUp') return 'up';
  if (event.key === 'ArrowDown') return 'down';
  return null;
}

function startsInsideNestedEditor(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof Element && Boolean(target.closest('.cm-editor, input, textarea, select'));
}

function findAncestorDepth($pos: ResolvedPos, nodeName: string): number | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === nodeName) return depth;
  }
  return null;
}

function findTextSelectionOutsideTable(
  $pos: ResolvedPos,
  tableDepth: number,
  direction: ShiftSelectionDirection,
): TextSelection | null {
  const tableBoundary = direction === 'up'
    ? $pos.before(tableDepth)
    : $pos.after(tableDepth);
  const selection = Selection.findFrom(
    $pos.doc.resolve(tableBoundary),
    direction === 'up' ? -1 : 1,
    true,
  );
  return selection instanceof TextSelection ? selection : null;
}

function resolveRegressedIsolatingSelectionHead(
  selection: TextSelection,
  direction: ShiftSelectionDirection,
): number | null {
  const { $head, anchor, head } = selection;
  if ($head.depth === 0 || !$head.parent.isTextblock || !$head.parent.type.spec.isolating) {
    return null;
  }

  const currentStart = $head.start();
  const currentEnd = $head.end();
  const regressedToBoundary = direction === 'down'
    ? head === currentStart && anchor < currentStart
    : head === currentEnd && anchor > currentEnd;
  if (!regressedToBoundary) return null;

  const outsideBoundary = direction === 'up' ? $head.before() : $head.after();
  const outside = Selection.findFrom(
    $head.doc.resolve(outsideBoundary),
    direction === 'up' ? -1 : 1,
    true,
  );
  if (!(outside instanceof TextSelection)) return null;

  return direction === 'up' ? outside.$head.end() : outside.$head.start();
}

function resolveModifiedSelectionHead(
  selection: TextSelection,
  direction: ShiftSelectionDirection,
): number {
  const { $head, head } = selection;
  if (!$head.parent.isTextblock || $head.depth === 0) return head;

  const recoveredHead = resolveRegressedIsolatingSelectionHead(selection, direction);
  if (recoveredHead !== null) return recoveredHead;

  const currentStart = $head.start();
  const currentEnd = $head.end();
  if (direction === 'up' && head > currentStart) return currentStart;
  if (direction === 'down' && head < currentEnd) return currentEnd;

  const currentTableDepth = findAncestorDepth($head, 'table');
  if (currentTableDepth !== null) {
    return head;
  }

  const searchPos = direction === 'up' ? $head.before() : $head.after();
  const adjacent = Selection.findFrom(
    $head.doc.resolve(searchPos),
    direction === 'up' ? -1 : 1,
    true,
  );
  if (!(adjacent instanceof TextSelection)) return head;

  const adjacentTableDepth = findAncestorDepth(adjacent.$head, 'table');
  if (adjacentTableDepth !== null) {
    const outside = findTextSelectionOutsideTable(adjacent.$head, adjacentTableDepth, direction);
    if (!outside) return head;
    return direction === 'up' ? outside.$head.end() : outside.$head.start();
  }

  return direction === 'up' ? adjacent.$head.start() : adjacent.$head.end();
}

function clampSelectionHeadToAnchor(
  anchor: number,
  head: number,
  target: number,
  direction: ShiftSelectionDirection,
): number {
  if (direction === 'up' && head > anchor && target < anchor) return anchor;
  if (direction === 'down' && head < anchor && target > anchor) return anchor;
  return target;
}

export function handleModifiedVerticalShiftSelection(view: EditorView, event: KeyboardEvent): boolean {
  const direction = getModifiedShiftSelectionDirection(event);
  if (!direction || startsInsideNestedEditor(event)) return false;

  const { selection } = view.state;
  if (!(selection instanceof TextSelection)) return false;

  const resolvedHead = resolveModifiedSelectionHead(selection, direction);
  const nextHead = clampSelectionHeadToAnchor(
    selection.anchor,
    selection.head,
    resolvedHead,
    direction,
  );

  event.preventDefault();
  if (nextHead === selection.head) return true;

  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, selection.anchor, nextHead))
      .scrollIntoView(),
  );
  return true;
}

function getTopLevelTextblockBoundary(view: EditorView, pos: number): TextblockBoundary | null {
  const $pos = view.state.doc.resolve(pos);
  if ($pos.depth !== 1 || !$pos.parent.isTextblock) {
    return null;
  }

  const blockStart = $pos.before(1);
  return {
    $pos,
    contentStart: blockStart + 1,
    contentEnd: blockStart + 1 + $pos.parent.content.size,
    rootIndex: $pos.index(0),
  };
}

function isSameTopLevelTextblock(view: EditorView, firstPos: number, secondPos: number): boolean {
  const first = getTopLevelTextblockBoundary(view, firstPos);
  const second = getTopLevelTextblockBoundary(view, secondPos);
  return Boolean(first && second && first.contentStart === second.contentStart && first.contentEnd === second.contentEnd);
}

function isContainerBlock(node: ProseNode | null | undefined): boolean {
  return Boolean(node && !node.isTextblock && !node.isAtom && node.content.size > 0);
}

function hasAdjacentContainerBlock(
  view: EditorView,
  boundary: TextblockBoundary,
  direction: ShiftSelectionDirection
): boolean {
  const adjacentIndex = direction === 'up' ? boundary.rootIndex - 1 : boundary.rootIndex + 1;
  if (adjacentIndex < 0 || adjacentIndex >= view.state.doc.childCount) {
    return false;
  }

  return isContainerBlock(view.state.doc.child(adjacentIndex));
}

function isAtVisualTextblockBoundary(
  view: EditorView,
  direction: ShiftSelectionDirection,
  boundary: TextblockBoundary
): boolean {
  const targetPos = direction === 'up' ? boundary.contentStart : boundary.contentEnd;
  if (boundary.$pos.pos === targetPos) {
    return true;
  }

  if (typeof view.endOfTextblock !== 'function') {
    return direction === 'up'
      ? boundary.$pos.parentOffset === 0
      : boundary.$pos.parentOffset === boundary.$pos.parent.content.size;
  }

  return view.endOfTextblock(direction);
}

export function handleContainerBoundaryShiftSelection(view: EditorView, event: KeyboardEvent): boolean {
  const direction = getShiftSelectionDirection(event);
  if (!direction) {
    return false;
  }

  const { selection } = view.state;
  if (!(selection instanceof TextSelection)) {
    return false;
  }

  if (!selection.empty && !isSameTopLevelTextblock(view, selection.anchor, selection.head)) {
    return false;
  }

  const boundary = getTopLevelTextblockBoundary(view, selection.head);
  if (!boundary || !hasAdjacentContainerBlock(view, boundary, direction)) {
    return false;
  }

  const targetPos = direction === 'up' ? boundary.contentStart : boundary.contentEnd;
  if (!selection.empty && selection.head === targetPos) {
    return false;
  }

  if (!isAtVisualTextblockBoundary(view, direction, boundary)) {
    return false;
  }

  event.preventDefault();
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selection.anchor, targetPos)));
  return true;
}

export const containerBoundaryShiftSelectionPlugin = $prose(() => {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        return handleModifiedVerticalShiftSelection(view, event)
          || handleContainerBoundaryShiftSelection(view, event);
      },
    },
  });
});
