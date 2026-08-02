import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileItemHoverPrefetch } from './useFileItemHoverPrefetch';

const hoisted = vi.hoisted(() => {
  const state = {
    cancelPrefetchNote: vi.fn(),
    noteContentsCache: new Map<string, { content: string }>(),
    noteMetadata: { version: 2, notes: {} as Record<string, { cover?: { assetPath: string } }> },
    notesPath: '/notes-root',
    prefetchNote: vi.fn<() => Promise<void>>(),
  };
  return { preloadCoverImage: vi.fn(), state };
});

vi.mock('@/stores/useNotesStore', () => ({
  useNotesStore: Object.assign(
    (selector: (state: typeof hoisted.state) => unknown) => selector(hoisted.state),
    { getState: () => hoisted.state },
  ),
}));

vi.mock('@/components/Notes/features/Cover/utils/coverImagePreload', () => ({
  preloadCoverImage: hoisted.preloadCoverImage,
}));

describe('useFileItemHoverPrefetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.state.cancelPrefetchNote.mockReset();
    hoisted.state.noteContentsCache.clear();
    hoisted.state.noteMetadata.notes = {};
    hoisted.state.prefetchNote.mockReset().mockResolvedValue(undefined);
    hoisted.preloadCoverImage.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prefetches known cover media after a short hover intent delay', async () => {
    hoisted.state.noteMetadata.notes['target.md'] = {
      cover: { assetPath: 'assets/cover.webp' },
    };
    const { result } = renderHook(() =>
      useFileItemHoverPrefetch({ notePath: 'target.md', enabled: true }),
    );

    act(() => {
      result.current.onMouseEnter();
      vi.advanceTimersByTime(59);
    });
    expect(hoisted.state.prefetchNote).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(hoisted.preloadCoverImage).toHaveBeenCalledWith({
      url: 'assets/cover.webp',
      notesRootPath: '/notes-root',
      currentNotePath: 'target.md',
    });
    expect(hoisted.state.prefetchNote).toHaveBeenCalledWith('target.md');
  });

  it('discovers cover metadata from newly prefetched Markdown', async () => {
    hoisted.state.prefetchNote.mockImplementation(async () => {
      hoisted.state.noteContentsCache.set('target.md', {
        content: [
          '---',
          'vlaina_cover: "assets/from-markdown.webp"',
          '---',
          '',
          '# Target',
        ].join('\n'),
      });
    });
    const { result } = renderHook(() =>
      useFileItemHoverPrefetch({ notePath: 'target.md', enabled: true }),
    );

    await act(async () => {
      result.current.onMouseEnter();
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(hoisted.preloadCoverImage).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'assets/from-markdown.webp' }),
    );
  });
});
