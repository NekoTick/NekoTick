import { useCallback, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useToastStore } from '@/stores/useToastStore';
import { writeImageBlobToClipboard, writeTextToClipboard } from '@/lib/clipboard';
import { writeDesktopBinaryFile } from '@/lib/desktop/fs';
import { fetchBoundedImageBlobResult, MAX_FETCHED_IMAGE_BYTES } from '@/lib/markdown/fetchBoundedImageBlob';
import { isSvgImageMimeType } from '@/lib/markdown/svgRasterize';
import { saveDialog } from '@/lib/storage/dialog';
import { ensureImageFileExists } from '../utils/fileUtils';
import { EditorView } from '@milkdown/kit/prose/view';
import { Node } from '@milkdown/kit/prose/model';
import { deleteImageNodeAtPos } from '../commands/imageNodeCommands';
import type { CropArea, ImageNodeAttrs } from '../types';
import type { CropParams } from '../utils/imageSourceFragment';
import {
    createImageDownloadDefaultName,
    getImageActionResourceSrc,
    isBlobByteLengthWithinLimit,
    isLikelySvgImageSource,
    normalizeActionImageBlob,
    readBlobBytes,
    readLocalActionImageBlob,
} from './imageActionResources';

export { createImageDownloadDefaultName } from './imageActionResources';

function isValidCropArea(value: CropArea): boolean {
    return Number.isFinite(value.x)
        && Number.isFinite(value.y)
        && Number.isFinite(value.width)
        && Number.isFinite(value.height)
        && value.width > 0
        && value.height > 0;
}

function isImageEditTargetStillCurrent(
    view: EditorView,
    originalDoc: EditorView['state']['doc'] | undefined,
): boolean {
    if (view.dom?.isConnected === false) {
        return false;
    }

    const currentDoc = view.state?.doc as { eq?: (other: unknown) => boolean } | undefined;
    if (typeof currentDoc?.eq === 'function' && originalDoc && !currentDoc.eq(originalDoc)) {
        return false;
    }

    return true;
}

interface UseImageActionsProps {
    node: Node;
    view: EditorView;
    getPos: () => number | undefined;
    baseSrc: string;
    resolvedSrc?: string;
    notesPath: string;
    currentNotePath?: string;
    updateNodeAttrs: (attrs: ImageNodeAttrs) => void;
    markImageUserInput: () => void;
    setCropParams: (params: CropParams | null) => void;
    setIsActive: (active: boolean) => void;
    setHeight: (h: number | undefined) => void;
}

export function useImageActions({
    node, view, getPos,
    baseSrc, resolvedSrc,
    notesPath, currentNotePath,
    updateNodeAttrs, markImageUserInput, setCropParams, setIsActive, setHeight
}: UseImageActionsProps) {
    const { t } = useI18n();
    const addToast = useToastStore((state) => state.addToast);
    const [isSaving, setIsSaving] = useState(false);
    const nodeSrc = typeof node.attrs.src === 'string' ? node.attrs.src : '';
    const nodeAlt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';

    const restoreIfNeeded = useCallback(async () => {
        if (baseSrc && resolvedSrc) {
            await ensureImageFileExists(baseSrc, resolvedSrc, notesPath, currentNotePath);
        }
    }, [baseSrc, resolvedSrc, notesPath, currentNotePath]);

    const handleSave = async (percentageCrop: CropArea, ratio: number) => {
        try {
            if (!isValidCropArea(percentageCrop) || !Number.isFinite(ratio) || ratio <= 0) {
                addToast(t('editor.invalidCropState'), 'error');
                return;
            }

            setIsSaving(true);
            markImageUserInput();
            const originalDoc = view.state?.doc;
            await restoreIfNeeded();
            if (!isImageEditTargetStillCurrent(view, originalDoc)) {
                return;
            }
            const cropParams = {
                x: percentageCrop.x, 
                y: percentageCrop.y, 
                width: percentageCrop.width, 
                height: percentageCrop.height, 
                ratio 
            };
            setCropParams(cropParams);
            updateNodeAttrs({ src: baseSrc, crop: cropParams });
            setIsActive(false);
            setHeight(undefined);
        } catch (error) {
            addToast(t('editor.updateViewFailed'), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCopy = async () => {
        try {
            await restoreIfNeeded();
            const localImage = await readLocalActionImageBlob(baseSrc, notesPath, currentNotePath);
            if (localImage.status === 'too-large') {
                return false;
            }
            if (localImage.status === 'ok') {
                const blob = await normalizeActionImageBlob(localImage.blob);
                if (!blob) {
                    return writeTextToClipboard(nodeSrc);
                }
                return writeImageBlobToClipboard(blob);
            }

            const resourceSrc = getImageActionResourceSrc(baseSrc, resolvedSrc);
            if (resourceSrc) {
                const result = await fetchBoundedImageBlobResult(resourceSrc);
                if (result.status === 'too-large') {
                    return false;
                }
                const blob = await normalizeActionImageBlob(result.blob);
                if (!blob) {
                    return writeTextToClipboard(nodeSrc);
                }
                return writeImageBlobToClipboard(blob);
            } else {
                return writeTextToClipboard(nodeSrc);
            }
        } catch {
            return false;
        }
    };

    const handleDownload = async () => {
        const resourceSrc = getImageActionResourceSrc(baseSrc, resolvedSrc);
        if (!resourceSrc) return;
        let allowAnchorFallback = !isLikelySvgImageSource(baseSrc) && !isLikelySvgImageSource(resourceSrc);
        try {
            await restoreIfNeeded();
            const defaultName = createImageDownloadDefaultName(nodeAlt || 'image', baseSrc);
            const filePath = await saveDialog({ defaultPath: defaultName, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'webp'] }] });
            if (!filePath) return;
            const result = await fetchBoundedImageBlobResult(resourceSrc);
            if (result.status === 'too-large') return;
            if (isSvgImageMimeType(result.blob.type)) {
                allowAnchorFallback = false;
            }
            const blob = await normalizeActionImageBlob(result.blob);
            if (!blob) return;
            const bytes = await readBlobBytes(blob);
            if (!isBlobByteLengthWithinLimit(bytes.byteLength, MAX_FETCHED_IMAGE_BYTES)) return;
            await writeDesktopBinaryFile(filePath, bytes);
        } catch {
            if (!allowAnchorFallback) return;
            const link = document.createElement('a');
            link.href = resourceSrc;
            link.download = nodeAlt || 'image';
            document.body.appendChild(link);
            try {
                link.click();
            } finally {
                link.parentNode?.removeChild(link);
            }
        }
    };

    const handleDelete = () => {
        const pos = getPos();
        if (pos !== undefined) {
            markImageUserInput();
            deleteImageNodeAtPos(view, pos);
        }
    };

    return {
        isSaving,
        handleSave,
        handleCopy,
        handleDownload,
        handleDelete,
        restoreIfNeeded
    };
}
