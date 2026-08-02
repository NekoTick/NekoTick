import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useCoverInteraction } from './interaction/useCoverInteraction';
import { useCoverResize } from './resize/useCoverResize';
import { useCoverPositionSync } from './interaction/useCoverPositionSync';
import { useCoverContainerObserver } from './resize/useCoverContainerObserver';

interface UseCoverInteractionControllerProps {
  mediaSize: { width: number; height: number } | null;
  effectiveContainerSize: { width: number; height: number } | null;
  zoom: number;
  setZoom: (zoom: number) => void;
  crop: { x: number; y: number };
  setCrop: Dispatch<SetStateAction<{ x: number; y: number }>>;
  coverHeight: number;
  storedCoverHeight?: number;
  setCoverHeight: (height: number) => void;
  url: string | null;
  readOnly: boolean;
  onUpdate: (url: string | null, positionX: number, positionY: number, height?: number, scale?: number) => void;
  setIsInteracting: (interacting: boolean) => void;
  showPicker: boolean;
  setShowPicker: (show: boolean) => void;
  positionX: number;
  positionY: number;
  isInteracting: boolean;
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;
  isManualResizingRef: React.MutableRefObject<boolean>;
  setContainerSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>;
  suspendPositionSync: boolean;
  containerObserveKey?: string | null;
  suspendContainerObservation?: boolean;
}

export function useCoverInteractionController({
  mediaSize,
  effectiveContainerSize,
  zoom,
  setZoom,
  crop,
  setCrop,
  coverHeight,
  storedCoverHeight,
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
  containerObserveKey,
  suspendContainerObservation = false,
}: UseCoverInteractionControllerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isContainerResizing, setIsContainerResizing] = useState(false);

  const {
    handleResizeMouseDown,
    isResizeSettling,
    frozenImageState,
    frozenImgRef,
    ignoreCropSyncRef,
  } = useCoverResize({
    mediaSize,
    effectiveContainerSize,
    zoom,
    crop,
    coverHeight,
    setCoverHeight,
    setCrop,
    setZoom,
    setIsResizing,
    isManualResizingRef,
    containerRef,
    wrapperRef,
    onUpdate,
    url,
  });

  const {
    objectFitMode, effectiveMinZoom, effectiveMaxZoom,
    handleInteractionStart, handleInteractionEnd,
    onCropperCropChange, onCropperZoomChange,
    markPointerIntent, markPointerMoveIntent, markNonPointerIntent,
  } = useCoverInteraction({
    mediaSize,
    effectiveContainerSize,
    zoom,
    setZoom,
    crop,
    setCrop,
    storedCoverHeight,
    url,
    readOnly,
    onUpdate,
    setIsInteracting,
    showPicker,
    setShowPicker,
    ignoreCropSyncRef,
  });

  useCoverPositionSync({
    positionX,
    positionY,
    mediaSize,
    effectiveContainerSize,
    zoom,
    isInteracting,
    isResizing,
    suspendSync: suspendPositionSync,
    ignoreCropSyncRef,
    setCrop,
  });

  useCoverContainerObserver({
    containerRef,
    isManualResizingRef,
    setContainerSize,
    setIsContainerResizing,
    observeKey: containerObserveKey,
    suspended: suspendContainerObservation,
  });

  return {
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
  };
}
