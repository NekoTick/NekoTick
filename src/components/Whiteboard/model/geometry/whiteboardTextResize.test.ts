import { describe, expect, it } from 'vitest';
import type { WhiteboardElement } from '@/components/Whiteboard/model/core/whiteboardModel';
import {
  getElementBounds,
  getResizedSelectionBounds,
  getSelectionBounds,
  resizeSelectionElement,
  resizeSelectionElements,
} from '@/components/Whiteboard/model/interaction/whiteboardSelection';

const wideText: WhiteboardElement = {
  color: '#111111',
  fontSize: 24,
  height: 40,
  id: 'wide-text',
  lineHeight: 1.25,
  text: 'A wide line of text',
  type: 'text',
  width: 200,
  x: 10,
  y: 20,
};

describe('whiteboard text resize', () => {
  it.each([
    ['nw', { x: 10, y: 20 }, { x: -110, y: -60 }, { height: 120, width: 600, x: -390, y: -60 }],
    ['ne', { x: 210, y: 20 }, { x: 330, y: -60 }, { height: 120, width: 600, x: 10, y: -60 }],
    ['se', { x: 210, y: 60 }, { x: 330, y: 140 }, { height: 120, width: 600, x: 10, y: 20 }],
    ['sw', { x: 10, y: 60 }, { x: -110, y: 140 }, { height: 120, width: 600, x: -390, y: 20 }],
  ] as const)('uses the largest proportional change from the %s corner', (handle, startPoint, point, expected) => {
    expect(getResizedSelectionBounds(
      getElementBounds(wideText),
      startPoint,
      point,
      handle,
      true,
    )).toEqual(expected);
  });

  it('shrinks proportionally around the opposite corner', () => {
    const nextBounds = getResizedSelectionBounds(
      getElementBounds(wideText),
      { x: 10, y: 20 },
      { x: 110, y: 40 },
      'nw',
      true,
    );

    expect(nextBounds).toEqual({ height: 20, width: 100, x: 110, y: 40 });
    expect(resizeSelectionElement(wideText, getElementBounds(wideText), nextBounds))
      .toMatchObject({ fontSize: 12, height: 20, width: 100, x: 110, y: 40 });
  });

  it.each([
    [{ x: -90, y: 40 }, { flipX: true, fontSize: 12, height: 20, width: 100, x: -90, y: 20 }],
    [{ x: -90, y: 0 }, { flipX: true, flipY: true, fontSize: 12, height: 20, width: 100, x: -90, y: 0 }],
  ])('keeps text proportional after crossing opposite edges', (point, expected) => {
    const startBounds = getElementBounds(wideText);
    const nextBounds = getResizedSelectionBounds(
      startBounds,
      { x: 210, y: 60 },
      point,
      'se',
      true,
    );

    expect(resizeSelectionElement(wideText, startBounds, nextBounds)).toMatchObject(expected);
  });

  it('keeps bounds and font proportional near the crossing point', () => {
    const startBounds = getElementBounds(wideText);
    const nextBounds = getResizedSelectionBounds(
      startBounds,
      { x: 210, y: 60 },
      { x: 10.05, y: 20.01 },
      'se',
      true,
    );
    const resized = resizeSelectionElement(wideText, startBounds, nextBounds);
    const scale = nextBounds.width / startBounds.width;

    expect(resized.width / wideText.width).toBeCloseTo(scale);
    expect(resized.height / wideText.height).toBeCloseTo(scale);
    expect(resized.fontSize! / wideText.fontSize!).toBeCloseTo(scale);
    expect(Object.values(resized).every((value) => typeof value !== 'number' || Number.isFinite(value)))
      .toBe(true);
  });

  it('keeps the aspect ratio exactly at the opposite corner', () => {
    const startBounds = getElementBounds(wideText);
    const nextBounds = getResizedSelectionBounds(
      startBounds,
      { x: 210, y: 60 },
      { x: 10, y: 20 },
      'se',
      true,
    );
    const resized = resizeSelectionElement(wideText, startBounds, nextBounds);

    expect(nextBounds).toEqual({ height: 0.01, width: 0.05, x: 10, y: 20 });
    expect(resized.width / resized.height).toBeCloseTo(wideText.width / wideText.height);
    expect(resized.fontSize! / wideText.fontSize!).toBeCloseTo(resized.width / wideText.width);
  });

  it('scales a rotated text intrinsic geometry around its transformed center', () => {
    const text: WhiteboardElement = {
      ...wideText,
      fontSize: 20,
      height: 40,
      rotation: Math.PI / 4,
      width: 100,
      x: 50,
      y: 70,
    };
    const startBounds = getElementBounds(text);
    const nextBounds = {
      height: startBounds.height * 2,
      width: startBounds.width * 2,
      x: 20,
      y: 30,
    };
    const expectedCenter = {
      x: nextBounds.x + (text.x + text.width / 2 - startBounds.x) * 2,
      y: nextBounds.y + (text.y + text.height / 2 - startBounds.y) * 2,
    };

    const resized = resizeSelectionElement(text, startBounds, nextBounds);

    expect(resized.fontSize).toBeCloseTo(40);
    expect(resized.width).toBeCloseTo(200);
    expect(resized.height).toBeCloseTo(80);
    expect(resized.x + resized.width / 2).toBeCloseTo(expectedCenter.x);
    expect(resized.y + resized.height / 2).toBeCloseTo(expectedCenter.y);
    expect(resized.rotation).toBe(text.rotation);
    expect(getElementBounds(resized)).toMatchObject({
      height: expect.closeTo(nextBounds.height),
      width: expect.closeTo(nextBounds.width),
      x: expect.closeTo(nextBounds.x),
      y: expect.closeTo(nextBounds.y),
    });
  });

  it('reflects a rotated text angle when crossing one opposite edge', () => {
    const text: WhiteboardElement = {
      ...wideText,
      rotation: Math.PI / 6,
      width: 100,
    };
    const startBounds = getElementBounds(text);
    const nextBounds = {
      ...startBounds,
      width: -startBounds.width,
    };
    const resized = resizeSelectionElement(text, startBounds, nextBounds);

    expect(resized).toMatchObject({ flipX: true, rotation: -text.rotation! });
    expect(getElementBounds(resized)).toMatchObject({
      height: expect.closeTo(startBounds.height),
      width: expect.closeTo(startBounds.width),
      x: expect.closeTo(startBounds.x - startBounds.width),
      y: expect.closeTo(startBounds.y),
    });
  });

  it('uses the same text scale and center transform in a mixed selection', () => {
    const rotatedText: WhiteboardElement = {
      ...wideText,
      id: 'rotated-text',
      rotation: Math.PI / 6,
      x: 280,
      y: 100,
    };
    const image: WhiteboardElement = {
      height: 80,
      id: 'image',
      text: '',
      type: 'image',
      width: 100,
      x: 0,
      y: 0,
    };
    const startBounds = getSelectionBounds(
      [rotatedText, image],
      [],
      [rotatedText.id, image.id],
      [],
    )!;
    const scale = 1.5;
    const nextBounds = {
      height: startBounds.height * scale,
      width: startBounds.width * scale,
      x: startBounds.x + 30,
      y: startBounds.y - 20,
    };
    const originalCenter = {
      x: rotatedText.x + rotatedText.width / 2,
      y: rotatedText.y + rotatedText.height / 2,
    };

    const [resized] = resizeSelectionElements(
      [rotatedText, image],
      [rotatedText],
      startBounds,
      nextBounds,
    );

    expect(resized.fontSize).toBeCloseTo(wideText.fontSize! * scale);
    expect(resized.width).toBeCloseTo(rotatedText.width * scale);
    expect(resized.height).toBeCloseTo(rotatedText.height * scale);
    expect(resized.x + resized.width / 2).toBeCloseTo(
      nextBounds.x + (originalCenter.x - startBounds.x) * scale,
    );
    expect(resized.y + resized.height / 2).toBeCloseTo(
      nextBounds.y + (originalCenter.y - startBounds.y) * scale,
    );
    expect(resized.rotation).toBe(rotatedText.rotation);
  });
});
