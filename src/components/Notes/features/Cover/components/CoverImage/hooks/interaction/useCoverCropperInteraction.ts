import { useCallback, useEffect, useRef } from 'react';

interface UseCoverCropperInteractionProps {
  displaySrc: string;
  crop: { x: number; y: number };
  zoom: number;
  effectiveMinZoom: number;
  effectiveMaxZoom: number;
  onCropperCropChange: (crop: { x: number; y: number }) => void;
  onCropperZoomChange: (zoom: number, anchor?: { x: number; y: number }) => void;
  onPointerIntent: (x?: number, y?: number) => void;
  onPointerMoveIntent: (x: number, y: number) => void;
  onNonPointerIntent: () => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
}

export function useCoverCropperInteraction({
  displaySrc,
  crop,
  zoom,
  effectiveMinZoom,
  effectiveMaxZoom,
  onCropperCropChange,
  onCropperZoomChange,
  onPointerIntent,
  onPointerMoveIntent,
  onNonPointerIntent,
  onInteractionStart,
  onInteractionEnd,
}: UseCoverCropperInteractionProps) {
  const wheelTargetRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; cropX: number; cropY: number } | null>(null);
  const cropFrameRef = useRef<number | null>(null);
  const pendingCropRef = useRef<{ x: number; y: number } | null>(null);
  const zoomFrameRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<{ zoom: number; anchor?: { x: number; y: number } } | null>(null);
  const wheelInteractionRef = useRef(false);
  const wheelEndTimerRef = useRef<number | null>(null);
  const latestStateRef = useRef({
    displaySrc,
    crop,
    zoom,
    effectiveMinZoom,
    effectiveMaxZoom,
    onCropperCropChange,
    onCropperZoomChange,
    onPointerIntent,
    onPointerMoveIntent,
    onNonPointerIntent,
    onInteractionStart,
    onInteractionEnd,
  });

  latestStateRef.current = {
    displaySrc,
    crop,
    zoom,
    effectiveMinZoom,
    effectiveMaxZoom,
    onCropperCropChange,
    onCropperZoomChange,
    onPointerIntent,
    onPointerMoveIntent,
    onNonPointerIntent,
    onInteractionStart,
    onInteractionEnd,
  };

  const applyPendingCrop = useCallback(() => {
    cropFrameRef.current = null;
    const pendingCrop = pendingCropRef.current;
    pendingCropRef.current = null;
    if (pendingCrop) latestStateRef.current.onCropperCropChange(pendingCrop);
  }, []);

  const flushPendingCrop = useCallback(() => {
    if (cropFrameRef.current !== null) {
      window.cancelAnimationFrame(cropFrameRef.current);
      cropFrameRef.current = null;
    }
    applyPendingCrop();
  }, [applyPendingCrop]);

  const scheduleCropChange = useCallback((nextCrop: { x: number; y: number }) => {
    pendingCropRef.current = nextCrop;
    if (cropFrameRef.current !== null) return;
    cropFrameRef.current = window.requestAnimationFrame(applyPendingCrop);
  }, [applyPendingCrop]);

  const applyPendingZoom = useCallback(() => {
    zoomFrameRef.current = null;
    const pendingZoom = pendingZoomRef.current;
    pendingZoomRef.current = null;
    if (pendingZoom) {
      latestStateRef.current.onCropperZoomChange(pendingZoom.zoom, pendingZoom.anchor);
    }
  }, []);

  const flushPendingZoom = useCallback(() => {
    if (zoomFrameRef.current !== null) {
      window.cancelAnimationFrame(zoomFrameRef.current);
      zoomFrameRef.current = null;
    }
    applyPendingZoom();
  }, [applyPendingZoom]);

  const scheduleZoomChange = useCallback((nextZoom: number, anchor?: { x: number; y: number }) => {
    pendingZoomRef.current = { zoom: nextZoom, anchor };
    if (zoomFrameRef.current !== null) return;
    zoomFrameRef.current = window.requestAnimationFrame(applyPendingZoom);
  }, [applyPendingZoom]);

  const clearWheelTimer = useCallback(() => {
    if (wheelEndTimerRef.current == null) return;
    window.clearTimeout(wheelEndTimerRef.current);
    wheelEndTimerRef.current = null;
  }, []);

  const finishActiveInteraction = useCallback(() => {
    const activePointerId = pointerIdRef.current;
    const activeWheel = wheelInteractionRef.current;
    const activePointer = activePointerId != null;

    clearWheelTimer();
    flushPendingCrop();
    flushPendingZoom();

    if (activePointer && wheelTargetRef.current?.hasPointerCapture?.(activePointerId)) {
      wheelTargetRef.current.releasePointerCapture?.(activePointerId);
    }

    wheelInteractionRef.current = false;
    pointerIdRef.current = null;
    dragStartRef.current = null;

    if (activeWheel || activePointer) {
      latestStateRef.current.onInteractionEnd();
    }
  }, [clearWheelTimer, flushPendingCrop, flushPendingZoom]);

  const endWheelInteraction = useCallback(() => {
    clearWheelTimer();
    if (!wheelInteractionRef.current) return;
    flushPendingZoom();
    wheelInteractionRef.current = false;
    latestStateRef.current.onInteractionEnd();
  }, [clearWheelTimer, flushPendingZoom]);

  const scheduleWheelInteractionEnd = useCallback(() => {
    clearWheelTimer();
    wheelEndTimerRef.current = window.setTimeout(() => {
      endWheelInteraction();
    }, 120);
  }, [clearWheelTimer, endWheelInteraction]);

  useEffect(() => {
    return () => {
      finishActiveInteraction();
    };
  }, [finishActiveInteraction]);

  const handleWheel = useCallback((event: WheelEvent) => {
    const {
      displaySrc: currentDisplaySrc,
      zoom: currentZoom,
      effectiveMinZoom: currentMinZoom,
      effectiveMaxZoom: currentMaxZoom,
      onNonPointerIntent: markNonPointerIntent,
      onInteractionStart: startInteraction,
    } = latestStateRef.current;

    if (!currentDisplaySrc) return;

    event.preventDefault();
    event.stopPropagation();
    markNonPointerIntent();

    if (!wheelInteractionRef.current) {
      wheelInteractionRef.current = true;
      startInteraction();
    }

    const rect = wheelTargetRef.current?.getBoundingClientRect();
    const anchor = rect
      ? {
          x: event.clientX - rect.left - rect.width / 2,
          y: event.clientY - rect.top - rect.height / 2,
        }
      : undefined;
    const zoomDelta = Math.exp(-event.deltaY * 0.0015);
    const nextZoom = (pendingZoomRef.current?.zoom ?? currentZoom) * zoomDelta;
    const clampedZoom = Math.min(currentMaxZoom, Math.max(currentMinZoom, nextZoom));
    latestStateRef.current.zoom = clampedZoom;
    scheduleZoomChange(clampedZoom, anchor);
    scheduleWheelInteractionEnd();
  }, [scheduleWheelInteractionEnd, scheduleZoomChange]);

  const bindWheelTarget = useCallback((node: HTMLDivElement | null) => {
    if (wheelTargetRef.current === node) return;

    if (wheelTargetRef.current) {
      finishActiveInteraction();
      wheelTargetRef.current.removeEventListener('wheel', handleWheel);
    }

    wheelTargetRef.current = node;

    if (node) {
      node.addEventListener('wheel', handleWheel, { passive: false });
    }
  }, [finishActiveInteraction, handleWheel]);

  useEffect(() => {
    return () => {
      if (!wheelTargetRef.current) return;
      finishActiveInteraction();
      wheelTargetRef.current.removeEventListener('wheel', handleWheel);
      wheelTargetRef.current = null;
    };
  }, [finishActiveInteraction, handleWheel]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const {
      displaySrc: currentDisplaySrc,
      crop: currentCrop,
      onPointerIntent: markPointerIntent,
      onInteractionStart: startInteraction,
    } = latestStateRef.current;

    if (!currentDisplaySrc) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    markPointerIntent(event.clientX, event.clientY);
    startInteraction();
    pointerIdRef.current = event.pointerId;
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      cropX: currentCrop.x,
      cropY: currentCrop.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();

    const {
      onPointerMoveIntent: markPointerMoveIntent,
    } = latestStateRef.current;

    markPointerMoveIntent(event.clientX, event.clientY);

    const dragStart = dragStartRef.current;
    if (!dragStart || pointerIdRef.current !== event.pointerId) return;

    scheduleCropChange({
      x: dragStart.cropX + (event.clientX - dragStart.x),
      y: dragStart.cropY + (event.clientY - dragStart.y),
    });
  }, [scheduleCropChange]);

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (pointerIdRef.current !== event.pointerId) return;

    flushPendingCrop();
    dragStartRef.current = null;
    pointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    latestStateRef.current.onInteractionEnd();
  }, [flushPendingCrop]);

  return {
    bindWheelTarget,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
  };
}
