import {
  getWhiteboardDeleteUpdate,
  getWhiteboardSparseUpdate,
  getWhiteboardSpliceUpdate,
  type WhiteboardSpliceEdit,
} from '@/components/Whiteboard/model/core/whiteboardCollection';

interface WhiteboardItemOrder {
  get: (id: string) => number | undefined;
}

export interface WhiteboardSparseCollectionUpdate<T> {
  changedItems: T[];
  mutationCount: number;
  order: WhiteboardItemOrder;
}

export function getWhiteboardSparseCollectionUpdate<T extends { id: string }>(
  current: T[],
  next: T[],
  currentOrder: WhiteboardItemOrder,
  maxChangedItems = Number.POSITIVE_INFINITY,
): WhiteboardSparseCollectionUpdate<T> | null {
  const knownSplice = getWhiteboardSpliceUpdate(current, next);
  if (knownSplice) {
    const changedItems = knownSplice.edits.flatMap((edit) => edit.items);
    if (changedItems.length > maxChangedItems) return null;
    return {
      changedItems,
      mutationCount: getSpliceMutationCount(current, knownSplice.edits),
      order: createSpliceOrder(current, currentOrder, knownSplice.edits),
    };
  }
  const knownDeletion = getWhiteboardDeleteUpdate(current, next);
  if (knownDeletion) {
    return {
      changedItems: [],
      mutationCount: knownDeletion.removedIndices.length,
      order: createDeletionOrder(currentOrder, knownDeletion.removedIndices),
    };
  }
  const knownUpdate = getWhiteboardSparseUpdate(current, next);
  if (knownUpdate) {
    if (knownUpdate.changedItems.length > maxChangedItems) return null;
    return {
      changedItems: knownUpdate.changedItems,
      mutationCount: knownUpdate.changedItems.length,
      order: currentOrder,
    };
  }
  const changedItems: T[] = [];
  const order = new Map<string, number>();
  let mutationCount = 0;
  for (let index = 0; index < next.length; index += 1) {
    const item = next[index];
    order.set(item.id, index);
    const previousIndex = currentOrder.get(item.id);
    if (previousIndex === undefined || current[previousIndex] !== item) {
      changedItems.push(item);
      mutationCount += 1;
      if (changedItems.length > maxChangedItems) return null;
    }
  }
  for (const item of current) {
    if (!order.has(item.id)) mutationCount += 1;
  }
  return { changedItems, mutationCount, order };
}

function createDeletionOrder(
  currentOrder: WhiteboardItemOrder,
  removedIndices: number[],
): WhiteboardItemOrder {
  return {
    get(id) {
      const currentIndex = currentOrder.get(id);
      if (currentIndex === undefined) return undefined;
      const removedBefore = getInsertionIndex(removedIndices, currentIndex);
      return removedIndices[removedBefore] === currentIndex
        ? undefined
        : currentIndex - removedBefore;
    },
  };
}

function getInsertionIndex(sortedValues: number[], value: number): number {
  let start = 0;
  let end = sortedValues.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (sortedValues[middle] < value) start = middle + 1;
    else end = middle;
  }
  return start;
}

function getSpliceMutationCount<T extends { id: string }>(
  current: T[],
  edits: WhiteboardSpliceEdit<T>[],
): number {
  let count = 0;
  for (const edit of edits) {
    const sourceId = current[edit.index]?.id;
    count += edit.items.length;
    if (sourceId && !edit.items.some((item) => item.id === sourceId)) count += 1;
  }
  return count;
}

function createSpliceOrder<T extends { id: string }>(
  current: T[],
  currentOrder: WhiteboardItemOrder,
  edits: WhiteboardSpliceEdit<T>[],
): WhiteboardItemOrder {
  const editedIndices = edits.map((edit) => edit.index);
  const cumulativeDeltas: number[] = [];
  const localOrder = new Map<string, number>();
  let delta = 0;
  for (let editIndex = 0; editIndex < edits.length; editIndex += 1) {
    const edit = edits[editIndex];
    const nextIndex = edit.index + delta;
    edit.items.forEach((item, itemIndex) => localOrder.set(item.id, nextIndex + itemIndex));
    delta += edit.items.length - 1;
    cumulativeDeltas[editIndex] = delta;
  }
  return {
    get(id) {
      const localIndex = localOrder.get(id);
      if (localIndex !== undefined) return localIndex;
      const currentIndex = currentOrder.get(id);
      if (currentIndex === undefined) return undefined;
      const editPosition = getInsertionIndex(editedIndices, currentIndex);
      if (editedIndices[editPosition] === currentIndex && current[currentIndex]?.id === id) return undefined;
      return currentIndex + (editPosition > 0 ? cumulativeDeltas[editPosition - 1] : 0);
    },
  };
}
