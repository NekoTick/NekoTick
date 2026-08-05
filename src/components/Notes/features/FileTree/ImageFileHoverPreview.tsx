import { useEffect, useState } from 'react';
import { loadImageAsBlob } from '@/lib/assets/io/reader';
import { resolveNotesRootRelativeFullPath } from '@/stores/notes/utils/fs/notesRootPathContainment';
import { themeFileTreeTokens } from '@/styles/themeTokens';
import { useImageFileHoverPreviewTarget } from './imageFileHoverPreviewState';
import { useImageCacheGeneration } from '@/hooks/useImageCacheGeneration';

const IMAGE_HOVER_PREVIEW_ACTIVE_ATTRIBUTE = 'data-image-file-hover-preview-active';

export function ImageFileHoverPreview() {
  const target = useImageFileHoverPreviewTarget();
  const imageCacheGeneration = useImageCacheGeneration();
  const [preview, setPreview] = useState<{
    imagePath: string;
    notesPath: string;
    src: string;
  } | null>(null);
  const activePreview = target
    && preview?.imagePath === target.imagePath
    && preview.notesPath === target.notesPath
    ? preview
    : null;

  useEffect(() => {
    if (!activePreview) {
      document.documentElement.removeAttribute(IMAGE_HOVER_PREVIEW_ACTIVE_ATTRIBUTE);
      return;
    }

    document.documentElement.setAttribute(IMAGE_HOVER_PREVIEW_ACTIVE_ATTRIBUTE, 'true');
    return () => {
      document.documentElement.removeAttribute(IMAGE_HOVER_PREVIEW_ACTIVE_ATTRIBUTE);
    };
  }, [activePreview]);

  useEffect(() => {
    if (!target) {
      setPreview(null);
      return;
    }

    let active = true;
    setPreview(null);
    const timer = window.setTimeout(() => {
      void resolveNotesRootRelativeFullPath(target.notesPath, target.imagePath)
        .then(({ fullPath }) => loadImageAsBlob(fullPath))
        .then((src) => {
          if (active) {
            setPreview({ ...target, src });
          }
        })
        .catch(() => {
          if (active) {
            setPreview(null);
          }
        });
    }, themeFileTreeTokens.imageHoverPreviewDelayMs);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [imageCacheGeneration, target]);

  if (!activePreview) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[var(--vlaina-z-30)] flex items-center justify-center bg-[var(--vlaina-bg-primary)] p-[var(--vlaina-size-32px)]"
      data-image-file-hover-preview="true"
    >
      <img
        src={activePreview.src}
        alt={activePreview.imagePath}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}
