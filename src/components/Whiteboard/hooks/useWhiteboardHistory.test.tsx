import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useWhiteboardHistory } from './useWhiteboardHistory';
import type { WhiteboardElement, WhiteboardPaperStyle, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';

describe('useWhiteboardHistory', () => {
  it('clears undo and redo state when the active board changes', () => {
    const { result, rerender } = renderHook(({ historyKey }: { historyKey: string }) => useHistoryHarness(historyKey), {
      initialProps: { historyKey: 'board-a' },
    });

    act(() => result.current.history.pushHistory());
    expect(result.current.history.canUndo).toBe(true);

    rerender({ historyKey: 'board-b' });

    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.history.canRedo).toBe(false);
  });

  it('restores paper style through undo', () => {
    const { result } = renderHook(() => useHistoryHarness('board-a'));

    act(() => {
      result.current.history.pushHistory();
      result.current.setPaper('ruled');
    });
    expect(result.current.paper).toBe('ruled');

    act(() => result.current.history.undo());
    expect(result.current.paper).toBe('dots');
  });

  it('reuses immutable document arrays in history snapshots', () => {
    const { result } = renderHook(() => useHistoryHarness('board-a'));
    const elements: WhiteboardElement[] = [{
      height: 80, id: 'image', text: '', type: 'image', width: 120, x: 10, y: 20,
    }];
    const strokes: WhiteboardStroke[] = [{
      color: '#111111', id: 'stroke', points: [{ pressure: 0.5, x: 0, y: 0 }], size: 1, tool: 'pen',
    }];

    act(() => {
      result.current.setElements(elements);
      result.current.setStrokes(strokes);
    });
    act(() => result.current.history.pushHistory());
    act(() => {
      result.current.setElements([]);
      result.current.setStrokes([]);
    });
    act(() => result.current.history.undo());

    expect(result.current.elements).toBe(elements);
    expect(result.current.strokes).toBe(strokes);
  });

  it('bounds history retained by repeated whole-document stroke replacements', async () => {
    const { result } = renderHook(() => useHistoryHarness('board-a'));
    const createLargeStroke = (version: number): WhiteboardStroke => ({
      color: '#111111',
      id: `stroke-${version}`,
      points: new Array(250_000) as WhiteboardStroke['points'],
      size: 1,
      tool: 'pen',
    });

    act(() => result.current.setStrokes([createLargeStroke(0)]));
    for (let version = 1; version <= 6; version += 1) {
      act(() => result.current.history.pushHistory());
      act(() => result.current.setStrokes([createLargeStroke(version)]));
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    let undoCount = 0;
    while (result.current.history.canUndo && undoCount < 10) {
      act(() => result.current.history.undo());
      undoCount += 1;
    }

    expect(undoCount).toBeGreaterThan(0);
    expect(undoCount).toBeLessThan(6);
  });
});

function useHistoryHarness(historyKey: string) {
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const [paper, setPaper] = useState<WhiteboardPaperStyle>('dots');
  const history = useWhiteboardHistory({
    active: true,
    elements,
    historyKey,
    paper,
    setElements,
    setPaper,
    setStrokes,
    strokes,
  });
  return { elements, history, paper, setElements, setPaper, setStrokes, strokes };
}
