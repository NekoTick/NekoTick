import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssetSlice, MAX_PENDING_ASSET_LOADS } from './assetSlice';
import { setCurrentNotesRootPath } from '../storage';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  list: vi.fn(),
}));

vi.mock('@/lib/assets/AssetService', () => ({
  AssetService: {
    list: mocks.list,
    upload: mocks.upload,
  },
}));

function createSliceHarness(overrides: Record<string, unknown> = {}) {
  let state: any;

  const set = (partial: any) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...nextState };
  };

  const get = () => state;
  const slice = createAssetSlice(set as never, get as never, {} as never);

  state = {
    ...slice,
    notesPath: '/notesRoot',
    currentNote: { path: 'daily/demo.md', content: '' },
    assetList: [],
    uploadProgress: null,
    ...overrides,
  };

  return {
    getState: () => state,
  };
}

describe('assetSlice uploadAsset', () => {
  beforeEach(() => {
    setCurrentNotesRootPath(null);
    vi.clearAllMocks();
    mocks.upload.mockImplementation(async (_file, _context, _config, _assets, onProgress) => {
      onProgress?.(70);
      return {
        success: true,
        path: './assets/demo.png',
        isDuplicate: false,
      };
    });
  });

  it('uses the active notesRoot when notesPath has not been written to the notes store yet', async () => {
    setCurrentNotesRootPath('/notesRoot');
    const harness = createSliceHarness({
      notesPath: '',
      currentNote: { path: 'daily/demo.md', content: '' },
    });
    const file = new File(['demo'], 'demo.png', { type: 'image/png' });

    await harness.getState().uploadAsset(file, 'daily/demo.md');

    expect(mocks.upload).toHaveBeenCalledWith(
      file,
      {
        notesRootPath: '/notesRoot',
        currentNotePath: 'daily/demo.md',
      },
      expect.any(Object),
      [],
      expect.any(Function),
    );
    expect(harness.getState().uploadProgress).toBe(70);
  });

  it('falls back to the current absolute note directory when no notesRoot is selected', async () => {
    const harness = createSliceHarness({
      notesPath: '',
      currentNote: { path: '/outside/demo.md', content: '' },
    });
    const file = new File(['demo'], 'demo.png', { type: 'image/png' });

    await harness.getState().uploadAsset(file, '/outside/demo.md');

    expect(mocks.upload).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        notesRootPath: '/outside',
        currentNotePath: '/outside/demo.md',
      }),
      expect.any(Object),
      [],
      expect.any(Function),
    );
  });
});

