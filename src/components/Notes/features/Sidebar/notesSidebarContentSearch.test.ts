import { describe, expect, it } from 'vitest';

import { MAX_HTML_TAG_END_SCAN_CHARS } from '@/lib/markdown/markdownHtmlRanges';
import {
  getNotesSidebarContentMatches,
  MAX_CONTENT_SEARCH_HTML_RANGES,
  MAX_CONTENT_SEARCH_SCANNED_CHARS,
  prepareNotesSidebarContentSearch,
} from './notesSidebarContentSearch';

describe('notesSidebarContentSearch', () => {
  it('reuses prepared search text by content identity and invalidates changed content', () => {
    const identity = {};

    expect(prepareNotesSidebarContentSearch('alpha', identity))
      .toBe(prepareNotesSidebarContentSearch('alpha', identity));
    expect(prepareNotesSidebarContentSearch('beta', identity))
      .not.toBe(prepareNotesSidebarContentSearch('alpha', identity));
  });

  it('does not report content matches for an empty normalized query', () => {
    expect(getNotesSidebarContentMatches('visible target', '')).toEqual([]);
  });

  it('quickly rejects plain content without a case-insensitive query match', () => {
    expect(getNotesSidebarContentMatches('Alpha body without the requested word', 'needle')).toEqual([]);
  });

  it('searches ordinary prose without changing visible punctuation', () => {
    expect(getNotesSidebarContentMatches('Release 2.0: ordinary text, fast search.', 'ordinary')).toEqual([
      {
        matchIndex: 13,
        ordinal: 0,
        snippet: 'Release 2.0: ordinary text, fast search.',
      },
    ]);
  });

  it('bounds skipped HTML ranges while searching note content', () => {
    const hiddenBlocks = Array.from(
      { length: MAX_CONTENT_SEARCH_HTML_RANGES + 100 },
      (_, index) => `<svg>hidden ${index}</svg>`,
    ).join('\n');
    const content = `${hiddenBlocks}\nvisible target`;

    const matches = getNotesSidebarContentMatches(content, 'target');

    expect(matches).toHaveLength(1);
    expect(matches[0]?.snippet).toBe('visible target');
  });

  it('does not match hidden markdown link or image targets', () => {
    const content = [
      '[visible text](https://hidden-target.example/path)',
      '![hidden alt](https://hidden-image.example/path)',
      'visible target',
    ].join('\n');

    expect(getNotesSidebarContentMatches(content, 'hidden-target')).toEqual([]);
    expect(getNotesSidebarContentMatches(content, 'hidden-image')).toEqual([]);
    expect(getNotesSidebarContentMatches(content, 'target')).toEqual([
      {
        matchIndex: 8,
        ordinal: 0,
        snippet: 'visible target',
      },
    ]);
  });

  it('does not match leading frontmatter content', () => {
    const content = [
      '---',
      'title: hidden target',
      'tags: hidden-target',
      '---',
      '',
      'visible target',
    ].join('\n');

    expect(getNotesSidebarContentMatches(content, 'hidden')).toEqual([]);
    expect(getNotesSidebarContentMatches(content, 'target')).toEqual([
      {
        matchIndex: 8,
        ordinal: 0,
        snippet: 'visible target',
      },
    ]);
  });

  it('does not match leading frontmatter content after a UTF-8 BOM', () => {
    const content = [
      '\uFEFF---',
      'title: hidden target',
      'tags: hidden-target',
      '---',
      '',
      'visible target',
    ].join('\n');

    expect(getNotesSidebarContentMatches(content, 'hidden')).toEqual([]);
    expect(getNotesSidebarContentMatches(content, 'target')).toEqual([
      {
        matchIndex: 8,
        ordinal: 0,
        snippet: 'visible target',
      },
    ]);
  });

  it('searches indented leading thematic breaks as normal markdown', () => {
    const content = [
      '  ---',
      'visible target',
      '  ---',
    ].join('\n');

    expect(getNotesSidebarContentMatches(content, 'target')).toEqual([
      {
        matchIndex: 8,
        ordinal: 0,
        snippet: 'visible target',
      },
    ]);
  });

  it('searches decoded markdown character references as visible text', () => {
    const content = 'Fish &amp; Chips and &#x1F363; are visible';

    expect(getNotesSidebarContentMatches(content, '&')).toEqual([
      {
        matchIndex: 5,
        ordinal: 0,
        snippet: 'Fish & Chips and 🍣 are visible',
      },
    ]);
    expect(getNotesSidebarContentMatches(content, 'amp')).toEqual([]);
    expect(getNotesSidebarContentMatches(content, '🍣')).toEqual([
      {
        matchIndex: 17,
        ordinal: 0,
        snippet: 'Fish & Chips and 🍣 are visible',
      },
    ]);
  });

  it('maps content match indexes back to original text after case folding expands characters', () => {
    expect(getNotesSidebarContentMatches('İstanbul note body', 'note')).toEqual([
      {
        matchIndex: 'İstanbul '.length,
        ordinal: 0,
        snippet: 'İstanbul note body',
      },
    ]);
  });

  it('does not match HTML comments, tags, or attributes', () => {
    const content = [
      '<!-- hidden comment target -->',
      '<span title="hidden attribute target">visible</span>',
      'visible target',
    ].join('\n');

    expect(getNotesSidebarContentMatches(content, 'comment')).toEqual([]);
    expect(getNotesSidebarContentMatches(content, 'attribute')).toEqual([]);
    expect(getNotesSidebarContentMatches(content, 'target')).toEqual([
      {
        matchIndex: 8,
        ordinal: 0,
        snippet: 'visible target',
      },
    ]);
  });

  it('does not match overlong inline HTML tag attributes', () => {
    const badLine = `<span title="hidden overlong target ${'a'.repeat(MAX_HTML_TAG_END_SCAN_CHARS)}`;
    const content = `${badLine}\nvisible target`;

    expect(getNotesSidebarContentMatches(content, 'overlong')).toEqual([]);
    expect(getNotesSidebarContentMatches(content, 'target')).toEqual([
      {
        matchIndex: 8,
        ordinal: 0,
        snippet: 'visible target',
      },
    ]);
  });

  it('counts empty lines against the content search scan budget', () => {
    const content = `${'\n'.repeat(MAX_CONTENT_SEARCH_SCANNED_CHARS + 1)}visible target`;

    expect(getNotesSidebarContentMatches(content, 'target')).toEqual([]);
  });
});
