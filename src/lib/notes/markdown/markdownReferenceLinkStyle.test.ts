import { describe, expect, it } from 'vitest';

import { restoreReferenceLinkStyleFromReference } from './markdownReferenceLinkStyle';

describe('restoreReferenceLinkStyleFromReference', () => {
  it('preserves unused definitions exactly', () => {
    const reference = [
      '# Before',
      '[docs]: https://example.test/docs "Docs"',
      '~~~after',
      'after',
      '~~~',
    ].join('\n');

    expect(restoreReferenceLinkStyleFromReference(
      ['# Before', '~~~after', 'after', '~~~'].join('\n'),
      reference,
    )).toBe(reference);
  });

  it('preserves blank lines on both sides of a middle unused definition', () => {
    const reference = [
      'Before',
      '',
      '[unused]: https://example.test/unused',
      '',
      'After',
    ].join('\n');

    expect(restoreReferenceLinkStyleFromReference(
      ['Before', '', 'After'].join('\n'),
      reference,
    )).toBe(reference);
  });

  it('preserves adjacent and duplicate-label definitions in source order', () => {
    const reference = [
      '# Before',
      '[docs]: https://example.test/first',
      '[unused]: https://example.test/unused',
      '[DOCS]: https://example.test/second',
      '## After',
    ].join('\n');

    expect(restoreReferenceLinkStyleFromReference(
      ['# Before', '## After'].join('\n'),
      reference,
    )).toBe(reference);
  });

  it('restores multiline destinations and titles with reference link style', () => {
    const reference = [
      'Read [Docs][docs].',
      '[docs]:',
      '  <docs/file name.md>',
      '  "Docs title"',
      'After',
    ].join('\n');

    expect(restoreReferenceLinkStyleFromReference(
      ['Read [Docs](<docs/file name.md> "Docs title").', 'After'].join('\n'),
      reference,
    )).toBe(reference);
  });

  it('restores the correct occurrence when equivalent inline and reference links share a line', () => {
    const reference = [
      'Read [Docs](https://example.test/docs) then [Docs][docs].',
      '',
      '[docs]: https://example.test/docs',
    ].join('\n');
    const serialized = 'Read [Docs](https://example.test/docs) then [Docs](https://example.test/docs).';

    expect(restoreReferenceLinkStyleFromReference(serialized, reference)).toBe(reference);
  });

  it('anchors a definition after its usage when an earlier block grows during serialization', () => {
    const reference = [
      '    indented code',
      '',
      '',
      'Read [Docs][docs].',
      '',
      '[docs]: https://example.test/docs',
      '',
      '',
      'After.',
    ].join('\n');
    const serialized = [
      '```',
      'indented code',
      '```',
      '',
      '',
      'Read [Docs](https://example.test/docs).',
      '',
      '',
      '',
      '',
      'After.',
    ].join('\n');

    expect(restoreReferenceLinkStyleFromReference(serialized, reference)).toBe([
      '```',
      'indented code',
      '```',
      '',
      '',
      'Read [Docs][docs].',
      '',
      '[docs]: https://example.test/docs',
      '',
      '',
      'After.',
    ].join('\n'));
  });

  it('does not treat fenced or frontmatter text as definitions', () => {
    const reference = [
      '---',
      '[meta]: keep',
      '---',
      '~~~md',
      '[code]: keep',
      '~~~',
      'After',
    ].join('\n');

    expect(restoreReferenceLinkStyleFromReference(reference, reference)).toBe(reference);
  });
});
