import { describe, expect, it } from 'vitest';
import { getWhiteboardItemIds, isWhiteboardFullSelection } from '@/components/Whiteboard/model/core/whiteboardCollection';
import { getWhiteboardSelectedItemMap } from './whiteboardIndexedSelectionMap';

describe('whiteboard indexed selection map', () => {
  it('iterates a repeated selected id once', () => {
    const item = { id: 'item' };
    const selection = getWhiteboardSelectedItemMap(
      [item],
      [item.id, item.id],
      new Map([[item.id, 0]]),
      false,
    );

    expect(selection.size).toBe(1);
    expect([...selection.values()]).toEqual([item]);
  });

  it('does not mark duplicate source ids as a full selection', () => {
    const items = [{ id: 'item', value: 1 }, { id: 'item', value: 2 }];
    const ids = getWhiteboardItemIds(items);

    expect(ids).toEqual(['item']);
    expect(isWhiteboardFullSelection(ids, items)).toBe(false);
  });
});
