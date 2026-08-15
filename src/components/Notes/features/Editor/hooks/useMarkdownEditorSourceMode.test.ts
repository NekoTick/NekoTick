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
});
