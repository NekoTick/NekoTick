import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotesExternalSync } from './useNotesExternalSync';
import { buildExternalTreeSnapshot, detectExternalTreePathChanges } from './notesExternalPollingUtils';
import { shouldIgnoreExpectedExternalChange } from '@/stores/notes/document/externalChangeRegistry';

type WatchEvent = {
  type: unknown;
  paths: string[];
};

const hoisted = vi.hoisted(() => {
  const notesState = {
    loadFileTree: vi.fn(async () => undefined),
    invalidateNoteCache: vi.fn(),
    syncCurrentNoteFromDisk: vi.fn(async () => 'unchanged' as const),
    applyExternalPathRename: vi.fn(async () => undefined),
    applyExternalPathDeletion: vi.fn(async () => undefined),
    notesPath: '/notesRoot',
    currentNote: { path: 'docs/current.md' } as { path: string } | null,
    isDirty: false,
    rootFolder: { children: [] as unknown[] } as { children: unknown[] } | null,
    openTabs: [] as Array<{ path: string }>,
    recentNotes: [] as string[],
    noteContentsCache: new Map<string, unknown>(),
    noteMetadata: { notes: {} as Record<string, unknown> },
  };

  return {
    notesState,
    watchHandler: null as ((event: WatchEvent) => void | Promise<void>) | null,
    unwatch: vi.fn(async () => undefined) as () => Promise<void>,
    releaseWatcher: vi.fn(),
    watchDesktopPath: vi.fn(async (_path: string, handler: (event: WatchEvent) => void | Promise<void>) => {
      hoisted.watchHandler = handler;
      return hoisted.unwatch;
    }),
    renameBroadcastHandler: null as ((event: { nonce: string; oldPath: string; newPath: string }) => void) | null,
    unsubscribeRenameBroadcast: vi.fn(),
    subscribeNotesExternalPathRename: vi.fn(
      (_notesPath: string, handler: (event: { nonce: string; oldPath: string; newPath: string }) => void) => {
        hoisted.renameBroadcastHandler = handler;
        return hoisted.unsubscribeRenameBroadcast;
      }
    ),
    readNotesExternalPathEvents: vi.fn(async () => [] as Array<{ nonce: string; oldPath: string; newPath: string }>),
  };
});

vi.mock('@/lib/desktop/watch', () => ({
  watchDesktopPath: hoisted.watchDesktopPath,
}));

