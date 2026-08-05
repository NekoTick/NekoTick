import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';
import { useMarkdownEditorScrollPersistence } from './useMarkdownEditorScrollPersistence';

const mocks = vi.hoisted(() => ({
  persistNoteScrollPosition: vi.fn(),
}));

vi.mock('../utils/editorBlockPositionCache', () => ({
  subscribeCurrentEditorBlockPositionSnapshot: vi.fn(() => vi.fn()),
}));

vi.mock('../utils/noteScrollPositionStorage', () => ({
  loadPersistedNoteScrollPosition: vi.fn(() => 0),
  persistNoteScrollPosition: mocks.persistNoteScrollPosition,
}));

vi.mock('../../Sidebar/sidebarSearchNavigation', () => ({
  isSidebarSearchNavigationPending: vi.fn(() => false),
}));

function ScrollPersistenceHarness({ onScrollRoot }: { onScrollRoot: (element: HTMLDivElement) => void }) {
  const scrollRootRef = useMarkdownEditorScrollPersistence({
    active: true,
    currentNotePath: 'note.md',
    hasActiveNote: true,
    notesPath: '/notes',
    openTabPathsKey: 'note.md',
    startAtTop: false,
  });

  return (
    <div
      ref={(element) => {
        scrollRootRef.current = element;
        if (element) onScrollRoot(element);
      }}
    />
  );
}

describe('useMarkdownEditorScrollPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.persistNoteScrollPosition.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('reads the final scroll position after scrolling becomes idle', () => {
    let scrollRoot: HTMLDivElement | null = null;
    let scrollTop = 0;
    let scrollTopReadCount = 0;

    render(
      <ScrollPersistenceHarness
        onScrollRoot={(element) => {
          scrollRoot = element;
          Object.defineProperties(element, {
            clientHeight: { configurable: true, value: 600 },
            scrollHeight: { configurable: true, value: 2_000 },
            scrollTop: {
              configurable: true,
              get: () => {
                scrollTopReadCount += 1;
                return scrollTop;
              },
              set: (value: number) => {
                scrollTop = value;
              },
            },
          });
        }}
      />,
    );

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(scrollRoot).not.toBeNull();
    scrollTopReadCount = 0;
    mocks.persistNoteScrollPosition.mockClear();
    scrollTop = 420;
    scrollRoot!.dataset.overlayScrollbarInteracting = 'true';

    act(() => {
      scrollRoot!.dispatchEvent(new Event('scroll'));
    });

    expect(scrollTopReadCount).toBe(0);
    expect(mocks.persistNoteScrollPosition).not.toHaveBeenCalled();

    delete scrollRoot!.dataset.overlayScrollbarInteracting;
    act(() => {
      window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT));
    });

    expect(scrollTopReadCount).toBe(1);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mocks.persistNoteScrollPosition).toHaveBeenCalledWith('/notes', 'note.md', 420);
  });

  it('does not restore over the first user scroll when the initial position already matches', () => {
    let scrollRoot: HTMLDivElement | null = null;
    let scrollTop = 0;

    render(
      <ScrollPersistenceHarness
        onScrollRoot={(element) => {
          scrollRoot = element;
          Object.defineProperties(element, {
            clientHeight: { configurable: true, value: 600 },
            scrollHeight: { configurable: true, value: 2_000 },
            scrollTop: {
              configurable: true,
              get: () => scrollTop,
              set: (value: number) => {
                scrollTop = value;
              },
            },
          });
        }}
      />,
    );

    scrollTop = 120;
    act(() => {
      scrollRoot!.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(200);
    });

    expect(scrollTop).toBe(120);
  });
});
