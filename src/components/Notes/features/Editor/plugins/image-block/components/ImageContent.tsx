import { lazy, Suspense, useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Icon } from '@/components/ui/icons';
import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getCropViewStyles } from '../utils/cropGeometry';
import type { CropParams } from '../utils/imageSourceFragment';
import type { CropArea, LoadedMediaSize, CropperViewportState, ResizeDirection } from '../types';

const LazyImageCropper = lazy(async () => {
    const mod = await import('./ImageCropper');
    return { default: mod.ImageCropper };
});

const LOADED_IMAGE_SRC_CACHE_LIMIT = 300;
const loadedImageSrcs = new Set<string>();

function hasLoadedImageSrc(src: string | undefined): boolean {
    return Boolean(src && loadedImageSrcs.has(src));
}

function rememberLoadedImageSrc(src: string | undefined): void {
    if (!src) return;

    if (loadedImageSrcs.has(src)) {
        loadedImageSrcs.delete(src);
    }

    loadedImageSrcs.add(src);
    while (loadedImageSrcs.size > LOADED_IMAGE_SRC_CACHE_LIMIT) {
        const oldestSrc = loadedImageSrcs.values().next().value;
        if (!oldestSrc) break;
        loadedImageSrcs.delete(oldestSrc);
    }
}

interface ImageContentProps {
    isLoading: boolean;
    loadError: boolean;
    sourceSrc?: string;
    sourceAlt?: string;
    resolvedSrc?: string;
    isRemoteImageSource: boolean;
    isDeferred: boolean;
    cropParams: CropParams | null;
    containerSize: { width: number; height: number };
    isSaving: boolean;
    isActive: boolean;
    onSave: (percentageCrop: CropArea, ratio: number) => void;
    onCancel: () => void;
    onResizeStart: (direction: ResizeDirection) => (e: React.MouseEvent) => void;
    onMediaLoaded: (media: LoadedMediaSize) => void;
    onMediaErrorChange?: (hasError: boolean) => void;
    onStateChange?: (state: CropperViewportState) => void;
}

