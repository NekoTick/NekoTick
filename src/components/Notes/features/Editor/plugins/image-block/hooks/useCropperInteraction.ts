import { useState, useRef, useEffect, useCallback } from 'react';
import type { Area } from 'react-easy-crop';
import type { CropParams } from '../utils/imageSourceFragment';
import type { CropArea } from '../types';
import { resolveCropperMaxZoom } from '../utils/cropperViewport';
import { themeCropperTokens } from '@/styles/themeTokens';

const AUTO_SAVE_DELAY_MS = 500;

function isValidCropArea(value: CropArea | null): value is CropArea {
    return Boolean(
        value
        && Number.isFinite(value.x)
        && Number.isFinite(value.y)
        && Number.isFinite(value.width)
        && Number.isFinite(value.height)
        && value.width > 0
        && value.height > 0
    );
}

interface UseCropperInteractionProps {
    isActive: boolean;
    containerRef: React.RefObject<HTMLDivElement | null>;
    minZoomLimit: number;
    setZoom: (z: number | ((prev: number) => number)) => void;
    setCrop: (c: { x: number; y: number }) => void;
    onSave: (percentageCrop: CropArea, ratio: number) => void;
    onCancel: () => void;
    initialCropParams: CropParams | null;
    containerSize: { width: number; height: number };
    originalAspectRatioRef: React.MutableRefObject<number>;
}

export function useCropperInteraction({
    isActive,
    containerRef,
    minZoomLimit,
    setZoom,
    setCrop,
    onSave,
    onCancel,
    initialCropParams,
    containerSize,
    originalAspectRatioRef
}: UseCropperInteractionProps) {
    const [isCtrlPressed, setIsCtrlPressed] = useState(false);
    const lastPercentageCrop = useRef<CropArea | null>(null);
    const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const zoomFrameRef = useRef<number | null>(null);
    const pendingWheelZoomDeltasRef = useRef<number[]>([]);
    const latestWheelOptionsRef = useRef({ isActive, minZoomLimit, setZoom });
    const performSaveRef = useRef<() => void>(() => {});

    latestWheelOptionsRef.current = { isActive, minZoomLimit, setZoom };

    const applyPendingWheelZoom = useCallback(() => {
        zoomFrameRef.current = null;
        const deltas = pendingWheelZoomDeltasRef.current;
        pendingWheelZoomDeltasRef.current = [];
        if (deltas.length === 0) return;

        const options = latestWheelOptionsRef.current;
        const maxZoomLimit = resolveCropperMaxZoom(options.minZoomLimit);
        options.setZoom((previousZoom) => deltas.reduce(
            (nextZoom, delta) => Math.min(
                maxZoomLimit,
                Math.max(options.minZoomLimit, nextZoom + delta),
            ),
            previousZoom,
        ));
    }, []);

    const schedulePendingWheelZoom = useCallback(() => {
        if (zoomFrameRef.current !== null) return;
        zoomFrameRef.current = window.requestAnimationFrame(applyPendingWheelZoom);
    }, [applyPendingWheelZoom]);

    const flushPendingWheelZoom = useCallback(() => {
        if (zoomFrameRef.current !== null) {
            window.cancelAnimationFrame(zoomFrameRef.current);
            zoomFrameRef.current = null;
        }
        applyPendingWheelZoom();
    }, [applyPendingWheelZoom]);

    const cancelPendingWheelZoom = useCallback(() => {
        if (zoomFrameRef.current !== null) {
            window.cancelAnimationFrame(zoomFrameRef.current);
            zoomFrameRef.current = null;
        }
        pendingWheelZoomDeltasRef.current = [];
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.isComposing) return;
            if (e.key === 'Control' || e.key === 'Meta') setIsCtrlPressed(true);
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.isComposing) return;
            if (e.key === 'Control' || e.key === 'Meta') setIsCtrlPressed(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    useEffect(() => {
        return () => {
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
            }
            cancelPendingWheelZoom();
        };
    }, [cancelPendingWheelZoom]);

    const performSave = useCallback(() => {
        if (isValidCropArea(lastPercentageCrop.current)) {
            const pc = lastPercentageCrop.current;
            let currentRatio = initialCropParams?.ratio;

            if (!currentRatio && containerSize.width && containerSize.height) {
                currentRatio = containerSize.width / containerSize.height;
            }

            if (!currentRatio) {
                currentRatio = (pc.width / pc.height) * originalAspectRatioRef.current;
            }

            onSave(pc, currentRatio);
        }
    }, [initialCropParams?.ratio, containerSize.width, containerSize.height, onSave, originalAspectRatioRef]);

    performSaveRef.current = performSave;

    useEffect(() => {
        const currentRef = containerRef.current;
        if (!currentRef) return;

        const onWheel = (e: WheelEvent) => {
            if (latestWheelOptionsRef.current.isActive) return;

            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();

                pendingWheelZoomDeltasRef.current.push(-e.deltaY / 200);
                schedulePendingWheelZoom();

                if (autoSaveTimeoutRef.current) {
                    clearTimeout(autoSaveTimeoutRef.current);
                }

                autoSaveTimeoutRef.current = setTimeout(() => {
                    autoSaveTimeoutRef.current = null;
                    flushPendingWheelZoom();
                    performSaveRef.current();
                }, AUTO_SAVE_DELAY_MS);
            }
        };

        currentRef.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            currentRef.removeEventListener('wheel', onWheel);
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
                autoSaveTimeoutRef.current = null;
            }
            cancelPendingWheelZoom();
        };
    }, [cancelPendingWheelZoom, containerRef, flushPendingWheelZoom, schedulePendingWheelZoom]);

    const handleInteractionEnd = () => {
        if (!isActive) {
            flushPendingWheelZoom();
            performSave();
        }
    };

    const onCropChangeComplete = useCallback((percentageCrop: Area) => {
        if (!isValidCropArea(percentageCrop)) {
            return;
        }

        lastPercentageCrop.current = percentageCrop;
    }, []);

    const handleCancelClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        cancelPendingWheelZoom();
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
            autoSaveTimeoutRef.current = null;
        }

        if (initialCropParams) {
            const restoredZoom = 100 / initialCropParams.width;
            setZoom(restoredZoom);
        } else {
            setZoom(minZoomLimit);
            setCrop({
                x: themeCropperTokens.defaultCropX,
                y: themeCropperTokens.defaultCropY,
            });
        }
        onCancel();
    };

    const handleSaveClick = (e?: React.MouseEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        flushPendingWheelZoom();
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
            autoSaveTimeoutRef.current = null;
        }

        const pc = isValidCropArea(lastPercentageCrop.current)
            ? lastPercentageCrop.current
            : {
                x: themeCropperTokens.defaultCropX,
                y: themeCropperTokens.defaultCropY,
                width: themeCropperTokens.defaultCropWidth,
                height: themeCropperTokens.defaultCropHeight,
            };
        const cropRatio = (pc.width / pc.height) * originalAspectRatioRef.current;
        onSave(pc, cropRatio);
    };

    return {
        isCtrlPressed,
        handleInteractionEnd,
        onCropChangeComplete,
        handleCancelClick,
        handleSaveClick
    };
}