describe('assetSlice loadAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([]);
  });

  it('does not add builtin covers when the picker is scoped to an external note directory', async () => {
    const harness = createSliceHarness({
      notesPath: '/notesRoot',
      currentNote: { path: '/outside/demo.md', content: '' },
    });

    await harness.getState().loadAssets('/outside');

    expect(harness.getState().isLoadingAssets).toBe(false);
    expect(harness.getState().assetList.map((entry: { filename: string }) => entry.filename))
      .toEqual([]);
    expect(mocks.list).toHaveBeenCalledWith(
      {
        notesRootPath: '/outside',
        currentNotePath: '/outside/demo.md',
      },
      expect.any(Object),
    );
  });

  it('includes user uploaded cover assets from the configured image location', async () => {
    mocks.list.mockResolvedValue([
      {
        filename: './assets/13_9.jpg',
        hash: 'uploaded-hash',
        size: 1224349,
        mimeType: 'image/jpeg',
        uploadedAt: '2026-05-08T01:47:54.361Z',
      },
    ]);
    const harness = createSliceHarness({
      notesPath: '',
      currentNote: { path: '/outside/demo.md', content: '' },
    });

    await harness.getState().loadAssets('/outside');

    expect(harness.getState().assetList.map((entry: { filename: string }) => entry.filename))
      .toContain('./assets/13_9.jpg');
    expect(harness.getState().assetList.map((entry: { filename: string }) => entry.filename))
      .not.toContain('@monet/5');
  });

  it('keeps existing assets visible while refreshing the library', async () => {
    let resolveList: (value: Array<{
      filename: string;
      hash: string;
      size: number;
      mimeType: string;
      uploadedAt: string;
    }>) => void = () => {};
    mocks.list.mockReturnValue(new Promise((resolve) => {
      resolveList = resolve;
    }));
    const harness = createSliceHarness({
      notesPath: '',
      currentNote: { path: '/outside/demo.md', content: '' },
      assetList: [
        {
          filename: './assets/existing.jpg',
          hash: 'existing',
          size: 10,
          mimeType: 'image/jpeg',
          uploadedAt: '2026-05-08T01:47:54.361Z',
        },
      ],
    });

    const load = harness.getState().loadAssets('/outside');

    expect(harness.getState().isLoadingAssets).toBe(true);
    expect(harness.getState().assetList.map((entry: { filename: string }) => entry.filename))
      .toEqual(['./assets/existing.jpg']);

    resolveList([]);
    await load;
  });

  it('preserves existing assets and exposes a failed library refresh', async () => {
    mocks.list.mockRejectedValue(new Error('Library read failed'));
    const existingAsset = {
      filename: './assets/existing.jpg',
      hash: 'existing',
      size: 10,
      mimeType: 'image/jpeg',
      uploadedAt: '2026-05-08T01:47:54.361Z',
    };
    const harness = createSliceHarness({
      notesPath: '',
      currentNote: { path: '/outside/demo.md', content: '' },
      assetList: [existingAsset],
    });

    await expect(harness.getState().loadAssets('/outside')).rejects.toThrow('Library read failed');

    expect(harness.getState().assetList).toEqual([existingAsset]);
    expect(harness.getState().isLoadingAssets).toBe(false);
    expect(harness.getState().assetLoadError).toBe('Library read failed');
  });

  it('clears the previous library error after a successful refresh', async () => {
    const harness = createSliceHarness({
      notesPath: '',
      currentNote: { path: '/outside/demo.md', content: '' },
      assetLoadError: 'Previous failure',
    });

    await harness.getState().loadAssets('/outside');

    expect(harness.getState().assetLoadError).toBeNull();
  });

  it('does not expose assets from a previous scope when the next scope fails to load', async () => {
    mocks.list
      .mockResolvedValueOnce([{
        filename: './assets/a.png',
        hash: 'a',
        size: 10,
        mimeType: 'image/png',
        uploadedAt: '2026-05-08T01:47:54.361Z',
      }])
      .mockRejectedValueOnce(new Error('Scope B unavailable'));
    const harness = createSliceHarness({
      notesPath: '/notes-root-a',
      currentNote: { path: 'daily/a.md', content: '' },
    });

    await harness.getState().loadAssets('/notes-root-a');
    expect(harness.getState().assetList.map((entry: { filename: string }) => entry.filename))
      .toEqual(['./assets/a.png']);

    harness.getState().currentNote = { path: 'daily/b.md', content: '' };
    await expect(harness.getState().loadAssets('/notes-root-a')).rejects.toThrow('Scope B unavailable');

    expect(harness.getState().assetList).toEqual([]);
    expect(harness.getState().assetLoadError).toBe('Scope B unavailable');
  });

  it('coalesces concurrent loads for the same asset scope', async () => {
    let resolveList: (value: Array<{
      filename: string;
      hash: string;
      size: number;
      mimeType: string;
      uploadedAt: string;
    }>) => void = () => {};
    mocks.list.mockReturnValue(new Promise((resolve) => {
      resolveList = resolve;
    }));
    const harness = createSliceHarness({
      notesPath: '',
      currentNote: { path: '/outside/demo.md', content: '' },
    });

    const firstLoad = harness.getState().loadAssets('/outside');
    const secondLoad = harness.getState().loadAssets('/outside');

    resolveList([]);
    await Promise.all([firstLoad, secondLoad]);

    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('applies a coalesced refresh after switching away and back to the same note', async () => {
    type Asset = {
      filename: string;
      hash: string;
      size: number;
      mimeType: string;
      uploadedAt: string;
    };
    const pendingLists = new Map<string, (value: Asset[]) => void>();
    mocks.list.mockImplementation(({ currentNotePath }: { currentNotePath?: string }) => (
      new Promise<Asset[]>((resolve) => {
        pendingLists.set(currentNotePath ?? '', resolve);
      })
    ));
    const harness = createSliceHarness({
      notesPath: '/notes-root-a',
      currentNote: { path: 'daily/a.md', content: '' },
    });

    const firstALoad = harness.getState().loadAssets('/notes-root-a');
    harness.getState().currentNote = { path: 'daily/b.md', content: '' };
    const bLoad = harness.getState().loadAssets('/notes-root-a');
    harness.getState().currentNote = { path: 'daily/a.md', content: '' };
    const secondALoad = harness.getState().loadAssets('/notes-root-a');

    pendingLists.get('daily/a.md')?.([{
      filename: './assets/a.png',
      hash: 'a',
      size: 10,
      mimeType: 'image/png',
      uploadedAt: '2026-05-08T01:47:54.361Z',
    }]);
    pendingLists.get('daily/b.md')?.([{
      filename: './assets/b.png',
      hash: 'b',
      size: 10,
      mimeType: 'image/png',
      uploadedAt: '2026-05-08T01:47:54.361Z',
    }]);
    await Promise.all([firstALoad, secondALoad, bLoad]);

    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(harness.getState().assetList.map((entry: Asset) => entry.filename))
      .toEqual(['./assets/a.png']);
    expect(harness.getState().isLoadingAssets).toBe(false);
  });

  it('bounds concurrent loads for different asset scopes', async () => {
    const pendingLists: Array<(value: []) => void> = [];
    mocks.list.mockImplementation(() => new Promise((resolve) => {
      pendingLists.push(resolve);
    }));
    const harness = createSliceHarness({
      notesPath: '/notes-root-a',
      currentNote: { path: 'daily/start.md', content: '' },
    });

    const loads = Array.from({ length: MAX_PENDING_ASSET_LOADS }, (_value, index) => {
      harness.getState().currentNote = { path: `daily/${index}.md`, content: '' };
      return harness.getState().loadAssets('/notes-root-a');
    });

    expect(mocks.list).toHaveBeenCalledTimes(MAX_PENDING_ASSET_LOADS);
    harness.getState().currentNote = { path: 'daily/overflow.md', content: '' };
    await harness.getState().loadAssets('/notes-root-a');
    expect(mocks.list).toHaveBeenCalledTimes(MAX_PENDING_ASSET_LOADS);

    pendingLists.forEach((resolve) => resolve([]));
    await Promise.all(loads);
  });

  it('ignores a stale asset refresh after switching notes-roots', async () => {
    let resolveList: (value: Array<{
      filename: string;
      hash: string;
      size: number;
      mimeType: string;
      uploadedAt: string;
    }>) => void = () => {};
    mocks.list.mockReturnValue(new Promise((resolve) => {
      resolveList = resolve;
    }));
    const harness = createSliceHarness({
      notesPath: '/notes-root-a',
      currentNote: { path: 'daily/demo.md', content: '' },
      assetList: [
        {
          filename: './assets/current.jpg',
          hash: 'current',
          size: 10,
          mimeType: 'image/jpeg',
          uploadedAt: '2026-05-08T01:47:54.361Z',
        },
      ],
    });

    const load = harness.getState().loadAssets('/notes-root-a');
    harness.getState().notesPath = '/notes-root-b';
    harness.getState().currentNote = { path: 'daily/other.md', content: '' };

    resolveList([
      {
        filename: './assets/stale.jpg',
        hash: 'stale',
        size: 10,
        mimeType: 'image/jpeg',
        uploadedAt: '2026-05-08T01:47:54.361Z',
      },
    ]);
    await load;

    expect(harness.getState().assetList.map((entry: { filename: string }) => entry.filename))
      .toEqual(['./assets/current.jpg']);
    expect(harness.getState().isLoadingAssets).toBe(false);
  });
});
