import { describe, expect, it } from 'vitest';
import type { WhiteboardElement, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';
import {
  getSelectedOverlayGeometry,
  resizeSelectionElement,
  resizeSelectionElements,
  resizeSelectionStroke,
} from './whiteboardSelection';
import { getWhiteboardResizePreviewGeometry } from './whiteboardSelectionPreviewGeometry';

describe('whiteboard selection preview geometry', () => {
  it('matches the committed content bounds after resizing a stroke', () => {
    const stroke: WhiteboardStroke = {
      color: '#111111', id: 'stroke',
      points: [{ pressure: 0.5, x: 10, y: 20 }, { pressure: 0.5, x: 110, y: 40 }],
      size: 2, tool: 'pen',
    };
    const startGeometry = getSelectedOverlayGeometry([], [stroke]);
    const startBounds = startGeometry.singleBounds!;
    const nextBounds = { height: 90, width: 240, x: 30, y: 50 };
    const preview = getWhiteboardResizePreviewGeometry({
      nextBounds,
      originalElementsById: new Map(),
      originalStrokesById: new Map([[stroke.id, stroke]]),
      startBounds,
    }, startGeometry);
    const committed = getSelectedOverlayGeometry([], [resizeSelectionStroke(stroke, startBounds, nextBounds)]);

    expect(preview.singleBounds).toEqual(committed.singleBounds);
  });

  it('matches the committed bounds after resizing rotated text', () => {
    const text: WhiteboardElement = {
      color: '#111111', fontSize: 24, height: 30, id: 'text', lineHeight: 1.25,
      rotation: Math.PI / 4, text: 'Rotated', type: 'text', width: 120, x: 80, y: 60,
    };
    const startGeometry = getSelectedOverlayGeometry([text], []);
    const startBounds = startGeometry.singleBounds!;
    const nextBounds = {
      height: startBounds.height * 1.75,
      width: startBounds.width * 1.75,
      x: 20,
      y: 30,
    };
    const preview = getWhiteboardResizePreviewGeometry({
      nextBounds,
      originalElementsById: new Map([[text.id, text]]),
      originalStrokesById: new Map(),
      startBounds,
    }, startGeometry);
    const committedText = resizeSelectionElement(text, startBounds, nextBounds);
    const committed = getSelectedOverlayGeometry([committedText], []);

    expect(preview.singleBounds).toEqual(committed.singleBounds);
    expect(committed.singleBounds).toMatchObject({
      height: expect.closeTo(nextBounds.height),
      width: expect.closeTo(nextBounds.width),
      x: expect.closeTo(nextBounds.x),
      y: expect.closeTo(nextBounds.y),
    });
    expect(committedText).toMatchObject({
      fontSize: expect.closeTo(42),
      height: expect.closeTo(52.5),
      rotation: text.rotation,
      width: expect.closeTo(210),
    });
  });

  it('keeps a mixed selection frame at the dragged bounds after commit', () => {
    const text: WhiteboardElement = {
      color: '#111111', fontSize: 24, height: 30, id: 'text', lineHeight: 1.25,
      text: 'Text', type: 'text', width: 100, x: 10, y: 20,
    };
    const image: WhiteboardElement = {
      height: 60, id: 'image', text: '', type: 'image', width: 80, x: 200, y: 50,
    };
    const elements = [text, image];
    const startGeometry = getSelectedOverlayGeometry(elements, []);
    const startBounds = startGeometry.groupBounds!;
    const nextBounds = {
      height: startBounds.height * 2,
      width: startBounds.width * 2,
      x: 30,
      y: 40,
    };
    const originalElementsById = new Map(elements.map((element) => [element.id, element]));
    const preview = getWhiteboardResizePreviewGeometry({
      nextBounds,
      originalElementsById,
      originalStrokesById: new Map(),
      startBounds,
    }, startGeometry);
    const committed = getSelectedOverlayGeometry(
      resizeSelectionElements(elements, originalElementsById, startBounds, nextBounds),
      [],
    );

    expect(preview.groupBounds).toEqual(nextBounds);
    expect(committed.groupBounds).toEqual(nextBounds);
  });
});
