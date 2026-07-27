import { getElectronBridge } from '@/lib/electron/bridge';
import { normalizeContainedAssetPath } from '@/lib/assets/core/pathContainment';
import { normalizeRenderableDataImageSrc } from '@/lib/markdown/renderableImagePolicy';
import { getStorageAdapter, joinPath } from './adapter';
import {
    extractStoredAttachmentFilename,
    inferAttachmentMimeTypeFromFilename,
    sanitizeAttachmentFilename,
} from './attachmentUrl';
import {
    getPrimaryAttachmentDir,
    getPrimaryAttachmentPath,
} from './attachmentPaths';
import {
    assertAttachmentImageSize,
    assertAttachmentTextSize,
    assertReadableAttachmentInfo,
    decodeAttachmentTextBytes,
    getAttachmentFilename,
    normalizeAttachmentFileType,
    prepareAttachmentImageBytes,
} from './attachmentStorageMime';
import {
    dataUrlToBytes,
    encodeAttachmentDataUrl,
    inferDataUrlExtension,
    isAttachmentDataUrlWithinSizeLimit,
    prepareAttachmentOutputBytes,
    sanitizeInlineAttachmentDataUrl,
    uint8ArrayToBase64,
} from './attachmentStorageDataUrl';
import {
    MAX_ATTACHMENT_IMAGE_BYTES,
    type Attachment,
    type ConvertAttachmentOptions,
    type SaveAttachmentOptions,
} from './attachmentStorageTypes';

export type { Attachment, ConvertAttachmentOptions, SaveAttachmentOptions } from './attachmentStorageTypes';
export {
    MAX_ATTACHMENT_IMAGE_BYTES,
    MAX_ATTACHMENT_TEXT_BYTES,
    MAX_ATTACHMENT_TEXT_CHARS,
    SUPPORTED_ATTACHMENT_IMAGE_INPUT_ACCEPT,
    SUPPORTED_ATTACHMENT_INPUT_ACCEPT,
} from './attachmentStorageTypes';
export { isAttachmentDataUrlWithinSizeLimit } from './attachmentStorageDataUrl';

export function createStoredAttachmentFromSource(src: string, id = 'stored-attachment'): Attachment | null {
    const filename = extractStoredAttachmentFilename(src);
    if (!filename) {
        return null;
    }
    const type = inferAttachmentMimeTypeFromFilename(filename);
    if (!type.startsWith('image/')) {
        return null;
    }

    const trimmed = src.trim();
    return {
        id,
        path: '',
        previewUrl: trimmed,
        assetUrl: trimmed,
        name: filename,
        type,
        size: 0,
    };
}

function getPathApi() {
    const bridge = getElectronBridge();
    return bridge?.path ?? null;
}

async function buildAttachmentAssetUrl(absolutePath: string, previewUrl: string): Promise<string> {
    const pathApi = getPathApi();
    if (!pathApi || !absolutePath) {
        return previewUrl;
    }

    return await pathApi.toFileUrl(absolutePath);
}

function isSameNormalizedPath(leftPath: string, rightPath: string): boolean {
    return (
        normalizeContainedAssetPath(leftPath, rightPath) !== null &&
        normalizeContainedAssetPath(rightPath, leftPath) !== null
    );
}

async function resolvePrimaryAttachmentFilePath(path: string): Promise<string | null> {
    const attachmentPath = path.trim();
    const filename = sanitizeAttachmentFilename(attachmentPath.split(/[\\/]/).pop() ?? '');
    if (!filename) {
        return null;
    }

    const storage = getStorageAdapter();
    const basePath = await storage.getBasePath();
    const attachmentDir = await getPrimaryAttachmentDir(basePath);
    const containedPath = normalizeContainedAssetPath(attachmentPath, attachmentDir);
    if (!containedPath) {
        return null;
    }

    const expectedPath = normalizeContainedAssetPath(
        await getPrimaryAttachmentPath(basePath, filename),
        attachmentDir,
    );
    if (!expectedPath || !isSameNormalizedPath(containedPath, expectedPath)) {
        return null;
    }

    return containedPath;
}

async function readFileBytes(file: File): Promise<Uint8Array> {
    if (typeof file.arrayBuffer === 'function') {
        return new Uint8Array(await file.arrayBuffer());
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (result instanceof ArrayBuffer) {
                resolve(new Uint8Array(result));
                return;
            }
            reject(new Error('Failed to read attachment bytes'));
        };
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read attachment bytes'));
        reader.onabort = () => reject(new Error('Attachment file read was aborted'));
        reader.readAsArrayBuffer(file);
    });
}

