import { useState, useEffect } from 'react';
import { loadImageAsBlob } from '@/lib/assets/io/reader';
import { hasInternalNoteAssetPathSegment } from '@/lib/assets/core/internalAssetPaths';
import { getStorageAdapter } from '@/lib/storage/adapter';
import { normalizePublicRemoteMediaUrl, sanitizeNoteMediaSrc } from '@/lib/notes/markdown/urlSecurity';
import { getImageSourceBase, getLocalImageSourcePath, isVirtualImageSource, resolveImageSourcePathCandidates } from '../utils/imageSourcePath';
import { getCachedRemoteImageSrc, resolveRemoteImageFromMemoryCache } from '../utils/remoteImageMemoryCache';
import { useImageCacheGeneration } from '@/hooks/useImageCacheGeneration';

interface UseLocalImageResult {
    resolvedSrc: string;
    isLoading: boolean;
    error: Error | null;
}

interface LocalImageState {
    key: string;
    src: string;
    isLoading: boolean;
    error: Error | null;
}

function canUseNotesRootlessLocalImageFallback(src: string): boolean {
    const localSrc = getLocalImageSourcePath(src);
    if (!localSrc || hasInternalNoteAssetPathSegment(localSrc)) {
        return false;
    }
    if (localSrc.startsWith('/') || /^[A-Za-z]:[\\/]/.test(localSrc)) {
        return false;
    }
    return !localSrc.split('/').some((segment) => segment === '..');
}

function getInitialResolvedImageSrc(rawSrc: string, enabled: boolean): string {
    if (!enabled || !rawSrc) {
        return '';
    }

    const baseSrc = getImageSourceBase(rawSrc);
    const safeBaseSrc = sanitizeNoteMediaSrc(baseSrc);
    if (!safeBaseSrc) {
        return '';
    }

    const normalizedRemoteSrc = normalizePublicRemoteMediaUrl(safeBaseSrc);
    if (normalizedRemoteSrc) {
        return getCachedRemoteImageSrc(normalizedRemoteSrc) ?? '';
    }

    return isVirtualImageSource(safeBaseSrc) ? safeBaseSrc : '';
}

export function useLocalImage(
    rawSrc: string,
    notesPath: string,
    currentNotePath: string | undefined,
    enabled = true
): UseLocalImageResult {
    const imageCacheGeneration = useImageCacheGeneration();
    const resolutionKey = `${imageCacheGeneration}\0${enabled ? '1' : '0'}\0${rawSrc}\0${notesPath}\0${currentNotePath ?? ''}`;
    const initialResolvedSrc = getInitialResolvedImageSrc(rawSrc, enabled);
    const initialState: LocalImageState = {
        key: resolutionKey,
        src: initialResolvedSrc,
        isLoading: enabled && !initialResolvedSrc,
        error: null,
    };
    const [imageState, setImageState] = useState<LocalImageState>(() => initialState);
    const currentImageState = imageState.key === resolutionKey ? imageState : initialState;
    const { src: resolvedSrc, isLoading, error } = currentImageState;

    useEffect(() => {
        let isMounted = true;

        const commitState = (state: Omit<LocalImageState, 'key'>) => {
            if (!isMounted) {
                return;
            }

            setImageState({
                key: resolutionKey,
                ...state,
            });
        };

        const commitLoading = (src = initialResolvedSrc) => {
            commitState({
                src,
                isLoading: true,
                error: null,
            });
        };

        const commitResolved = (src: string) => {
            commitState({
                src,
                isLoading: false,
                error: null,
            });
        };

        const commitError = (nextError: Error, src = '') => {
            commitState({
                src,
                isLoading: false,
                error: nextError,
            });
        };

        const resolveImage = async () => {
            if (!enabled) {
                commitResolved('');
                return;
            }

            if (!rawSrc) {
                commitResolved('');
                return;
            }

            try {
                const baseSrc = getImageSourceBase(rawSrc);
                const safeBaseSrc = sanitizeNoteMediaSrc(baseSrc);
                if (!safeBaseSrc) {
                    commitResolved('');
                    return;
                }

                const normalizedRemoteSrc = normalizePublicRemoteMediaUrl(safeBaseSrc);
                if (normalizedRemoteSrc) {
                    const cachedRemoteSrc = getCachedRemoteImageSrc(normalizedRemoteSrc);
                    if (cachedRemoteSrc) {
                        commitResolved(cachedRemoteSrc);
                        return;
                    }

                    commitLoading();
                    const resolvedRemoteSrc = await resolveRemoteImageFromMemoryCache(normalizedRemoteSrc);
                    commitResolved(resolvedRemoteSrc);
                    return;
                }

                if (isVirtualImageSource(safeBaseSrc)) {
                    commitResolved(safeBaseSrc);
                    return;
                }

                commitLoading();
                const candidatePaths = await resolveImageSourcePathCandidates({
                    rawSrc: safeBaseSrc,
                    notesPath,
                    currentNotePath,
                });

                if (candidatePaths.length > 0) {
                    let pathsToTry = candidatePaths;

                    if (candidatePaths.length > 1) {
                        const storage = getStorageAdapter();
                        const existingPaths: string[] = [];

                        for (const candidatePath of candidatePaths) {
                            if (await storage.exists(candidatePath).catch(() => false)) {
                                existingPaths.push(candidatePath);
                            }
                        }

                        if (existingPaths.length === 0) {
                            throw new Error(`Failed to resolve image: ${rawSrc}`);
                        }

                        pathsToTry = existingPaths;
                    }

                    let lastError: unknown = null;

                    for (const fullPath of pathsToTry) {
                        try {
                            const blobUrl = await loadImageAsBlob(fullPath);
                            commitResolved(blobUrl);
                            return;
                        } catch (err) {
                            lastError = err;
                        }
                    }

                    throw lastError ?? new Error(`Failed to load image: ${rawSrc}`);
                } else if (!notesPath && canUseNotesRootlessLocalImageFallback(safeBaseSrc)) {
                    commitResolved(baseSrc);
                } else if (isMounted) {
                    commitError(new Error(`Failed to resolve image: ${rawSrc}`));
                }
            } catch (err) {
                commitError(
                    err instanceof Error ? err : new Error('Unknown error loading image'),
                    notesPath ? '' : getImageSourceBase(rawSrc)
                );
            }
        };

        resolveImage();

        return () => {
            isMounted = false;
        };
    }, [rawSrc, notesPath, currentNotePath, enabled, resolutionKey, initialResolvedSrc]);

    return { resolvedSrc, isLoading, error };
}
