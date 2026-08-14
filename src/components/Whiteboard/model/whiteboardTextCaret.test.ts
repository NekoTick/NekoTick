import { describe, expect, it } from 'vitest';
import type { WhiteboardElement, WhiteboardPoint } from './whiteboardModel';
import { getWhiteboardTextCaretIndex } from './whiteboardText';

const multilineText: WhiteboardElement = {
  color: '#111111', fontSize: 24, height: 60, id: 'text-1', lineHeight: 1.25,
  text: 'ABCD\nEFGH', type: 'text', width: 32, x: 10, y: 20,
};

describe('whiteboard text caret placement', () => {
  it('places the caret after the nearest character on the clicked line', () => {
    expect(getWhiteboardTextCaretIndex(multilineText, { x: 31, y: 35 })).toBe(3);
    expect(getWhiteboardTextCaretIndex(multilineText, { x: 23, y: 56 })).toBe(7);
  });

  it('undoes rotation and flips before resolving the character', () => {
    const transformed = {
      ...multilineText,
      flipX: true,
      flipY: true,
      rotation: Math.PI / 2,
    };
    const point = transformTextPoint(transformed, { x: 21, y: 15 });

    expect(getWhiteboardTextCaretIndex(transformed, point)).toBe(3);
  });

  it('uses visual RTL positions without splitting compound characters', () => {
    const rtl = { ...multilineText, height: 30, text: 'אבג', width: 24 };
    expect(getWhiteboardTextCaretIndex(rtl, { x: 26, y: 35 })).toBe(1);

    const emoji = { ...rtl, text: 'A👨‍👩‍👧‍👦B', width: 104 };
    expect(getWhiteboardTextCaretIndex(emoji, { x: 90, y: 35 })).toBe(12);
  });
});

function transformTextPoint(element: WhiteboardElement, localPoint: WhiteboardPoint): WhiteboardPoint {
  const localX = element.flipX ? element.width - localPoint.x : localPoint.x;
  const localY = element.flipY ? element.height - localPoint.y : localPoint.y;
  const center = { x: element.width / 2, y: element.height / 2 };
  const dx = localX - center.x;
  const dy = localY - center.y;
  const angle = element.rotation ?? 0;
  return {
    x: element.x + center.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: element.y + center.y + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}
