import type { ObsidianImageEmbedMetadata } from '@/lib/notes/markdown/obsidianImageEmbed';

export interface ExportMarkdownAssetSourceToken {
  start: number;
  end: number;
  src: string;
  lookupSrc?: string;
  obsidianEmbed?: ObsidianImageEmbedMetadata;
  referenceOffset?: number;
  referenceSource?: string;
  replaceEnd?: number;
  replaceStart?: number;
}
