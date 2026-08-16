import { describe, expect, it } from 'vitest';
import { cloneElements } from './whiteboardTransform';

describe('cloneElements', () => {
  it('copies images with new ids and an offset', () => {
    const cloned = cloneElements([
      { height: 72, id: 'image', text: 'Image', type: 'image', width: 176, x: 280, y: 0 },
    ], 20, 'copy');

    expect(cloned[0]).toMatchObject({ id: 'copy-element-1', x: 300, y: 20 });
  });

  it('assigns unique ids when source ids are repeated', () => {
    const cloned = cloneElements([
      { height: 20, id: 'duplicate', text: 'First', type: 'image', width: 20, x: 0, y: 0 },
      { height: 20, id: 'duplicate', text: 'Second', type: 'image', width: 20, x: 40, y: 0 },
    ], 20, 'copy');

    expect(cloned.map((element) => element.id)).toEqual(['copy-element-1', 'copy-element-2']);
  });
});
