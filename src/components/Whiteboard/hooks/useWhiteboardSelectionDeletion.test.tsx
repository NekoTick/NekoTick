import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useWhiteboardSelectionDeletion } from './useWhiteboardSelectionDeletion';
import type { WhiteboardElement, WhiteboardStroke } from '@/components/Whiteboard/model/core/whiteboardModel';

describe('useWhiteboardSelectionDeletion', () => {
  it('deletes only selected images', () => {
    const initialElements: WhiteboardElement[] = [
      { height: 80, id: 'first', text: '', type: 'image', width: 100, x: 0, y: 0 },
      { height: 80, id: 'second', text: '', type: 'image', width: 100, x: 200, y: 0 },
    ];
    const { result } = renderHook(() => {
      const [elements, setElements] = useState(initialElements);
      const [selectedElementIds, setSelectedElementIds] = useState(['first']);
      const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
      const [, setStrokes] = useState<WhiteboardStroke[]>([]);
      const deleteSelection = useWhiteboardSelectionDeletion({
        active: false, pushHistory: vi.fn(), selectedElementIds, selectedStrokeIds,
        setElements, setSelectedElementIds, setSelectedStrokeIds, setStrokes,
      });
      return { deleteSelection, elements };
    });

    act(() => result.current.deleteSelection());
    expect(result.current.elements.map((element) => element.id)).toEqual(['second']);
  });
});
