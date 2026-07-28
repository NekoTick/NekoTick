import { describe, expect, it } from 'vitest';
import { hasClipboardPayload } from './clipboardPlugin';
import { hasClipboardImageOnlyHtmlPayload } from './clipboardPayload';

describe('hasClipboardPayload', () => {
    it('checks clipboard type length without materializing the type list', () => {
        const types = new Proxy({ length: 1 }, {
            get(target, property) {
                if (property === 'length') return target.length;
                throw new Error(`Unexpected clipboard type access: ${String(property)}`);
            },
        });

        const event = {
            clipboardData: {
                getData: () => '',
                types,
            },
        } as unknown as ClipboardEvent;

        expect(hasClipboardPayload(event)).toBe(true);
    });

    it('recognizes linked image-only HTML without treating real image captions as image-only', () => {
        const createClipboardData = (html: string) => ({
            getData: (type: string) => type === 'text/html' ? html : '',
        }) as DataTransfer;

        expect(hasClipboardImageOnlyHtmlPayload(createClipboardData(
            '<a href="https://example.test/page"><img src="https://images.example.test/copy.png"></a>',
        ))).toBe(true);
        expect(hasClipboardImageOnlyHtmlPayload(createClipboardData(
            '\u200B<img src="https://images.example.test/copy.png">\u200B',
        ))).toBe(true);
        expect(hasClipboardImageOnlyHtmlPayload(createClipboardData(
            '<p><img src="https://images.example.test/copy.png">Real caption</p>',
        ))).toBe(false);
    });
});
