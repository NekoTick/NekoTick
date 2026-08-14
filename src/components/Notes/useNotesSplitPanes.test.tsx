import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotesSplitPanes } from './useNotesSplitPanes';

const mocks = vi.hoisted(() => ({
  currentNotePath: 'docs/alpha.md' as string | null,
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
  focusCurrentEditorAtViewportPoint: vi.fn(() => false),
}));

vi.mock('./features/Editor/utils/editorViewRegistry', () => ({
  getCurrentEditorNotePath: vi.fn(() => null),
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
    mocks.openStoredNotePath.mockReset();
    mocks.setNotesSplitPanesActive.mockClear();
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
