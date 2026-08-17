import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotesSplitPanes } from './useNotesSplitPanes';

const mocks = vi.hoisted(() => ({
  currentNotePath: 'docs/alpha.md' as string | null,
  currentEditorNotePath: null as string | null,
  currentEditorSelection: { empty: true, from: 20, to: 20 },
  lastMappedEditorPosition: 42 as number | null,
  focusCurrentEditorAtViewportPoint: vi.fn(() => true),
  getCurrentEditorPositionAtViewportPoint: vi.fn(() => 42 as number | null),
  openStoredNotePath: vi.fn(),
  setNotesSplitPanesActive: vi.fn(),
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: (selector: (state: { setNotesSplitPanesActive: typeof mocks.setNotesSplitPanesActive }) => unknown) => (
    selector({ setNotesSplitPanesActive: mocks.setNotesSplitPanesActive })
  ),
}));

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: {
    getState: () => ({
      currentNote: mocks.currentNotePath ? { path: mocks.currentNotePath, content: '' } : null,
    }),
  },
}));

vi.mock('@/stores/notes/openNotePath', () => ({
  openStoredNotePath: mocks.openStoredNotePath,
}));

vi.mock('@/lib/diagnostics/notesSplitDiagnostics', () => ({
  logNotesSplitDiagnostic: vi.fn(),
}));

vi.mock('./features/Editor/utils/focusEditorAtPoint', () => ({
  focusCurrentEditorAtViewportPoint: mocks.focusCurrentEditorAtViewportPoint,
  getCurrentEditorPositionAtViewportPoint: mocks.getCurrentEditorPositionAtViewportPoint,
}));

vi.mock('./features/Editor/utils/editorViewRegistry', () => ({
  getCurrentEditorNotePath: vi.fn(() => mocks.currentEditorNotePath),
  getCurrentEditorView: vi.fn(() => (
    mocks.currentEditorNotePath
      ? { state: { selection: mocks.currentEditorSelection } }
      : null
  )),
}));

vi.mock('./notesViewHelpers', () => ({
  isNotePathOpenInLatestTabs: vi.fn(() => true),
}));

vi.mock('./useNotesSplitResize', () => ({
  useNotesSplitResize: () => ({
    activeSplitResizeRef: { current: null },
    beginSplitResize: vi.fn(),
    stopSplitResize: vi.fn(),
  }),
}));

vi.mock('./useNotesSplitPaneDrag', () => ({
  useNotesSplitPaneDrag: () => ({ beginSplitPaneDrag: vi.fn() }),
}));

vi.mock('./useNotesSplitDrop', () => ({
  useNotesSplitDrop: () => ({ resolveSplitDropTarget: vi.fn() }),
}));

