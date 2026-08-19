import { act, renderHook } from '@testing-library/react';
import { editorViewCtx, serializerCtx } from '@milkdown/kit/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMilkdownExternalContentSync } from './useMilkdownExternalContentSync';

afterEach(() => {
  vi.useRealTimers();
});

describe('useMilkdownExternalContentSync', () => {
  it('waits for editor creation before reading its context', () => {
    const content = '# Small';
    const view = {
      dom: document.createElement('div'),
      state: {
        doc: {},
        plugins: [],
      },
    };
    const ctx = {
      get: vi.fn<(token: unknown) => unknown>(() => {
        throw new Error('Editor context is not ready');
      }),
    };
    const editor = {
      action: vi.fn((action: (activeCtx: typeof ctx) => unknown) => action(ctx)),
      ctx,
      status: 'OnCreate',
    };
    const reportEditorContentSyncFailure = vi.fn();
    const reportEditorReady = vi.fn();
    const lastAppliedNoteRef = {
      current: {
        path: 'small.md',
        diskRevision: 1,
        content,
      },
    };

    const { rerender } = renderHook(
      ({ activatedRevision }) => useMilkdownExternalContentSync({
        activatedRevision,
        canSyncContent: true,
        currentNoteContent: content,
        currentNoteDiskRevision: 1,
        currentNotePath: 'small.md',
        get: () => editor,
        lastAppliedNoteRef,
        reportEditorContentSyncFailure,
        reportEditorReady,
        shouldPreserveLiveEditorContent: () => false,
      }),
      { initialProps: { activatedRevision: 0 } },
    );

    expect(ctx.get).not.toHaveBeenCalled();
    expect(reportEditorContentSyncFailure).not.toHaveBeenCalled();

    editor.status = 'Created';
    ctx.get.mockImplementation((token: unknown) => {
      if (token === editorViewCtx) return view;
      if (token === serializerCtx) return () => content;
      throw new Error('Unexpected token');
    });
    rerender({ activatedRevision: 1 });

    expect(reportEditorReady).toHaveBeenCalledWith(editor);
    expect(reportEditorContentSyncFailure).not.toHaveBeenCalled();
  });

  it('resets the retry budget when editor creation interrupts synchronization', () => {
    vi.useFakeTimers();
    const ctx = {
      get: vi.fn<(token: unknown) => unknown>(() => {
        throw new Error('Editor context is unavailable');
      }),
    };
    const editor = {
      action: vi.fn((action: (activeCtx: typeof ctx) => unknown) => action(ctx)),
      ctx,
      status: 'Created',
    };
    const reportEditorContentSyncFailure = vi.fn();
    const reportEditorReady = vi.fn();
    const lastAppliedNoteRef = {
      current: { path: 'small.md', diskRevision: 1, content: '# Small' },
    };
    const { rerender } = renderHook(
      ({ activatedRevision }) => useMilkdownExternalContentSync({
        activatedRevision,
        canSyncContent: true,
        currentNoteContent: '# Small',
        currentNoteDiskRevision: 1,
        currentNotePath: 'small.md',
        get: () => editor,
        lastAppliedNoteRef,
        reportEditorContentSyncFailure,
        reportEditorReady,
        shouldPreserveLiveEditorContent: () => false,
      }),
      { initialProps: { activatedRevision: 0 } },
    );

    editor.status = 'OnCreate';
    rerender({ activatedRevision: 1 });
    editor.status = 'Created';
    rerender({ activatedRevision: 2 });

    expect(reportEditorContentSyncFailure).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersToNextTimer();
    });
    expect(reportEditorContentSyncFailure).toHaveBeenCalledTimes(1);
  });
});
