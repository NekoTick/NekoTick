import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WhiteboardElement, WhiteboardPoint, WhiteboardStroke } from '../model/whiteboardModel';
import { useWhiteboardAutoDraw } from './useWhiteboardAutoDraw';

const createStroke = (id: string, points: WhiteboardPoint[]): WhiteboardStroke => ({
  color: '#1e96eb',
  id,
  points: points.map((point) => ({ ...point, pressure: 0.5 })),
  size: 1,
  tool: 'pen',
});

describe('useWhiteboardAutoDraw', () => {
  it('replaces every sketch stroke with the chosen icon as one history action', () => {
    const pushHistory = vi.fn();
    const setTool = vi.fn();
    const outline = createStroke('outline', [
      { x: 0, y: 55 }, { x: 50, y: 10 }, { x: 100, y: 55 },
      { x: 100, y: 110 }, { x: 0, y: 110 }, { x: 0, y: 55 },
    ]);
    const door = createStroke('door', [
      { x: 38, y: 110 }, { x: 38, y: 70 }, { x: 62, y: 70 }, { x: 62, y: 110 },
    ]);
    const { result } = renderHook(() => useHarness(pushHistory, setTool));

    act(() => result.current.commit(outline));
    act(() => result.current.commit(door));
    const house = result.current.autoDraw.suggestions.find(
      (suggestion) => suggestion.kind === 'icon' && suggestion.icon === 'house',
    );
    expect(house).toBeDefined();

    act(() => result.current.autoDraw.chooseSuggestion(house!));

    expect(result.current.strokes).toEqual([]);
    expect(result.current.elements).toEqual([expect.objectContaining({
      autoDrawIcon: 'house', color: '#1e96eb', type: 'icon',
    })]);
    expect(result.current.selectedElementIds).toEqual(['outline-autodraw']);
    expect(result.current.selectedStrokeIds).toEqual([]);
    expect(setTool).toHaveBeenCalledWith('select');
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(result.current.autoDraw.suggestions).toEqual([]);
  });

  it('centers a chosen icon in square bounds without stretching it', () => {
    const sketch = createStroke('wide-sketch', [
      { x: 10, y: 20 }, { x: 170, y: 20 }, { x: 170, y: 80 }, { x: 10, y: 80 },
    ]);
    const { result } = renderHook(() => useHarness(vi.fn()));

    act(() => result.current.commit(sketch));
    act(() => result.current.autoDraw.chooseSuggestion({
      icon: 'house', kind: 'icon', label: 'House', score: 0,
    }));

    expect(result.current.elements).toEqual([expect.objectContaining({
      height: 60, width: 60, x: 60, y: 20,
    })]);
  });

  it('commits a suggestion once when the same handler fires twice', () => {
    const pushHistory = vi.fn();
    const sketch = createStroke('sketch', [{ x: 10, y: 20 }, { x: 90, y: 100 }]);
    const { result } = renderHook(() => useHarness(pushHistory));
    act(() => result.current.commit(sketch));
    const choose = result.current.autoDraw.chooseSuggestion;
    const suggestion = { icon: 'smile', kind: 'icon', label: 'Smile', score: 0 } as const;

    act(() => {
      choose(suggestion);
      choose(suggestion);
    });

    expect(result.current.elements).toEqual([expect.objectContaining({
      autoDrawIcon: 'smile', id: 'sketch-autodraw',
    })]);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('ranks candidates from the current draft before pointer up', () => {
    const rectangle = createStroke('draft-rectangle', [
      { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 },
      { x: 0, y: 80 }, { x: 0, y: 0 },
    ]);
    const { result } = renderHook(() => useHarness(vi.fn()));

    act(() => result.current.setDraftStroke(rectangle));

    expect(result.current.strokes).toEqual([]);
    expect(result.current.autoDraw.suggestions[0]).toMatchObject({ kind: 'shape', shape: 'rectangle' });
  });

  it('selects a chosen geometric result before returning to the selection tool', () => {
    const setTool = vi.fn();
    const rectangle = createStroke('rectangle', [
      { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 },
      { x: 0, y: 80 }, { x: 0, y: 0 },
    ]);
    const { result } = renderHook(() => useHarness(vi.fn(), setTool));

    act(() => result.current.commit(rectangle));
    const suggestion = result.current.autoDraw.suggestions.find(
      (candidate) => candidate.kind === 'shape' && candidate.shape === 'rectangle',
    );
    act(() => result.current.autoDraw.chooseSuggestion(suggestion!));

    expect(result.current.selectedElementIds).toEqual([]);
    expect(result.current.selectedStrokeIds).toEqual(['rectangle-autodraw']);
    const resultPoints = result.current.strokes[0].points;
    expect(Math.min(...resultPoints.map((point) => point.x))).toBe(20);
    expect(Math.max(...resultPoints.map((point) => point.x))).toBe(100);
    expect(Math.min(...resultPoints.map((point) => point.y))).toBe(0);
    expect(Math.max(...resultPoints.map((point) => point.y))).toBe(80);
    expect(setTool).toHaveBeenCalledWith('select');
  });

  it('keeps raw sketch strokes when suggestions are dismissed', () => {
    const rectangle = createStroke('rectangle', [
      { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 },
      { x: 0, y: 80 }, { x: 0, y: 0 },
    ]);
    const { result } = renderHook(() => useHarness(vi.fn()));

    act(() => result.current.commit(rectangle));
    act(() => result.current.autoDraw.dismiss());

    expect(result.current.strokes).toEqual([rectangle]);
    expect(result.current.elements).toEqual([]);
    expect(result.current.autoDraw.suggestions).toEqual([]);
  });
});

function useHarness(pushHistory: () => void, setTool = vi.fn()) {
  const [draftStroke, setDraftStroke] = useState<WhiteboardStroke | null>(null);
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const autoDraw = useWhiteboardAutoDraw({
    draftStroke,
    pushHistory,
    setElements,
    setSelectedElementIds,
    setSelectedStrokeIds,
    setStrokes,
    setTool,
    strokes,
    tool: 'autoshape',
  });
  const commit = (stroke: WhiteboardStroke) => {
    setStrokes((current) => [...current, stroke]);
    autoDraw.addStroke(stroke);
  };
  return { autoDraw, commit, elements, selectedElementIds, selectedStrokeIds, setDraftStroke, strokes };
}
