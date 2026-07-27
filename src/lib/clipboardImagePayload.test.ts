import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  hasClipboardImagePayload,
  normalizeImageOnlyClipboardHtml,
  preventImageClipboardTextPaste,
  preventImageDataTransferTextDrop,
} from './clipboardImagePayload';

function createTransfer(options: { file?: File; html?: string; text?: string }) {
  const { file, html = '', text = '' } = options;
  return {
    items: file ? [{ kind: 'file', type: file.type, getAsFile: () => file }] : [],
    files: file ? [file] : [],
    getData: (type: string) => type === 'text/html' ? html : text,
  } as unknown as DataTransfer;
}

describe('clipboard image payload guards', () => {
  it.each([
    createTransfer({ file: new File(['image'], 'guard.png', { type: 'image/png' }), text: 'companion' }),
    createTransfer({ html: '<a href="https://example.test"><img src="https://images.example.test/a.png"></a>', text: 'companion' }),
  ])('blocks image-associated text for paste and drop', (transfer) => {
    const pasteEvent = { clipboardData: transfer, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const dropEvent = { dataTransfer: transfer, preventDefault: vi.fn(), stopPropagation: vi.fn() };

    expect(hasClipboardImagePayload(transfer)).toBe(true);
    expect(preventImageClipboardTextPaste(pasteEvent)).toBe(true);
    expect(preventImageDataTransferTextDrop(dropEvent)).toBe(true);
    expect(pasteEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(dropEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('leaves plain text and real image captions untouched', () => {
    const plainText = createTransfer({ text: 'https://example.test/plain' });
    const captionedImage = createTransfer({
      html: '<p><img src="https://images.example.test/a.png">Real caption</p>',
      text: 'Real caption',
    });

    expect(hasClipboardImagePayload(plainText)).toBe(false);
    expect(hasClipboardImagePayload(captionedImage)).toBe(false);
    expect(preventImageDataTransferTextDrop({
      dataTransfer: plainText,
      preventDefault: vi.fn(),
    })).toBe(false);
  });

  it('recognizes and unwraps random image-only HTML without retaining companion links', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.array(fc.constantFrom('\u200B', '\u200C', '\uFEFF', ' '), { maxLength: 8 }),
      (id, paddingParts) => {
        const padding = paddingParts.join('');
        const imageUrl = `https://images.example.test/${id}.png`;
        const html = `${padding}<div><a href="https://example.test/${id}"><img src="${imageUrl}" alt="Image ${id}"></a></div>${padding}`;
        const transfer = createTransfer({ html, text: `https://example.test/${id}` });

        expect(hasClipboardImagePayload(transfer)).toBe(true);
        const normalized = normalizeImageOnlyClipboardHtml(html);
        const document = new DOMParser().parseFromString(normalized, 'text/html');
        expect(document.body.querySelectorAll('img')).toHaveLength(1);
        expect(document.body.querySelector('img')?.getAttribute('src')).toBe(imageUrl);
        expect(document.body.querySelector('a')).toBeNull();
        expect(document.body.textContent).toBe('');
      },
    ), { numRuns: 300, seed: 0x20260728 });
  });

  it('never classifies randomized captions or plain URLs as image-only payloads', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 1_000_000 }),
      (id) => {
        expect(hasClipboardImagePayload(createTransfer({
          html: `<p><img src="https://images.example.test/${id}.png">Caption ${id}</p>`,
          text: `Caption ${id}`,
        }))).toBe(false);
        expect(hasClipboardImagePayload(createTransfer({
          text: `https://example.test/plain/${id}`,
        }))).toBe(false);
      },
    ), { numRuns: 300, seed: 0x20260729 });
  });

  it('rejects oversized image HTML without parsing it', () => {
    const oversizedHtml = `<img src="https://images.example.test/large.png">${' '.repeat(2 * 1024 * 1024)}`;

    expect(hasClipboardImagePayload(createTransfer({ html: oversizedHtml }))).toBe(false);
  });
});
