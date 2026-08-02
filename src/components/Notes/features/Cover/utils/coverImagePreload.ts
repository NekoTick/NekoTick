import { loadImageWithDimensions } from './coverDimensionCache';
import {
  resolveCoverAssetUrl,
  shouldPreserveAssetAnimation,
} from './resolveCoverAssetUrl';

const COVER_DISPLAY_THUMBNAIL_MAX_EDGE_PX = 1280;
const ANIMATED_COVER_DIMENSION_PROBE_TOKEN = 'vlaina-dimension-probe=1';

export function getCoverDimensionProbeSrc(assetPath: string, resolvedSrc: string): string {
  if (!shouldPreserveAssetAnimation(assetPath)) return resolvedSrc;
  return `${resolvedSrc}${resolvedSrc.includes('#') ? '&' : '#'}${ANIMATED_COVER_DIMENSION_PROBE_TOKEN}`;
}

export function getCoverResolveOptions({
  url,
  notesRootPath,
  currentNotePath,
}: {
  url: string;
  notesRootPath: string;
  currentNotePath?: string;
}) {
  const preserveAnimation = shouldPreserveAssetAnimation(url);
  return {
    assetPath: url,
    notesRootPath,
    currentNotePath,
    thumbnail: !preserveAnimation,
    thumbnailMaxEdgePx: preserveAnimation ? undefined : COVER_DISPLAY_THUMBNAIL_MAX_EDGE_PX,
    replayAnimated: preserveAnimation,
    animatedPlaybackKey: currentNotePath,
  };
}

export async function preloadCoverImage({
  url,
  notesRootPath,
  currentNotePath,
}: {
  url: string;
  notesRootPath: string;
  currentNotePath?: string;
}): Promise<void> {
  const resolvedSrc = await resolveCoverAssetUrl(
    getCoverResolveOptions({ url, notesRootPath, currentNotePath }),
  );
  await loadImageWithDimensions(getCoverDimensionProbeSrc(url, resolvedSrc));
}