export const ImageContent = ({
    isLoading,
    loadError,
    sourceSrc,
    sourceAlt,
    resolvedSrc,
    isRemoteImageSource,
    isDeferred,
    cropParams,
    containerSize,
    isSaving,
    isActive,
    onSave,
    onCancel,
    onResizeStart,
    onMediaLoaded,
    onMediaErrorChange,
    onStateChange
}: ImageContentProps) => {
    const { t } = useI18n();
    const [mediaError, setMediaError] = useState(false);
    const [isImageLoaded, setIsImageLoaded] = useState(() => hasLoadedImageSrc(resolvedSrc));
    const pendingRemoteLoadCleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        pendingRemoteLoadCleanupRef.current?.();
        pendingRemoteLoadCleanupRef.current = null;
        setMediaError(false);
        setIsImageLoaded(hasLoadedImageSrc(resolvedSrc));
        onMediaErrorChange?.(false);
        return () => {
            pendingRemoteLoadCleanupRef.current?.();
            pendingRemoteLoadCleanupRef.current = null;
        };
    }, [onMediaErrorChange, resolvedSrc]);

    const handleMediaError = useCallback(() => {
        pendingRemoteLoadCleanupRef.current?.();
        pendingRemoteLoadCleanupRef.current = null;
        setMediaError(true);
        onMediaErrorChange?.(true);
    }, [onMediaErrorChange]);

    const handleRemoteMediaLoaded = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
        const image = event.currentTarget;
        const media = {
            width: image.width,
            height: image.height,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
        };
        const commit = () => {
            pendingRemoteLoadCleanupRef.current = null;
            rememberLoadedImageSrc(resolvedSrc);
            setIsImageLoaded(true);
            onMediaLoaded(media);
        };
        const scrollRoot = image.closest<HTMLElement>('[data-note-scroll-root="true"]');
        const ownerWindow = image.ownerDocument.defaultView;
        if (scrollRoot?.dataset.overlayScrollbarInteracting !== 'true' || !ownerWindow) {
            commit();
            return;
        }

        const handleScrollIdle = () => {
            if (scrollRoot.dataset.overlayScrollbarInteracting === 'true') return;
            ownerWindow.removeEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleScrollIdle);
            commit();
        };
        pendingRemoteLoadCleanupRef.current?.();
        pendingRemoteLoadCleanupRef.current = () => {
            ownerWindow.removeEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleScrollIdle);
        };
        ownerWindow.addEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleScrollIdle);
    }, [onMediaLoaded, resolvedSrc]);

    const shouldRenderPlainRemoteImage = isRemoteImageSource && !isActive && !cropParams;
    const shouldRenderCropPreview = !isActive && !!cropParams;
    const cropPreviewStyles = cropParams ? getCropViewStyles(cropParams) : null;
    const imageThemeAttrs = {
        'data-src': sourceSrc || undefined,
        'data-inject-url': sourceSrc || undefined,
        alt: sourceAlt ?? '',
        referrerPolicy: 'no-referrer' as const,
    };

    if (isDeferred) {
        return (
            <div
                data-testid="deferred-image-placeholder"
                data-image-selection-surface="true"
                className="w-full h-full min-h-[var(--vlaina-size-100px)] flex items-center justify-center bg-[var(--vlaina-color-editor-image-surface)] border border-dashed border-[var(--vlaina-color-editor-image-border)] rounded-md"
            >
                <Icon name="file.image" className="size-6 text-[var(--vlaina-color-editor-image-placeholder)]" />
            </div>
        );
    }

    if (isLoading || !resolvedSrc) {
        return (
            <div
                data-image-selection-surface="true"
                className="w-full h-full min-h-[var(--vlaina-size-100px)] flex flex-col items-center justify-center bg-[var(--vlaina-color-editor-image-surface)] rounded-md"
            >
                <div className="size-6 border-2 border-[var(--vlaina-color-editor-image-placeholder)] border-t-[var(--vlaina-accent)] rounded-full animate-spin" />
            </div>
        );
    }

    if (loadError || mediaError) {
        return (
            <div className="w-full h-full min-h-[var(--vlaina-size-100px)] flex flex-col items-center justify-center border border-dashed border-[var(--vlaina-color-editor-image-border)] rounded-md text-[var(--vlaina-color-editor-image-placeholder)]">
                <Icon name="file.brokenImage" className="size-8 mb-2 opacity-[var(--vlaina-opacity-50)]" />
                <span className="text-xs font-medium">{t('editor.imageNotFound')}</span>
            </div>
        );
    }

    if (shouldRenderPlainRemoteImage) {
        return (
            <div
                data-image-selection-surface="true"
                className={cn(
                    'relative w-full overflow-hidden rounded-md bg-[var(--vlaina-color-editor-image-surface)]',
                    !isImageLoaded && 'min-h-[var(--vlaina-size-100px)]'
                )}
            >
                {!isImageLoaded ? (
                    <div
                        data-testid="remote-image-placeholder"
                        aria-hidden="true"
                        className="absolute inset-0 flex items-center justify-center border border-dashed border-[var(--vlaina-color-editor-image-border)]"
                    >
                        <div className="size-6 rounded-full border-2 border-[var(--vlaina-color-editor-image-placeholder)] border-t-[var(--vlaina-accent)]" />
                    </div>
                ) : null}
                <img
                    {...imageThemeAttrs}
                    src={resolvedSrc}
                    draggable={false}
                    className={cn(
                        'max-w-full select-none object-contain transition-opacity duration-[var(--vlaina-duration-150)]',
                        isImageLoaded
                            ? 'block h-auto opacity-[var(--vlaina-opacity-100)]'
                            : 'absolute inset-0 h-full w-full opacity-[var(--vlaina-opacity-0)]'
                    )}
                    onLoad={handleRemoteMediaLoaded}
                    onError={handleMediaError}
                />
            </div>
        );
    }

    if (shouldRenderCropPreview && cropPreviewStyles) {
        return (
            <div
                className="relative h-full w-full overflow-hidden"
                style={cropPreviewStyles.container}
            >
                <img
                    {...imageThemeAttrs}
                    src={resolvedSrc}
                    draggable={false}
                    className="select-none"
                    style={cropPreviewStyles.image}
                    onLoad={(event) => {
                        const image = event.currentTarget;
                        rememberLoadedImageSrc(resolvedSrc);
                        onMediaLoaded({
                            width: image.width,
                            height: image.height,
                            naturalWidth: image.naturalWidth,
                            naturalHeight: image.naturalHeight,
                        });
                    }}
                    onError={handleMediaError}
                />
            </div>
        );
    }

    return (
        <Suspense
            fallback={(
                <div
                    data-image-selection-surface="true"
                    className="relative h-full w-full overflow-hidden rounded-md bg-[var(--vlaina-color-editor-image-surface)]"
                >
                    <img
                        {...imageThemeAttrs}
                        src={resolvedSrc}
                        draggable={false}
                        className="block h-full w-full select-none object-contain"
                    />
                </div>
            )}
        >
            <LazyImageCropper
                imageSrc={resolvedSrc!}
                sourceSrc={sourceSrc}
                sourceAlt={sourceAlt}
                initialCropParams={cropParams}
                containerSize={containerSize}
                onSave={onSave}
                onCancel={onCancel}
                isSaving={isSaving}
                isActive={isActive}
                onResizeStart={onResizeStart}
                onMediaLoaded={onMediaLoaded}
                onStateChange={onStateChange}
            />
        </Suspense>
    );
};

export const __testing__ = {
    clearLoadedImageSrcCache() {
        loadedImageSrcs.clear();
    },
    rememberLoadedImageSrc,
};
