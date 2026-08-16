const mutations = new WeakMap<object, WhiteboardCollectionMutation<unknown>>();
const itemIds = new WeakMap<object, string[]>();
const fullSelectionSources = new WeakMap<object, object>();

interface WhiteboardAppendMutation<T> {
  kind: 'append';
  source: T[];
  start: number;
}

interface WhiteboardSparseMutation<T> {
  changedItems: T[];
  kind: 'sparse';
  source: T[];
}

export interface WhiteboardSpliceEdit<T> {
  index: number;
  items: T[];
}

interface WhiteboardSpliceMutation<T> {
  edits: WhiteboardSpliceEdit<T>[];
  kind: 'splice';
  source: T[];
}

interface WhiteboardDeleteMutation<T> {
  kind: 'delete';
  removedIndices: number[];
  source: T[];
}

type WhiteboardCollectionMutation<T> = WhiteboardAppendMutation<T> | WhiteboardDeleteMutation<T> | WhiteboardSparseMutation<T> | WhiteboardSpliceMutation<T>;

export function appendWhiteboardItems<T>(current: T[], additions: readonly T[]): T[] {
  if (additions.length === 0) return current;
  const next = [...current, ...additions];
  mutations.set(next, { kind: 'append', source: current, start: current.length });
  return next;
}

export function markWhiteboardSparseUpdate<T>(
  current: T[],
  next: T[],
  changedItems: T[],
): T[] {
  mutations.set(next, { changedItems, kind: 'sparse', source: current });
  return next;
}

export function markWhiteboardSpliceUpdate<T>(
  current: T[],
  next: T[],
  edits: WhiteboardSpliceEdit<T>[],
): T[] {
  mutations.set(next, { edits, kind: 'splice', source: current });
  return next;
}

export function removeWhiteboardItems<T extends { id: string }>(current: T[], removedIds: ReadonlySet<string>): T[] {
  if (removedIds.size === 0) return current;
  const next: T[] = [];
  const removedIndices: number[] = [];
  for (let index = 0; index < current.length; index += 1) {
    const item = current[index];
    if (removedIds.has(item.id)) removedIndices.push(index);
    else next.push(item);
  }
  if (removedIndices.length === 0) return current;
  mutations.set(next, { kind: 'delete', removedIndices, source: current });
  return next;
}

export function getWhiteboardAppendStart<T>(current: T[], next: T[]): number | null {
  let candidate: T[] = next;
  while (candidate.length >= current.length) {
    const mutation = mutations.get(candidate) as WhiteboardCollectionMutation<T> | undefined;
    if (!mutation || mutation.kind !== 'append') return null;
    if (mutation.source === current) return current.length;
    candidate = mutation.source;
  }
  return null;
}

export function getWhiteboardSparseUpdate<T>(
  current: T[],
  next: T[],
): WhiteboardSparseMutation<T> | null {
  const mutation = mutations.get(next) as WhiteboardCollectionMutation<T> | undefined;
  return mutation?.kind === 'sparse' && mutation.source === current ? mutation : null;
}

export function getWhiteboardDeleteUpdate<T>(
  current: T[],
  next: T[],
): WhiteboardDeleteMutation<T> | null {
  const mutation = mutations.get(next) as WhiteboardCollectionMutation<T> | undefined;
  return mutation?.kind === 'delete' && mutation.source === current ? mutation : null;
}

export function getWhiteboardSpliceUpdate<T>(
  current: T[],
  next: T[],
): WhiteboardSpliceMutation<T> | null {
  const mutation = mutations.get(next) as WhiteboardCollectionMutation<T> | undefined;
  return mutation?.kind === 'splice' && mutation.source === current ? mutation : null;
}

export function getWhiteboardItemIds<T extends { id: string }>(items: T[]): string[] {
  const cached = itemIds.get(items);
  if (cached) return cached;
  const ids = [...new Set(items.map((item) => item.id))];
  itemIds.set(items, ids);
  if (ids.length === items.length) fullSelectionSources.set(ids, items);
  return ids;
}

export function isWhiteboardFullSelection<T>(ids: string[], items: T[]): boolean {
  return fullSelectionSources.get(ids) === items;
}

export function markWhiteboardFullSelection<T>(ids: string[], items: T[]): void {
  fullSelectionSources.set(ids, items);
}