export async function saveAttachment(file: File, options: SaveAttachmentOptions = {}): Promise<Attachment> {
    const normalizedType = normalizeAttachmentFileType(file);
    if (!normalizedType) {
        throw new Error('Unsupported attachment type');
    }
    const { kind, mimeType } = normalizedType;
    if (kind === 'image') {
        assertAttachmentImageSize(file.size);
    } else {
        assertAttachmentTextSize(file.size);
    }

    const rawBytes = await readFileBytes(file);
    const bytes = kind === 'image' ? prepareAttachmentImageBytes(rawBytes, mimeType) : rawBytes;
    let previewUrl = '';
    let textContent: string | undefined;
    if (kind === 'image') {
        assertAttachmentImageSize(bytes.byteLength);
        previewUrl = `data:${mimeType};base64,${uint8ArrayToBase64(bytes)}`;
    } else {
        assertAttachmentTextSize(bytes.byteLength);
        textContent = decodeAttachmentTextBytes(bytes);
    }
    let absolutePath = '';
    let assetUrl = '';

    const storage = getStorageAdapter();

    if (options.persist !== false) {
        try {
            const appDataPath = await storage.getBasePath();
            const dirPath = await getPrimaryAttachmentDir(appDataPath);

            if (!(await storage.exists(dirPath))) {
                await storage.mkdir(dirPath, true);
            }

            const filename = getAttachmentFilename(file.name, mimeType, kind);
            absolutePath = await joinPath(dirPath, filename);
            await storage.writeBinaryFile(absolutePath, bytes, { recursive: true });
            assetUrl = await buildAttachmentAssetUrl(absolutePath, previewUrl);
        } catch (e) {
        }
    }

    return {
        id: crypto.randomUUID(),
        path: absolutePath,
        previewUrl,
        assetUrl,
        name: file.name,
        type: mimeType,
        size: file.size,
        ...(textContent !== undefined ? { textContent } : {}),
    };
}

export async function deleteAttachment(attachment: Attachment): Promise<void> {
    const storage = getStorageAdapter();
    const attachmentPath = attachment.path?.trim();
    if (attachmentPath) {
        const managedPath = await resolvePrimaryAttachmentFilePath(attachmentPath);
        if (managedPath) {
            await storage.deleteFile(managedPath).catch(() => {});
            return;
        }
    }

    const storedFilename =
        extractStoredAttachmentFilename(attachment.previewUrl) ||
        extractStoredAttachmentFilename(attachment.assetUrl);
    if (!storedFilename) {
        return;
    }

    await deleteStoredAttachmentFile(storedFilename);
}

export async function deleteStoredAttachmentFile(filename: string): Promise<void> {
    const safeFilename = sanitizeAttachmentFilename(filename);
    if (!safeFilename) {
        return;
    }
    const storage = getStorageAdapter();
    const basePath = await storage.getBasePath();
    await storage.deleteFile(await getPrimaryAttachmentPath(basePath, safeFilename)).catch(() => {});
}

export async function persistDataUrlAttachment(dataUrl: string): Promise<string | null> {
    const normalizedDataUrl = normalizeRenderableDataImageSrc(dataUrl);
    if (!normalizedDataUrl) {
        return null;
    }
    if (!isAttachmentDataUrlWithinSizeLimit(normalizedDataUrl)) {
        return null;
    }

    const decoded = dataUrlToBytes(normalizedDataUrl);
    if (!decoded) {
        return null;
    }
    if (decoded.bytes.byteLength > MAX_ATTACHMENT_IMAGE_BYTES) {
        return null;
    }

    const storage = getStorageAdapter();
    const appDataPath = await storage.getBasePath();
    const dirPath = await getPrimaryAttachmentDir(appDataPath);

    if (!(await storage.exists(dirPath))) {
        await storage.mkdir(dirPath, true);
    }

    const ext = inferDataUrlExtension(decoded.mimeType);
    const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const absolutePath = await joinPath(dirPath, filename);
    await storage.writeBinaryFile(absolutePath, decoded.bytes, { recursive: true });
    return `attachment://${encodeURIComponent(filename)}`;
}

export async function convertToBase64(attachment: Attachment, options: ConvertAttachmentOptions = {}): Promise<string> {
    if (/^data:/i.test(attachment.previewUrl.trim())) {
        const sanitizedDataUrl = sanitizeInlineAttachmentDataUrl(attachment.previewUrl);
        if (!sanitizedDataUrl) {
            throw new Error('Attachment image is too large.');
        }
        return sanitizedDataUrl;
    }

    const storage = getStorageAdapter();

    if (attachment.path) {
        try {
            const managedPath = await resolvePrimaryAttachmentFilePath(attachment.path);
            const readablePath = managedPath || ((await options.allowPath?.(attachment.path)) ? attachment.path : null);
            if (readablePath) {
                const info = await storage.stat(readablePath).catch(() => null);
                assertReadableAttachmentInfo(info);
                const data = await storage.readBinaryFile(readablePath, MAX_ATTACHMENT_IMAGE_BYTES);
                const prepared = prepareAttachmentOutputBytes(data, attachment.type);
                return encodeAttachmentDataUrl(prepared.bytes, prepared.mimeType);
            }
        } catch (e) {
        }
    }

    const storedFilename =
        extractStoredAttachmentFilename(attachment.previewUrl) ||
        extractStoredAttachmentFilename(attachment.assetUrl);
    if (storedFilename) {
        const basePath = await storage.getBasePath();
        const attachmentPath = await getPrimaryAttachmentPath(basePath, storedFilename);
        const info = await storage.stat(attachmentPath).catch(() => null);
        assertReadableAttachmentInfo(info);
        const data = await storage.readBinaryFile(attachmentPath, MAX_ATTACHMENT_IMAGE_BYTES);
        const prepared = prepareAttachmentOutputBytes(data, attachment.type);
        return encodeAttachmentDataUrl(prepared.bytes, prepared.mimeType);
    }

    throw new Error('Cannot convert attachment to Base64');
}
