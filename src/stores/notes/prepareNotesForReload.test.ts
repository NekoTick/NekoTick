import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareNotesForReload } from './prepareNotesForReload';

const mocks = vi.hoisted(() => ({
  flushPending: vi.fn(),
  flushRecovery: vi.fn(),
  saveDrafts: vi.fn(),
  saveRegularTabs: vi.fn(),
}));

vi.mock('./pendingEditorMarkdownFlusher', () => ({
  flushCurrentPendingEditorMarkdown: mocks.flushPending,
}));
vi.mock('./noteRecovery', () => ({ flushNoteRecovery: mocks.flushRecovery }));
vi.mock('./autoSaveableDrafts', () => ({ saveAutoSaveableDrafts: mocks.saveDrafts }));
vi.mock('./dirtyOpenTabs', () => ({ saveDirtyRegularOpenTabs: mocks.saveRegularTabs }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.flushRecovery.mockResolvedValue(undefined);
  mocks.saveDrafts.mockResolvedValue(true);
  mocks.saveRegularTabs.mockResolvedValue(true);
});

describe('prepareNotesForReload', () => {
  it('flushes recovery before and after saving all safe note targets', async () => {
    await expect(prepareNotesForReload()).resolves.toBe(true);

    expect(mocks.flushPending).toHaveBeenCalledTimes(1);
    expect(mocks.saveDrafts).toHaveBeenCalledTimes(1);
    expect(mocks.saveRegularTabs).toHaveBeenCalledTimes(1);
    expect(mocks.flushRecovery).toHaveBeenCalledTimes(2);
    expect(mocks.flushRecovery.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveDrafts.mock.invocationCallOrder[0]!,
    );
  });

  it('blocks reload when a note cannot be saved', async () => {
    mocks.saveRegularTabs.mockResolvedValue(false);

    await expect(prepareNotesForReload()).resolves.toBe(false);
    expect(mocks.flushRecovery).toHaveBeenCalledTimes(2);
  });

  it('blocks reload when the recovery journal cannot be flushed', async () => {
    mocks.flushRecovery.mockRejectedValue(new Error('disk full'));

    await expect(prepareNotesForReload()).resolves.toBe(false);
    expect(mocks.saveDrafts).not.toHaveBeenCalled();
  });
});
