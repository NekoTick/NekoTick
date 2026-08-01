import type { Dispatch, MutableRefObject, PointerEvent, SetStateAction } from "react";
import Cropper from "react-easy-crop";
import { DialogCloseIconButton, dialogActionIconButtonClassName } from "@/components/common/DialogCloseIconButton";
import { Icon } from "@/components/ui/icons";
import { cn, iconButtonStyles } from "@/lib/utils";
import { downloadImageWithPrompt } from "@/components/Chat/common/imageDownload";
import { raisedPopoverSurfaceClass } from "@/components/ui/surfaceStyles";
import { useI18n } from "@/lib/i18n";
import { themeChatImageViewerTokens, themeCropperTokens, themeStyleResetTokens } from "@/styles/themeTokens";
import { clampZoom, MAX_ZOOM, resolveInitialViewerZoom, ZOOM_STEP, type ViewerPoint, type ViewerSize } from "./chatImageViewerGeometry";
import { TRANSPARENT_IMAGE_DATA_URL } from "./chatImageViewerSource";

function stopViewerControlMouseDown(event: React.MouseEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
}

export function ChatImageViewerDialog({
  activeAlt,
  activeSrc,
  copied,
  crop,
  cropperImageSrc,
  cropperViewportSize,
  dialogRef,
  handleCopy,
  handleDialogPointerDownCapture,
  hasNext,
  hasPrevious,
  imageElementRef,
  imageSizeLabel,
  isPointOnImage,
  mediaReady,
  onNavigateNext,
  onNavigatePrevious,
  onOpenChange,
  percentLabel,
  previewMetrics,
  setAspectRatio,
  setCrop,
  setImageSize,
  setMediaReady,
  setMediaSize,
  setZoom,
  viewportSize,
  zoom,
}: {
  activeAlt?: string;
  activeSrc: string;
  copied: boolean;
  crop: ViewerPoint;
  cropperImageSrc: string;
  cropperViewportSize: ViewerSize;
  dialogRef: MutableRefObject<HTMLDivElement | null>;
  handleCopy: () => void;
  handleDialogPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => void;
  hasNext: boolean;
  hasPrevious: boolean;
  imageElementRef: MutableRefObject<HTMLImageElement | null>;
  imageSizeLabel: string | null;
  isPointOnImage: (clientX: number, clientY: number) => boolean;
  mediaReady: boolean;
  onNavigateNext: () => void;
  onNavigatePrevious: () => void;
  onOpenChange: (open: boolean) => void;
  percentLabel: string;
  previewMetrics: { initialZoom: number; minZoom: number };
  setAspectRatio: Dispatch<SetStateAction<number>>;
  setCrop: Dispatch<SetStateAction<ViewerPoint>>;
  setImageSize: Dispatch<SetStateAction<{ width: number; height: number } | null>>;
  setMediaReady: Dispatch<SetStateAction<boolean>>;
  setMediaSize: Dispatch<SetStateAction<{
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  } | null>>;
  setZoom: Dispatch<SetStateAction<number>>;
  viewportSize: ViewerSize;
  zoom: number;
}) {
  const { t } = useI18n();

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={activeAlt || t('common.preview')}
      tabIndex={-1}
      className="fixed inset-0 z-[var(--vlaina-z-121)]"
      data-no-focus-input="true"
      data-chat-image-viewer-surface="true"
      onPointerDownCapture={handleDialogPointerDownCapture}
      onClick={(event) => {
        if (isPointOnImage(event.clientX, event.clientY)) {
          return;
        }
        onOpenChange(false);
      }}
    >
      <DialogCloseIconButton
        label={t('chat.closePreview')}
        data-no-focus-input="true"
        data-chat-image-viewer-control="true"
        className="absolute right-12 top-[var(--vlaina-size-72px)] z-[var(--vlaina-z-10)]"
        onMouseDown={stopViewerControlMouseDown}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenChange(false);
        }}
      />

      {hasPrevious && (
        <div className="absolute inset-y-0 left-4 z-[var(--vlaina-z-10)] flex items-center">
          <button
            type="button"
            aria-label={t('chat.previousImage')}
            data-no-focus-input="true"
            data-chat-image-viewer-control="true"
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--vlaina-color-panel-border)] bg-[var(--vlaina-color-setting-field)] text-[var(--vlaina-color-text-strong)] shadow-[var(--vlaina-shadow-floating-panel)] transition-colors hover:bg-[var(--vlaina-color-setting-field)]",
              iconButtonStyles
            )}
            onMouseDown={stopViewerControlMouseDown}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onNavigatePrevious();
            }}
          >
            <Icon name="nav.chevronLeft" size="md" />
          </button>
        </div>
      )}

      {hasNext && (
        <div className="absolute inset-y-0 right-4 z-[var(--vlaina-z-10)] flex items-center">
          <button
            type="button"
            aria-label={t('chat.nextImage')}
            data-no-focus-input="true"
            data-chat-image-viewer-control="true"
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--vlaina-color-panel-border)] bg-[var(--vlaina-color-setting-field)] text-[var(--vlaina-color-text-strong)] shadow-[var(--vlaina-shadow-floating-panel)] transition-colors hover:bg-[var(--vlaina-color-setting-field)]",
              iconButtonStyles
            )}
            onMouseDown={stopViewerControlMouseDown}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onNavigateNext();
            }}
          >
            <Icon name="nav.chevronRight" size="md" />
          </button>
        </div>
      )}

      <div className="relative h-full w-full">
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-[var(--vlaina-duration-100)]",
            mediaReady ? "opacity-[var(--vlaina-opacity-100)]" : "opacity-[var(--vlaina-opacity-0)]"
          )}
        >
          <Cropper
            image={cropperImageSrc}
            crop={crop}
            cropSize={cropperViewportSize}
            zoom={zoom}
            minZoom={previewMetrics.minZoom}
            maxZoom={MAX_ZOOM}
            showGrid={false}
            zoomWithScroll={true}
            zoomSpeed={ZOOM_STEP}
            restrictPosition={false}
            objectFit="contain"
            setImageRef={(ref) => {
              imageElementRef.current = ref.current;
            }}
            onMediaLoaded={(mediaSize) => {
              if (cropperImageSrc === TRANSPARENT_IMAGE_DATA_URL) {
                return;
              }
              const width = mediaSize.naturalWidth || mediaSize.width || themeChatImageViewerTokens.minViewportSizePx;
              const height = mediaSize.naturalHeight || mediaSize.height || themeChatImageViewerTokens.minViewportSizePx;
              const nextZoom = resolveInitialViewerZoom({
                mediaHeight: mediaSize.height || height,
                mediaWidth: mediaSize.width || width,
                naturalHeight: height,
                naturalWidth: width,
                viewportSize,
              });
              setAspectRatio(width / height);
              setImageSize({ width, height });
              setMediaSize({
                width: mediaSize.width || width,
                height: mediaSize.height || height,
                naturalWidth: width,
                naturalHeight: height,
              });
              setCrop({ x: themeCropperTokens.defaultCropX, y: themeCropperTokens.defaultCropY });
              setZoom(nextZoom);
              setMediaReady(true);
            }}
            onCropChange={setCrop}
            onZoomChange={(value) => setZoom(clampZoom(value))}
            style={{
              containerStyle: { backgroundColor: themeStyleResetTokens.backgroundTransparent },
              cropAreaStyle: {
                border: themeStyleResetTokens.borderNone,
                boxShadow: themeStyleResetTokens.boxShadowNone,
                color: themeStyleResetTokens.colorTransparent,
                outline: themeStyleResetTokens.outlineNone,
                background: themeStyleResetTokens.backgroundTransparent,
                pointerEvents: themeStyleResetTokens.pointerEventsNone,
              },
            }}
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[var(--vlaina-z-10)] flex justify-center">
          <div
            data-chat-image-viewer-control="true"
            className={cn(
              "pointer-events-auto inline-flex items-center gap-1 rounded-full px-2 py-2 text-[var(--vlaina-color-text-strong)]",
              raisedPopoverSurfaceClass
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label={t('chat.zoomOut')}
              data-no-focus-input="true"
              className={dialogActionIconButtonClassName}
              onMouseDown={stopViewerControlMouseDown}
              onClick={() => setZoom((value) => clampZoom(value - ZOOM_STEP))}
            >
              <Icon name="common.remove" size="md" />
            </button>
            <span className="min-w-[var(--vlaina-size-50px)] px-1.5 text-center text-xs font-semibold tabular-nums text-[var(--vlaina-color-text-strong)]">
              {percentLabel}
            </span>
            <button
              type="button"
              aria-label={t('chat.zoomIn')}
              data-no-focus-input="true"
              className={dialogActionIconButtonClassName}
              onMouseDown={stopViewerControlMouseDown}
              onClick={() => setZoom((value) => clampZoom(value + ZOOM_STEP))}
            >
              <Icon name="common.add" size="md" />
            </button>
            <div className="mx-1 h-6 w-px bg-[var(--vlaina-border)]" />
            {imageSizeLabel && (
              <span className="min-w-[var(--vlaina-size-78px)] px-3 text-center text-[var(--vlaina-font-11)] font-medium tabular-nums text-[var(--vlaina-color-text-soft)]">
                {imageSizeLabel}
              </span>
            )}
            <div className="mx-1 h-6 w-px bg-[var(--vlaina-border)]" />
            <button
              type="button"
              aria-label={t('chat.copyImage')}
              data-no-focus-input="true"
              data-action="copy"
              className={cn(
                dialogActionIconButtonClassName,
                copied && "text-[var(--vlaina-accent)] bg-[var(--vlaina-accent-soft)]"
              )}
              onMouseDown={stopViewerControlMouseDown}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleCopy();
              }}
            >
              <Icon name={copied ? "common.check" : "common.copy"} size="md" />
            </button>
            <button
              type="button"
              aria-label={t('chat.downloadImage')}
              data-no-focus-input="true"
              className={dialogActionIconButtonClassName}
              onMouseDown={stopViewerControlMouseDown}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void downloadImageWithPrompt(activeSrc, activeAlt).catch(() => undefined);
              }}
            >
              <Icon name="common.download" size="md" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
