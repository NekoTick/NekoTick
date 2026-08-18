import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  selectVideoBlock: vi.fn(),
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: {
    subscribe: vi.fn(() => vi.fn()),
  },
}));

vi.mock('./videoBlockSelection', () => ({
  selectVideoBlock: mocks.selectVideoBlock,
}));

vi.mock('./videoDom', () => ({
  createVideoDom: vi.fn(() => document.createElement('div')),
  refreshVideoDomI18n: vi.fn(),
}));

import { VideoNodeView } from './videoNodeView';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('VideoNodeView pointer selection', () => {
  it('does not select from hover movement after the mouse button is released', () => {
    vi.useFakeTimers();
    const view = { focus: vi.fn() } as never;
    let positionLookupCount = 0;
    const nodeView = new VideoNodeView(
      { attrs: { src: 'video.mp4' }, type: {} } as never,
      view,
      () => {
        positionLookupCount += 1;
        return positionLookupCount === 1 ? undefined : 5;
      },
    );

    nodeView.dom.dispatchEvent(new MouseEvent('mousedown', {
      button: 0,
      buttons: 1,
      bubbles: true,
      clientX: 10,
      clientY: 10,
    }));
    window.dispatchEvent(new MouseEvent('mousemove', {
      buttons: 0,
      clientX: 80,
      clientY: 80,
    }));
    window.dispatchEvent(new MouseEvent('mousemove', {
      buttons: 1,
      clientX: 100,
      clientY: 100,
    }));
    vi.advanceTimersByTime(200);

    expect(mocks.selectVideoBlock).not.toHaveBeenCalled();
    nodeView.destroy();
    vi.runAllTimers();
  });
});
