import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_ABSOLUTE_NOTE_WATCH_EVENT_PATHS,
  useAbsoluteNoteExternalRenameSync,
} from './useAbsoluteNoteExternalRenameSync';

type WatchEvent = {
  type: unknown;
  paths: string[];
};

const hoisted = vi.hoisted(() => {
  const notesState = {
    applyExternalPathRename: vi.fn(async () => undefined),
    syncCurrentNoteFromDisk: vi.fn(async () => 'unchanged' as const),
  };

  return {
    notesState,
    watchHandler: null as ((event: WatchEvent) => void | Promise<void>) | null,
    unwatch: vi.fn(async () => undefined),
    watchDesktopPath: vi.fn(async (_path: string, handler: (event: WatchEvent) => void | Promise<void>) => {
      hoisted.watchHandler = handler;
      return hoisted.unwatch;
    }),
    unsubscribeRenameBroadcast: vi.fn(),
    renameBroadcastListener: null as ((event: { nonce?: string; oldPath: string; newPath: string }) => void) | null,
    subscribeNotesExternalPathRename: vi.fn((
      _path: string,
      listener: (event: { nonce?: string; oldPath: string; newPath: string }) => void,
    ) => {
      hoisted.renameBroadcastListener = listener;
      return hoisted.unsubscribeRenameBroadcast;
    }),
    readNotesExternalPathEvents: vi.fn(async () => [] as Array<{ nonce: string; oldPath: string; newPath: string }>),
  };
});

vi.mock('@/lib/desktop/watch', () => ({
  watchDesktopPath: hoisted.watchDesktopPath,
}));

vi.mock('@/lib/storage/adapter', () => ({
  getParentPath: (path: string) => {
    const normalized = path.replace(/\\/g, '/');
    const index = normalized.lastIndexOf('/');
    return index > 0 ? normalized.slice(0, index) : null;
  },
  isAbsolutePath: (path: string) => path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path),
  normalizeAbsolutePath: (path: string) => {
    const normalized = path.replace(/\\/g, '/');
    const driveMatch = normalized.match(/^([A-Za-z]:)(?:\/|$)/);
    const root = driveMatch ? `${driveMatch[1]}/` : normalized.startsWith('/') ? '/' : '';
    if (!root) return path;

    const parts: string[] = [];
    const rest = normalized.slice(root.length).replace(/^\/+/, '');
    for (const part of rest.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        parts.pop();
        continue;
      }
      parts.push(part);
    }

    const nextPath = parts.length > 0
      ? `${root}${root.endsWith('/') ? '' : '/'}${parts.join('/')}`
      : root;
    return path.includes('\\') ? nextPath.replace(/\//g, '\\') : nextPath;
  },
}));

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: Object.assign(
    (selector: (state: typeof hoisted.notesState) => unknown) => selector(hoisted.notesState),
    {
      getState: () => hoisted.notesState,
    },
  ),
}));

vi.mock('@/stores/notes/document/externalPathBroadcast', () => ({
  readNotesExternalPathEvents: hoisted.readNotesExternalPathEvents,
  subscribeNotesExternalPathRename: hoisted.subscribeNotesExternalPathRename,
}));

describe('useAbsoluteNoteExternalRenameSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.watchHandler = null;
    hoisted.renameBroadcastListener = null;
    hoisted.watchDesktopPath.mockImplementation(async (_path: string, handler: (event: WatchEvent) => void | Promise<void>) => {
      hoisted.watchHandler = handler;
      return hoisted.unwatch;
    });
    hoisted.subscribeNotesExternalPathRename.mockImplementation((
      _path: string,
      listener: (event: { nonce?: string; oldPath: string; newPath: string }) => void,
    ) => {
      hoisted.renameBroadcastListener = listener;
      return hoisted.unsubscribeRenameBroadcast;
    });
  });

  it('syncs an open absolute note after a content watch event', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    expect(hoisted.watchDesktopPath).toHaveBeenCalledWith(
      '/external/docs',
      expect.any(Function),
      { recursive: true },
    );

    await act(async () => {
      await hoisted.watchHandler?.({
        type: 'modify',
        paths: ['/external/docs/current.md'],
      });
    });

    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });
    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('syncs the current absolute note for oversized watch events', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: 'modify',
        paths: Array.from(
          { length: MAX_ABSOLUTE_NOTE_WATCH_EVENT_PATHS + 1 },
          (_value, index) => `/external/docs/changed-${index}.md`,
        ),
      });
    });

    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });
    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('continues handling current-note paths after checking persisted rename events', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: 'modify',
        paths: ['/external/docs/current.md'],
      });
    });

    expect(hoisted.readNotesExternalPathEvents).toHaveBeenCalledWith('/external/docs', {
      afterStamp: expect.any(Number),
    });
    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });

    hook.unmount();
  });

  it('continues handling current-note paths when persisted event replay fails', async () => {
    hoisted.readNotesExternalPathEvents.mockRejectedValueOnce(new Error('event file unavailable'));
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: 'modify',
        paths: ['/external/docs/current.md'],
      });
    });

    expect(hoisted.readNotesExternalPathEvents).toHaveBeenCalledWith('/external/docs', {
      afterStamp: expect.any(Number),
    });
    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });

    hook.unmount();
  });

  it('keeps absolute rename sync behavior for rename watch events', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'rename', mode: 'both' } },
        paths: ['/external/docs/current.md', '/external/docs/renamed.md'],
      });
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith(
      '/external/docs/current.md',
      '/external/docs/renamed.md',
    );
    expect(hoisted.notesState.syncCurrentNoteFromDisk).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('applies absolute rename broadcast events for the watched parent path', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    expect(hoisted.subscribeNotesExternalPathRename).toHaveBeenCalledWith(
      '/external/docs',
      expect.any(Function),
    );

    act(() => {
      hoisted.renameBroadcastListener?.({
        nonce: 'broadcast-rename',
        oldPath: '/external/docs/current.md',
        newPath: '/external/docs/renamed.md',
      });
    });

    await waitFor(() => {
      expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith(
        '/external/docs/current.md',
        '/external/docs/renamed.md',
      );
    });

    hook.unmount();
  });

  it('does not remap an absolute note when the file is renamed to a non-Markdown path', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'rename', mode: 'both' } },
        paths: ['/external/docs/current.md', '/external/docs/current.png'],
      });
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });

    hook.unmount();
  });

  it('syncs a Windows absolute note renamed to a non-Markdown path with case-varied events', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('C:/Users/Me/NotesRoot/current.md'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'rename', mode: 'both' } },
        paths: ['c:/users/me/notesRoot/current.md', 'c:/users/me/notesRoot/current.png'],
      });
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });

    hook.unmount();
  });

  it('does not remap an absolute note through unsafe rename endpoints', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'rename', mode: 'both' } },
        paths: ['/external/docs/current.md', '/external/docs/secret\u202Egnp.md'],
      });
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.syncCurrentNoteFromDisk).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('does not watch an absolute note inside internal folders', () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/.git/current.md'));

    expect(hoisted.watchDesktopPath).not.toHaveBeenCalled();
    expect(hoisted.subscribeNotesExternalPathRename).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('does not remap an absolute note into internal folders', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'rename', mode: 'both' } },
        paths: ['/external/docs/current.md', '/external/docs/.vlaina/current.md'],
      });
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.syncCurrentNoteFromDisk).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('keeps absolute note rename sync inside user dot folders', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/.notes/current.md'));

    expect(hoisted.watchDesktopPath).toHaveBeenCalledWith(
      '/external/.notes',
      expect.any(Function),
      { recursive: true },
    );

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'rename', mode: 'both' } },
        paths: ['/external/.notes/current.md', '/external/.notes/renamed.md'],
      });
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith(
      '/external/.notes/current.md',
      '/external/.notes/renamed.md',
    );

    hook.unmount();
  });

  it('keeps absolute note folder rename sync when the parent folder moves', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'rename', mode: 'both' } },
        paths: ['/external/docs', '/external/archive'],
      });
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith(
      '/external/docs',
      '/external/archive',
    );
    expect(hoisted.notesState.syncCurrentNoteFromDisk).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('keeps Windows absolute note folder rename sync with case-varied events', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('C:/Users/Me/NotesRoot/docs/current.md'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'rename', mode: 'both' } },
        paths: ['c:/users/me/notesRoot/docs', 'c:/users/me/notesRoot/archive'],
      });
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith(
      'c:/users/me/notesRoot/docs',
      'c:/users/me/notesRoot/archive',
    );
    expect(hoisted.notesState.syncCurrentNoteFromDisk).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('syncs an open absolute note deletion without treating it as a rename', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/external/docs/current.md'],
      });
    });

    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });
    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('avoids native directory watching when an absolute note lives directly in the home directory', async () => {
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/home/user/current.md'));

    expect(hoisted.watchDesktopPath).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });

    hook.unmount();
  });

  it('falls back to focus polling when the absolute note watcher is unavailable', async () => {
    hoisted.watchDesktopPath.mockRejectedValueOnce(
      new Error('ENOSPC: System limit for number of file watchers reached')
    );

    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    await act(async () => {
      await Promise.resolve();
      window.dispatchEvent(new Event('focus'));
    });

    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });

    hook.unmount();
  });

  it('falls back to focus polling when the absolute note watcher fails unexpectedly', async () => {
    hoisted.watchDesktopPath.mockRejectedValueOnce(new Error('Permission denied'));

    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/external/docs/current.md'));

    await act(async () => {
      await Promise.resolve();
      window.dispatchEvent(new Event('focus'));
    });

    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });

    hook.unmount();
  });

  it('pauses fallback polling while the document is hidden', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const hook = renderHook(() => useAbsoluteNoteExternalRenameSync('/home/user/current.md'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    hoisted.notesState.syncCurrentNoteFromDisk.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(hoisted.notesState.syncCurrentNoteFromDisk).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });

    hook.unmount();
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
});
