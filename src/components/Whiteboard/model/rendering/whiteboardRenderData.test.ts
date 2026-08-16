import { describe, expect, it } from 'vitest';
import { createWhiteboardEraserSpatialIndex } from '@/components/Whiteboard/model/interaction/whiteboardEraser';
import { WhiteboardRenderData, WhiteboardSelectionRenderData } from './whiteboardRenderData';

describe('WhiteboardRenderData', () => {
  it('exposes renderer inputs without enumerable document collections', () => {
    const elements = [{ height: 40, id: 'image', text: '', type: 'image' as const, width: 40, x: 0, y: 0 }];
    const strokes = [{
      color: '#111111', id: 'stroke', points: [{ pressure: 0.5, x: 0, y: 0 }], size: 1, tool: 'pen' as const,
    }];
    const spatialIndex = createWhiteboardEraserSpatialIndex(elements, strokes);
    const selectedElementIds = ['image'];
    const selectedStrokeIds = ['stroke'];
    const data = new WhiteboardRenderData(
      elements,
      spatialIndex,
      strokes,
      null,
      selectedElementIds,
      selectedStrokeIds,
    );

    expect(Object.keys(data)).toEqual([]);
    expect(data.elements).toBe(elements);
    expect(data.spatialIndex).toBe(spatialIndex);
    expect(data.strokes).toBe(strokes);
    expect(data.selectedElementIds).toBe(selectedElementIds);
    expect(data.selectedStrokeIds).toBe(selectedStrokeIds);
  });

  it('exposes selection inputs without enumerable selected collections', () => {
    const elements = [{ height: 40, id: 'image', text: '', type: 'image' as const, width: 40, x: 0, y: 0 }];
    const strokes = [{
      color: '#111111', id: 'stroke', points: [{ pressure: 0.5, x: 0, y: 0 }], size: 1, tool: 'pen' as const,
    }];
    const data = new WhiteboardSelectionRenderData(elements, strokes);

    expect(Object.keys(data)).toEqual([]);
    expect(data.elements).toBe(elements);
    expect(data.strokes).toBe(strokes);
  });
});
