import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { getStorageAdapter } from '@/lib/storage/adapter';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import {
    extractStoredAttachmentFilename,
    inferAttachmentMimeTypeFromFilename,
} from '@/lib/storage/attachmentUrl';
import { MAX_ATTACHMENT_IMAGE_BYTES } from '@/lib/storage/attachmentStorage';
import { getPrimaryAttachmentPath } from '@/lib/storage/attachmentPaths';
import { createBoundedAsyncQueue } from '@/lib/boundedAsyncQueue';
import { themeDomStyleTokens } from '@/styles/themeTokens';
import {
    isSvgDataUrl,
    rasterizeSvgDataUrlToPng,
} from './svgRasterize';
import { normalizeDirectChatImageSource } from './chatImageSourceResolution';

interface LocalImageProps {
    src: string;
    alt?: string;
    className?: string;
    'data-vlaina-crop'?: string;
    onClick?: () => void;
    onResolvedSrc?: (src: string | null) => void;
    style?: CSSProperties;
}

export const MAX_CONCURRENT_LOCAL_IMAGE_ATTACHMENT_READS = 4;
const LOCAL_IMAGE_ATTACHMENT_READ_TIMEOUT_MS = import.meta.env.MODE === 'test' ? 1000 : 15_000;

function createAbortError(): Error {
    const error = new Error('Local image attachment read aborted.');
    error.name = 'AbortError';
    return error;
}

const localImageAttachmentReadQueue = createBoundedAsyncQueue({
    concurrency: MAX_CONCURRENT_LOCAL_IMAGE_ATTACHMENT_READS,
    createAbortError,
    createTimeoutError: () => new Error('Local image attachment read timed out.'),
    timeoutMs: LOCAL_IMAGE_ATTACHMENT_READ_TIMEOUT_MS,
});

function uint8ArrayToBase64(data: Uint8Array): string {
    const CHUNK_SIZE = 0x8000;
    let binary = '';
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.subarray(i, i + CHUNK_SIZE);
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return window.btoa(binary);
}

async function normalizeDisplaySrc(src: string): Promise<string | null> {
    return isSvgDataUrl(src) ? await rasterizeSvgDataUrlToPng(src) : src;
}

function assertStoredAttachmentSize(size: number): void {
    if (!Number.isFinite(size) || size < 0 || size > MAX_ATTACHMENT_IMAGE_BYTES) {
        throw new Error('Attachment image is too large.');
    }
}

function assertReadableStoredAttachmentInfo(
    info: { isDirectory?: boolean; isFile?: boolean; size?: number } | null | undefined,
): void {
    if (
        info?.isFile === false ||
        info?.isDirectory === true ||
        (typeof info?.size === 'number' && (
            !Number.isFinite(info.size) ||
            info.size < 0 ||
            info.size > MAX_ATTACHMENT_IMAGE_BYTES
        ))
    ) {
        throw new Error('Attachment image is too large.');
    }
}

