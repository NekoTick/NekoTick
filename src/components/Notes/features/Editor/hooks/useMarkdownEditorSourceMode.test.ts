import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarkdownEditorSourceMode } from './useMarkdownEditorSourceMode';

const mocks = vi.hoisted(() => ({
  flushEditorSave: vi.fn(async () => undefined),
  flushPendingMarkdown: vi.fn(() => true),
}));

vi.mock('@/stores/notes/pendingEditorMarkdown', () => ({
  flushCurrentPendingEditorMarkdown: mocks.flushPendingMarkdown,
}));

vi.mock('../utils/editorSaveRegistry', () => ({
  flushCurrentEditorSave: mocks.flushEditorSave,
}));

vi.mock('@/stores/useNotesStore', () => ({
  useNotesStore: {
    getState: () => ({
      currentNote: { path: 'alpha.md', content: '# Alpha' },
      noteContentsCache: new Map(),
    }),
  },
}));

describe('useMarkdownEditorSourceMode', () => {
  beforeEach(() => {
    mocks.flushEditorSave.mockClear();
    mocks.flushPendingMarkdown.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes editor content and persistence when source mode changes', () => {
    const { result } = renderHook(() => useMarkdownEditorSourceMode({
      currentNotePath: 'alpha.md',
      hasActiveNote: true,
    }));

    act(() => {
      result.current.handleToggleSourceMode();
    });

    expect(mocks.flushPendingMarkdown).toHaveBeenCalledTimes(1);
    expect(mocks.flushEditorSave).toHaveBeenCalledTimes(1);
    expect(result.current.isSourceMode).toBe(true);
  });

  it('restores relative scroll position after entering and leaving source mode', () => {
    vi.useFakeTimers();
    let clientHeight = 400;
    let scrollHeight = 2_000;
    let scrollTop = 880;
    const scrollRoot = {} as HTMLElement;
    Object.defineProperties(scrollRoot, {
      clientHeight: { get: () => clientHeight },
      scrollHeight: { get: () => scrollHeight },
      scrollTop: {
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    const scrollRootRef = { current: scrollRoot };
    const { result } = renderHook(() => useMarkdownEditorSourceMode({
      currentNotePath: 'alpha.md',
      hasActiveNote: true,
      scrollRootRef,
    }));

    act(() => {
      result.current.handleToggleSourceMode();
    });
    scrollHeight = 1_200;
    scrollTop = 0;
    act(() => {
      result.current.handleEditorViewReady();
    });
    expect(scrollTop).toBeCloseTo(440);

    scrollTop = 0;
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(scrollTop).toBeCloseTo(440);

    scrollTop = 576;
    act(() => {
      result.current.handleToggleSourceMode();
    });
    clientHeight = 400;
    scrollHeight = 2_000;
    scrollTop = 0;
    act(() => {
      result.current.handleEditorViewReady();
    });
    expect(scrollTop).toBeCloseTo(1_152);

    scrollTop = 0;
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(scrollTop).toBeCloseTo(1_152);
  });

  it('requires the rendered editor to report ready again after reactivation', () => {
    const { result, rerender } = renderHook(
      ({ hasActiveNote }) => useMarkdownEditorSourceMode({
        currentNotePath: 'alpha.md',
        hasActiveNote,
      }),
      { initialProps: { hasActiveNote: true } },
    );

    act(() => {
      result.current.handleEditorViewReady();
    });
    expect(result.current.isEditorViewReady).toBe(true);

    rerender({ hasActiveNote: false });
    rerender({ hasActiveNote: true });

    expect(result.current.isEditorViewReady).toBe(false);
    expect(result.current.shouldUseSourceFallback).toBe(false);
  });
});
