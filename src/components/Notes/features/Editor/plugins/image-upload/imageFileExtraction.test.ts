import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
    MAX_IMAGE_UPLOAD_INPUT_FILES,
    MAX_IMAGE_UPLOAD_TRANSFER_ITEM_SCAN,
    extractImageFilesFromClipboardData,
    extractImageFilesFromClipboardItems,
    extractImageFilesFromFileList,
} from './imageFileExtraction';

const supportedImageFilenames = [
    'photo.jpg',
    'photo.jpeg',
    'screenshot.png',
    'animation.gif',
    'cover.webp',
    'diagram.svg',
    'scan.bmp',
    'favicon.ico',
    'photo.avif',
];

describe('imageFileExtraction', () => {
    it('extracts image files from clipboard items only', () => {
        const imageFile = new File(['demo'], 'demo.png', { type: 'image/png' });
        const textFile = new File(['demo'], 'demo.txt', { type: 'text/plain' });
        const items = [
            { type: 'image/png', getAsFile: () => imageFile },
            { type: 'text/plain', getAsFile: () => textFile },
            { type: 'image/jpeg', getAsFile: () => null },
        ];

        expect(extractImageFilesFromClipboardItems(items)).toEqual([imageFile]);
    });

    it('falls back to clipboard files when the item list has no usable image', () => {
        const imageFile = new File(['demo'], 'demo.png', { type: 'image/png' });
        const clipboardData = {
            items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
            files: [imageFile],
        };

        expect(extractImageFilesFromClipboardData(clipboardData)).toEqual([imageFile]);
    });

    it('prefers clipboard items without duplicating the same files list payload', () => {
        const imageFile = new File(['demo'], 'demo.png', { type: 'image/png' });
        const clipboardData = {
            items: [{ kind: 'file', type: imageFile.type, getAsFile: () => imageFile }],
            files: [imageFile],
        };

        expect(extractImageFilesFromClipboardData(clipboardData)).toEqual([imageFile]);
    });

    it('deduplicates the same image file repeated in clipboard items', () => {
        const imageFile = new File(['demo'], 'demo.png', { type: 'image/png' });
        const clipboardData = {
            items: [
                { kind: 'file', type: imageFile.type, getAsFile: () => imageFile },
                { kind: 'file', type: imageFile.type, getAsFile: () => imageFile },
            ],
            files: [imageFile],
        };

        expect(extractImageFilesFromClipboardData(clipboardData)).toEqual([imageFile]);
    });

    it('extracts clipboard image files when MIME is missing but filename is known', () => {
        const imageFiles = supportedImageFilenames.map((filename) => new File(['demo'], filename, { type: '' }));
        const explicitTextFile = new File(['demo'], 'looks-like-image.png', { type: 'text/plain' });
        const items = [
            ...imageFiles.map((file) => ({ kind: 'file', type: '', getAsFile: () => file })),
            { kind: 'file', type: 'text/plain', getAsFile: () => explicitTextFile },
        ];

        expect(extractImageFilesFromClipboardItems(items)).toEqual(imageFiles);
    });

    it('extracts image files from a dropped file list only', () => {
        const imageFile = new File(['demo'], 'demo.png', { type: 'image/png' });
        const textFile = new File(['demo'], 'demo.txt', { type: 'text/plain' });

        expect(extractImageFilesFromFileList([imageFile, textFile])).toEqual([imageFile]);
    });

    it('extracts an image from a drop payload that exposes only data-transfer items', () => {
        const imageFile = new File(['demo'], 'items-only.png', { type: 'image/png' });

        expect(extractImageFilesFromClipboardData({
            items: [{ kind: 'file', type: imageFile.type, getAsFile: () => imageFile }],
            files: [],
        })).toEqual([imageFile]);
    });

    it('extracts dropped image files when MIME is octet-stream but filename is known', () => {
        const imageFiles = supportedImageFilenames.map((filename) =>
            new File(['demo'], filename, { type: 'application/octet-stream' })
        );
        const explicitTextFile = new File(['demo'], 'looks-like-image.png', { type: 'text/plain' });

        expect(extractImageFilesFromFileList([...imageFiles, explicitTextFile])).toEqual(imageFiles);
    });

    it('caps clipboard item scanning and collected image files', () => {
        const createImageFile = (index: number) =>
            new File(['demo'], `demo-${index}.png`, { type: 'image/png' });
        let accessed = 0;
        const items = {
            length: MAX_IMAGE_UPLOAD_TRANSFER_ITEM_SCAN + 1,
            get [0]() {
                accessed += 1;
                return { type: 'image/png', getAsFile: () => createImageFile(0) };
            },
        } as ArrayLike<{ type: string; getAsFile: () => File | null }>;

        for (let index = 1; index < MAX_IMAGE_UPLOAD_TRANSFER_ITEM_SCAN; index += 1) {
            Object.defineProperty(items, index, {
                get() {
                    accessed += 1;
                    return { type: 'image/png', getAsFile: () => createImageFile(index) };
                },
            });
        }
        Object.defineProperty(items, MAX_IMAGE_UPLOAD_TRANSFER_ITEM_SCAN, {
            get() {
                throw new Error('Read past clipboard item scan cap');
            },
        });

        const files = extractImageFilesFromClipboardItems(items);

        expect(files).toHaveLength(MAX_IMAGE_UPLOAD_INPUT_FILES);
        expect(accessed).toBe(MAX_IMAGE_UPLOAD_INPUT_FILES);
    });

    it('caps dropped file list scanning and collected image files', () => {
        const createImageFile = (index: number) =>
            new File(['demo'], `demo-${index}.png`, { type: 'image/png' });
        let accessed = 0;
        const files = {
            length: MAX_IMAGE_UPLOAD_TRANSFER_ITEM_SCAN + 1,
            get [0]() {
                accessed += 1;
                return createImageFile(0);
            },
        } as ArrayLike<File>;

        for (let index = 1; index < MAX_IMAGE_UPLOAD_TRANSFER_ITEM_SCAN; index += 1) {
            Object.defineProperty(files, index, {
                get() {
                    accessed += 1;
                    return createImageFile(index);
                },
            });
        }
        Object.defineProperty(files, MAX_IMAGE_UPLOAD_TRANSFER_ITEM_SCAN, {
            get() {
                throw new Error('Read past dropped file scan cap');
            },
        });

        const imageFiles = extractImageFilesFromFileList(files);

        expect(imageFiles).toHaveLength(MAX_IMAGE_UPLOAD_INPUT_FILES);
        expect(accessed).toBe(MAX_IMAGE_UPLOAD_INPUT_FILES);
    });

    it('preserves random image order exactly once across clipboard exposure matrices', () => {
        fc.assert(fc.property(
            fc.uniqueArray(fc.record({
                id: fc.integer({ min: 0, max: 1_000_000 }),
                duplicate: fc.boolean(),
            }), {
                minLength: 1,
                maxLength: 24,
                selector: (entry) => entry.id,
            }),
            fc.constantFrom('items', 'files', 'both'),
            (entries, exposure) => {
                const files = entries.map(({ id }) => new File(
                    [`image-${id}`],
                    `image-${id}.png`,
                    { type: 'image/png', lastModified: id },
                ));
                const items = exposure === 'files' ? [] : entries.flatMap((entry, index) => {
                    const file = files[index]!;
                    const item = { kind: 'file', type: file.type, getAsFile: () => file };
                    return entry.duplicate ? [item, item] : [item];
                });
                const exposedFiles = exposure === 'items'
                    ? []
                    : entries.flatMap((entry, index) => (
                        entry.duplicate ? [files[index]!, files[index]!] : [files[index]!]
                    ));

                expect(extractImageFilesFromClipboardData({
                    items,
                    files: exposedFiles,
                })).toEqual(files);
            },
        ), { numRuns: 500, seed: 0x20260727 });
    });
});
