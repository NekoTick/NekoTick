import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useImageResize } from './useImageResize';

afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

describe('useImageResize', () => {
    it('commits the last pressed position instead of a released-button hover point', async () => {
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
        const parent = document.createElement('div');
        const container = document.createElement('div');
        parent.appendChild(container);
        document.body.appendChild(parent);
        Object.defineProperty(parent, 'offsetWidth', { configurable: true, value: 400 });
        Object.defineProperty(container, 'offsetWidth', { configurable: true, value: 200 });
        Object.defineProperty(container, 'offsetHeight', { configurable: true, value: 100 });
        const setWidth = vi.fn();
        const setHeight = vi.fn();
        const setDragDimensions = vi.fn();
        const updateNodeAttrs = vi.fn();
        const restoreIfNeeded = vi.fn(async () => undefined);
        const { result, unmount } = renderHook(() => useImageResize({
            containerRef: { current: container },
            width: '50%',
            height: undefined,
            setWidth,
            setHeight,
            setDragDimensions,
            updateNodeAttrs,
            markImageUserInput: vi.fn(),
            restoreIfNeeded,
        }));

        act(() => {
            result.current.handleResizeStart('right')({
                clientX: 50,
                clientY: 40,
                preventDefault: vi.fn(),
                stopPropagation: vi.fn(),
            } as never);
            document.dispatchEvent(new MouseEvent('mousemove', {
                buttons: 1,
                clientX: 70,
                clientY: 40,
            }));
        });
        await act(async () => {
            document.dispatchEvent(new MouseEvent('mousemove', {
                buttons: 0,
                clientX: 300,
                clientY: 40,
            }));
            await Promise.resolve();
        });

        expect(setWidth).toHaveBeenLastCalledWith('60%');
        expect(updateNodeAttrs).toHaveBeenCalledWith({ width: '60%' });
        expect(setDragDimensions).toHaveBeenLastCalledWith(null);

        document.dispatchEvent(new MouseEvent('mousemove', {
            buttons: 0,
            clientX: 350,
            clientY: 40,
        }));
        expect(setWidth).toHaveBeenCalledTimes(1);
        unmount();
    });
});
