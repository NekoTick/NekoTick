import { describe, expect, it } from 'vitest';
import {
  getFrontmatterFenceMeta,
  getFrontmatterFenceLanguage,
  isInternalFrontmatterFence,
  isFrontmatterFenceLanguage,
  isFrontmatterShortcutText,
  normalizeLeadingFrontmatterMarkdown,
  serializeLeadingFrontmatterMarkdown,
} from './frontmatterMarkdown';

function frontmatterFenceOpen(): string {
  return `\`\`\`${getFrontmatterFenceLanguage()} ${getFrontmatterFenceMeta()}`;
}

describe('frontmatterMarkdown', () => {
  it('normalizes leading yaml frontmatter into an internal fenced block', () => {
    expect(normalizeLeadingFrontmatterMarkdown('---\ntitle: Demo\n---\n# Heading')).toBe(
      `${frontmatterFenceOpen()}\ntitle: Demo\n\`\`\`\n# Heading`,
    );
  });

  it('uses a longer internal fence when frontmatter contains a markdown fence', () => {
    const markdown = [
      '---',
      'title: Demo',
      'body: |',
      '  ```ts',
      '  const value = 1;',
      '  ```',
      '---',
      '# Heading',
    ].join('\n');
    const normalized = [
      '````yaml-frontmatter vlaina-internal-frontmatter',
      'title: Demo',
      'body: |',
      '  ```ts',
      '  const value = 1;',
      '  ```',
      '````',
      '# Heading',
    ].join('\n');

    expect(normalizeLeadingFrontmatterMarkdown(markdown)).toBe(normalized);
    expect(serializeLeadingFrontmatterMarkdown(normalized)).toBe(markdown);
  });

  it('normalizes leading yaml frontmatter after a UTF-8 BOM', () => {
    expect(normalizeLeadingFrontmatterMarkdown('\uFEFF---\ntitle: Demo\n---\n# Heading')).toBe(
      `${frontmatterFenceOpen()}\ntitle: Demo\n\`\`\`\n# Heading`,
    );
  });

  it('hides vlaina-managed frontmatter fields from the editor block', () => {
    expect(
      normalizeLeadingFrontmatterMarkdown(
        '---\ntitle: Demo\nvlaina_cover: "@biva/1"\nvlaina_icon: "🧏‍♂️"\n---\n# Heading'
      )
    ).toBe(`${frontmatterFenceOpen()}\ntitle: Demo\n\`\`\`\n# Heading`);
  });

  it('removes spacer blank lines that only exist above hidden vlaina-managed frontmatter', () => {
    expect(
      normalizeLeadingFrontmatterMarkdown(
        [
          '---',
          'title: Demo',
          '',
          '',
          'vlaina_cover: "@biva/1"',
          'vlaina_icon: "🧏‍♂️"',
          '---',
          '# Heading',
        ].join('\n'),
      )
    ).toBe(`${frontmatterFenceOpen()}\ntitle: Demo\n\`\`\`\n# Heading`);
  });

  it('keeps user-authored empty leading frontmatter blocks visible', () => {
    expect(normalizeLeadingFrontmatterMarkdown('---\n---\n# Heading')).toBe(
      `${frontmatterFenceOpen()}\n\`\`\`\n# Heading`
    );
  });

  it('removes hidden-only frontmatter from the editor surface', () => {
    expect(
      normalizeLeadingFrontmatterMarkdown('---\nvlaina_cover: "@biva/1"\nvlaina_updated: "2026-04-16T00:00:00.000Z"\n---\n# Heading')
    ).toBe('# Heading');
  });

  it('does not expose the body separator after hidden-only frontmatter as a leading editor blank line', () => {
    expect(
      normalizeLeadingFrontmatterMarkdown([
        '---',
        'vlaina_cover: "@biva/1"',
        'vlaina_icon: "🍓"',
        '---',
        '',
        '# Heading',
      ].join('\n')),
    ).toBe('# Heading');
  });

  it('keeps extra body blank lines after hidden-only frontmatter visible in the editor', () => {
    expect(
      normalizeLeadingFrontmatterMarkdown([
        '---',
        'vlaina_cover: "@biva/1"',
        'vlaina_icon: "🍓"',
        '---',
        '',
        '',
        '# Heading',
      ].join('\n')),
    ).toBe('\n# Heading');
  });

  it('serializes the internal fenced block back to markdown frontmatter', () => {
    expect(
      serializeLeadingFrontmatterMarkdown(
        `${frontmatterFenceOpen()}\ntitle: Demo\n\`\`\`\n# Heading`,
      ),
    ).toBe('---\ntitle: Demo\n---\n# Heading');
  });

  it('preserves a body blank line after the internal frontmatter block', () => {
    expect(
      serializeLeadingFrontmatterMarkdown(
        `${frontmatterFenceOpen()}\ntitle: Demo\n\`\`\`\n\n# Heading`,
      ),
    ).toBe('---\ntitle: Demo\n---\n\n# Heading');
  });

  it('preserves user-authored body blank lines after frontmatter', () => {
    expect(
      serializeLeadingFrontmatterMarkdown(
        `${frontmatterFenceOpen()}\ntitle: Demo\n\`\`\`\n\n\n# Heading`,
      ),
    ).toBe('---\ntitle: Demo\n---\n\n\n# Heading');
  });

  it('preserves editor-visible body blank lines when hidden-only frontmatter is restored', () => {
    expect(
      serializeLeadingFrontmatterMarkdown(
        '\n# Heading',
        '---\nvlaina_cover: "@biva/1"\n---\n\n# Heading',
      ),
    ).toBe('---\nvlaina_cover: "@biva/1"\n---\n\n\n# Heading');
  });

  it('restores the hidden-only frontmatter body separator without requiring an editor blank line', () => {
    expect(
      serializeLeadingFrontmatterMarkdown(
        '# Heading',
        '---\nvlaina_cover: "@biva/1"\nvlaina_icon: "🍓"\n---\n\n# Heading',
      ),
    ).toBe('---\nvlaina_cover: "@biva/1"\nvlaina_icon: "🍓"\n---\n\n# Heading');
  });

  it('restores a hidden-only frontmatter body separator that contains spaces', () => {
    expect(
      serializeLeadingFrontmatterMarkdown(
        '# Heading',
        '---\nvlaina_cover: "@biva/1"\n---\n   \n# Heading',
      ),
    ).toBe('---\nvlaina_cover: "@biva/1"\n---\n\n# Heading');
  });

  it('merges hidden vlaina-managed frontmatter back during serialization', () => {
    expect(
      serializeLeadingFrontmatterMarkdown(
        `${frontmatterFenceOpen()}\ntitle: Demo\n\`\`\`\n# Heading`,
        '---\ntitle: Demo\nvlaina_cover: "@biva/1"\nvlaina_updated: "2026-04-16T00:00:00.000Z"\n---\n# Heading',
      ),
    ).toBe(
      '---\ntitle: Demo\nvlaina_cover: "@biva/1"\n---\n# Heading'
    );
  });

  it('preserves two authored separator lines before hidden metadata', () => {
    expect(
      serializeLeadingFrontmatterMarkdown(
        `${frontmatterFenceOpen()}\ntitle: Demo\n\`\`\`\n# Heading`,
        '---\ntitle: Demo\n\n\nvlaina_cover: "@biva/1"\n---\n# Heading',
      ),
    ).toBe(
      '---\ntitle: Demo\n\n\nvlaina_cover: "@biva/1"\n---\n# Heading'
    );
  });

  it('keeps visible frontmatter spacing stable when hidden metadata is merged back', () => {
    expect(
      serializeLeadingFrontmatterMarkdown(
        `${frontmatterFenceOpen()}\ntitle: Demo\nsummary: Test\n\`\`\`\n\n# Heading`,
        '---\ntitle: Demo\nsummary: Test\n\nvlaina_cover: "@biva/1"\n---\n\n# Heading',
      ),
    ).toBe(
      '---\ntitle: Demo\nsummary: Test\n\nvlaina_cover: "@biva/1"\n---\n\n# Heading'
    );
  });

  it('restores hidden vlaina-managed frontmatter when the editor shows no frontmatter block', () => {
    expect(
      serializeLeadingFrontmatterMarkdown(
        '# Heading',
        '---\nvlaina_cover: "@biva/1"\nvlaina_updated: "2026-04-16T00:00:00.000Z"\n---\n# Heading',
      ),
    ).toBe(
      '---\nvlaina_cover: "@biva/1"\n---\n# Heading'
    );
  });

  it('recognizes frontmatter shortcut and fence language', () => {
    expect(isFrontmatterShortcutText('---')).toBe(true);
    expect(isFrontmatterShortcutText('--- \t')).toBe(true);
    expect(isFrontmatterShortcutText(' --- ')).toBe(false);
    expect(isFrontmatterShortcutText('--')).toBe(false);
    expect(isFrontmatterFenceLanguage(getFrontmatterFenceLanguage())).toBe(true);
    expect(isInternalFrontmatterFence(getFrontmatterFenceLanguage(), getFrontmatterFenceMeta())).toBe(true);
    expect(isInternalFrontmatterFence(getFrontmatterFenceLanguage(), null)).toBe(false);
    expect(isFrontmatterFenceLanguage('yaml')).toBe(false);
  });

  it('leaves user-authored leading yaml-frontmatter code blocks as markdown', () => {
    const markdown = [
      `\`\`\`${getFrontmatterFenceLanguage()}`,
      'title: Demo',
      '```',
      '# Heading',
    ].join('\n');

    expect(serializeLeadingFrontmatterMarkdown(markdown)).toBe(markdown);
  });

  it('leaves oversized unclosed leading frontmatter candidates as markdown', () => {
    const markdown = [
      '---',
      ...Array.from({ length: 2050 }, (_, index) => `line_${index}: value`),
      '# Heading',
    ].join('\n');

    expect(normalizeLeadingFrontmatterMarkdown(markdown)).toBe(markdown);
  });

  it('leaves oversized unclosed internal frontmatter candidates as markdown', () => {
    const markdown = [
      frontmatterFenceOpen(),
      ...Array.from({ length: 2050 }, (_, index) => `line_${index}: value`),
      '# Heading',
    ].join('\n');

    expect(serializeLeadingFrontmatterMarkdown(markdown)).toBe(markdown);
  });
});
