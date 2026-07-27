import { useState, type IframeHTMLAttributes } from 'react';
import { useI18n } from '@/lib/i18n';
import { normalizePublicRemoteMediaUrl } from '@/lib/notes/markdown/urlSecurity';
import { cn } from '@/lib/utils';

type ChatRemoteIframeProps = Pick<
  IframeHTMLAttributes<HTMLIFrameElement>,
  'className' | 'height' | 'src' | 'style' | 'title' | 'width'
>;

export function ChatRemoteIframe({
  className,
  height,
  src,
  style,
  title,
  width,
}: ChatRemoteIframeProps) {
  const { t } = useI18n();
  const safeSrc = normalizePublicRemoteMediaUrl(src);
  const [approvedSrc, setApprovedSrc] = useState<string | null>(null);

  if (!safeSrc) return null;

  if (approvedSrc !== safeSrc) {
    return (
      <div
        className={cn(
          'my-4 flex min-h-[var(--vlaina-size-120px)] max-w-full items-center justify-center rounded-[var(--vlaina-radius-8px)] border border-[var(--vlaina-color-subtle-border)] bg-[var(--vlaina-color-overlay-weak)] p-3',
          className,
        )}
        style={style}
        data-chat-selection-excluded="true"
      >
        <button
          type="button"
          className="font-medium text-[var(--vlaina-accent)] underline decoration-[var(--vlaina-accent)]/45 underline-offset-4"
          onClick={() => setApprovedSrc(safeSrc)}
        >
          {t('chat.loadRemoteContent')}
        </button>
      </div>
    );
  }

  return (
    <iframe
      className={cn('max-w-full', className)}
      height={height}
      width={width}
      style={style}
      title={title || safeSrc}
      src={safeSrc}
      sandbox="allow-scripts"
      allow="fullscreen"
      allowFullScreen
      referrerPolicy="no-referrer"
      loading="lazy"
      data-chat-selection-excluded="true"
    />
  );
}
