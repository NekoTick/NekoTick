import { describe, expect, it } from 'vitest';
import { getImageAlignment, getImageCrop, getImageWidth, mergeImageNodeAttrs } from './imageNodeAttrs';

describe('imageNodeAttrs', () => {
    it('reads layout only from node attrs', () => {
        const attrs = { src: 'image.png#preview', align: 'right', width: '90%' };

        expect(getImageAlignment(attrs)).toBe('right');
        expect(getImageWidth(attrs)).toBe('90%');
    });

    it('uses defaults when attrs are missing or invalid', () => {
        expect(getImageAlignment({ src: 'image.png#preview' })).toBe('center');
        expect(getImageWidth({ src: 'image.png#preview' })).toBeNull();
        expect(getImageCrop({ src: 'image.png#preview' })).toBeNull();
    });

    it('merges alignment updates while preserving existing attr-based layout', () => {
        const latest = {
            src: 'image.png',
            alt: 'cover',
            width: '25%',
            crop: { x: 1, y: 2, width: 30, height: 40, ratio: 1.5 },
        };

        const next = mergeImageNodeAttrs(latest, { align: 'left' });

        expect(next.src).toBe('image.png');
        expect(next.align).toBe('left');
        expect(next.width).toBe('25%');
        expect(next.crop).toMatchObject({ x: 1, y: 2, width: 30, height: 40, ratio: 1.5 });
        expect(next.alt).toBe('cover');
    });

    it('keeps existing alignment and width when updating crop', () => {
        const latest = { src: 'image.png', align: 'right', width: '25%' };
        const next = mergeImageNodeAttrs(latest, { crop: { x: 5, y: 6, width: 7, height: 8, ratio: 1 } });

        expect(next.src).toBe('image.png');
        expect(next.align).toBe('right');
        expect(next.width).toBe('25%');
        expect(next.crop).toMatchObject({ x: 5, y: 6, width: 7, height: 8, ratio: 1 });
    });

    it('keeps crop and alignment when resizing an existing image', () => {
        const latest = {
            src: 'image.png',
            alt: 'cover',
            align: 'left',
            crop: { x: 5, y: 6, width: 70, height: 80, ratio: 1.25 },
        };
        const next = mergeImageNodeAttrs(latest, { width: '33%' });

        expect(next.src).toBe('image.png');
        expect(next.crop).toMatchObject({ x: 5, y: 6, width: 70, height: 80, ratio: 1.25 });
        expect(next.align).toBe('left');
        expect(next.width).toBe('33%');
        expect(next.alt).toBe('cover');
    });

    it('updates caption without changing persisted layout attrs', () => {
        const latest = {
            src: 'image.png',
            alt: 'old',
            align: 'left',
            width: '33%',
            crop: { x: 5, y: 6, width: 70, height: 80, ratio: 1.25 },
        };
        const next = mergeImageNodeAttrs(latest, { alt: 'new' });

        expect(next.crop).toMatchObject({ x: 5, y: 6, width: 70, height: 80, ratio: 1.25 });
        expect(next.align).toBe('left');
        expect(next.width).toBe('33%');
        expect(next.alt).toBe('new');
    });

    it('keeps Obsidian source metadata for alias-only updates', () => {
        const obsidianEmbed = {
            src: 'image.png',
            alias: 'old',
            size: null,
            width: null,
            height: null,
        };
        const aliasUpdate = mergeImageNodeAttrs({
            src: 'image.png',
            alt: 'old',
            persistedSrc: 'image.png',
            obsidianEmbed,
        }, { alt: 'new' });
        const layoutUpdate = mergeImageNodeAttrs(aliasUpdate, { align: 'left' });

        expect(aliasUpdate.persistedSrc).toBe('image.png');
        expect(aliasUpdate.obsidianEmbed).toBe(obsidianEmbed);
        expect(layoutUpdate.persistedSrc).toBeNull();
    });

    it('handles non-string src values safely', () => {
        expect(getImageAlignment({ src: 123 })).toBe('center');
        expect(getImageWidth({ src: 123, width: '40%' })).toBe('40%');
        const next = mergeImageNodeAttrs({ src: 123 }, { align: 'left', width: '25%' });
        expect(next.src).toBe('');
        expect(next.align).toBe('left');
        expect(next.width).toBe('25%');
    });

    it('clamps or drops note-controlled image layout values', () => {
        expect(getImageWidth({ src: 'image.png', width: 'calc(999999px * 999999)' })).toBeNull();
        expect(getImageWidth({ src: 'image.png', width: '999999px' })).toBe('2000px');
        expect(getImageWidth({ src: 'image.png', width: `${' '.repeat(65)}50%` })).toBeNull();
        expect(getImageCrop({ crop: '5,6,70,80,1.25' })).toMatchObject({ x: 5, y: 6, width: 70, height: 80, ratio: 1.25 });
        expect(getImageCrop({ crop: '-10,200,999,0,999' })).toMatchObject({ x: 0, y: 100, width: 100, height: 1, ratio: 20 });
        expect(getImageCrop({ crop: '0x10,6,70,80,1' })).toBeNull();
        expect(getImageCrop({ crop: `${' '.repeat(161)}5,6,70,80,1` })).toBeNull();
    });
});
