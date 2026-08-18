import { describe, expect, it } from 'vitest';
import {
  getNoteGraphLinkReferences,
  getNoteTags,
  getNoteWikiLinkReferences,
} from './noteTextAnalysis';

describe('note text analysis', () => {
  it('reuses prepared derivatives for the same content identity', () => {
    const identity = {};
    const content = '#tag [[Alpha]] [Beta](beta.md)';

    expect(getNoteTags(identity, content)).toBe(getNoteTags(identity, content));
    expect(getNoteWikiLinkReferences(identity, content))
      .toBe(getNoteWikiLinkReferences(identity, content));
    expect(getNoteGraphLinkReferences(identity, content))
      .toBe(getNoteGraphLinkReferences(identity, content));
  });

  it('invalidates derivatives when content changes on the same identity', () => {
    const identity = {};

    expect(getNoteTags(identity, '#alpha')).toEqual(['alpha']);
    expect(getNoteTags(identity, '#beta')).toEqual(['beta']);
  });

  it('keeps frontmatter links in the graph but out of backlinks and tags', () => {
    const identity = {};
    const content = [
      '---',
      'related: "[[Frontmatter]]"',
      'tag: "#hidden"',
      '---',
      '[[Body|label]] #visible',
      '`[[Code]] #code`',
    ].join('\n');

    expect(getNoteGraphLinkReferences(identity, content)).toContain('Frontmatter');
    expect(getNoteWikiLinkReferences(identity, content)).toEqual([
      expect.objectContaining({ aliased: true, target: 'Body' }),
    ]);
    expect(getNoteTags(identity, content)).toEqual(['visible']);
  });
});
