import { canTransformMarkdownAst } from '../../markdownAstBudget';
import {
  findObsidianImageEmbedSourceTokens,
  type ObsidianImageEmbedMetadata,
} from '@/lib/notes/markdown/obsidianImageEmbed';

export { parseObsidianImageEmbedTarget } from '@/lib/notes/markdown/obsidianImageEmbed';

type MarkdownAstNode = {
  alt?: unknown;
  children?: MarkdownAstNode[];
  data?: {
    hProperties?: Record<string, unknown>;
    obsidianImageEmbed?: ObsidianImageEmbedMetadata;
  };
  position?: {
    end?: { offset?: number };
    start?: { offset?: number };
  };
  title?: unknown;
  type?: string;
  url?: unknown;
  value?: unknown;
};

const SKIPPED_PARENT_TYPES = new Set(['image', 'link', 'linkReference']);

function isEscapedSourceToken(rawSource: string, source: string, fromIndex: number): {
  escaped: boolean;
  nextIndex: number;
} {
  const index = rawSource.indexOf(source, fromIndex);
  if (index < 0) return { escaped: false, nextIndex: fromIndex };
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && rawSource[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return { escaped: slashCount % 2 === 1, nextIndex: index + source.length };
}

function splitTextNode(node: MarkdownAstNode, rawSource?: string): MarkdownAstNode[] | null {
  if (node.type !== 'text' || typeof node.value !== 'string' || !node.value.includes('![[')) {
    return null;
  }

  const parts: MarkdownAstNode[] = [];
  let lastIndex = 0;
  let rawCursor = 0;
  let changed = false;
  const tokens = findObsidianImageEmbedSourceTokens(node.value);
  for (const token of tokens) {
    if (rawSource !== undefined) {
      const rawMatch = isEscapedSourceToken(rawSource, token.source, rawCursor);
      rawCursor = rawMatch.nextIndex;
      if (rawMatch.escaped) continue;
    }
    if (token.embedStart > lastIndex) {
      parts.push({ type: 'text', value: node.value.slice(lastIndex, token.embedStart) });
    }

    const { target } = token;
    parts.push({
      type: 'image',
      url: target.src,
      alt: target.alt,
      title: target.title,
      data: {
        obsidianImageEmbed: target.obsidianEmbed,
        hProperties: {
          dataObsidianImageEmbed: 'true',
          ...(target.obsidianEmbed.width
            ? { width: Number.parseInt(target.obsidianEmbed.width, 10) }
            : {}),
          ...(target.obsidianEmbed.height ? { height: target.obsidianEmbed.height } : {}),
        },
      },
    });
    lastIndex = token.embedEnd;
    changed = true;
  }

  if (!changed) return null;

  if (lastIndex < node.value.length) {
    parts.push({ type: 'text', value: node.value.slice(lastIndex) });
  }

  return parts;
}

export function remarkObsidianImageEmbeds() {
  return (tree: MarkdownAstNode, file?: { value?: unknown }) => {
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
        const sourceStart = child.position?.start?.offset;
        const sourceEnd = child.position?.end?.offset;
        const rawSource = typeof file?.value === 'string'
          && typeof sourceStart === 'number'
          && typeof sourceEnd === 'number'
          ? file.value.slice(sourceStart, sourceEnd)
          : undefined;
        const replacement = splitTextNode(child, rawSource);
        if (replacement) {
          children.splice(index, 1, ...replacement);
          continue;
        }
        stack.push(child);
      }
    }
  };
}
