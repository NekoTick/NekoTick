import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNearViewport, __testing__ as nearViewportTesting } from './useNearViewport';

const callbacks: IntersectionObserverCallback[] = [];

class TestIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly scrollMargin = '0px';
    readonly thresholds = [0];

    constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback);
    }

    disconnect = vi.fn();
    observe = vi.fn();
    takeRecords = vi.fn(() => []);
    unobserve = vi.fn();
}

function createElementRef() {
    const element = document.createElement('div');
    document.body.appendChild(element);
    return { current: element };
}

describe('useNearViewport', () => {
    beforeEach(() => {
        callbacks.length = 0;
        vi.useFakeTimers();
        vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
        nearViewportTesting.clearBackgroundImageLoadQueue();
    });

    afterEach(() => {
        nearViewportTesting.clearBackgroundImageLoadQueue();
        document.body.replaceChildren();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('marks the target ready immediately when it intersects the viewport margin', () => {
        const ref = createElementRef();
        const { result } = renderHook(() => useNearViewport(ref));

        expect(result.current).toEqual({
            isNearViewport: false,
            shouldLoadImage: false,
        });

        act(() => {
            callbacks[0]?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        });

        expect(result.current).toEqual({
            isNearViewport: true,
            shouldLoadImage: true,
        });
    });

    it('preloads offscreen image nodes in the background after the initial delay', () => {
        const ref = createElementRef();
        const { result } = renderHook(() => useNearViewport(ref));

        expect(result.current).toEqual({
            isNearViewport: false,
            shouldLoadImage: false,
        });

        act(() => {
            vi.advanceTimersByTime(nearViewportTesting.BACKGROUND_LOAD_START_DELAY_MS - 1);
        });
        expect(result.current).toEqual({
            isNearViewport: false,
            shouldLoadImage: false,
        });

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current).toEqual({
            isNearViewport: false,
            shouldLoadImage: true,
        });

        act(() => {
            callbacks[0]?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        });
        expect(result.current).toEqual({
            isNearViewport: true,
            shouldLoadImage: true,
        });
    });

    it('preloads offscreen images in a lazy-layout editor through the background queue', () => {
        const editor = document.createElement('div');
        editor.dataset.noteLazyBlockVisibility = 'true';
        const element = document.createElement('div');
        editor.appendChild(element);
        document.body.appendChild(editor);
        const ref = { current: element };
        const { result } = renderHook(() => useNearViewport(ref));

        act(() => {
            vi.advanceTimersByTime(nearViewportTesting.BACKGROUND_LOAD_START_DELAY_MS);
        });
        expect(result.current).toEqual({
            isNearViewport: false,
            shouldLoadImage: true,
        });
    });

    it('releases background image prefetches in small batches', () => {
        const hookCount = nearViewportTesting.BACKGROUND_LOAD_BATCH_SIZE + 1;
        const hooks = Array.from({ length: hookCount }, () => {
            const ref = createElementRef();
            return renderHook(() => useNearViewport(ref));
        });

        act(() => {
            vi.advanceTimersByTime(nearViewportTesting.BACKGROUND_LOAD_START_DELAY_MS);
        });

        expect(hooks.slice(0, nearViewportTesting.BACKGROUND_LOAD_BATCH_SIZE).every((hook) => (
            hook.result.current.shouldLoadImage && !hook.result.current.isNearViewport
        ))).toBe(true);
        expect(hooks[hookCount - 1].result.current).toEqual({
            isNearViewport: false,
            shouldLoadImage: false,
        });

        act(() => {
            vi.advanceTimersByTime(nearViewportTesting.BACKGROUND_LOAD_INTERVAL_MS);
        });

        expect(hooks[hookCount - 1].result.current).toEqual({
            isNearViewport: false,
            shouldLoadImage: true,
        });
    });
});
