import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WhiteboardElement, WhiteboardTool } from '../model/whiteboardModel';
import { useWhiteboardTextEditing } from './useWhiteboardTextEditing';

const existingText: WhiteboardElement = {
  color: '#1e96eb', fontSize: 24, height: 30, id: 'text-1', lineHeight: 1.25,
  text: 'Existing', type: 'text', width: 64, x: 20, y: 30,
};

describe('useWhiteboardTextEditing', () => {
  it('keeps new text transient until confirmation', () => {
    const pushHistory = vi.fn();
    const { result } = renderTextEditing([], pushHistory);

    act(() => result.current.text.startTextEditing({ x: 100, y: 80 }, '#123456'));

    expect(result.current.elements).toEqual([]);
    expect(result.current.text.editing?.element).toMatchObject({
      color: '#123456', text: '', type: 'text', x: 100, y: 65,
    });

    act(() => {
      result.current.text.updateTextEditing('First\nSecond');
      result.current.text.commitTextEditing();
    });

    expect(pushHistory).toHaveBeenCalledOnce();
    expect(result.current.elements).toEqual([
      expect.objectContaining({ color: '#123456', height: 60, text: 'First\nSecond', type: 'text' }),
    ]);
    expect(result.current.selectedElementIds).toEqual([result.current.elements[0].id]);
    expect(result.current.tool).toBe('select');
  });

  it('discards empty new text without changing history', () => {
    const pushHistory = vi.fn();
    const { result } = renderTextEditing([], pushHistory);

    act(() => result.current.text.startTextEditing({ x: 10, y: 20 }, '#111111'));
    act(() => result.current.text.commitTextEditing());

    expect(result.current.elements).toEqual([]);
    expect(result.current.text.editing).toBeNull();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('edits text under the text-tool pointer and removes it when cleared', () => {
    const pushHistory = vi.fn();
    const { result } = renderTextEditing([existingText], pushHistory);

    act(() => result.current.text.startTextEditing({ x: 30, y: 40 }, '#ff0000'));
    expect(result.current.text.editing).toEqual({
      element: existingText,
      initialCaretPoint: { x: 30, y: 40 },
      original: existingText,
    });

    act(() => {
      result.current.text.updateTextEditing('  ');
      result.current.text.commitTextEditing();
    });

    expect(result.current.elements).toEqual([]);
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('uses rotated object geometry when opening existing text', () => {
    const rotated = { ...existingText, height: 20, rotation: Math.PI / 4, width: 100 };
    const { result } = renderTextEditing([rotated], vi.fn());

    let edited = false;
    act(() => { edited = result.current.text.editTextAtPoint({ x: 52, y: 21 }); });

    expect(edited).toBe(true);
    expect(result.current.text.editing).toEqual({
      element: rotated,
      initialCaretPoint: { x: 52, y: 21 },
      original: rotated,
    });
  });

  it('measures committed text after its handwritten fonts load', async () => {
    const fontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
    let resolveFonts!: (faces: FontFace[]) => void;
    const fontLoad = new Promise<FontFace[]>((resolve) => { resolveFonts = resolve; });
      const load = vi.fn(() => fontLoad);
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    try {
      const { result } = renderTextEditing([], vi.fn());
      act(() => result.current.text.startTextEditing({ x: 10, y: 20 }, '#111111'));
      act(() => {
        result.current.text.updateTextEditing('Handwritten');
        result.current.text.commitTextEditing();
        result.current.text.commitTextEditing();
      });

      expect(result.current.elements).toEqual([]);
      expect(load).toHaveBeenCalledOnce();
      expect(load).toHaveBeenCalledWith(expect.stringContaining('24px Excalifont'), 'Handwritten');

      await act(async () => { resolveFonts([]); await fontLoad; });

      expect(result.current.elements).toEqual([
        expect.objectContaining({ text: 'Handwritten', type: 'text' }),
      ]);
      expect(result.current.text.editing).toBeNull();
    } finally {
      if (fontsDescriptor) Object.defineProperty(document, 'fonts', fontsDescriptor);
      else Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('corrects stale stored text bounds after fonts load without adding history', async () => {
    const fontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
    const load = vi.fn(async () => [] as FontFace[]);
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    try {
      const pushHistory = vi.fn();
      const staleText = { ...existingText, width: 1 };
      const { result } = renderTextEditing([staleText], pushHistory);
      act(() => result.current.text.editTextElement(staleText));

      await act(async () => result.current.text.commitTextEditing());

      expect(result.current.elements[0].text).toBe(staleText.text);
      expect(result.current.elements[0].width).toBeGreaterThan(staleText.width);
      expect(pushHistory).not.toHaveBeenCalled();
    } finally {
      if (fontsDescriptor) Object.defineProperty(document, 'fonts', fontsDescriptor);
      else Reflect.deleteProperty(document, 'fonts');
    }
  });
});

function renderTextEditing(initialElements: WhiteboardElement[], pushHistory: () => void) {
  return renderHook(() => {
    const [elements, setElements] = useState(initialElements);
    const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
    const [, setSelectedStrokeIds] = useState<string[]>([]);
    const [tool, setTool] = useState<WhiteboardTool>('text');
    const text = useWhiteboardTextEditing({
      elements, pushHistory, setElements, setSelectedElementIds, setSelectedStrokeIds, setTool,
    });
    return { elements, selectedElementIds, text, tool };
  });
}
