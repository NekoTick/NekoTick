import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanAllNotesOptions } from '@/stores/notes/types';
import { useGraphNoteScan } from './useGraphNoteScan';

const state = vi.hoisted(() => ({
  notes: {
    notesPath: '/notes',
    rootFolder: {
      children: [
        { id: 'Alpha.md', name: 'Alpha.md', path: 'Alpha.md', isFolder: false },
      ],
    } as { children: Array<Record<string, unknown>> } | null,
    rootFolderPath: '/notes' as string | null,
    loadFileTree: vi.fn<() => Promise<void>>(),
    scanAllNotes: vi.fn<(options?: ScanAllNotesOptions) => Promise<void>>(),
  },
  roots: {
    currentNotesRoot: { path: '/notes' } as { path: string } | null,
  },
}));

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: Object.assign(
    (selector: (value: typeof state.notes) => unknown) => selector(state.notes),
    { getState: () => state.notes },
  ),
}));

vi.mock('@/stores/useNotesRootStore', () => ({
  useNotesRootStore: (selector: (value: typeof state.roots) => unknown) => selector(state.roots),
}));

describe('useGraphNoteScan', () => {
  beforeEach(() => {
    state.notes.notesPath = '/notes';
    state.notes.rootFolderPath = '/notes';
    state.notes.rootFolder = {
      children: [
        { id: 'Alpha.md', name: 'Alpha.md', path: 'Alpha.md', isFolder: false },
      ],
    };
    state.roots.currentNotesRoot = { path: '/notes' };
    state.notes.loadFileTree.mockReset().mockResolvedValue(undefined);
    state.notes.scanAllNotes.mockReset();
  });

  it('loads the file tree before scanning a directly opened graph', async () => {
    state.notes.rootFolder = null;
    state.notes.rootFolderPath = null;
    state.notes.scanAllNotes.mockResolvedValue(undefined);
    state.notes.loadFileTree.mockImplementation(async () => {
      state.notes.rootFolder = {
        children: [{ id: 'Alpha.md', name: 'Alpha.md', path: 'Alpha.md', isFolder: false }],
      };
      state.notes.rootFolderPath = '/notes';
    });
    const onPrimaryContentReady = vi.fn();
    const hook = renderHook(() => useGraphNoteScan({ active: true, onPrimaryContentReady }));

    expect(hook.result.current.status).toBe('loading');
    expect(onPrimaryContentReady).not.toHaveBeenCalled();
    await waitFor(() => expect(state.notes.loadFileTree).toHaveBeenCalledWith(true));
    hook.rerender();
    await waitFor(() => expect(hook.result.current.status).toBe('complete'));
    expect(state.notes.scanAllNotes).toHaveBeenCalledOnce();
    expect(onPrimaryContentReady).toHaveBeenCalledOnce();
  });

  it('moves from loading through provisional results to complete', async () => {
    let resolveScan!: () => void;
    state.notes.scanAllNotes.mockImplementation(() => new Promise<void>((resolve) => {
      resolveScan = resolve;
    }));
    const onPrimaryContentReady = vi.fn();
    const hook = renderHook(() => useGraphNoteScan({
      active: true,
      onPrimaryContentReady,
    }));

    expect(hook.result.current.status).toBe('loading');
    const options = state.notes.scanAllNotes.mock.calls[0]?.[0];
    expect(options?.rejectOnCancel).toBe(true);
    act(() => options?.onPriorityPathsScanned?.());
    expect(hook.result.current.status).toBe('provisional');
    expect(onPrimaryContentReady).toHaveBeenCalledTimes(1);

    await act(async () => resolveScan());
    expect(hook.result.current.status).toBe('complete');
  });

  it('joins an active scan when the focused graph note changes', () => {
    state.notes.scanAllNotes.mockImplementation(() => new Promise<void>(() => undefined));
    const hook = renderHook(({ priorityPath }) => useGraphNoteScan({
      active: true,
      priorityPath,
    }), {
      initialProps: { priorityPath: null as string | null },
    });

    hook.rerender({ priorityPath: 'Later.md' });

    expect(state.notes.scanAllNotes).toHaveBeenCalledTimes(2);
    expect(state.notes.scanAllNotes.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      background: true,
      priorityPaths: ['Later.md'],
    }));
    act(() => state.notes.scanAllNotes.mock.calls[1]?.[0]?.onPriorityPathsScanned?.());
    expect(hook.result.current.status).toBe('provisional');
  });

  it('reports scan failures instead of completing with an empty graph', async () => {
    state.notes.scanAllNotes.mockRejectedValue(new Error('scan failed'));
    const onPrimaryContentReady = vi.fn();
    const hook = renderHook(() => useGraphNoteScan({
      active: true,
      onPrimaryContentReady,
    }));

    await waitFor(() => expect(hook.result.current.status).toBe('error'));
    expect(onPrimaryContentReady).toHaveBeenCalledTimes(1);

    state.notes.scanAllNotes.mockResolvedValue(undefined);
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.status).toBe('complete'));
    expect(state.notes.scanAllNotes).toHaveBeenCalledTimes(2);
  });

  it('rejoins after a shared scan is cancelled without reporting an error', async () => {
    let rejectSharedScan!: (error: unknown) => void;
    let resolveReplacementScan!: () => void;
    state.notes.scanAllNotes
      .mockImplementationOnce(() => new Promise<void>((_, reject) => {
        rejectSharedScan = reject;
      }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveReplacementScan = resolve;
      }));
    const onPrimaryContentReady = vi.fn();
    const hook = renderHook(() => useGraphNoteScan({
      active: true,
      onPrimaryContentReady,
    }));

    const firstOptions = state.notes.scanAllNotes.mock.calls[0]?.[0];
    act(() => firstOptions?.onPriorityPathsScanned?.());
    expect(hook.result.current.status).toBe('provisional');

    await act(async () => {
      rejectSharedScan(new DOMException('Scan cancelled', 'AbortError'));
    });
    await waitFor(() => expect(state.notes.scanAllNotes).toHaveBeenCalledTimes(2));
    expect(hook.result.current.status).toBe('provisional');
    expect(onPrimaryContentReady).toHaveBeenCalledTimes(1);
    expect(state.notes.scanAllNotes.mock.calls[1]?.[0]?.rejectOnCancel).toBe(true);

    await act(async () => resolveReplacementScan());
    expect(hook.result.current.status).toBe('complete');
    expect(onPrimaryContentReady).toHaveBeenCalledTimes(1);
  });

  it('does not scan while inactive and starts with current data when activated', async () => {
    state.notes.scanAllNotes.mockResolvedValue(undefined);
    const hook = renderHook(({ active }) => useGraphNoteScan({ active }), {
      initialProps: { active: false },
    });

    expect(state.notes.scanAllNotes).not.toHaveBeenCalled();

    hook.rerender({ active: true });
    await waitFor(() => expect(hook.result.current.status).toBe('complete'));
    expect(state.notes.scanAllNotes).toHaveBeenCalledTimes(1);
  });

  it('keeps an existing snapshot provisional while refreshing after reactivation', async () => {
    state.notes.scanAllNotes.mockResolvedValueOnce(undefined);
    const hook = renderHook(({ active }) => useGraphNoteScan({ active }), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(hook.result.current.status).toBe('complete'));

    hook.rerender({ active: false });
    state.notes.scanAllNotes.mockImplementation(() => new Promise<void>(() => undefined));
    hook.rerender({ active: true });

    await waitFor(() => expect(hook.result.current.status).toBe('provisional'));
  });

  it('keeps an existing snapshot provisional when the file tree refreshes in place', async () => {
    state.notes.scanAllNotes.mockResolvedValueOnce(undefined);
    const hook = renderHook(() => useGraphNoteScan({ active: true }));
    await waitFor(() => expect(hook.result.current.status).toBe('complete'));

    state.notes.scanAllNotes.mockImplementation(() => new Promise<void>(() => undefined));
    state.notes.rootFolder = {
      children: [
        ...state.notes.rootFolder!.children,
        { id: 'Beta.md', name: 'Beta.md', path: 'Beta.md', isFolder: false },
      ],
    };
    hook.rerender();

    await waitFor(() => expect(hook.result.current.status).toBe('provisional'));
  });
});
