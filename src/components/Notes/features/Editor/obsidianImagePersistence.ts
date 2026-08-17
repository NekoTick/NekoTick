import { normalizeImageWidth, serializeCropValue } from './plugins/image-block/utils/imageSourceFragment';
import { normalizeImageAlignment } from './plugins/image-block/utils/imageNodeAttrs';
import { normalizeMarkdownHtmlImageTextAttr } from './markdownHtmlImage';
import {
    formatObsidianImageEmbed,
    parseObsidianImageEmbedTarget,
    type ObsidianImageEmbedMetadata,
} from '@/lib/notes/markdown/obsidianImageEmbed';
import { sanitizeNoteMediaSrc } from '@/lib/notes/markdown/urlSecurity';

const MAX_PERSISTED_IMAGE_SRC_CHARS = 64 * 1024;

export function getBoundedImageSrc(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_PERSISTED_IMAGE_SRC_CHARS
        ? value
        : null;
}

export function getRestorablePersistedImageSrc(attrs: Record<string, unknown>): string | null {
    const persistedSrc = getBoundedImageSrc(attrs.persistedSrc);
    if (!persistedSrc) return null;
    return sanitizeNoteMediaSrc(persistedSrc) === (sanitizeNoteMediaSrc(attrs.src) ?? null)
        ? persistedSrc
        : null;
}

export function getObsidianImageEmbedMetadata(value: unknown): ObsidianImageEmbedMetadata | null {
    if (!value || typeof value !== 'object') return null;
    const source = value as Partial<ObsidianImageEmbedMetadata>;
    if (typeof source.src !== 'string' || typeof source.alias !== 'string') return null;
    const parsed = parseObsidianImageEmbedTarget(`${source.src}${source.alias ? `|${source.alias}` : ''}`);
    return parsed?.obsidianEmbed ?? null;
}

export function getRestorableObsidianImageSource(attrs: Record<string, unknown>): string | null {
    const embed = getObsidianImageEmbedMetadata(attrs.obsidianEmbed);
    if (!embed || getRestorablePersistedImageSrc(attrs) !== embed.src) return null;
    if (
        normalizeImageAlignment(attrs.align) !== 'center'
        || normalizeImageWidth(attrs.width) !== normalizeImageWidth(embed.width)
        || serializeCropValue(attrs.crop) !== null
        || attrs.title != null
    ) {
        return null;
    }

    const alt = normalizeMarkdownHtmlImageTextAttr(attrs.alt);
    if (embed.size && alt) return null;
    const alias = embed.size ?? alt;
    if (/[|\]\n]/.test(alias)) return null;
    return formatObsidianImageEmbed(embed, alias);
}