export function LocalImage({ src, alt, className, onClick, onResolvedSrc, style, 'data-vlaina-crop': cropData }: LocalImageProps) {
    const { t } = useI18n();
    const [displaySrc, setDisplaySrc] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const [approvedRemoteSrc, setApprovedRemoteSrc] = useState<string | null>(null);
    const onResolvedSrcRef = useRef(onResolvedSrc);
    const directSrc = normalizeDirectChatImageSource(src);
    const isRemoteImage = directSrc !== null && /^https?:\/\//i.test(directSrc);

    useEffect(() => {
        onResolvedSrcRef.current = onResolvedSrc;
    }, [onResolvedSrc]);

    useEffect(() => {
        let active = true;
        const abortController = new AbortController();
        setDisplaySrc(null);
        onResolvedSrcRef.current?.(null);
        setError(false);

        const loadLocalImage = async () => {
            try {
                if (directSrc) {
                    if (isRemoteImage && approvedRemoteSrc !== src) {
                        return;
                    }
                    const nextSrc = await normalizeDisplaySrc(directSrc);
                    if (!active) return;
                    if (!nextSrc) {
                        setError(true);
                        onResolvedSrcRef.current?.(null);
                        return;
                    }
                    setDisplaySrc(nextSrc);
                    onResolvedSrcRef.current?.(nextSrc);
                    return;
                }

                const filename = extractStoredAttachmentFilename(src);

                if (!filename) {
                    setError(true);
                    return;
                }

                const mime = inferAttachmentMimeTypeFromFilename(filename);
                if (!mime.startsWith('image/')) {
                    setError(true);
                    onResolvedSrcRef.current?.(null);
                    return;
                }

                const base64 = await localImageAttachmentReadQueue.run(async () => {
                    const storage = getStorageAdapter();
                    const basePath = await storage.getBasePath();
                    const nextAttachmentPath = await getPrimaryAttachmentPath(basePath, filename);
                    const info = await storage.stat(nextAttachmentPath).catch(() => null);
                    assertReadableStoredAttachmentInfo(info);
                    const data = await storage.readBinaryFile(nextAttachmentPath, MAX_ATTACHMENT_IMAGE_BYTES);
                    assertStoredAttachmentSize(data.byteLength);
                    return uint8ArrayToBase64(data);
                }, abortController.signal);

                const nextSrc = await normalizeDisplaySrc(`data:${mime};base64,${base64}`);
                if (!active) return;
                if (!nextSrc) {
                    setError(true);
                    onResolvedSrcRef.current?.(null);
                    return;
                }
                setDisplaySrc(nextSrc);
                onResolvedSrcRef.current?.(nextSrc);
            } catch {
                if (active) {
                    setError(true);
                    onResolvedSrcRef.current?.(null);
                }
            }
        };

        void loadLocalImage();

        return () => {
            active = false;
            abortController.abort();
        };
    }, [approvedRemoteSrc, directSrc, isRemoteImage, src]);

    if (isRemoteImage && approvedRemoteSrc !== src) {
        return (
            <button
                type="button"
                className={cn(
                    'inline-flex min-h-[var(--vlaina-size-96px)] min-w-[var(--vlaina-size-120px)] items-center justify-center rounded-[var(--vlaina-radius-8px)] border border-[var(--vlaina-color-subtle-border)] bg-[var(--vlaina-color-overlay-weak)] px-3 py-2 text-[var(--vlaina-font-xs)] font-medium text-[var(--vlaina-text-secondary)]',
                    className,
                )}
                style={style}
                onClick={() => setApprovedRemoteSrc(src)}
                data-chat-load-remote-image="true"
            >
                {t('chat.loadRemoteContent')}
            </button>
        );
    }

    if (error) {
        return (
            <span
                className={cn(
                    'inline-flex items-center justify-center text-xs text-[var(--vlaina-color-unavailable-fg)]',
                    className,
                )}
                style={{
                    minHeight: themeDomStyleTokens.localImageUnavailableSize,
                    minWidth: themeDomStyleTokens.localImageUnavailableSize,
                }}
            >
                {t('chat.imageUnavailable')}
            </span>
        );
    }
    if (!displaySrc) {
        return (
            <span
                aria-hidden="true"
                className={cn(
                    'inline-block bg-transparent',
                    className,
                )}
                style={{
                    minHeight: themeDomStyleTokens.localImageLoadingSize,
                    minWidth: themeDomStyleTokens.localImageLoadingSize,
                }}
            />
        );
    }

    const image = (
        <img
            src={displaySrc} 
            alt={alt} 
            className={cn(className, onClick && 'cursor-pointer')} 
            onError={() => setError(true)}
            style={style}
            data-vlaina-crop={cropData}
            referrerPolicy="no-referrer"
        />
    );

    if (!onClick) {
        return image;
    }

    return (
        <button
            type="button"
            aria-label={alt || t('common.preview')}
            className="inline-block max-w-full border-0 bg-transparent p-0 align-top focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vlaina-color-sidebar-focus-ring)]"
            onClick={onClick}
        >
            {image}
        </button>
    );
}
