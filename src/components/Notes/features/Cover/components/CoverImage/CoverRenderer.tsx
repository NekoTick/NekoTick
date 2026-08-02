import React from 'react';
import { CoverPlaceholderLayer } from './layers/CoverPlaceholderLayer';
import { CoverCropperLayer } from './layers/CoverCropperLayer';
import { CoverFrozenLayer } from './layers/CoverFrozenLayer';
import type { CoverRendererProps } from './coverRenderer.types';
import { themeRenderingTokens } from '@/styles/themeTokens';
export type { CoverRendererProps, LoadedCoverMedia } from './coverRenderer.types';

export const CoverRenderer = React.memo(({
  displaySrc,
  layoutPanelDragging = false,
  isContainerResizing = false,
  placeholderSrc,
  placeholderMediaSize,
  isImageReady,
  isResizing,
  isResizeSettling,
  mediaSize,
  wrapperRef,
  frozenImgRef,
  frozenImageState,
  crop,
  zoom,
  effectiveContainerSize,
  effectiveMinZoom,
  effectiveMaxZoom,
  objectFitMode,
  onCropperCropChange,
  onCropperZoomChange,
  onPointerIntent,
  onPointerMoveIntent,
  onNonPointerIntent,
  onInteractionStart,
  onInteractionEnd,
  onMediaLoaded,
  positionX,
  positionY
}: CoverRendererProps) => {
  const frozenLayerVisible = Boolean(frozenImageState) && (isResizing || isResizeSettling);
  const placeholderFallbackVisible =
    !isImageReady ||
    (isResizing && !frozenLayerVisible);
  const placeholderDisplaySrc = placeholderSrc || displaySrc;
  const layoutBackdropVisible =
    Boolean(placeholderDisplaySrc) &&
    (layoutPanelDragging || isContainerResizing);
  const cropperSuspended =
    layoutPanelDragging || isContainerResizing || (isResizing && frozenLayerVisible);

  return (
    <>
      {layoutBackdropVisible ? (
        <img
          key={placeholderDisplaySrc}
          src={placeholderDisplaySrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
          style={{
            objectPosition: `${positionX}% ${positionY}%`,
            transform: themeRenderingTokens.translateZ0,
          }}
        />
      ) : null}
      <CoverPlaceholderLayer
        displaySrc={placeholderDisplaySrc}
        isImageReady={isImageReady}
        positionX={positionX}
        positionY={positionY}
        crop={crop}
        mediaSize={placeholderMediaSize ?? mediaSize}
        effectiveContainerSize={effectiveContainerSize}
        zoom={zoom}
        objectFitMode={objectFitMode}
        forceVisible={placeholderFallbackVisible}
      />
      <CoverCropperLayer
        displaySrc={displaySrc}
        isImageReady={isImageReady}
        isResizing={isResizing}
        isSuspended={cropperSuspended}
        mediaSize={mediaSize}
        wrapperRef={wrapperRef}
        crop={crop}
        zoom={zoom}
        effectiveContainerSize={effectiveContainerSize}
        effectiveMinZoom={effectiveMinZoom}
        effectiveMaxZoom={effectiveMaxZoom}
        objectFitMode={objectFitMode}
        onCropperCropChange={onCropperCropChange}
        onCropperZoomChange={onCropperZoomChange}
        onPointerIntent={onPointerIntent}
        onPointerMoveIntent={onPointerMoveIntent}
        onNonPointerIntent={onNonPointerIntent}
        onInteractionStart={onInteractionStart}
        onInteractionEnd={onInteractionEnd}
        onMediaLoaded={onMediaLoaded}
      />
      <CoverFrozenLayer
        displaySrc={displaySrc}
        isVisible={frozenLayerVisible}
        frozenImgRef={frozenImgRef}
        frozenImageState={frozenImageState}
      />
    </>
  );
});
