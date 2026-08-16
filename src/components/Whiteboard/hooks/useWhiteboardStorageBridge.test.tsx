import { act, renderHook } from '@testing-library/react';
import { useRef, type Dispatch, type SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeWhiteboardSnapshot } from '@/components/Whiteboard/model/document/whiteboardDocument';
import type { WhiteboardElement } from '@/components/Whiteboard/model/core/whiteboardModel';
import { incrementImageCacheGeneration } from '@/lib/assets/io/imageCacheGeneration';
import { useWhiteboardStorageBridge } from './useWhiteboardStorageBridge';

const mocks = vi.hoisted(() => ({
  notesRootPath: '/notes-a',
  whiteboardState: {
    activeBoardId: 'default' as string | null,
    activeSnapshot: null as ReturnType<typeof normalizeWhiteboardSnapshot> | null,
    boards: [{ id: 'default', folder: 'default' }],
    loadedNotesRootPath: '/notes-a' as string | null,
    loadForNotesRoot: vi.fn(async () => undefined),
  },
  refreshWhiteboardAssetUrls: vi.fn(),
}));

vi.mock('@/components/Whiteboard/model/persistence/whiteboardRepository', () => ({
  refreshWhiteboardAssetUrls: mocks.refreshWhiteboardAssetUrls,
}));

vi.mock('@/stores/useNotesRootStore', () => ({
  useNotesRootStore: (selector: (state: { currentNotesRoot: { path: string } }) => unknown) => selector({
    currentNotesRoot: { path: mocks.notesRootPath },
  }),
}));

vi.mock('../stores/useWhiteboardStore', () => ({
  useWhiteboardStore: Object.assign(
    (selector: (state: typeof mocks.whiteboardState) => unknown) => selector(mocks.whiteboardState),
    { getState: () => mocks.whiteboardState },
  ),
}));

describe('useWhiteboardStorageBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notesRootPath = '/notes-a';
    mocks.whiteboardState.loadedNotesRootPath = '/notes-a';
    mocks.whiteboardState.activeSnapshot = createSnapshot('image-a');
    mocks.refreshWhiteboardAssetUrls.mockResolvedValue([]);
  });

  it('applies the same board id again after the storage root changes', () => {
    const setElements = vi.fn<(value: SetStateAction<ReturnType<typeof createSnapshot>['elements']>) => void>();
    const { rerender } = renderHook(() => useBridgeHarness(setElements));
    expect(setElements).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'image-a' })]));

    mocks.notesRootPath = '/notes-b';
    rerender();
    expect(setElements).toHaveBeenCalledTimes(1);

    mocks.whiteboardState.loadedNotesRootPath = '/notes-b';
    mocks.whiteboardState.activeSnapshot = createSnapshot('image-b');
    rerender();

    expect(setElements).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'image-b' })]));
  });

  it('refreshes mounted whiteboard image URLs after the image cache is cleared', async () => {
    const staleElements: WhiteboardElement[] = createSnapshot('image-a').elements.map((element) => ({
      ...element,
      imageAssetPath: 'assets/image.png',
      imageSrc: 'blob:stale',
    }));
    const setElements = vi.fn<(value: SetStateAction<WhiteboardElement[]>) => void>();
    mocks.refreshWhiteboardAssetUrls.mockResolvedValue(staleElements.map((element) => ({
      ...element,
      imageSrc: 'blob:fresh',
    })));
    const { rerender } = renderHook(() => useBridgeHarness(setElements, staleElements));

    act(() => incrementImageCacheGeneration());
    rerender();

    await vi.waitFor(() => expect(mocks.refreshWhiteboardAssetUrls).toHaveBeenCalledWith(
      '/notes-a',
      mocks.whiteboardState.boards[0],
      staleElements,
    ));
    const update = setElements.mock.calls.at(-1)?.[0];
    expect(typeof update).toBe('function');
    const latestElements = staleElements.map((element) => ({ ...element, x: 91 }));
    expect((update as (current: WhiteboardElement[]) => WhiteboardElement[])(latestElements)[0])
      .toMatchObject({ imageSrc: 'blob:fresh', x: 91 });
  });
});

function useBridgeHarness(
  setElements: Dispatch<SetStateAction<ReturnType<typeof createSnapshot>['elements']>>,
  elements = createSnapshot('current').elements,
) {
  const appliedBoardKeyRef = useRef<string | null>(null);
  const strokeIdRef = useRef(1);
  useWhiteboardStorageBridge({
    active: true,
    appliedBoardKeyRef,
    elements,
    setElements,
    setPaper: vi.fn(),
    setSelectedElementIds: vi.fn(),
    setSelectedStrokeIds: vi.fn(),
    setStrokes: vi.fn(),
    setViewport: vi.fn(),
    strokeIdRef,
  });
}

function createSnapshot(id: string) {
  return normalizeWhiteboardSnapshot({
    elements: [{ height: 80, id, text: '', type: 'image', width: 100, x: 0, y: 0 }],
  });
}
