import { useCallback, useRef, useEffect } from 'react';
import type { ImageNodeAttrs, ResizeDirection } from '../types';

interface UseImageResizeOptions {
    containerRef: React.RefObject<HTMLDivElement | null>;
    width: string;
    height: number | undefined;
    setWidth: (width: string) => void;
    setHeight: (height: number | undefined) => void;
    setDragDimensions: (dims: { width: number; height: number } | null) => void;
    updateNodeAttrs: (attrs: ImageNodeAttrs) => void;
    markImageUserInput: () => void;
    restoreIfNeeded: () => Promise<void>;
}

export function useImageResize({
    containerRef,
    width,
    height,
    setWidth,
    setHeight,
    setDragDimensions,
    updateNodeAttrs,
    markImageUserInput,
    restoreIfNeeded,
}: UseImageResizeOptions) {
    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
            }
        };
    }, []);

    const handleResizeStart = useCallback((direction: ResizeDirection) => (e: React.MouseEvent) => {
        cleanupRef.current?.();
        e.preventDefault();
        e.stopPropagation();
        markImageUserInput();

        const isProportional = direction === 'left' || direction === 'right' || direction === 'bottom-left' || direction === 'bottom-right';

        if (!isProportional && !height && containerRef.current) {
            setHeight(containerRef.current.offsetHeight);
        }

        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = containerRef.current?.offsetWidth || 0;
        const startHeight = height || containerRef.current?.offsetHeight || 0;
        const parentWidth = containerRef.current?.parentElement?.offsetWidth || 1;
        const aspectRatio = startHeight > 0 ? startWidth / startHeight : 1;
        let latestWidthValue = width;
        let pendingPointer: { clientX: number; clientY: number } | null = null;
        let resizeFrame: number | null = null;
        let finished = false;
        let invalidated = false;

        const ownerDocument = containerRef.current?.ownerDocument ?? document;
        const ownerWindow = ownerDocument.defaultView ?? window;

        const applyResize = (clientX: number, clientY: number) => {
            if (isProportional) {
                const isLeftSided = direction === 'left' || direction === 'bottom-left';
                const delta = isLeftSided ? startX - clientX : clientX - startX;

                const newWidthPx = startWidth + delta * 2;
                const newWidthPercent = Math.min(100, Math.max(10, (newWidthPx / parentWidth) * 100));
                latestWidthValue = `${newWidthPercent}%`;

                setWidth(latestWidthValue);
                const expectedHeight = newWidthPx / aspectRatio;
                setDragDimensions({ width: newWidthPx, height: expectedHeight });
            } else {
                const delta = clientY - startY;
                const newHeight = Math.max(50, startHeight + delta);
                setHeight(newHeight);
                setDragDimensions({ width: startWidth, height: newHeight });
            }
        };

        const flushPendingResize = () => {
            resizeFrame = null;
            if (!pendingPointer) return;
            const { clientX, clientY } = pendingPointer;
            pendingPointer = null;
            applyResize(clientX, clientY);
        };

        const cancelPendingResize = () => {
            if (resizeFrame !== null) {
                ownerWindow.cancelAnimationFrame(resizeFrame);
                resizeFrame = null;
            }
        };

        const removeListeners = () => {
            ownerDocument.removeEventListener('mousemove', onMouseMove);
            ownerDocument.removeEventListener('mouseup', onMouseUp);
            ownerWindow.removeEventListener('blur', onWindowBlur);
        };

        const finishResize = async () => {
            if (finished) return;
            finished = true;
            removeListeners();
            cancelPendingResize();
            flushPendingResize();

            setDragDimensions(null);
            await restoreIfNeeded();
            if (invalidated) return;

            if (isProportional) {
                updateNodeAttrs({ width: latestWidthValue });
                setHeight(undefined);
            }
            if (cleanupRef.current === cancelResize) {
                cleanupRef.current = null;
            }
        };

        const cancelResize = () => {
            invalidated = true;
            removeListeners();
            cancelPendingResize();
            pendingPointer = null;
            if (cleanupRef.current === cancelResize) {
                cleanupRef.current = null;
            }
        };

        const onMouseMove = (moveEvent: MouseEvent) => {
            if ((moveEvent.buttons & 1) === 0) {
                void finishResize();
                return;
            }
            pendingPointer = {
                clientX: moveEvent.clientX,
                clientY: moveEvent.clientY,
            };

            if (resizeFrame !== null) return;
            resizeFrame = ownerWindow.requestAnimationFrame(flushPendingResize);
        };

        const onMouseUp = () => void finishResize();
        const onWindowBlur = () => void finishResize();

        cleanupRef.current = cancelResize;
        ownerDocument.addEventListener('mousemove', onMouseMove);
        ownerDocument.addEventListener('mouseup', onMouseUp);
        ownerWindow.addEventListener('blur', onWindowBlur);
    }, [containerRef, width, height, setWidth, setHeight, setDragDimensions, updateNodeAttrs, markImageUserInput, restoreIfNeeded]);

    return { handleResizeStart };
}
