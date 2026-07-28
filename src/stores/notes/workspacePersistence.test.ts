import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  saveWorkspaceState: vi.fn(async (): Promise<void> => undefined),
  toasts: [] as Array<{ message: string; type: string }>,
}));

vi.mock('./storage', () => ({
  saveWorkspaceState: mocks.saveWorkspaceState,
}));

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: {
    getState: () => ({
      addToast: mocks.addToast,
      toasts: mocks.toasts,
    }),
  },
}));

import {
  persistWorkspaceSnapshot,
  saveWorkspaceSnapshot,
  WORKSPACE_SNAPSHOT_PERSIST_DELAY_MS,
} from './workspacePersistence';

const snapshot = (currentNotePath: string) => ({
  rootFolder: null,
  currentNotePath,
  fileTreeSortMode: 'name-asc' as const,
  expandedFolders: [],
});

describe('workspace snapshot persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.addToast.mockReset();
    mocks.saveWorkspaceState.mockReset().mockResolvedValue(undefined);
    mocks.toasts = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces repeated snapshots for one notes root', async () => {
    persistWorkspaceSnapshot('/notesRoot', snapshot('alpha.md'));
    persistWorkspaceSnapshot('/notesRoot', snapshot('beta.md'));

    await vi.advanceTimersByTimeAsync(WORKSPACE_SNAPSHOT_PERSIST_DELAY_MS - 1);
    expect(mocks.saveWorkspaceState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.saveWorkspaceState).toHaveBeenCalledTimes(1);
    expect(mocks.saveWorkspaceState).toHaveBeenCalledWith('/notesRoot', expect.objectContaining({
      currentNotePath: 'beta.md',
    }));
  });

  it('cancels a queued snapshot before an immediate save', async () => {
    persistWorkspaceSnapshot('/notesRoot', snapshot('stale.md'));
    await saveWorkspaceSnapshot('/notesRoot', snapshot('current.md'));
    await vi.advanceTimersByTimeAsync(WORKSPACE_SNAPSHOT_PERSIST_DELAY_MS);

    expect(mocks.saveWorkspaceState).toHaveBeenCalledTimes(1);
    expect(mocks.saveWorkspaceState).toHaveBeenCalledWith('/notesRoot', expect.objectContaining({
      currentNotePath: 'current.md',
    }));
  });

  it('serializes an immediate save after an in-flight debounced save', async () => {
    let finishStaleSave: (() => void) | undefined;
    mocks.saveWorkspaceState.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishStaleSave = resolve;
    }));

    persistWorkspaceSnapshot('/notesRoot', snapshot('stale.md'));
    await vi.advanceTimersByTimeAsync(WORKSPACE_SNAPSHOT_PERSIST_DELAY_MS);

    const currentSave = saveWorkspaceSnapshot('/notesRoot', snapshot('current.md'));
    expect(mocks.saveWorkspaceState).toHaveBeenCalledTimes(1);

    finishStaleSave?.();
    await currentSave;

    expect(mocks.saveWorkspaceState).toHaveBeenCalledTimes(2);
    expect(mocks.saveWorkspaceState).toHaveBeenLastCalledWith('/notesRoot', expect.objectContaining({
      currentNotePath: 'current.md',
    }));
  });

  it('reports a debounced workspace failure without rejecting into note actions', async () => {
    mocks.saveWorkspaceState.mockRejectedValueOnce(new Error('Workspace disk unavailable'));

    persistWorkspaceSnapshot('/notesRoot', snapshot('alpha.md'));
    await vi.advanceTimersByTimeAsync(WORKSPACE_SNAPSHOT_PERSIST_DELAY_MS);

    expect(mocks.addToast).toHaveBeenCalledWith(
      'Could not save open tabs and folder view. Note content is unaffected.',
      'error',
      expect.any(Number),
    );
  });

  it('rejects an immediate workspace failure and still permits the next snapshot', async () => {
    mocks.saveWorkspaceState
      .mockRejectedValueOnce(new Error('Workspace disk unavailable'))
      .mockResolvedValueOnce(undefined);

    const failedSave = saveWorkspaceSnapshot('/notesRoot', snapshot('alpha.md'));
    const recoveredSave = saveWorkspaceSnapshot('/notesRoot', snapshot('beta.md'));

    await expect(failedSave).rejects.toThrow('Workspace disk unavailable');
    await expect(recoveredSave).resolves.toBeUndefined();
    expect(mocks.saveWorkspaceState).toHaveBeenCalledTimes(2);
  });
});
