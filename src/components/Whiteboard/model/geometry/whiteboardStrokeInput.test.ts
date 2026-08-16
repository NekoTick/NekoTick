import { describe, expect, it } from 'vitest';
import { createResponsiveStrokePoints } from './whiteboardStrokeInput';

describe('whiteboard stroke input pressure', () => {
  it('makes slow mouse strokes heavier than fast strokes', () => {
    const result = createResponsiveStrokePoints('pen', [
      { point: { x: 0, y: 0 }, pointerType: 'mouse', pressure: 0.5, timeStamp: 0 },
      { point: { x: 2, y: 0 }, pointerType: 'mouse', pressure: 0.5, timeStamp: 10 },
      { point: { x: 42, y: 0 }, pointerType: 'mouse', pressure: 0.5, timeStamp: 20 },
    ], null);

    expect(result.points[1].pressure).toBeGreaterThan(result.points[2].pressure);
  });

  it('smooths sudden stylus pressure jumps without discarding pressure', () => {
    const result = createResponsiveStrokePoints('fountain', [
      { point: { x: 0, y: 0 }, pointerType: 'pen', pressure: 0.2, timeStamp: 0 },
      { point: { x: 4, y: 0 }, pointerType: 'pen', pressure: 1, timeStamp: 4 },
    ], null);

    expect(result.points[1].pressure).toBeGreaterThan(0.2);
    expect(result.points[1].pressure).toBeLessThan(1);
  });

  it('keeps marker width steadier than fountain width for mouse input', () => {
    const samples = [
      { point: { x: 0, y: 0 }, pointerType: 'mouse', pressure: 0.5, timeStamp: 0 },
      { point: { x: 30, y: 0 }, pointerType: 'mouse', pressure: 0.5, timeStamp: 10 },
    ];
    const marker = createResponsiveStrokePoints('marker', samples, null).points;
    const fountain = createResponsiveStrokePoints('fountain', samples, null).points;

    expect(marker[0].pressure - marker[1].pressure).toBeLessThan(fountain[0].pressure - fountain[1].pressure);
  });

  it('keeps mouse pressure response stable across viewport zoom levels', () => {
    const createSamples = (boardDistance: number) => [
      { point: { x: 0, y: 0 }, pointerType: 'mouse', pressure: 0.5, screenPoint: { x: 10, y: 10 }, timeStamp: 0 },
      { point: { x: boardDistance, y: 0 }, pointerType: 'mouse', pressure: 0.5, screenPoint: { x: 30, y: 10 }, timeStamp: 10 },
    ];

    const normalZoom = createResponsiveStrokePoints('pen', createSamples(20), null).points;
    const zoomedOut = createResponsiveStrokePoints('pen', createSamples(40), null).points;

    expect(zoomedOut[1].pressure).toBe(normalZoom[1].pressure);
  });
});
