import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDiagnosticsLog, getDiagnosticsLogText } from '@/lib/diagnostics/diagnosticsLog';
import { MAX_FETCHED_IMAGE_BYTES } from '@/lib/markdown/fetchBoundedImageBlob';
import { createImageDownloadDefaultName, useImageActions } from './useImageActions';

type MockStorageFileInfo = {
    name: string;
    path: string;
    isDirectory: boolean;
    isFile: boolean;
    size?: number;
};

const mocks = vi.hoisted(() => ({
    ensureImageFileExists: vi.fn(async () => undefined),
    saveDialog: vi.fn(async () => '/downloads/demo.png'),
    writeDesktopBinaryFile: vi.fn(async () => undefined),
    writeTextToClipboard: vi.fn(async () => true),
    rasterizeSvgBlobToPngBlob: vi.fn(),
    storage: {
        stat: vi.fn(async (_path: string): Promise<MockStorageFileInfo | null> => null),
        readBinaryFile: vi.fn(async (_path: string, _maxBytes?: number): Promise<Uint8Array> => {
            throw new Error('File not found');
        }),
    },
}));

vi.mock('@/lib/i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/clipboard', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/clipboard')>();
    return {
        ...actual,
        writeTextToClipboard: mocks.writeTextToClipboard,
    };
});

vi.mock('@/lib/desktop/fs', () => ({
    writeDesktopBinaryFile: mocks.writeDesktopBinaryFile,
}));

vi.mock('@/lib/storage/adapter', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/storage/adapter')>();
    return {
        ...actual,
        getStorageAdapter: () => mocks.storage,
    };
});

vi.mock('@/lib/storage/dialog', () => ({
    saveDialog: mocks.saveDialog,
}));

vi.mock('../utils/fileUtils', () => ({
    ensureImageFileExists: mocks.ensureImageFileExists,
}));

vi.mock('@/lib/markdown/svgRasterize', () => ({
    isSvgImageMimeType: (value: string | null | undefined) =>
        (value ?? '').split(';')[0].trim().toLowerCase() === 'image/svg+xml',
    rasterizeSvgBlobToPngBlob: mocks.rasterizeSvgBlobToPngBlob,
}));

vi.mock('../commands/imageNodeCommands', () => ({
    deleteImageNodeAtPos: vi.fn(),
}));

type ImageActionOverrides = Partial<Parameters<typeof useImageActions>[0]> & {
    alt?: string;
    nodeSrc?: string;
};

function renderImageActions(overrides: ImageActionOverrides = {}) {
    const { alt: overrideAlt, nodeSrc: overrideNodeSrc, ...actionOverrides } = overrides;
    const nodeSrc = overrideNodeSrc ?? 'assets/demo.png';
    const alt = overrideAlt ?? 'demo';
    return renderHook(() =>
        useImageActions({
            node: { attrs: { src: nodeSrc, alt } } as never,
            view: {} as never,
            getPos: () => undefined,
            baseSrc: actionOverrides.baseSrc ?? nodeSrc,
            resolvedSrc: actionOverrides.resolvedSrc ?? 'blob:resolved-image',
            notesPath: '/notesRoot',
            currentNotePath: 'note.md',
            updateNodeAttrs: vi.fn(),
            markImageUserInput: vi.fn(),
            setCropParams: vi.fn(),
            setIsActive: vi.fn(),
            setHeight: vi.fn(),
            ...actionOverrides,
        })
    );
}

function createDesktopBridgeWithClipboard({
    writeImage,
    writeText = vi.fn(),
}: {
    writeImage?: (dataUrl: string) => Promise<void>;
    writeText?: (text: string) => Promise<void>;
}) {
    return {
        platform: 'electron' as const,
        clipboard: {
            writeText,
            writeImage,
        },
        path: {
            join: async (...segments: string[]) => segments.filter(Boolean).join('/'),
            appDataDir: async () => '/app',
            toFileUrl: async (filePath: string) => `file://${filePath}`,
        },
    };
}