vi.mock('@/lib/storage/adapter', () => ({
  isAbsolutePath: (path: string) => path.startsWith('/'),
  normalizeAbsolutePath: (path: string) => {
    const parts: string[] = [];
    for (const part of path.replace(/\\/g, '/').split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        parts.pop();
        continue;
      }
      parts.push(part);
    }
    return `/${parts.join('/')}`;
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

vi.mock('@/stores/notes/document/externalChangeRegistry', () => ({
  shouldIgnoreExpectedExternalChange: vi.fn(() => false),
}));

vi.mock('@/stores/notes/document/externalSyncControl', () => ({
  isExternalSyncPaused: vi.fn(() => false),
  subscribeExternalSyncPause: vi.fn(() => () => {}),
  registerExternalSyncWatcher: vi.fn(() => hoisted.releaseWatcher),
}));

vi.mock('@/stores/notes/document/externalPathBroadcast', () => ({
  readNotesExternalPathEvents: hoisted.readNotesExternalPathEvents,
  subscribeNotesExternalPathRename: hoisted.subscribeNotesExternalPathRename,
}));

vi.mock('./notesExternalPollingUtils', () => ({
  buildExternalTreeSnapshot: vi.fn(async () => []),
  detectExternalTreePathChanges: vi.fn(() => ({
    hasChanges: false,
    renames: [],
    deletions: [],
    hasAdditions: false,
  })),
}));

describe('useNotesExternalSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    hoisted.watchHandler = null;
    hoisted.renameBroadcastHandler = null;
    hoisted.notesState.notesPath = '/notesRoot';
    hoisted.notesState.currentNote = { path: 'docs/current.md' };
    hoisted.notesState.rootFolder = { children: [] };
    hoisted.notesState.openTabs = [];
    hoisted.notesState.recentNotes = [];
    hoisted.notesState.noteContentsCache = new Map();
    hoisted.notesState.noteMetadata = { notes: {} };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconciles the current note without reloading the tree after an external current-note change', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    expect(hoisted.watchDesktopPath).toHaveBeenCalledWith(
      '/notesRoot',
      expect.any(Function),
      { recursive: true }
    );

    await act(async () => {
      await hoisted.watchHandler?.({
        type: 'modify',
        paths: ['/notesRoot/docs/current.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledTimes(1);
    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });
    expect(hoisted.notesState.invalidateNoteCache).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('refreshes current note disk state for expected write events without reloading the tree', async () => {
    vi.mocked(shouldIgnoreExpectedExternalChange).mockReturnValueOnce(true);
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: 'modify',
        paths: ['/notesRoot/docs/current.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledTimes(1);
    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({
      force: true,
      expectedExternalChange: true,
    });
    expect(hoisted.notesState.invalidateNoteCache).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('invalidates non-current note cache and reloads the tree after an external change', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: 'modify',
        paths: ['/notesRoot/docs/other.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.syncCurrentNoteFromDisk).not.toHaveBeenCalled();
    expect(hoisted.notesState.invalidateNoteCache).toHaveBeenCalledWith('docs/other.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('isolates rejected scheduled file tree reloads', async () => {
    hoisted.notesState.loadFileTree.mockRejectedValueOnce(new Error('reload failed'));
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: 'modify',
        paths: ['/notesRoot/docs/other.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.invalidateNoteCache).toHaveBeenCalledWith('docs/other.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('handles user dotfile note changes as normal markdown events', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: 'modify',
        paths: ['/notesRoot/.journal.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.invalidateNoteCache).toHaveBeenCalledWith('.journal.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('handles user dot-folder note changes as normal markdown events', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: 'modify',
        paths: ['/notesRoot/.notes/alpha.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.invalidateNoteCache).toHaveBeenCalledWith('.notes/alpha.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('invalidates cached descendants and syncs the current note after an external folder change', async () => {
    hoisted.notesState.currentNote = { path: 'docs/current.md' };
    hoisted.notesState.rootFolder = {
      children: [
        {
          id: 'docs',
          path: 'docs',
          name: 'docs',
          isFolder: true,
          expanded: true,
          children: [],
        },
      ],
    };
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'data', mode: 'any' } },
        paths: ['/notesRoot/docs'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.invalidateNoteCache).toHaveBeenCalledWith(
      'docs',
      { includeDescendants: true },
    );
    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalledWith({ force: true });
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('ignores watch events outside the active notes path even if the opened folder path is broader', async () => {
    const hook = renderHook(() => useNotesExternalSync('/home/user', '/home/user/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: 'modify',
        paths: ['/home/user/.cache/firefox/cache-entry'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.syncCurrentNoteFromDisk).not.toHaveBeenCalled();
    expect(hoisted.notesState.invalidateNoteCache).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('polls only the current note for broad notes paths instead of starting a recursive native watch', async () => {
    hoisted.notesState.notesPath = '/home/user';
    const hook = renderHook(() => useNotesExternalSync('/home/user', '/home/user'));

    expect(hoisted.watchDesktopPath).not.toHaveBeenCalled();

    await act(async () => {
      await Promise.resolve();
    });
    expect(buildExternalTreeSnapshot).not.toHaveBeenCalled();
    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalled();

    hoisted.notesState.syncCurrentNoteFromDisk.mockClear();
    vi.mocked(buildExternalTreeSnapshot).mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(buildExternalTreeSnapshot).not.toHaveBeenCalled();
    expect(hoisted.notesState.syncCurrentNoteFromDisk).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(buildExternalTreeSnapshot).not.toHaveBeenCalled();
    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalled();

    hook.unmount();
    hoisted.notesState.notesPath = '/notesRoot';
  });

  it('pauses broad-path polling while the document is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    hoisted.notesState.notesPath = '/home/user';
    const hook = renderHook(() => useNotesExternalSync('/home/user', '/home/user'));

    await act(async () => {
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
    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalled();

    hook.unmount();
    hoisted.notesState.notesPath = '/notesRoot';
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('falls back to polling when native watch startup fails unexpectedly', async () => {
    hoisted.watchDesktopPath.mockRejectedValueOnce(new Error('Permission denied'));
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hoisted.watchDesktopPath).toHaveBeenCalledWith(
      '/notesRoot',
      expect.any(Function),
      { recursive: true },
    );
    expect(buildExternalTreeSnapshot).not.toHaveBeenCalled();
    expect(hoisted.notesState.syncCurrentNoteFromDisk).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(buildExternalTreeSnapshot).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });

    expect(buildExternalTreeSnapshot).toHaveBeenCalled();
    expect(hoisted.notesState.syncCurrentNoteFromDisk).toHaveBeenCalled();
    expect(hoisted.releaseWatcher).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('reconciles on focus without polling the full tree while native watch is active', async () => {
    vi.mocked(detectExternalTreePathChanges).mockReturnValueOnce({
      hasChanges: true,
      renames: [],
      deletions: ['docs/missed-delete.md'],
      hasAdditions: false,
    });
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(buildExternalTreeSnapshot).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    expect(buildExternalTreeSnapshot).toHaveBeenCalledWith('/notesRoot');
    expect(hoisted.notesState.applyExternalPathDeletion).toHaveBeenCalledWith('docs/missed-delete.md');

    hook.unmount();
  });

  it('applies external deletions before reloading the tree', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/removed.md'],
      });
      await vi.advanceTimersByTimeAsync(401);
    });

    expect(hoisted.notesState.applyExternalPathDeletion).toHaveBeenCalledWith('docs/removed.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('treats paired remove and create events as an external rename', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/beta.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.md');
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('deduplicates repeated remove events before pairing an external rename', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/beta.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.md');
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('deduplicates repeated create events before pairing an external rename', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/beta.md'],
      });
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/beta.md'],
      });
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.md');
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('treats paired user dot-folder note events as an external rename', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/.notes/alpha.md'],
      });
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/.notes/beta.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('.notes/alpha.md', '.notes/beta.md');
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('treats a native remove-any event paired with a file create as an external rename', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'any' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/beta.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.md');
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('treats paired create and remove events as an external rename', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/beta.md'],
      });
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.md');
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('pairs a remove event with the unique best pending create instead of the first create', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/archive/new.md'],
      });
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/beta.md'],
      });
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.md');
    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalledWith('docs/alpha.md', 'archive/new.md');
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalledWith('docs/alpha.md');

    hook.unmount();
  });

  it('does not immediately pair ambiguous pending creates with a remove event', async () => {
    vi.mocked(detectExternalTreePathChanges).mockReturnValueOnce({
      hasChanges: true,
      renames: [{ oldPath: 'docs/alpha.md', newPath: 'docs/beta.md' }],
      deletions: [],
      hasAdditions: true,
    });
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/new.md'],
      });
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/beta.md'],
      });
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(181);
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.md');
    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalledWith('docs/alpha.md', 'docs/new.md');
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalledWith('docs/alpha.md');

    hook.unmount();
  });

  it('does not treat a Markdown file removed before a created folder as a folder rename', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { create: { kind: 'folder' } },
        paths: ['/notesRoot/docs/beta.md'],
      });
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'any' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      await vi.advanceTimersByTimeAsync(401);
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.applyExternalPathDeletion).toHaveBeenCalledWith('docs/alpha.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('does not pair a removed Markdown file with a created folder as a rename', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      await hoisted.watchHandler?.({
        type: { create: { kind: 'folder' } },
        paths: ['/notesRoot/docs/beta'],
      });
      await vi.advanceTimersByTimeAsync(401);
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.applyExternalPathDeletion).toHaveBeenCalledWith('docs/alpha.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('does not pair a created folder with a removed Markdown file as a rename', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { create: { kind: 'folder' } },
        paths: ['/notesRoot/docs/beta'],
      });
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      await vi.advanceTimersByTimeAsync(401);
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.applyExternalPathDeletion).toHaveBeenCalledWith('docs/alpha.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('treats a Markdown file renamed to a non-Markdown file as an external deletion', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'rename', mode: 'both' } },
        paths: ['/notesRoot/docs/alpha.md', '/notesRoot/docs/alpha.png'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.applyExternalPathDeletion).toHaveBeenCalledWith('docs/alpha.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('treats a non-Markdown file renamed to Markdown as an external Markdown addition', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'rename', mode: 'both' } },
        paths: ['/notesRoot/docs/alpha.png', '/notesRoot/docs/alpha.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.invalidateNoteCache).toHaveBeenCalledWith('docs/alpha.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('does not remap Markdown state when paired remove and create events change a file to non-Markdown', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.png'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.applyExternalPathDeletion).toHaveBeenCalledWith('docs/alpha.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('does not remap Markdown state when paired create and remove events change a file to Markdown', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.md'],
      });
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/alpha.png'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.invalidateNoteCache).toHaveBeenCalledWith('docs/alpha.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('keeps direct folder rename events even when a folder name looks like Markdown', async () => {
    hoisted.notesState.rootFolder = {
      children: [
        {
          id: 'docs/alpha.md',
          path: 'docs/alpha.md',
          name: 'alpha.md',
          isFolder: true,
          expanded: true,
          children: [],
        },
      ],
    };
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'rename', mode: 'both' } },
        paths: ['/notesRoot/docs/alpha.md', '/notesRoot/docs/beta.png'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.png');
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('does not pair ignored rename endpoints with note paths', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'rename', mode: 'both' } },
        paths: ['/notesRoot/.vlaina/internal.json', '/notesRoot/docs/beta.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.invalidateNoteCache).toHaveBeenCalledWith('docs/beta.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('reloads the tree for a standalone external create after the rename window expires', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/new.md'],
      });
      await vi.advanceTimersByTimeAsync(401);
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.invalidateNoteCache).toHaveBeenCalledWith('docs/new.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('reloads the tree for a standalone image create after the rename window expires', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/image.png'],
      });
      await vi.advanceTimersByTimeAsync(401);
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.invalidateNoteCache).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('reloads the tree for a standalone image remove after the rename window expires', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/image.png'],
      });
      await vi.advanceTimersByTimeAsync(401);
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.invalidateNoteCache).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('isolates rejected pending deletion flushes', async () => {
    hoisted.notesState.applyExternalPathDeletion.mockRejectedValueOnce(new Error('delete failed'));
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { remove: { kind: 'file' } },
        paths: ['/notesRoot/docs/stale.md'],
      });
      await vi.advanceTimersByTimeAsync(181);
    });

    expect(hoisted.notesState.applyExternalPathDeletion).toHaveBeenCalledWith('docs/stale.md');

    hook.unmount();
  });

  it('reconciles a single create event as a rename when the tree diff matches one', async () => {
    vi.mocked(detectExternalTreePathChanges).mockReturnValueOnce({
      hasChanges: true,
      renames: [{ oldPath: 'docs/alpha.md', newPath: 'docs/beta.md' }],
      deletions: [],
      hasAdditions: false,
    });
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { create: { kind: 'file' } },
        paths: ['/notesRoot/docs/beta.md'],
      });
      await vi.advanceTimersByTimeAsync(181);
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.md');
    expect(hoisted.notesState.applyExternalPathDeletion).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('applies semantic rename broadcasts from another window', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      hoisted.renameBroadcastHandler?.({
        nonce: 'rename-event-1',
        oldPath: 'docs/alpha.md',
        newPath: 'docs/beta.md',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hoisted.subscribeNotesExternalPathRename).toHaveBeenCalledWith('/notesRoot', expect.any(Function));
    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
    expect(hoisted.unsubscribeRenameBroadcast).toHaveBeenCalled();
  });

  it('does not apply semantic rename broadcasts that move Markdown files to non-Markdown paths', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      hoisted.renameBroadcastHandler?.({
        nonce: 'rename-event-non-markdown',
        oldPath: 'docs/alpha.md',
        newPath: 'docs/alpha.png',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.applyExternalPathDeletion).toHaveBeenCalledWith('docs/alpha.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('ignores semantic rename broadcasts with paths outside the notesRoot', async () => {
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      hoisted.renameBroadcastHandler?.({
        nonce: 'rename-event-escape',
        oldPath: 'docs/alpha.md',
        newPath: '../secret.md',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hoisted.notesState.applyExternalPathRename).not.toHaveBeenCalled();
    expect(hoisted.notesState.loadFileTree).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('applies rename events from the persisted notesRoot event file on startup', async () => {
    hoisted.readNotesExternalPathEvents.mockResolvedValueOnce([
      {
        nonce: 'rename-file-event-1',
        oldPath: 'docs/alpha.md',
        newPath: 'docs/beta.md',
      },
    ]);
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hoisted.readNotesExternalPathEvents).toHaveBeenCalledWith('/notesRoot', {
      afterStamp: expect.any(Number),
    });
    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('continues handling note paths after replaying persisted notesRoot events', async () => {
    hoisted.readNotesExternalPathEvents.mockResolvedValueOnce([
      {
        nonce: 'rename-file-event-1',
        oldPath: 'docs/alpha.md',
        newPath: 'docs/beta.md',
      },
    ]);
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'data', mode: 'any' } },
        paths: ['/notesRoot/docs/other.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.readNotesExternalPathEvents).toHaveBeenCalledWith('/notesRoot', {
      afterStamp: expect.any(Number),
    });
    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.md');
    expect(hoisted.notesState.invalidateNoteCache).toHaveBeenCalledWith('docs/other.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('continues handling note paths when persisted notesRoot event replay fails', async () => {
    hoisted.readNotesExternalPathEvents.mockRejectedValueOnce(new Error('event file unavailable'));
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      await hoisted.watchHandler?.({
        type: { modify: { kind: 'data', mode: 'any' } },
        paths: ['/notesRoot/docs/other.md'],
      });
      await vi.advanceTimersByTimeAsync(221);
    });

    expect(hoisted.readNotesExternalPathEvents).toHaveBeenCalledWith('/notesRoot', {
      afterStamp: expect.any(Number),
    });
    expect(hoisted.notesState.invalidateNoteCache).toHaveBeenCalledWith('docs/other.md');
    expect(hoisted.notesState.loadFileTree).toHaveBeenCalledWith(true);

    hook.unmount();
  });

  it('isolates rejected semantic rename broadcasts', async () => {
    hoisted.notesState.applyExternalPathRename.mockRejectedValueOnce(new Error('rename failed'));
    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    await act(async () => {
      hoisted.renameBroadcastHandler?.({
        nonce: 'rename-event-rejected',
        oldPath: 'docs/alpha.md',
        newPath: 'docs/beta.md',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hoisted.notesState.applyExternalPathRename).toHaveBeenCalledWith('docs/alpha.md', 'docs/beta.md');
    expect(hoisted.notesState.loadFileTree).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('unwatches if the effect is disposed before the async watcher resolves', async () => {
    let resolveWatch: ((unwatch: () => Promise<void>) => void) | null = null;
    hoisted.watchDesktopPath.mockImplementationOnce(async (_path, handler) => {
      hoisted.watchHandler = handler;
      return await new Promise<() => Promise<void>>((resolve) => {
        resolveWatch = resolve;
      });
    });

    const hook = renderHook(() => useNotesExternalSync('/notesRoot', '/notesRoot'));

    hook.unmount();

    await act(async () => {
      resolveWatch?.(hoisted.unwatch);
      await Promise.resolve();
    });

    expect(hoisted.unwatch).toHaveBeenCalledTimes(1);
    expect(hoisted.releaseWatcher).not.toHaveBeenCalled();
  });

  it('does not start recursive native watching for a user home directory', async () => {
    const hook = renderHook(() => useNotesExternalSync('/home/vladelaina', '/home/vladelaina'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.watchDesktopPath).not.toHaveBeenCalled();
    expect(hoisted.releaseWatcher).not.toHaveBeenCalled();

    hook.unmount();
  });
});
