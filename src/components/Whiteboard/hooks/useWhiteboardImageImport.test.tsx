import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhiteboardElement } from '../model/whiteboardModel';
import { useWhiteboardImageImport } from './useWhiteboardImageImport';

const mocks = vi.hoisted(() => ({
  setSelectedElementId: vi.fn(),
  setSelectedStrokeIds: vi.fn(),
  setTool: vi.fn(),
  writeActiveAsset: vi.fn(),
}));

vi.mock('../stores/useWhiteboardStore', () => ({
  useWhiteboardStore: (selector: (state: { writeActiveAsset: typeof mocks.writeActiveAsset }) => unknown) => selector({
    writeActiveAsset: mocks.writeActiveAsset,
  }),
}));

describe('useWhiteboardImageImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Image', class {
      naturalHeight = 80;
      naturalWidth = 120;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    });
  });

  it('does not add a transient image when asset storage fails', async () => {
    mocks.writeActiveAsset.mockResolvedValue(null);
    const { result } = renderHook(useImageImportHarness);

    await act(() => result.current.importImage(createImageFile()));

    expect(result.current.elements).toEqual([]);
    expect(result.current.pushHistory).not.toHaveBeenCalled();
  });

  it('assigns unique ids to concurrent image imports', async () => {
    mocks.writeActiveAsset
      .mockResolvedValueOnce('assets/first.png')
      .mockResolvedValueOnce('assets/second.png');
    const { result } = renderHook(useImageImportHarness);

    await act(async () => {
      await Promise.all([
        result.current.importImage(createImageFile('first.png')),
        result.current.importImage(createImageFile('second.png')),
      ]);
    });

    expect(result.current.elements).toHaveLength(2);
    expect(new Set(result.current.elements.map((element) => element.id)).size).toBe(2);
  });

  it('adds an image without leaving it selected', async () => {
    mocks.writeActiveAsset.mockResolvedValue('assets/image.png');
    const { result } = renderHook(useImageImportHarness);

    await act(() => result.current.importImage(createImageFile()));

    expect(result.current.elements).toHaveLength(1);
    expect(mocks.setSelectedElementId).toHaveBeenLastCalledWith(null);
    expect(mocks.setSelectedStrokeIds).toHaveBeenLastCalledWith([]);
    expect(mocks.setTool).toHaveBeenLastCalledWith('select');
  });
});

function useImageImportHarness() {
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pushHistory = vi.fn();
  const importImage = useWhiteboardImageImport({
    pushHistory,
    setElements,
    setSelectedElementId: mocks.setSelectedElementId,
    setSelectedStrokeIds: mocks.setSelectedStrokeIds,
    setTool: mocks.setTool,
    viewport: { x: 0, y: 0, zoom: 1 },
    viewportRef,
  });
  return { elements, importImage, pushHistory };
}

function createImageFile(name = 'image.png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}
