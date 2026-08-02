import { useLayoutEffect } from 'react';
import { useUIStore } from '@/stores/uiSlice';
import { useCoverState } from './state/useCoverState';
import { useCoverDisplayModel } from './display/useCoverDisplayModel';
import { useCoverPreviewReset } from './display/useCoverPreviewReset';
import { useCoverSelectionFlow } from './source/useCoverSelectionFlow';
import { useCoverInteractionController } from './useCoverInteractionController';
import { useCoverMediaController } from './display/useCoverMediaController';
import { useCoverStableMediaState } from './display/useCoverStableMediaState';
import { useAutomaticCoverHeight } from './state/useAutomaticCoverHeight';
import type { CoverImageControllerModel, CoverImageProps } from '../coverImage.types';
import { DEFAULT_POSITION_PERCENT, resolveDefaultCoverHeight } from '../../../utils/coverConstants';

interface UseCoverImageControllerProps extends Omit<CoverImageProps, 'height' | 'scale' | 'readOnly'> {
  initialHeight?: number;
  scale: number;
  readOnly: boolean;
}

export function useCoverImageController({
  url,
  positionX,
  positionY,
  initialHeight,
  scale,
  readOnly,
  onUpdate,
  notesRootPath,
  currentNotePath,
  pickerOpen,
  onPickerOpenChange,
  onPreviewLayoutActiveChange,
}: UseCoverImageControllerProps): CoverImageControllerModel {
  const layoutPanelDragging = useUIStore((state) => state.layoutPanelDragging);
  const layoutPanelTransitioning = useUIStore((state) => state.layoutPanelTransitioning);
  const layoutPanelBusy = layoutPanelDragging || layoutPanelTransitioning;
  const {
    coverHeight, setCoverHeight,
    containerSize, setContainerSize,
    mediaSize, setMediaSize,
    crop, setCrop,
    zoom, setZoom,
    isInteracting, setIsInteracting,
    isResizing, setIsResizing,
    isManualResizingRef,
    showPicker, setShowPicker,
  } = useCoverState({ initialHeight, scale, pickerOpen, onPickerOpenChange });

  const {
    resolvedSrc,
    previewSrc,
    phase,
    isResolvedSourceStale,
    canUsePreviousSource,
    isImageReady,
    setIsImageReady,
    prevSrcRef,
    isError,
    handleCoverSelect,
    handlePreview,
    handlePickerClose,
  } = useCoverSelectionFlow({
    url,
    coverHeight: initialHeight,
    notesRootPath,
    currentNotePath,
    pickerOpen: showPicker,
    onUpdate,
    setShowPicker,
  });

  useLayoutEffect(() => {
    onPreviewLayoutActiveChange?.(!url && Boolean(previewSrc));
    return () => onPreviewLayoutActiveChange?.(false);
  }, [onPreviewLayoutActiveChange, previewSrc, url]);

  useCoverPreviewReset({
    previewSrc,
    scale,
    setCrop,
    setZoom,
    setIsImageReady,
  });

  const {
    mediaSrc,
    sourceIsReady,
    displayPositionX,
    displayPositionY,
    effectiveCrop,
    effectiveZoom,
    syncPositionX,
    syncPositionY,
    syncZoom,
    placeholderSrc,
    isHoldingPreviousFrame,
    suspendPositionSync,
    handleSourceReady,
  } = useCoverDisplayModel({
    phase,
    previewSrc,
    resolvedSrc,
    isSourceStale: isResolvedSourceStale,
    canUsePreviousSource,
    prevSrcRef,
    crop,
    zoom,
    positionX,
    positionY,
    isImageReady,
    setIsImageReady,
  });

  const {
    displayCoverHeight,
    effectiveContainerSize,
    effectiveMediaSize,
    placeholderMediaSize,
    handleResolvedMediaSize,
  } = useCoverStableMediaState({
    sourceIsReady,
    mediaSrc,
    coverHeight,
    containerSize,
    mediaSize,
    setMediaSize,
    isHoldingPreviousFrame,
    placeholderSrc,
  });

  const {
    objectFitMode,
    effectiveMinZoom,
    effectiveMaxZoom,
    handleInteractionStart,
    handleInteractionEnd,
    onCropperCropChange,
    onCropperZoomChange,
    markPointerIntent,
    markPointerMoveIntent,
    markNonPointerIntent,
    containerRef,
    wrapperRef,
    handleResizeMouseDown,
    isResizeSettling,
    isContainerResizing,
    frozenImageState,
    frozenImgRef,
  } = useCoverInteractionController({
    mediaSize: effectiveMediaSize,
    effectiveContainerSize,
    zoom,
    setZoom,
    crop,
    setCrop,
    coverHeight,
    storedCoverHeight: initialHeight,
    setCoverHeight,
    url,
    readOnly,
    onUpdate,
    setIsInteracting,
    showPicker,
    setShowPicker,
    positionX,
    positionY,
    isInteracting,
    isResizing,
    setIsResizing,
    isManualResizingRef,
    setContainerSize,
    suspendPositionSync,
    containerObserveKey: url || previewSrc,
    suspendContainerObservation: layoutPanelBusy,
  });

  useAutomaticCoverHeight({
    containerRef,
    enabled: initialHeight === undefined,
    observeKey: `${url ?? ''}\0${previewSrc ?? ''}\0${showPicker}`,
    setCoverHeight,
  });

  const { handleMediaLoaded } = useCoverMediaController({
    mediaSrc,
    effectiveContainerSize,
    isImageReady,
    syncPositionX,
    syncPositionY,
    syncZoom,
    setMediaSize: handleResolvedMediaSize,
    setCrop,
    setZoom,
    setIsImageReady,
    onSourceReady: handleSourceReady,
  });

  return {
    url,
    readOnly,
    notesRootPath,
    currentNotePath,
    phase,
    showPicker,
    previewSrc,
    isError,
    displaySrc: mediaSrc,
    coverHeight: displayCoverHeight,
    positionX: displayPositionX,
    positionY: displayPositionY,
    containerRef,
    onOpenPicker: () => setShowPicker(true),
    onClosePicker: handlePickerClose,
    onSelectCover: handleCoverSelect,
    onPreview: handlePreview,
    onRemoveCover: () => {
      void handlePreview(null).catch(() => undefined);
      setIsImageReady(false);
      onUpdate(null, DEFAULT_POSITION_PERCENT, DEFAULT_POSITION_PERCENT);
    },
    onResizeMouseDown: handleResizeMouseDown,
    onResetHeight: () => {
      setCoverHeight(resolveDefaultCoverHeight());
      onUpdate(url, positionX, positionY, undefined, scale);
    },
    rendererProps: {
      layoutPanelDragging: layoutPanelBusy,
      isContainerResizing,
      placeholderSrc,
      placeholderMediaSize,
      isImageReady: sourceIsReady,
      isResizing,
      isResizeSettling,
      mediaSize: effectiveMediaSize,
      wrapperRef,
      frozenImgRef,
      frozenImageState,
      crop: effectiveCrop,
      zoom: effectiveZoom,
      effectiveContainerSize,
      effectiveMinZoom,
      effectiveMaxZoom,
      objectFitMode,
      onCropperCropChange,
      onCropperZoomChange,
      onPointerIntent: markPointerIntent,
      onPointerMoveIntent: markPointerMoveIntent,
      onNonPointerIntent: markNonPointerIntent,
      onInteractionStart: handleInteractionStart,
      onInteractionEnd: handleInteractionEnd,
      onMediaLoaded: handleMediaLoaded,
    },
  };
}
