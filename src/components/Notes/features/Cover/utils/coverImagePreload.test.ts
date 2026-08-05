import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCoverDimensionProbeSrc,
  getCoverResolveOptions,
  preloadCoverImage,
} from './coverImagePreload';

const hoisted = vi.hoisted(() => ({
  loadImageWithDimensions: vi.fn(),
  resolveCoverAssetUrl: vi.fn(),
}));

vi.mock('./coverDimensionCache', () => ({
  loadImageWithDimensions: hoisted.loadImageWithDimensions,
}));

vi.mock('./resolveCoverAssetUrl', () => ({
  resolveCoverAssetUrl: hoisted.resolveCoverAssetUrl,
  shouldPreserveAssetAnimation: (path: string) => path.endsWith('.gif'),
}));

describe('coverImagePreload', () => {
  beforeEach(() => {
    hoisted.loadImageWithDimensions.mockReset();
    hoisted.resolveCoverAssetUrl.mockReset();
  });

  it('preloads the same static thumbnail and dimensions used by the cover renderer', async () => {
    hoisted.resolveCoverAssetUrl.mockResolvedValue('blob:cover');
    hoisted.loadImageWithDimensions.mockResolvedValue({ width: 1200, height: 400 });

    await preloadCoverImage({
      url: 'assets/cover.webp',
      notesRootPath: '/notes-root',
      currentNotePath: 'notes/today.md',
    });

    expect(hoisted.resolveCoverAssetUrl).toHaveBeenCalledWith({
      assetPath: 'assets/cover.webp',
      notesRootPath: '/notes-root',
      currentNotePath: 'notes/today.md',
      thumbnail: true,
      thumbnailMaxEdgePx: 1280,
      replayAnimated: false,
      animatedPlaybackKey: 'notes/today.md',
    });
    expect(hoisted.loadImageWithDimensions).toHaveBeenCalledWith('blob:cover');
  });

  it('keeps animated covers on their original source and preloads a dimension probe', () => {
    expect(getCoverResolveOptions({
      url: 'assets/cover.gif',
      notesRootPath: '/notes-root',
      currentNotePath: 'notes/today.md',
    })).toMatchObject({
      thumbnail: false,
      replayAnimated: true,
    });
    expect(getCoverDimensionProbeSrc('assets/cover.gif', 'blob:animated#replay=1'))
      .toBe('blob:animated#replay=1&vlaina-dimension-probe=1');
  });
});