describe('useNotesSplitPanes', () => {
  beforeEach(() => {
    mocks.currentNotePath = 'docs/alpha.md';
    mocks.currentEditorNotePath = null;
    mocks.currentEditorSelection = { empty: true, from: 20, to: 20 };
    mocks.lastMappedEditorPosition = 42;
    mocks.focusCurrentEditorAtViewportPoint.mockReset();
    mocks.focusCurrentEditorAtViewportPoint.mockImplementation(() => {
      const position = mocks.lastMappedEditorPosition;
      if (position === null) return false;
      mocks.currentEditorSelection = { empty: true, from: position, to: position };
      return true;
    });
    mocks.getCurrentEditorPositionAtViewportPoint.mockReset();
    mocks.getCurrentEditorPositionAtViewportPoint.mockImplementation(() => {
      mocks.lastMappedEditorPosition = 42;
      return 42;
    });
    mocks.openStoredNotePath.mockReset();
    mocks.setNotesSplitPanesActive.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('corrects split activation focus after the first selection changes editor layout', async () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    mocks.openStoredNotePath.mockImplementation((path: string) => {
      mocks.currentNotePath = path;
      mocks.currentEditorNotePath = path;
      return Promise.resolve();
    });
    const mappedPositions = [116, 142, 142];
    mocks.getCurrentEditorPositionAtViewportPoint.mockImplementation(() => {
      const position = mappedPositions.shift() ?? 142;
      mocks.lastMappedEditorPosition = position;
      return position;
    });
    const point = {
      clientX: 640,
      clientY: 480,
      contentOffset: { left: 120, top: 240 },
    };
    const { result } = renderHook(() => useNotesSplitPanes({
      active: true,
      currentNotePath: 'docs/alpha.md',
      openNote: vi.fn(async () => undefined),
      openNoteByAbsolutePath: vi.fn(async () => undefined),
      openTabs: [],
      prefetchNote: vi.fn(async () => undefined),
    }));

    await act(async () => {
      await result.current.activateSplitPane('preview:beta', 'docs/beta.md', point);
    });

    expect(mocks.focusCurrentEditorAtViewportPoint).not.toHaveBeenCalled();
    act(() => animationFrames.shift()?.(performance.now()));
    expect(mocks.focusCurrentEditorAtViewportPoint).toHaveBeenCalledTimes(1);
    act(() => animationFrames.shift()?.(performance.now()));
    expect(mocks.focusCurrentEditorAtViewportPoint).toHaveBeenCalledTimes(2);
    act(() => animationFrames.shift()?.(performance.now()));
    expect(mocks.focusCurrentEditorAtViewportPoint).toHaveBeenCalledTimes(2);
    expect(mocks.focusCurrentEditorAtViewportPoint).toHaveBeenLastCalledWith(point);
    expect(mocks.currentEditorSelection.from).toBe(142);
  });

  it('ignores a split activation that finishes after another note becomes current', async () => {
    let resolveOpen: (() => void) | undefined;
    mocks.openStoredNotePath.mockImplementation(() => new Promise<void>((resolve) => {
      resolveOpen = resolve;
    }));
    const openNote = vi.fn(async () => undefined);
    const openNoteByAbsolutePath = vi.fn(async () => undefined);
    const prefetchNote = vi.fn(async () => undefined);
    const { result, rerender } = renderHook(
      ({ currentNotePath }) => useNotesSplitPanes({
        active: true,
        currentNotePath,
        openNote,
        openNoteByAbsolutePath,
        openTabs: [],
        prefetchNote,
      }),
      { initialProps: { currentNotePath: 'docs/alpha.md' } },
    );

    let activation: Promise<void>;
    act(() => {
      activation = result.current.activateSplitPane('preview:beta', 'docs/beta.md');
    });

    mocks.currentNotePath = 'docs/gamma.md';
    rerender({ currentNotePath: 'docs/gamma.md' });
    await act(async () => {
      resolveOpen?.();
      await activation!;
    });

    expect(result.current.activeSplitPreviewLeafId).toBeNull();
    expect(result.current.primaryPreviewLeaf).toBeNull();
  });

  it('does not let a stale primary activation clear a newer split activation', async () => {
    let resolveBetaOpen: (() => void) | undefined;
    mocks.openStoredNotePath.mockImplementation((path: string) => {
      if (path === 'docs/beta.md') {
        return new Promise<void>((resolve) => {
          resolveBetaOpen = resolve;
        });
      }

      mocks.currentNotePath = path;
      return Promise.resolve();
    });
    const openNote = vi.fn(async () => undefined);
    const openNoteByAbsolutePath = vi.fn(async () => undefined);
    const prefetchNote = vi.fn(async () => undefined);
    const { result } = renderHook(() => useNotesSplitPanes({
      active: true,
      currentNotePath: 'docs/alpha.md',
      openNote,
      openNoteByAbsolutePath,
      openTabs: [],
      prefetchNote,
    }));

    let staleActivation: Promise<void>;
    act(() => {
      staleActivation = result.current.activatePrimaryPreviewPane('docs/beta.md');
    });
    await act(async () => {
      await result.current.activateSplitPane('preview:gamma', 'docs/gamma.md');
    });

    expect(result.current.activeSplitPreviewLeafId).toBe('preview:gamma');
    expect(result.current.primaryPreviewLeaf?.path).toBe('docs/alpha.md');

    await act(async () => {
      resolveBetaOpen?.();
      await staleActivation!;
    });

    expect(result.current.activeSplitPreviewLeafId).toBe('preview:gamma');
    expect(result.current.primaryPreviewLeaf?.path).toBe('docs/alpha.md');
  });
});
