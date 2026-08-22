import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { themeEditorLayoutTokens } from '@/styles/themeTokens';
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
      currentNoteDiskRevision: 7,
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

  it('requires a fresh rendered-editor readiness signal after leaving source mode', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMarkdownEditorSourceMode({
      currentNotePath: 'alpha.md',
      hasActiveNote: true,
    }));

    act(() => {
      result.current.handleToggleSourceMode();
    });
    expect(result.current.isSourceMode).toBe(true);
    expect(result.current.isEditorViewReady).toBe(true);

    act(() => {
      result.current.handleToggleSourceMode();
    });
    expect(result.current.isSourceMode).toBe(false);
    expect(result.current.isEditorViewReady).toBe(false);

    act(() => {
      vi.advanceTimersByTime(themeEditorLayoutTokens.editorInitFallbackDelayMs);
    });
    expect(result.current.shouldUseSourceFallback).toBe(true);
  });

  it('discards a pending fallback timeout when the current note changes', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ currentNotePath }) => useMarkdownEditorSourceMode({
        currentNotePath,
        hasActiveNote: true,
      }),
      { initialProps: { currentNotePath: 'alpha.md' } },
    );

    act(() => {
      vi.advanceTimersByTime(themeEditorLayoutTokens.editorInitFallbackDelayMs - 1);
    });
    rerender({ currentNotePath: 'beta.md' });
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.shouldUseSourceFallback).toBe(false);
  });

  it('restarts the fallback timeout after the notes view is reactivated', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ hasActiveNote }) => useMarkdownEditorSourceMode({
        currentNotePath: 'alpha.md',
        hasActiveNote,
      }),
      { initialProps: { hasActiveNote: true } },
    );

    rerender({ hasActiveNote: false });
    rerender({ hasActiveNote: true });
    act(() => {
      vi.advanceTimersByTime(themeEditorLayoutTokens.editorInitFallbackDelayMs);
    });

    expect(result.current.shouldUseSourceFallback).toBe(true);
  });

  it('reports an initialization timeout with note metadata', () => {
    vi.useFakeTimers();
    const onEditorFailure = vi.fn();
    const { result } = renderHook(() => useMarkdownEditorSourceMode({
      currentNotePath: 'alpha.md',
      hasActiveNote: true,
      onEditorFailure,
    }));

    act(() => {
      vi.advanceTimersByTime(themeEditorLayoutTokens.editorInitFallbackDelayMs);
    });

    expect(result.current.shouldUseSourceFallback).toBe(true);
    expect(onEditorFailure).toHaveBeenCalledWith({
      reason: 'init-timeout',
      contentLength: '# Alpha'.length,
      diskRevision: 7,
    });
  });

  it('ignores a failure callback from the previous note session', () => {
    const onEditorFailure = vi.fn();
    const { result, rerender } = renderHook(
      ({ currentNotePath }) => useMarkdownEditorSourceMode({
        currentNotePath,
        hasActiveNote: true,
        onEditorFailure,
      }),
      { initialProps: { currentNotePath: 'alpha.md' } },
    );
    const staleFailureHandler = result.current.handleRenderedEditorFailure;

    rerender({ currentNotePath: 'beta.md' });
    act(() => {
      staleFailureHandler({ reason: 'creation-error', error: new Error('stale editor') });
    });

    expect(onEditorFailure).not.toHaveBeenCalled();
    expect(result.current.editorRuntimeRevision).toBe(1);
    expect(result.current.shouldUseSourceFallback).toBe(false);
  });

  it('ignores a failure callback from before the current note was reloaded', () => {
    const onEditorFailure = vi.fn();
    const { result, rerender } = renderHook(
      ({ currentNoteDiskRevision }) => useMarkdownEditorSourceMode({
        currentNotePath: 'alpha.md',
        currentNoteDiskRevision,
        hasActiveNote: true,
        onEditorFailure,
      }),
      { initialProps: { currentNoteDiskRevision: 7 } },
    );
    const staleFailureHandler = result.current.handleRenderedEditorFailure;

    rerender({ currentNoteDiskRevision: 8 });
    act(() => {
      staleFailureHandler({ reason: 'creation-error', error: new Error('stale editor') });
    });

    expect(onEditorFailure).not.toHaveBeenCalled();
    expect(result.current.editorRuntimeRevision).toBe(1);
    expect(result.current.shouldUseSourceFallback).toBe(false);
  });

  it('ignores a readiness callback from the previous note session', () => {
    const onEditorViewReady = vi.fn();
    const { result, rerender } = renderHook(
      ({ currentNotePath }) => useMarkdownEditorSourceMode({
        currentNotePath,
        hasActiveNote: true,
        onEditorViewReady,
      }),
      { initialProps: { currentNotePath: 'alpha.md' } },
    );
    const staleReadyHandler = result.current.handleEditorViewReady;

    rerender({ currentNotePath: 'beta.md' });
    act(() => {
      staleReadyHandler();
    });

    expect(onEditorViewReady).not.toHaveBeenCalled();
    expect(result.current.isEditorViewReady).toBe(false);
  });

  it('does not report a timeout after the editor session is deactivated', () => {
    vi.useFakeTimers();
    const onEditorFailure = vi.fn();
    const { rerender } = renderHook(
      ({ hasActiveNote }) => useMarkdownEditorSourceMode({
        currentNotePath: 'alpha.md',
        hasActiveNote,
        onEditorFailure,
      }),
      { initialProps: { hasActiveNote: true } },
    );

    rerender({ hasActiveNote: false });
    act(() => {
      vi.advanceTimersByTime(themeEditorLayoutTokens.editorInitFallbackDelayMs);
    });

    expect(onEditorFailure).not.toHaveBeenCalled();
  });
});
