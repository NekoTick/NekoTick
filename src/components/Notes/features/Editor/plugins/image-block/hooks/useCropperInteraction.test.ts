import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCropperInteraction } from './useCropperInteraction';

function installAnimationFrameQueue() {
    let nextId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
    });
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
        callbacks.delete(id);
    });

    return {
        callbacks,
        cancelAnimationFrame,
        requestAnimationFrame,
        flush(id: number) {
            const callback = callbacks.get(id);
            callbacks.delete(id);
            callback?.(0);
        },
    };
}

describe('useCropperInteraction', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('coalesces rapid ctrl-wheel zoom while preserving sequential clamp behavior', () => {
        vi.useFakeTimers();
        const frames = installAnimationFrameQueue();
        const container = document.createElement('div');
        let zoom = 4.8;
        const setZoom = vi.fn((next: number | ((previous: number) => number)) => {
            zoom = typeof next === 'function' ? next(zoom) : next;
        });
        const onSave = vi.fn();
        const { result, unmount } = renderHook(() => useCropperInteraction({
            isActive: false,
            containerRef: { current: container },
            minZoomLimit: 1,
            setZoom,
            setCrop: vi.fn(),
            onSave,
            onCancel: vi.fn(),
            initialCropParams: null,
            containerSize: { width: 200, height: 100 },
            originalAspectRatioRef: { current: 2 },
        }));

        act(() => {
            result.current.onCropChangeComplete({ x: 10, y: 20, width: 50, height: 40 });
            container.dispatchEvent(new WheelEvent('wheel', {
                ctrlKey: true,
                deltaY: -100,
                cancelable: true,
            }));
            container.dispatchEvent(new WheelEvent('wheel', {
                ctrlKey: true,
                deltaY: 100,
                cancelable: true,
            }));
        });

        expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1);
        expect(setZoom).not.toHaveBeenCalled();

        act(() => {
            frames.flush(1);
        });

        expect(setZoom).toHaveBeenCalledTimes(1);
        expect(zoom).toBe(4.5);

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(onSave).toHaveBeenCalledOnce();
        expect(onSave).toHaveBeenCalledWith(
            { x: 10, y: 20, width: 50, height: 40 },
            2,
        );
        unmount();
    });

    it('cancels a queued wheel update when the cropper unmounts', () => {
        const frames = installAnimationFrameQueue();
        const container = document.createElement('div');
        const setZoom = vi.fn();
        const { unmount } = renderHook(() => useCropperInteraction({
            isActive: false,
            containerRef: { current: container },
            minZoomLimit: 1,
            setZoom,
            setCrop: vi.fn(),
            onSave: vi.fn(),
            onCancel: vi.fn(),
            initialCropParams: null,
            containerSize: { width: 200, height: 100 },
            originalAspectRatioRef: { current: 2 },
        }));

        act(() => {
            container.dispatchEvent(new WheelEvent('wheel', {
                ctrlKey: true,
                deltaY: -100,
                cancelable: true,
            }));
        });

        expect(frames.callbacks.size).toBe(1);
        unmount();

        expect(frames.cancelAnimationFrame).toHaveBeenCalledWith(1);
        expect(frames.callbacks.size).toBe(0);
        expect(setZoom).not.toHaveBeenCalled();
    });
});
