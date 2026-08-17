import type { Alignment } from '../types';
import { normalizeImageWidth, parseCropValue } from './imageSourceFragment';

type NodeAttrs = Record<string, unknown>;

function getSrc(attrs: NodeAttrs): string {
    return typeof attrs.src === 'string' ? attrs.src : '';
}

export function normalizeImageAlignment(value: unknown): Alignment | null {
    if (value === 'left' || value === 'center' || value === 'right') {
        return value;
    }
    return null;
}

function normalizeWidth(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    return normalizeImageWidth(value);
}

export function getImageAlignment(attrs: NodeAttrs): Alignment {
    return normalizeImageAlignment(attrs.align) ?? 'center';
}

export function getImageWidth(attrs: NodeAttrs): string | null {
    return normalizeWidth(attrs.width);
}

export function getImageCrop(attrs: NodeAttrs) {
    return parseCropValue(attrs.crop);
}

export function mergeImageNodeAttrs(latestAttrs: NodeAttrs, incomingAttrs: NodeAttrs): NodeAttrs {
    const incomingSrc = typeof incomingAttrs.src === 'string' ? incomingAttrs.src : undefined;
    const incomingAlign = normalizeImageAlignment(incomingAttrs.align);
    const incomingWidth = normalizeWidth(incomingAttrs.width);

    const mergedAlign =
        incomingAlign ??
        normalizeImageAlignment(latestAttrs.align) ??
        null;
    const mergedWidth =
        incomingWidth ??
        normalizeWidth(latestAttrs.width);
    const mergedCrop = parseCropValue(incomingAttrs.crop)
        ?? parseCropValue(latestAttrs.crop)
        ?? null;
    const mergedSrc = incomingSrc ?? getSrc(latestAttrs);

    const nextAttrs: NodeAttrs = { ...latestAttrs, ...incomingAttrs };
    const preservesObsidianAlias = latestAttrs.obsidianEmbed != null
        && Object.keys(incomingAttrs).every((key) => key === 'alt');
    nextAttrs.markdownSource = null;
    nextAttrs.persistedSrc = preservesObsidianAlias ? latestAttrs.persistedSrc ?? null : null;
    nextAttrs.src = mergedSrc;
    nextAttrs.align = mergedAlign ?? 'center';
    nextAttrs.width = mergedWidth;
    nextAttrs.crop = mergedCrop;

    return nextAttrs;
}
