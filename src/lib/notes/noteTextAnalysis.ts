import type { Root, RootContent } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import {
  getMarkdownLinkHref,
  MARKDOWN_LINK_PATTERN_ALLOW_EMPTY_LABEL_GLOBAL,
} from './markdown/markdownLinkParser';
import {
  extractNoteTagOccurrences,
  getNoteMarkdownExcludedRanges,
  isNoteMarkdownIndexExcluded,
  type NoteMarkdownExcludedRange,
  type NoteTagOccurrence,
} from './tags';

const WIKI_LINK_PATTERN = /\[\[([^\]\n]{1,512})\]\]/g;
const commonMarkLinkParser = unified().use(remarkParse);

export interface NoteWikiLinkReference {
  aliased: boolean;
  from: number;
  target: string;
  to: number;
}

interface NoteTextAnalysis {
  content: string;
  excludedRanges?: NoteMarkdownExcludedRange[];
  graphExcludedRanges?: NoteMarkdownExcludedRange[];
  graphLinkReferences?: string[];
  graphWikiLinkReferences?: NoteWikiLinkReference[];
  tagOccurrences?: NoteTagOccurrence[];
  tags?: string[];
  wikiLinkReferences?: NoteWikiLinkReference[];
}

const analysisByIdentity = new WeakMap<object, NoteTextAnalysis>();

function getAnalysis(identity: object, content: string): NoteTextAnalysis {
  const cached = analysisByIdentity.get(identity);
  if (cached?.content === content) {
    return cached;
  }

  const analysis = { content };
  analysisByIdentity.set(identity, analysis);
  return analysis;
}

function getExcludedRanges(analysis: NoteTextAnalysis): NoteMarkdownExcludedRange[] {
  analysis.excludedRanges ??= getNoteMarkdownExcludedRanges(analysis.content);
  return analysis.excludedRanges;
}

function getGraphExcludedRanges(analysis: NoteTextAnalysis): NoteMarkdownExcludedRange[] {
  analysis.graphExcludedRanges ??= getNoteMarkdownExcludedRanges(
    analysis.content,
    { excludeFrontmatter: false },
  );
  return analysis.graphExcludedRanges;
}

function collectWikiLinkReferences(
  content: string,
  excludedRanges: readonly NoteMarkdownExcludedRange[],
): NoteWikiLinkReference[] {
  const references: NoteWikiLinkReference[] = [];
  let excludedRangeCursor = 0;
  WIKI_LINK_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_PATTERN.exec(content)) !== null) {
    while (
      excludedRangeCursor < excludedRanges.length
      && excludedRanges[excludedRangeCursor]!.to <= match.index
    ) {
      excludedRangeCursor += 1;
    }
    if (isNoteMarkdownIndexExcluded(match.index, excludedRanges, excludedRangeCursor)) {
      continue;
    }

    const rawTarget = match[1] ?? '';
    const aliasIndex = rawTarget.indexOf('|');
    references.push({
      aliased: aliasIndex >= 0,
      from: match.index,
      target: aliasIndex >= 0 ? rawTarget.slice(0, aliasIndex) : rawTarget,
      to: match.index + match[0].length,
    });
  }

  return references;
}

function collectCommonMarkLinkReferences(content: string): string[] {
  const root = commonMarkLinkParser.parse(content) as Root;
  const definitions = new Map<string, string>();
  const references: Array<{ identifier?: string; target?: string }> = [];
  const stack: RootContent[] = [...root.children].reverse();

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === 'definition' && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node.url);
    } else if (node.type === 'link') {
      references.push({ target: node.url });
    } else if (node.type === 'linkReference') {
      references.push({ identifier: node.identifier });
    }

    if ('children' in node) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index] as RootContent);
      }
    }
  }

  return references.flatMap(({ identifier, target }) => {
    const resolved = target ?? (identifier ? definitions.get(identifier) : undefined);
    return resolved ? [resolved] : [];
  });
}

export function getNoteWikiLinkReferences(
  identity: object,
  content: string,
): readonly NoteWikiLinkReference[] {
  const analysis = getAnalysis(identity, content);
  analysis.wikiLinkReferences ??= content.includes('[[')
    ? collectWikiLinkReferences(content, getExcludedRanges(analysis))
    : [];
  return analysis.wikiLinkReferences;
}

export function getNoteGraphLinkReferences(
  identity: object,
  content: string,
): readonly string[] {
  const analysis = getAnalysis(identity, content);
  if (analysis.graphLinkReferences) {
    return analysis.graphLinkReferences;
  }

  const references: string[] = [];
  if (content.includes('[[')) {
    analysis.graphWikiLinkReferences ??= collectWikiLinkReferences(
      content,
      getGraphExcludedRanges(analysis),
    );
    for (const reference of analysis.graphWikiLinkReferences) {
      references.push(reference.target);
    }
  }

  if (
    content.includes('](')
    || content.includes('][')
    || content.includes(']:')
  ) {
    references.push(...collectCommonMarkLinkReferences(content));
  }

  if (
    content.includes('](')
    || content.includes(']（')
    || content.includes('】(')
    || content.includes('】（')
  ) {
    const excludedRanges = getGraphExcludedRanges(analysis);
    let excludedRangeCursor = 0;
    MARKDOWN_LINK_PATTERN_ALLOW_EMPTY_LABEL_GLOBAL.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MARKDOWN_LINK_PATTERN_ALLOW_EMPTY_LABEL_GLOBAL.exec(content)) !== null) {
      while (
        excludedRangeCursor < excludedRanges.length
        && excludedRanges[excludedRangeCursor]!.to <= match.index
      ) {
        excludedRangeCursor += 1;
      }
      if (
        content[match.index - 1] === '!'
        || isNoteMarkdownIndexExcluded(match.index, excludedRanges, excludedRangeCursor)
      ) {
        continue;
      }
      references.push(getMarkdownLinkHref(match[2] ?? ''));
    }
  }

  analysis.graphLinkReferences = references;
  return references;
}

export function getNoteTagOccurrences(
  identity: object,
  content: string,
): readonly NoteTagOccurrence[] {
  const analysis = getAnalysis(identity, content);
  analysis.tagOccurrences ??= extractNoteTagOccurrences(
    content,
    getExcludedRanges(analysis),
  );
  return analysis.tagOccurrences;
}

export function getNoteTags(identity: object, content: string): readonly string[] {
  const analysis = getAnalysis(identity, content);
  analysis.tags ??= Array.from(new Set(
    getNoteTagOccurrences(identity, content).map((occurrence) => occurrence.tag),
  ));
  return analysis.tags;
}