describe('createImageDownloadDefaultName', () => {
    it('removes path separators and control characters from image download names', () => {
        expect(createImageDownloadDefaultName('../secret\u0000name', 'assets/photo.webp')).toBe('secretname.webp');
        expect(createImageDownloadDefaultName('folder\\evil/name', 'assets/photo.jpg')).toBe('folderevilname.jpg');
    });

    it('falls back to a safe extension for unsupported source extensions', () => {
        expect(createImageDownloadDefaultName('cover', 'assets/cover.html')).toBe('cover.png');
        expect(createImageDownloadDefaultName('...', 'assets/cover')).toBe('image.png');
    });
});

describe('useImageActions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearDiagnosticsLog();
        vi.unstubAllGlobals();
        mocks.ensureImageFileExists.mockResolvedValue(undefined);
        mocks.rasterizeSvgBlobToPngBlob.mockImplementation(async (blob: Blob) => blob);
        mocks.storage.stat.mockResolvedValue(null);
        mocks.storage.readBinaryFile.mockImplementation(async () => {
            throw new Error('File not found');
        });
        Object.defineProperty(window, 'vlainaDesktop', {
            configurable: true,
            value: undefined,
        });
    });

    it('records image crop failures in the shared diagnostics log', async () => {
        const failure = new Error('image restore failed');
        mocks.ensureImageFileExists.mockRejectedValueOnce(failure);
        const { result } = renderImageActions();

        await act(async () => {
            await result.current.handleSave({ x: 10, y: 10, width: 80, height: 80 }, 1);
        });

        const report = JSON.parse(getDiagnosticsLogText());
        expect(report.entries).toContainEqual(expect.objectContaining({
            channel: 'notes-editor',
            event: 'failure-image-update',
            details: {
                operation: 'image-crop',
                errorName: 'Error',
                errorMessage: 'image restore failed',
            },
        }));
    });

    it('does not save crop attributes when the editor document changes during image restore', async () => {
        let resolveRestore: () => void = () => undefined;
        mocks.ensureImageFileExists.mockReturnValue(new Promise<undefined>((resolve) => {
            resolveRestore = () => resolve(undefined);
        }));
        const updateNodeAttrs = vi.fn();
        const setCropParams = vi.fn();
        const originalDoc = { eq: vi.fn((other: unknown) => other === originalDoc) };
        const changedDoc = { eq: vi.fn((other: unknown) => other === changedDoc) };
        const view = {
            state: { doc: originalDoc },
            dom: { isConnected: true },
        };
        const { result } = renderImageActions({
            view: view as never,
            updateNodeAttrs,
            setCropParams,
        });

        let savePromise: Promise<void> = Promise.resolve();
        await act(async () => {
            savePromise = result.current.handleSave(
                { x: 10, y: 10, width: 80, height: 80 },
                1,
            );
            await Promise.resolve();
        });
        view.state.doc = changedDoc;
        resolveRestore();

        await act(async () => {
            await savePromise;
        });

        expect(setCropParams).not.toHaveBeenCalled();
        expect(updateNodeAttrs).not.toHaveBeenCalled();
    });

    it('falls back to copying source text when resolved content is not an image', async () => {
        const clipboardWrite = vi.fn();
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { write: clipboardWrite },
        });
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '12',
                'content-type': 'text/html',
            }),
            blob: async () => new Blob(['not an image'], { type: 'text/html' }),
        })));
        const { result } = renderImageActions();

        let copied = false;
        await act(async () => {
            copied = await result.current.handleCopy();
        });

        expect(copied).toBe(true);
        expect(clipboardWrite).not.toHaveBeenCalled();
        expect(mocks.writeTextToClipboard).toHaveBeenCalledWith('assets/demo.png');
    });

    it('copies resolved image content to the clipboard', async () => {
        const clipboardWrite = vi.fn(async () => undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { write: clipboardWrite },
        });
        vi.stubGlobal('ClipboardItem', vi.fn(function ClipboardItem(items) {
            return { items };
        }));
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '3',
                'content-type': 'image/png',
            }),
            blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
        })));
        const { result } = renderImageActions();

        let copied = false;
        await act(async () => {
            copied = await result.current.handleCopy();
        });

        expect(copied).toBe(true);
        expect(clipboardWrite).toHaveBeenCalledTimes(1);
        expect(mocks.writeTextToClipboard).not.toHaveBeenCalled();
    });

    it('rasterizes SVG content before copying it to the clipboard', async () => {
        const clipboardWrite = vi.fn(async () => undefined);
        const pngBlob = new Blob([new Uint8Array([7, 8, 9])], { type: 'image/png' });
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { write: clipboardWrite },
        });
        vi.stubGlobal('ClipboardItem', vi.fn(function ClipboardItem(items) {
            return { items };
        }));
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '11',
                'content-type': 'image/svg+xml',
            }),
            blob: async () => new Blob(['<svg></svg>'], { type: 'image/svg+xml' }),
        })));
        mocks.rasterizeSvgBlobToPngBlob.mockResolvedValueOnce(pngBlob);
        const { result } = renderImageActions();

        let copied = false;
        await act(async () => {
            copied = await result.current.handleCopy();
        });

        expect(copied).toBe(true);
        expect(mocks.rasterizeSvgBlobToPngBlob).toHaveBeenCalledWith(expect.any(Blob));
        expect(clipboardWrite).toHaveBeenCalledWith([
            expect.objectContaining({
                items: {
                    'image/png': pngBlob,
                },
            }),
        ]);
    });

    it('copies resolved image content through the desktop image clipboard when available', async () => {
        const clipboardWrite = vi.fn(async () => undefined);
        const desktopWriteImage = vi.fn(async () => undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { write: clipboardWrite },
        });
        Object.defineProperty(window, 'vlainaDesktop', {
            configurable: true,
            value: createDesktopBridgeWithClipboard({ writeImage: desktopWriteImage }),
        });
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '1',
                'content-type': 'image/png',
            }),
            blob: async () => new Blob(['x'], { type: 'image/png' }),
        })));
        const { result } = renderImageActions();

        let copied = false;
        await act(async () => {
            copied = await result.current.handleCopy();
        });

        expect(copied).toBe(true);
        expect(desktopWriteImage).toHaveBeenCalledWith('data:image/png;base64,eA==');
        expect(clipboardWrite).not.toHaveBeenCalled();
        expect(mocks.writeTextToClipboard).not.toHaveBeenCalled();
    });

    it('copies local relative image content from disk instead of fetching the resolved blob URL', async () => {
        const desktopWriteImage = vi.fn(async () => undefined);
        Object.defineProperty(window, 'vlainaDesktop', {
            configurable: true,
            value: createDesktopBridgeWithClipboard({ writeImage: desktopWriteImage }),
        });
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('local image copy should not fetch the resolved blob URL');
        }));
        mocks.storage.stat.mockResolvedValue({
            name: '2026-06-24_13-31-00.png',
            path: '/notesRoot/assets/2026-06-24_13-31-00.png',
            isDirectory: false,
            isFile: true,
            size: 3,
        });
        mocks.storage.readBinaryFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
        const nodeSrc = './assets/2026-06-24_13-31-00.png';
        const { result } = renderImageActions({
            alt: '2026-06-24_13-31-00',
            baseSrc: nodeSrc,
            nodeSrc,
            resolvedSrc: 'blob:resolved-local-image',
        });

        let copied = false;
        await act(async () => {
            copied = await result.current.handleCopy();
        });

        expect(copied).toBe(true);
        expect(mocks.storage.readBinaryFile).toHaveBeenCalledWith(
            '/notesRoot/assets/2026-06-24_13-31-00.png',
            MAX_FETCHED_IMAGE_BYTES,
        );
        expect(fetch).not.toHaveBeenCalled();
        expect(desktopWriteImage).toHaveBeenCalledWith('data:image/png;base64,AQID');
    });

    it('copies remote image content from the original resource URL instead of the cached blob URL', async () => {
        const desktopWriteImage = vi.fn(async () => undefined);
        Object.defineProperty(window, 'vlainaDesktop', {
            configurable: true,
            value: createDesktopBridgeWithClipboard({ writeImage: desktopWriteImage }),
        });
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '3',
                'content-type': 'image/jpeg',
            }),
            blob: async () => new Blob(['jpg'], { type: 'image/jpeg' }),
        })));
        const remoteSrc = 'https://raw.githubusercontent.com/521xueweihan/img_logo/master/logo/cover.jpg#w=72%25';
        const { result } = renderImageActions({
            alt: 'cover',
            baseSrc: remoteSrc,
            nodeSrc: remoteSrc,
            resolvedSrc: 'blob:cached-remote-image',
        });

        let copied = false;
        await act(async () => {
            copied = await result.current.handleCopy();
        });

        expect(copied).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
            'https://raw.githubusercontent.com/521xueweihan/img_logo/master/logo/cover.jpg',
            expect.objectContaining({
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
            }),
        );
        expect(fetch).not.toHaveBeenCalledWith('blob:cached-remote-image', expect.anything());
        expect(desktopWriteImage).toHaveBeenCalledWith('data:image/jpeg;base64,anBn');
    });

    it('normalizes protocol-relative remote image sources before copying instead of using the cached blob URL', async () => {
        const desktopWriteImage = vi.fn(async () => undefined);
        Object.defineProperty(window, 'vlainaDesktop', {
            configurable: true,
            value: createDesktopBridgeWithClipboard({ writeImage: desktopWriteImage }),
        });
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '3',
                'content-type': 'image/png',
            }),
            blob: async () => new Blob(['png'], { type: 'image/png' }),
        })));
        const remoteSrc = '//example.com/assets/cover.png#w=72%25';
        const { result } = renderImageActions({
            alt: 'cover',
            baseSrc: remoteSrc,
            nodeSrc: remoteSrc,
            resolvedSrc: 'blob:cached-protocol-relative-image',
        });

        let copied = false;
        await act(async () => {
            copied = await result.current.handleCopy();
        });

        expect(copied).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
            'https://example.com/assets/cover.png',
            expect.objectContaining({
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
            }),
        );
        expect(fetch).not.toHaveBeenCalledWith('blob:cached-protocol-relative-image', expect.anything());
        expect(desktopWriteImage).toHaveBeenCalledWith('data:image/png;base64,cG5n');
    });

    it('does not copy oversized resolved image responses', async () => {
        const clipboardWrite = vi.fn();
        const blob = vi.fn(async () => new Blob([new Uint8Array([1])], { type: 'image/png' }));
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { write: clipboardWrite },
        });
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': String(MAX_FETCHED_IMAGE_BYTES + 1),
                'content-type': 'image/png',
            }),
            blob,
        })));
        const { result } = renderImageActions();

        let copied = true;
        await act(async () => {
            copied = await result.current.handleCopy();
        });

        expect(copied).toBe(false);
        expect(blob).not.toHaveBeenCalled();
        expect(clipboardWrite).not.toHaveBeenCalled();
        expect(mocks.writeTextToClipboard).not.toHaveBeenCalled();
    });

    it('does not write downloaded non-image content to disk', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '12',
                'content-type': 'text/html',
            }),
            blob: async () => new Blob(['not an image'], { type: 'text/html' }),
        })));
        const { result } = renderImageActions();

        await act(async () => {
            await result.current.handleDownload();
        });

        expect(mocks.saveDialog).toHaveBeenCalledWith({
            defaultPath: 'demo.png',
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'webp'] }],
        });
        expect(mocks.writeDesktopBinaryFile).not.toHaveBeenCalled();
    });

    it('writes downloaded image content to disk', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '3',
                'content-type': 'image/png',
            }),
            blob: async () => new Blob([new Uint8Array([4, 5, 6])], { type: 'image/png' }),
        })));
        const { result } = renderImageActions();

        await act(async () => {
            await result.current.handleDownload();
        });

        expect(mocks.writeDesktopBinaryFile).toHaveBeenCalledWith(
            '/downloads/demo.png',
            expect.any(Uint8Array),
        );
    });

    it('rasterizes SVG content before writing downloaded image bytes', async () => {
        const pngBytes = new Uint8Array([7, 8, 9]);
        const pngBlob = new Blob([pngBytes], { type: 'image/png' });
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '11',
                'content-type': 'image/svg+xml',
            }),
            blob: async () => new Blob(['<svg></svg>'], { type: 'image/svg+xml' }),
        })));
        mocks.rasterizeSvgBlobToPngBlob.mockResolvedValueOnce(pngBlob);
        const { result } = renderImageActions();

        await act(async () => {
            await result.current.handleDownload();
        });

        expect(mocks.rasterizeSvgBlobToPngBlob).toHaveBeenCalledWith(expect.any(Blob));
        expect(mocks.writeDesktopBinaryFile).toHaveBeenCalledWith(
            '/downloads/demo.png',
            pngBytes,
        );
    });

    it('does not fall back to downloading original SVG content when writing rasterized bytes fails', async () => {
        const pngBlob = new Blob([new Uint8Array([7, 8, 9])], { type: 'image/png' });
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '11',
                'content-type': 'image/svg+xml',
            }),
            blob: async () => new Blob(['<svg></svg>'], { type: 'image/svg+xml' }),
        })));
        mocks.rasterizeSvgBlobToPngBlob.mockResolvedValueOnce(pngBlob);
        mocks.writeDesktopBinaryFile.mockRejectedValueOnce(new Error('disk unavailable'));
        const { result } = renderImageActions({
            node: { attrs: { src: 'assets/demo.svg', alt: 'demo' } } as never,
            baseSrc: 'assets/demo.svg',
        });
        const appendSpy = vi.spyOn(document.body, 'appendChild');
        const removeSpy = vi.spyOn(document.body, 'removeChild');

        try {
            await act(async () => {
                await result.current.handleDownload();
            });

            expect(mocks.writeDesktopBinaryFile).toHaveBeenCalled();
            expect(appendSpy).not.toHaveBeenCalled();
            expect(removeSpy).not.toHaveBeenCalled();
        } finally {
            appendSpy.mockRestore();
            removeSpy.mockRestore();
        }
    });

    it('downloads remote image content from the original resource URL instead of the cached blob URL', async () => {
        mocks.saveDialog.mockResolvedValueOnce('/downloads/cover.jpg');
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '3',
                'content-type': 'image/jpeg',
            }),
            blob: async () => new Blob([new Uint8Array([7, 8, 9])], { type: 'image/jpeg' }),
        })));
        const remoteSrc = 'https://raw.githubusercontent.com/521xueweihan/img_logo/master/logo/cover.jpg#w=72%25';
        const { result } = renderImageActions({
            alt: 'cover',
            baseSrc: remoteSrc,
            nodeSrc: remoteSrc,
            resolvedSrc: 'blob:cached-remote-image',
        });

        await act(async () => {
            await result.current.handleDownload();
        });

        expect(mocks.saveDialog).toHaveBeenCalledWith({
            defaultPath: 'cover.jpg',
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'webp'] }],
        });
        expect(fetch).toHaveBeenCalledWith(
            'https://raw.githubusercontent.com/521xueweihan/img_logo/master/logo/cover.jpg',
            expect.objectContaining({
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
            }),
        );
        expect(fetch).not.toHaveBeenCalledWith('blob:cached-remote-image', expect.anything());
        expect(mocks.writeDesktopBinaryFile).toHaveBeenCalledWith('/downloads/cover.jpg', new Uint8Array([7, 8, 9]));
    });

    it('normalizes protocol-relative remote image sources before downloading instead of using the cached blob URL', async () => {
        mocks.saveDialog.mockResolvedValueOnce('/downloads/cover.png');
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '3',
                'content-type': 'image/png',
            }),
            blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
        })));
        const remoteSrc = '//example.com/assets/cover.png#w=72%25';
        const { result } = renderImageActions({
            alt: 'cover',
            baseSrc: remoteSrc,
            nodeSrc: remoteSrc,
            resolvedSrc: 'blob:cached-protocol-relative-image',
        });

        await act(async () => {
            await result.current.handleDownload();
        });

        expect(mocks.saveDialog).toHaveBeenCalledWith({
            defaultPath: 'cover.png',
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'webp'] }],
        });
        expect(fetch).toHaveBeenCalledWith(
            'https://example.com/assets/cover.png',
            expect.objectContaining({
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
            }),
        );
        expect(fetch).not.toHaveBeenCalledWith('blob:cached-protocol-relative-image', expect.anything());
        expect(mocks.writeDesktopBinaryFile).toHaveBeenCalledWith('/downloads/cover.png', new Uint8Array([1, 2, 3]));
    });

    it('does not hang when fallback downloaded image reading is aborted', async () => {
        const originalArrayBufferDescriptor = Object.getOwnPropertyDescriptor(Blob.prototype, 'arrayBuffer');
        try {
            Object.defineProperty(Blob.prototype, 'arrayBuffer', {
                configurable: true,
                value: undefined,
            });
            vi.stubGlobal('FileReader', class {
                result: ArrayBuffer | null = null;
                error: Error | null = null;
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;
                onabort: (() => void) | null = null;

                readAsArrayBuffer() {
                    queueMicrotask(() => this.onabort?.());
                }
            });
            vi.stubGlobal('fetch', vi.fn(async () => ({
                headers: new Headers({
                    'content-length': '1',
                    'content-type': 'image/png',
                }),
                blob: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }),
            })));
            const { result } = renderImageActions();

            const appendSpy = vi.spyOn(document.body, 'appendChild');
            const removeSpy = vi.spyOn(document.body, 'removeChild');

            await act(async () => {
                await result.current.handleDownload();
            });

            expect(mocks.writeDesktopBinaryFile).not.toHaveBeenCalled();
            expect(appendSpy).toHaveBeenCalledTimes(1);
            expect(removeSpy).toHaveBeenCalledTimes(1);

            appendSpy.mockRestore();
            removeSpy.mockRestore();
        } finally {
            if (originalArrayBufferDescriptor) {
                Object.defineProperty(Blob.prototype, 'arrayBuffer', originalArrayBufferDescriptor);
            }
        }
    });

    it('does not write or anchor-download oversized image responses', async () => {
        const blob = vi.fn(async () => new Blob([new Uint8Array([1])], { type: 'image/png' }));
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': String(MAX_FETCHED_IMAGE_BYTES + 1),
                'content-type': 'image/png',
            }),
            blob,
        })));
        const { result } = renderImageActions();
        const appendSpy = vi.spyOn(document.body, 'appendChild');

        await act(async () => {
            await result.current.handleDownload();
        });

        expect(blob).not.toHaveBeenCalled();
        expect(mocks.writeDesktopBinaryFile).not.toHaveBeenCalled();
        expect(appendSpy).not.toHaveBeenCalled();

        appendSpy.mockRestore();
    });

    it('does not write downloaded image bytes when blob metadata understates the actual size', async () => {
        const blob = {
            type: 'image/png',
            size: 1,
            arrayBuffer: vi.fn(async () => new ArrayBuffer(MAX_FETCHED_IMAGE_BYTES + 1)),
        } as unknown as Blob;
        vi.stubGlobal('fetch', vi.fn(async () => ({
            headers: new Headers({
                'content-length': '1',
                'content-type': 'image/png',
            }),
            blob: async () => blob,
        })));
        const { result } = renderImageActions();
        const appendSpy = vi.spyOn(document.body, 'appendChild');

        await act(async () => {
            await result.current.handleDownload();
        });

        expect(blob.arrayBuffer).toHaveBeenCalledTimes(1);
        expect(mocks.writeDesktopBinaryFile).not.toHaveBeenCalled();
        expect(appendSpy).not.toHaveBeenCalled();

        appendSpy.mockRestore();
    });
});
