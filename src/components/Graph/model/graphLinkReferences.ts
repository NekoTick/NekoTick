import {
  getMarkdownLinkHref,
  MARKDOWN_LINK_PATTERN_GLOBAL,
} from '@/lib/notes/markdown/markdownLinkParser';
import { collectMarkdownReferenceLinkDestinations } from '@/lib/notes/markdown/markdownReferenceLinkStyle';
import {
  getNoteMarkdownExcludedRanges,
  isNoteMarkdownIndexExcluded,
} from '@/lib/notes/tags';
import type { NoteContentCacheEntry } from '@/stores/notes/types';

const WIKI_LINK_PATTERN = /\[\[([^\]\n]{1,512})\]\]/g;
const graphLinkReferenceCache = new WeakMap<
  NoteContentCacheEntry,
  { content: string; references: string[] }
>();

function hasGraphInlineLinkSyntax(content: string): boolean {
  return content.includes('](')
    || content.includes(']（')
    || content.includes('】(')
    || content.includes('】（');
}

function hasGraphLinkSyntax(content: string): boolean {
  return content.includes('[[')
    || hasGraphInlineLinkSyntax(content)
    || content.includes(']:');
}

function hasGraphExcludedRangeSyntax(content: string): boolean {
  return content.includes('`')
    || content.includes('~~~')
    || content.includes('<')
    || content.includes('](');
}

function collectGraphLinkReferences(content: string): string[] {
  const references: string[] = [];
  let excludedRanges: ReturnType<typeof getNoteMarkdownExcludedRanges> | null =
    hasGraphExcludedRangeSyntax(content) ? null : [];
  const getExcludedRanges = () => {
    excludedRanges ??= getNoteMarkdownExcludedRanges(content, { excludeFrontmatter: false });
    return excludedRanges;
  };
  let excludedRangeCursor = 0;
  WIKI_LINK_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  if (content.includes('[[')) {
    while ((match = WIKI_LINK_PATTERN.exec(content)) !== null) {
      const ranges = getExcludedRanges();
      while (
        excludedRangeCursor < ranges.length &&
        ranges[excludedRangeCursor]!.to <= match.index
      ) {
        excludedRangeCursor += 1;
      }
      if (isNoteMarkdownIndexExcluded(match.index, ranges, excludedRangeCursor)) continue;

      references.push(match[1]!.split('|', 1)[0] ?? '');
    }
  }

  if (hasGraphInlineLinkSyntax(content)) {
    excludedRangeCursor = 0;
    MARKDOWN_LINK_PATTERN_GLOBAL.lastIndex = 0;
    while ((match = MARKDOWN_LINK_PATTERN_GLOBAL.exec(content)) !== null) {
      const ranges = getExcludedRanges();
      while (
        excludedRangeCursor < ranges.length
        && ranges[excludedRangeCursor]!.to <= match.index
      ) {
        excludedRangeCursor += 1;
      }
      if (
        content[match.index - 1] === '!'
        || isNoteMarkdownIndexExcluded(match.index, ranges, excludedRangeCursor)
      ) {
        continue;
      }

      references.push(getMarkdownLinkHref(match[2] ?? ''));
    }
  }

  if (content.includes(']:')) {
    for (const destination of collectMarkdownReferenceLinkDestinations(content)) {
      references.push(destination);
    }
  }

  return references;
}

export function getGraphLinkReferences(entry: NoteContentCacheEntry): readonly string[] {
  const cached = graphLinkReferenceCache.get(entry);
  if (cached?.content === entry.content) return cached.references;
  const references = hasGraphLinkSyntax(entry.content)
    ? collectGraphLinkReferences(entry.content)
    : [];
  graphLinkReferenceCache.set(entry, { content: entry.content, references });
  return references;
}
