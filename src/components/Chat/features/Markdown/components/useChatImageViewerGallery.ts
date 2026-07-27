import { useEffect, useMemo, useState } from "react";
import { MAX_CHAT_MESSAGE_IMAGE_SOURCES } from "@/components/Chat/common/messageClipboard";
import {
  getInitialDirectViewerImageSource,
  getInitialViewerImageSource,
  requiresAttachmentResolution,
  resolveViewerImageSource,
  TRANSPARENT_IMAGE_DATA_URL,
  warmViewerImageSource,
} from "./chatImageViewerSource";

const MAX_COMPARABLE_IMAGE_SRC_DECODE_CHARS = 4096;

function normalizeComparableSrc(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > MAX_COMPARABLE_IMAGE_SRC_DECODE_CHARS) {
    return trimmed;
  }
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function useChatImageViewerGallery({
  currentImageId,
  gallery,
  open,
  previewSrc,
  src,
}: {
  currentImageId?: string;
  gallery?: Array<{ id: string; src: string }>;
  open: boolean;
  previewSrc?: string | null;
  src: string;
}) {
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(-1);
  const [resolvedActiveSrc, setResolvedActiveSrc] = useState(() => (
    open ? getInitialViewerImageSource(src) : TRANSPARENT_IMAGE_DATA_URL
  ));
  const boundedGallery = useMemo(() => {
    if (!gallery) {
      return undefined;
    }
    return gallery.length > MAX_CHAT_MESSAGE_IMAGE_SOURCES
      ? gallery.slice(0, MAX_CHAT_MESSAGE_IMAGE_SOURCES)
      : gallery;
  }, [gallery]);

  const galleryIndex = useMemo(() => {
    if (!open) {
      return -1;
    }
    if (!boundedGallery || boundedGallery.length === 0) {
      return -1;
    }
    if (currentImageId) {
      const byId = boundedGallery.findIndex((item) => item.id === currentImageId);
      if (byId !== -1) {
        return byId;
      }
    }
    const normalizedSrc = normalizeComparableSrc(src);
    for (let index = 0; index < boundedGallery.length; index += 1) {
      if (normalizeComparableSrc(boundedGallery[index]!.src) === normalizedSrc) {
        return index;
      }
    }
    return -1;
  }, [boundedGallery, currentImageId, open, src]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setActiveGalleryIndex(galleryIndex);
  }, [galleryIndex, open]);

  const activeGalleryItem =
    boundedGallery && activeGalleryIndex >= 0 && activeGalleryIndex < boundedGallery.length
      ? boundedGallery[activeGalleryIndex]
      : null;
  const activeSrc = activeGalleryItem?.src ?? src;
  const canNavigate = !!boundedGallery && boundedGallery.length > 1 && activeGalleryIndex >= 0;
  const hasPrevious = canNavigate && activeGalleryIndex > 0;
  const hasNext = canNavigate && activeGalleryIndex < boundedGallery.length - 1;
  const cropperImageSrc =
    requiresAttachmentResolution(activeSrc) && resolvedActiveSrc === activeSrc
      ? TRANSPARENT_IMAGE_DATA_URL
      : resolvedActiveSrc;

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    const isStoredAttachmentSource = requiresAttachmentResolution(activeSrc);
    const immediateSrc = activeSrc === src && previewSrc
      ? getInitialDirectViewerImageSource(previewSrc) ?? TRANSPARENT_IMAGE_DATA_URL
      : isStoredAttachmentSource
        ? activeSrc
        : getInitialDirectViewerImageSource(activeSrc) ?? TRANSPARENT_IMAGE_DATA_URL;
    setResolvedActiveSrc(immediateSrc);

    resolveViewerImageSource(activeSrc)
      .then((resolvedSrc) => {
        if (active) {
          setResolvedActiveSrc(resolvedSrc ?? TRANSPARENT_IMAGE_DATA_URL);
        }
      })
      .catch(() => {
        if (active) {
          setResolvedActiveSrc(TRANSPARENT_IMAGE_DATA_URL);
        }
      });

    return () => {
      active = false;
    };
  }, [activeSrc, open, previewSrc, src]);

  useEffect(() => {
    if (!open || !boundedGallery || activeGalleryIndex < 0) {
      return;
    }

    warmViewerImageSource(boundedGallery[activeGalleryIndex - 1]?.src);
    warmViewerImageSource(boundedGallery[activeGalleryIndex + 1]?.src);
  }, [activeGalleryIndex, boundedGallery, open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && hasPrevious) {
        event.preventDefault();
        setActiveGalleryIndex((value) => Math.max(value - 1, 0));
        return;
      }
      if (event.key === "ArrowRight" && hasNext) {
        event.preventDefault();
        setActiveGalleryIndex((value) => Math.min(value + 1, (boundedGallery?.length ?? 1) - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [boundedGallery?.length, hasNext, hasPrevious, open]);

  return {
    activeGalleryIndex,
    activeSrc,
    boundedGallery,
    cropperImageSrc,
    hasNext,
    hasPrevious,
    setActiveGalleryIndex,
  };
}
