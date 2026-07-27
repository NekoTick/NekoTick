import { useEffect, useState } from 'react';
import { LocalImage } from '@/components/Chat/common/LocalImage';
import { Icon } from '@/components/ui/icons';
import { cn, iconButtonStyles } from '@/lib/utils';
import { copyImageSourceToClipboard } from '@/components/Chat/common/messageClipboard';
import { downloadImageWithPrompt } from '@/components/Chat/common/imageDownload';
import { LazyChatImageViewer } from './components/LazyChatImageViewer';
import { normalizeImageWidth, serializeCropValue } from '@/components/common/markdown/imageSourceFragment';
import { useI18n } from '@/lib/i18n';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import { useToastStore } from '@/stores/useToastStore';

export type ImageGalleryItem = { id: string; src: string };

async function copyImageOrUrl(src: string): Promise<boolean> {
  return copyImageSourceToClipboard(src);
}

function stopImageControlMouseDown(event: React.MouseEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
}

export function MarkdownImage({
  src,
  alt,
  imageGallery,
  getImageGallery,
  currentImageId,
  align,
  width,
  crop,
}: {
  align?: string;
  alt?: string;
  currentImageId?: string;
  crop?: string | null;
  getImageGallery?: () => ImageGalleryItem[];
  imageGallery?: ImageGalleryItem[];
  src: string;
  width?: string | null;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [resolvedImageSrc, setResolvedImageSrc] = useState<string | null>(null);
  const addToast = useToastStore((state) => state.addToast);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), themeUiFeedbackTokens.copyFeedbackDurationMs);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      const didCopy = await copyImageOrUrl(src);
      setCopied(didCopy);
      if (!didCopy) {
        addToast(t('chat.copyImageFailed'), 'error');
      }
    } catch {
      setCopied(false);
      addToast(t('chat.copyImageFailed'), 'error');
    }
  };

  const gallery = getImageGallery ? getImageGallery() : imageGallery;
  const normalizedAlign = align === 'left' || align === 'right' || align === 'center' ? align : 'center';
  const justifyClass = normalizedAlign === 'left'
    ? 'justify-start'
    : normalizedAlign === 'right'
      ? 'justify-end'
      : 'justify-center';
  const safeWidth = normalizeImageWidth(width);
  const safeCrop = serializeCropValue(crop);

  return (
    <span
      className={cn('flex max-w-full select-none', justifyClass)}
      data-chat-selection-excluded="true"
      data-no-focus-input="true"
    >
      <span className="group relative inline-block max-w-full select-none align-top">
        <LocalImage
          src={src}
          alt={alt || 'image'}
          className="block max-h-[var(--vlaina-size-420px)] w-auto max-w-full select-none object-contain"
          style={safeWidth ? { width: safeWidth } : undefined}
          data-vlaina-crop={safeCrop || undefined}
          onResolvedSrc={setResolvedImageSrc}
          onClick={() => {
            setIsViewerOpen(true);
          }}
        />
        {resolvedImageSrc ? <span
          className="absolute right-2 top-2 z-[var(--vlaina-z-10)] flex items-center gap-1 opacity-[var(--vlaina-opacity-0)] transition-opacity duration-[var(--vlaina-duration-150)] group-hover:opacity-[var(--vlaina-opacity-100)] group-focus-within:opacity-[var(--vlaina-opacity-100)]"
          data-no-focus-input="true"
        >
          <button
            type="button"
            data-no-focus-input="true"
            data-action="copy"
            aria-label={t('chat.copyImage')}
            onMouseDown={stopImageControlMouseDown}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void handleCopy();
            }}
            className={cn('toolbar-btn', copied && 'active')}
          >
            <Icon name={copied ? 'common.check' : 'common.copy'} size="md" />
          </button>
          <button
            type="button"
            data-no-focus-input="true"
            aria-label={t('chat.downloadImage')}
            onMouseDown={stopImageControlMouseDown}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void downloadImageWithPrompt(src, alt).catch(() => undefined);
            }}
            className={cn('p-1.5', iconButtonStyles)}
          >
            <Icon name="common.download" size="md" />
          </button>
        </span> : null}
      </span>
      {isViewerOpen ? (
        <LazyChatImageViewer
          open={isViewerOpen}
          src={src}
          alt={alt}
          gallery={gallery}
          currentImageId={currentImageId}
          previewSrc={resolvedImageSrc}
          onOpenChange={setIsViewerOpen}
        />
      ) : null}
    </span>
  );
}
