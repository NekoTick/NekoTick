import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { createPortal } from "react-dom";
import { copyImageSourceToClipboard } from "@/components/Chat/common/messageClipboard";
import { useI18n } from "@/lib/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { themeChatImageViewerTokens, themeCropperTokens } from "@/styles/themeTokens";
import {
  clampZoom,
  getViewerFitBounds,
  MIN_ZOOM,
  type ViewerPoint,
} from "./chatImageViewerGeometry";
import { ChatImageViewerDialog } from "./ChatImageViewerDialog";
import { useChatImageViewerGallery } from "./useChatImageViewerGallery";
import { useChatImageViewerViewport } from "./useChatImageViewerViewport";
import { useChatModalFocus } from "@/components/Chat/hooks/useChatModalFocus";

export { RESOLVED_VIEWER_IMAGE_CACHE_CHAR_LIMIT } from "./chatImageViewerSource";

export interface ChatImageViewerProps {
  open: boolean;
  src: string;
  alt?: string;
  gallery?: Array<{ id: string; src: string }>;
  currentImageId?: string;
  previewSrc?: string | null;
  onCopyImage?: (src: string) => boolean | Promise<boolean>;
  onOpenChange: (open: boolean) => void;
}

const VIEWER_CONTROL_SELECTOR = '[data-chat-image-viewer-control="true"]';
const CROPPER_IMAGE_SELECTOR = '.reactEasyCrop_Image';
const VIEWER_SURFACE_SELECTOR = '[data-chat-image-viewer-surface="true"]';

async function copyImageOrUrl(src: string): Promise<boolean> {
  return copyImageSourceToClipboard(src);
}

