import { canTransformMarkdownAst } from '../../markdownAstBudget';
import { sanitizeNoteMediaSrc } from '@/lib/notes/markdown/urlSecurity';

type MarkdownAstNode = {
  alt?: unknown;
  children?: MarkdownAstNode[];
  title?: unknown;
  type?: string;
  url?: unknown;
  value?: unknown;
};

const OBSIDIAN_IMAGE_EMBED_PATTERN = /!\[\[([^\]\n]{1,4096})\]\]/g;
const IMAGE_TARGET_PATTERN = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;
const DATA_IMAGE_PATTERN = /^data:image\/(?:avif|bmp|gif|jpeg|png|webp);/i;
const SIZE_ALIAS_PATTERN = /^\d{1,5}(?:x\d{1,5})?$/i;
const SKIPPED_PARENT_TYPES = new Set(['image', 'link', 'linkReference']);

function getImageTargetBase(src: string): string {
  const withoutHash = src.split('#')[0] ?? '';
  return withoutHash.split('?')[0] ?? '';
}

function isImageTarget(src: string): boolean {
  if (DATA_IMAGE_PATTERN.test(src)) return true;
  const internalImagePrefix = /^img:/i.test(src) ? src.slice(src.indexOf(':') + 1) : src;
  return IMAGE_TARGET_PATTERN.test(getImageTargetBase(internalImagePrefix));
}

export function parseObsidianImageEmbedTarget(rawTarget: string): {
  src: string;
  alt: string;
  title: null;
} | null {
  const [rawSrc = '', rawAlias = ''] = rawTarget.split('|');
  const safeSrc = sanitizeNoteMediaSrc(rawSrc.trim());
  if (!safeSrc || !isImageTarget(safeSrc)) {
    return null;
  }

  const alias = rawAlias.trim();
  return {
    src: safeSrc,
    alt: alias && !SIZE_ALIAS_PATTERN.test(alias) ? alias : '',
    title: null,
  };
}

function splitTextNode(node: MarkdownAstNode): MarkdownAstNode[] | null {
  if (node.type !== 'text' || typeof node.value !== 'string' || !node.value.includes('![[')) {
    return null;
  }

  const parts: MarkdownAstNode[] = [];
  let changed = false;
  let lastIndex = 0;
  OBSIDIAN_IMAGE_EMBED_PATTERN.lastIndex = 0;

  for (const match of node.value.matchAll(OBSIDIAN_IMAGE_EMBED_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const matchedText = match[0] ?? '';
    const target = match[1] ?? '';
    if (matchIndex > lastIndex) {
      parts.push({ type: 'text', value: node.value.slice(lastIndex, matchIndex) });
    }

    const image = parseObsidianImageEmbedTarget(target);
    if (image) {
      parts.push({
        type: 'image',
        url: image.src,
        alt: image.alt,
        title: image.title,
      });
      changed = true;
    } else {
      parts.push({ type: 'text', value: matchedText });
    }
    lastIndex = matchIndex + matchedText.length;
  }

  if (!changed) {
    return null;
  }

  if (lastIndex < node.value.length) {
    parts.push({ type: 'text', value: node.value.slice(lastIndex) });
  }

  return parts;
}

export function remarkObsidianImageEmbeds() {
  return (tree: MarkdownAstNode) => {
    if (!canTransformMarkdownAst(tree)) {
      return;
    }

    const stack = [tree];
    while (stack.length > 0) {
      const node = stack.pop()!;
      const children = node.children;
      if (!Array.isArray(children) || SKIPPED_PARENT_TYPES.has(node.type ?? '')) {
        continue;
      }

      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        const replacement = splitTextNode(child);
        if (replacement) {
          children.splice(index, 1, ...replacement);
          continue;
        }
        stack.push(child);
      }
    }
  };
}
