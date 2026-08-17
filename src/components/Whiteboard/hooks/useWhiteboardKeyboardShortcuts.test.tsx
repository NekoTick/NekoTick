import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createWhiteboardEraserSpatialIndex } from '@/components/Whiteboard/model/interaction/whiteboardEraser';
import { useWhiteboardKeyboardShortcuts } from './useWhiteboardKeyboardShortcuts';

describe('useWhiteboardKeyboardShortcuts', () => {
  it('switches the eight tools before image in toolbar order', () => {
    const setTool = vi.fn();
    const spatialIndex = createWhiteboardEraserSpatialIndex([], []);
    renderHook(() => useWhiteboardKeyboardShortcuts({
      active: true, pushHistory: vi.fn(), resizeBrush: vi.fn(), selectAll: vi.fn(),
      selectedBrushTool: null, selectedElementIds: [], selectedStrokeIds: [],
      setElements: vi.fn(), setStrokes: vi.fn(), setTool, spatialIndex, viewportZoom: 1,
    }));

    ['1', '2', '3', '4', '5', '6', '7', '8'].forEach((key) => {
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key })));
    });

    expect(setTool.mock.calls.map(([tool]) => tool)).toEqual([
      'hand', 'select', 'eraser', 'pen', 'text', 'line', 'arrow', 'autoshape',
    ]);
  });

  it('restores the last drawing tool with shortcut 4', () => {
    const setTool = vi.fn();
    const spatialIndex = createWhiteboardEraserSpatialIndex([], []);
    const { rerender } = renderHook(({ selectedBrushTool }: { selectedBrushTool: 'crayon' | null }) => (
      useWhiteboardKeyboardShortcuts({
        active: true, pushHistory: vi.fn(), resizeBrush: vi.fn(), selectAll: vi.fn(),
        selectedBrushTool, selectedElementIds: [], selectedStrokeIds: [],
        setElements: vi.fn(), setStrokes: vi.fn(), setTool, spatialIndex, viewportZoom: 1,
      })
    ), { initialProps: { selectedBrushTool: 'crayon' } });
    rerender({ selectedBrushTool: null });

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' })));

    expect(setTool).toHaveBeenCalledWith('crayon');
  });

  it('does not switch tools while typing in an input', () => {
    const setTool = vi.fn();
    const spatialIndex = createWhiteboardEraserSpatialIndex([], []);
    renderHook(() => useWhiteboardKeyboardShortcuts({
      active: true, pushHistory: vi.fn(), resizeBrush: vi.fn(), selectAll: vi.fn(),
      selectedBrushTool: null, selectedElementIds: [], selectedStrokeIds: [],
      setElements: vi.fn(), setStrokes: vi.fn(), setTool, spatialIndex, viewportZoom: 1,
    }));
    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '1' })));

    expect(setTool).not.toHaveBeenCalled();
    input.remove();
  });

  it('opens the only selected text with Enter', () => {
    const editSelectedText = vi.fn(() => true);
    const spatialIndex = createWhiteboardEraserSpatialIndex([], []);
    renderHook(() => useWhiteboardKeyboardShortcuts({
      active: true, editSelectedText, pushHistory: vi.fn(), resizeBrush: vi.fn(), selectAll: vi.fn(),
      selectedBrushTool: null, selectedElementIds: ['text-1'], selectedStrokeIds: [],
      setElements: vi.fn(), setStrokes: vi.fn(), setTool: vi.fn(), spatialIndex, viewportZoom: 1,
    }));
    const event = new KeyboardEvent('keydown', { cancelable: true, key: 'Enter' });

    act(() => window.dispatchEvent(event));

    expect(editSelectedText).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('nudges a small stroke selection through the spatial order', () => {
    const strokes = Array.from({ length: 1000 }, (_, index) => ({
      color: '#111111',
      id: `stroke-${index}`,
      points: [{ pressure: 0.5, x: index * 100, y: 0 }],
      size: 1,
      tool: 'pen' as const,
    }));
    const spatialIndex = createWhiteboardEraserSpatialIndex([], strokes);
    const orderLookup = vi.spyOn(spatialIndex.strokeOrder as Map<string, number>, 'get');
    const setStrokes = vi.fn();
    renderHook(() => useWhiteboardKeyboardShortcuts({
      active: true,
      pushHistory: vi.fn(),
      resizeBrush: vi.fn(),
      selectAll: vi.fn(),
      selectedBrushTool: null,
      selectedElementIds: [],
      selectedStrokeIds: [strokes[500].id],
      setElements: vi.fn(),
      setStrokes,
      setTool: vi.fn(),
      spatialIndex,
      viewportZoom: 1,
    }));

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })));
    const update = setStrokes.mock.calls[0][0] as (current: typeof strokes) => typeof strokes;
    const next = update(strokes);

    expect(orderLookup).toHaveBeenCalledTimes(1);
    expect(next[499]).toBe(strokes[499]);
    expect(next[500].points[0].x).toBe(50_001);
    expect(next[501]).toBe(strokes[501]);
  });
});