export function ChatImageViewer({
  open,
  src,
  alt,
  gallery,
  currentImageId,
  previewSrc,
  onCopyImage,
  onOpenChange,
}: ChatImageViewerProps) {
  const { t } = useI18n();
  const addToast = useToastStore((state) => state.addToast);
  const [crop, setCrop] = useState<ViewerPoint>({ x: themeCropperTokens.defaultCropX, y: themeCropperTokens.defaultCropY });
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [mediaSize, setMediaSize] = useState<{ width: number; height: number; naturalWidth: number; naturalHeight: number } | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeViewer = useCallback(() => onOpenChange(false), [onOpenChange]);
  useChatModalFocus({ modalRef: dialogRef, onClose: closeViewer, open });
  const viewportSize = useChatImageViewerViewport(open);
  const {
    activeSrc,
    boundedGallery,
    cropperImageSrc,
    hasNext,
    hasPrevious,
    setActiveGalleryIndex,
  } = useChatImageViewerGallery({
    currentImageId,
    gallery,
    open,
    previewSrc,
    src,
  });
  const activeAlt = alt;

  const percentLabel = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);
  const imageSizeLabel = useMemo(() => {
    if (!imageSize) {
      return null;
    }
    return `${imageSize.width}×${imageSize.height}`;
  }, [imageSize]);
  const previewMetrics = useMemo(() => {
    const { maxHeight, maxWidth } = getViewerFitBounds(viewportSize);
    const safeAspect = aspectRatio > 0 ? aspectRatio : 1;
    const viewportAspect = viewportSize.width / Math.max(viewportSize.height, themeChatImageViewerTokens.minViewportSizePx);
    const fitWidthAtZoomOne = mediaSize?.width || (
      safeAspect >= viewportAspect
        ? viewportSize.width
        : viewportSize.height * safeAspect
    );
    const fitHeightAtZoomOne = mediaSize?.height || (
      safeAspect >= viewportAspect
        ? viewportSize.width / safeAspect
        : viewportSize.height
    );
    const naturalWidth = mediaSize?.naturalWidth || imageSize?.width || fitWidthAtZoomOne;
    const naturalHeight = mediaSize?.naturalHeight || imageSize?.height || fitHeightAtZoomOne;
    const targetWidth = Math.min(naturalWidth, maxWidth);
    const targetHeight = Math.min(naturalHeight, maxHeight);
    const initialZoom = clampZoom(
      Math.min(
        1,
        targetWidth / Math.max(fitWidthAtZoomOne, themeChatImageViewerTokens.minViewportSizePx),
        targetHeight / Math.max(fitHeightAtZoomOne, themeChatImageViewerTokens.minViewportSizePx)
      )
    );
    const minZoom = Math.max(MIN_ZOOM, Number((initialZoom * themeChatImageViewerTokens.previewMinZoomScale).toFixed(2)));
    return {
      initialZoom,
      minZoom,
    };
  }, [aspectRatio, imageSize?.height, imageSize?.width, mediaSize, viewportSize.height, viewportSize.width]);
  const cropperViewportSize = useMemo(
    () => ({
      width: Math.max(themeChatImageViewerTokens.minViewportSizePx, viewportSize.width),
      height: Math.max(themeChatImageViewerTokens.minViewportSizePx, viewportSize.height),
    }),
    [viewportSize.height, viewportSize.width],
  );

  const isPointOnImage = useCallback((clientX: number, clientY: number) => {
    if (typeof document !== "undefined" && typeof document.elementsFromPoint === "function") {
      const elementsAtPoint = document.elementsFromPoint(clientX, clientY);
      return elementsAtPoint.some((element) => (
        element === imageElementRef.current ||
        element.matches(CROPPER_IMAGE_SELECTOR)
      ));
    }

    const imageRect = imageElementRef.current?.getBoundingClientRect();
    if (imageRect && imageRect.width > 0 && imageRect.height > 0) {
      return (
        clientX >= imageRect.left &&
        clientX <= imageRect.right &&
        clientY >= imageRect.top &&
        clientY <= imageRect.bottom
      );
    }

    const safeAspect = aspectRatio > 0 ? aspectRatio : themeChatImageViewerTokens.minViewportSizePx;
    const viewportAspect = viewportSize.width / Math.max(viewportSize.height, themeChatImageViewerTokens.minViewportSizePx);
    const baseWidth =
      safeAspect >= viewportAspect
        ? viewportSize.width
        : viewportSize.height * safeAspect;
    const baseHeight =
      safeAspect >= viewportAspect
        ? viewportSize.width / safeAspect
        : viewportSize.height;

    const scaledWidth = baseWidth * zoom;
    const scaledHeight = baseHeight * zoom;
    const left = viewportSize.width / 2 - scaledWidth / 2 + crop.x;
    const top = viewportSize.height / 2 - scaledHeight / 2 + crop.y;
    const right = left + scaledWidth;
    const bottom = top + scaledHeight;

    return clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
  }, [aspectRatio, crop.x, crop.y, viewportSize.height, viewportSize.width, zoom]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const handleDocumentPress = (event: MouseEvent | globalThis.PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        event.button !== 0 ||
        target?.closest(VIEWER_CONTROL_SELECTOR) ||
        !target?.closest(VIEWER_SURFACE_SELECTOR) ||
        target === imageElementRef.current ||
        target?.matches(CROPPER_IMAGE_SELECTOR)
      ) {
        return;
      }

      onOpenChange(false);
    };

    document.addEventListener("pointerdown", handleDocumentPress, true);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPress, true);
    };
  }, [onOpenChange, open]);

  const handleDialogPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      event.button !== 0 ||
      target?.closest(VIEWER_CONTROL_SELECTOR) ||
      target === imageElementRef.current ||
      target?.matches(CROPPER_IMAGE_SELECTOR)
    ) {
      return;
    }

    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    setCrop({ x: themeCropperTokens.defaultCropX, y: themeCropperTokens.defaultCropY });
    setMediaSize(null);
    setMediaReady(false);
  }, [activeSrc, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (mediaReady) {
      setZoom(previewMetrics.initialZoom);
    }
  }, [activeSrc, mediaReady, open, previewMetrics.initialZoom]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), themeChatImageViewerTokens.copiedResetDelayMs);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      const didCopy = await (onCopyImage ? onCopyImage(activeSrc) : copyImageOrUrl(activeSrc));
      setCopied(didCopy);
      if (!didCopy) {
        addToast(t('chat.copyImageFailed'), 'error');
      }
    } catch {
      setCopied(false);
      addToast(t('chat.copyImageFailed'), 'error');
    }
  };

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <ChatImageViewerDialog
      activeAlt={activeAlt}
      activeSrc={activeSrc}
      copied={copied}
      crop={crop}
      cropperImageSrc={cropperImageSrc}
      cropperViewportSize={cropperViewportSize}
      dialogRef={dialogRef}
      handleCopy={() => {
        void handleCopy();
      }}
      handleDialogPointerDownCapture={handleDialogPointerDownCapture}
      hasNext={hasNext}
      hasPrevious={hasPrevious}
      imageElementRef={imageElementRef}
      imageSizeLabel={imageSizeLabel}
      isPointOnImage={isPointOnImage}
      mediaReady={mediaReady}
      onNavigateNext={() => setActiveGalleryIndex((value) => Math.min(value + 1, (boundedGallery?.length ?? 1) - 1))}
      onNavigatePrevious={() => setActiveGalleryIndex((value) => Math.max(value - 1, 0))}
      onOpenChange={onOpenChange}
      percentLabel={percentLabel}
      previewMetrics={previewMetrics}
      setAspectRatio={setAspectRatio}
      setCrop={setCrop}
      setImageSize={setImageSize}
      setMediaReady={setMediaReady}
      setMediaSize={setMediaSize}
      setZoom={setZoom}
      viewportSize={viewportSize}
      zoom={zoom}
    />,
    document.body
  );
}
