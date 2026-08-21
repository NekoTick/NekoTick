import { act, renderHook } from '@testing-library/react';
import { editorViewCtx, serializerCtx } from '@milkdown/kit/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMilkdownExternalContentSync } from './useMilkdownExternalContentSync';

const mocks = vi.hoisted(() => ({
  replaceEditorMarkdown: vi.fn(() => true),
}));

vi.mock('./milkdownEditorMarkdownReplacement', async (importOriginal) => ({
  ...await importOriginal<typeof import('./milkdownEditorMarkdownReplacement')>(),
  replaceEditorMarkdown: mocks.replaceEditorMarkdown,
}));

function createEditorHarness(serializedMarkdown: string) {
  const transaction = {
    setMeta: vi.fn(() => transaction),
  };
  const view = {
    composing: true,
    dispatch: vi.fn(),
    dom: document.createElement('div'),
    state: {
      doc: {},
      plugins: [],
      tr: transaction,
    },
  };
  const ctx = {
    get: vi.fn((token: unknown) => {
      if (token === editorViewCtx) return view;
      if (token === serializerCtx) return () => serializedMarkdown;
      throw new Error('Unexpected token');
    }),
  };
  const editor = {
    action: vi.fn((action: (activeCtx: typeof ctx) => unknown) => action(ctx)),
    ctx,
    status: 'Created',
  };
  return { editor, view };
}

afterEach(() => {
  vi.useRealTimers();
  mocks.replaceEditorMarkdown.mockClear();
  mocks.replaceEditorMarkdown.mockReturnValue(true);
});

describe('useMilkdownExternalContentSync', () => {
  it('defers a same-note external replacement until composition ends', () => {
    vi.useFakeTimers();
    const content = '# Disk edit';
    const { editor, view } = createEditorHarness('# nihao');
    const reportEditorReady = vi.fn();
    const lastAppliedNoteRef = {
      current: {
        path: 'small.md',
        diskRevision: 1,
        content: '# Previous disk content',
      },
    };

    renderHook(() => useMilkdownExternalContentSync({
      activatedRevision: 1,
      canSyncContent: true,
      currentNoteContent: content,
      currentNoteDiskRevision: 2,
      currentNotePath: 'small.md',
      get: () => editor,
      lastAppliedNoteRef,
      reportEditorReady,
      shouldPreserveLiveEditorContent: () => false,
    }));

    expect(mocks.replaceEditorMarkdown).not.toHaveBeenCalled();
    expect(reportEditorReady).not.toHaveBeenCalled();

    act(() => {
      view.composing = false;
      view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      vi.advanceTimersToNextTimer();
    });

    expect(mocks.replaceEditorMarkdown).toHaveBeenCalledTimes(1);
    expect(lastAppliedNoteRef.current).toEqual({
      path: 'small.md',
      diskRevision: 2,
      content,
    });
    expect(reportEditorReady).toHaveBeenCalledWith(editor);
  });

  it('still replaces a different note while the previous editor is composing', () => {
    const { editor } = createEditorHarness('# Previous note');
    const lastAppliedNoteRef = {
      current: {
        path: 'previous.md',
        diskRevision: 1,
        content: '# Previous note',
      },
    };

    renderHook(() => useMilkdownExternalContentSync({
      activatedRevision: 1,
      canSyncContent: true,
      currentNoteContent: '# Next note',
      currentNoteDiskRevision: 1,
      currentNotePath: 'next.md',
      get: () => editor,
      lastAppliedNoteRef,
      reportEditorReady: vi.fn(),
      shouldPreserveLiveEditorContent: () => false,
    }));

    expect(mocks.replaceEditorMarkdown).toHaveBeenCalledTimes(1);
  });

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

  it('reports the actual synchronization error after the retry fails', () => {
    vi.useFakeTimers();
    const failure = new Error('Unsupported markdown node');
    const { editor, view } = createEditorHarness('# Previous');
    view.composing = false;
    editor.action.mockImplementation(() => {
      throw failure;
    });
    const reportEditorContentSyncFailure = vi.fn();
    const lastAppliedNoteRef = {
      current: { path: 'small.md', diskRevision: 1, content: '# Previous' },
    };

    renderHook(() => useMilkdownExternalContentSync({
      activatedRevision: 1,
      canSyncContent: true,
      currentNoteContent: '# Broken',
      currentNoteDiskRevision: 2,
      currentNotePath: 'small.md',
      get: () => editor,
      lastAppliedNoteRef,
      reportEditorContentSyncFailure,
      reportEditorReady: vi.fn(),
      shouldPreserveLiveEditorContent: () => false,
    }));

    expect(reportEditorContentSyncFailure).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersToNextTimer();
    });

    expect(reportEditorContentSyncFailure).toHaveBeenCalledWith(failure);
  });
});
