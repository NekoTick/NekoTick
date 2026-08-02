import { useState } from 'react';
import { ReadOnlyVideoBlock } from '@/components/common/markdown/ReadOnlyVideoBlock';
import { parseVideoUrl } from '@/lib/markdown/videoUrl';
import { normalizePublicRemoteMediaUrl } from '@/lib/notes/markdown/urlSecurity';
import { useI18n } from '@/lib/i18n';

export function ChatRemoteVideoBlock({ src, title }: { src: string; title?: string }) {
  const { t } = useI18n();
  const parsed = parseVideoUrl(src);
  const remoteSrc = parsed?.type === 'direct'
    ? normalizePublicRemoteMediaUrl(parsed.embedUrl)
    : null;
  const [approvedSrc, setApprovedSrc] = useState<string | null>(null);

  if (!remoteSrc) {
    return <ReadOnlyVideoBlock src={src} title={title} />;
  }

  if (approvedSrc !== remoteSrc) {
    return (
      <div
        className="video-block"
        data-type="video"
        data-chat-selection-excluded="true"
      >
        <button
          type="button"
          className="video-external-action"
          onClick={() => setApprovedSrc(remoteSrc)}
        >
          {t('chat.loadRemoteContent')}
        </button>
      </div>
    );
  }

  return <ReadOnlyVideoBlock src={remoteSrc} title={title} />;
}
