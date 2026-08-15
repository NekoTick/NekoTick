import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
