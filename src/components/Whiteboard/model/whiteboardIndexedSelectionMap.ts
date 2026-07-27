import type { WhiteboardItemOrder } from './whiteboardSpatialIndex';

export function createWhiteboardIndexedSelectionMap<T extends { id: string }>(
  items: T[],
  ids: string[],
  order: WhiteboardItemOrder,
  fullSelection: boolean,
): ReadonlyMap<string, T> {
  return new WhiteboardIndexedSelectionMap(items, ids, order, fullSelection);
}

class WhiteboardIndexedSelectionMap<T extends { id: string }> implements ReadonlyMap<string, T> {
  readonly #ids: string[] | null;
  readonly #items: T[];
  readonly #order: WhiteboardItemOrder;
  readonly #selectedIds: Set<string> | null;
  readonly size: number;
  readonly [Symbol.toStringTag] = 'WhiteboardIndexedSelectionMap';

  constructor(items: T[], ids: string[], order: WhiteboardItemOrder, fullSelection: boolean) {
    this.#ids = fullSelection ? null : ids;
    this.#items = items;
    this.#order = order;
    this.#selectedIds = fullSelection ? null : new Set(ids);
    this.size = fullSelection ? items.length : this.#selectedIds.size;
  }

  get(id: string): T | undefined {
    if (this.#selectedIds && !this.#selectedIds.has(id)) return undefined;
    const index = this.#order.get(id);
    const item = index === undefined ? undefined : this.#items[index];
    return item?.id === id ? item : undefined;
  }

  has(id: string): boolean {
    return this.get(id) !== undefined;
  }

  *entries() {
    for (const item of this.values()) yield [item.id, item] as [string, T];
  }

  *keys() {
    for (const item of this.values()) yield item.id;
  }

  *values() {
    if (this.#ids === null) {
      yield* this.#items;
      return;
    }
    for (const id of this.#ids) {
      const item = this.get(id);
      if (item) yield item;
    }
  }

  forEach(callback: (value: T, key: string, map: ReadonlyMap<string, T>) => void, thisArg?: unknown): void {
    for (const item of this.values()) callback.call(thisArg, item, item.id, this);
  }

  [Symbol.iterator]() {
    return this.entries();
  }
}
