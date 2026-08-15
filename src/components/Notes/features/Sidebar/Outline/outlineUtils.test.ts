import { describe, expect, it } from 'vitest';
import {
  areOutlineHeadingsEqual,
  createOutlineHeadingId,
  getHeadingLevelFromTagName,
  getOutlineFallbackText,
  MAX_OUTLINE_HEADING_TEXT_CHARS,
  normalizeHeadingText,
  readBoundedHeadingText,
} from './outlineUtils';

describe('outlineUtils', () => {
  it('parses heading levels from tag names', () => {
    expect(getHeadingLevelFromTagName('H1')).toBe(1);
    expect(getHeadingLevelFromTagName('h6')).toBe(6);
    expect(getHeadingLevelFromTagName('div')).toBeNull();
    expect(getHeadingLevelFromTagName('h9')).toBeNull();
  });

  it('normalizes heading text and falls back for blank values', () => {
    expect(normalizeHeadingText('  Hello   World  ')).toBe('Hello World');
    expect(normalizeHeadingText('   ')).toBe(getOutlineFallbackText());
  });

  it('reads heading text from text nodes with a fixed budget', () => {
    const heading = document.createElement('h2');
    const syntax = document.createElement('span');
    syntax.dataset.markdownSyntax = 'heading';
    syntax.textContent = '## ';
    heading.append(
      document.createTextNode('Alpha   '),
      document.createElement('span'),
      syntax,
      document.createTextNode('Beta'),
    );
    heading.querySelector('span')?.appendChild(document.createTextNode('Nested'));
    Object.defineProperty(heading, 'textContent', {
      get() {
        throw new Error('aggregate heading textContent should not be read');
      },
    });

    expect(readBoundedHeadingText(heading)).toBe('Alpha NestedBeta');

    const longHeading = document.createElement('h3');
    longHeading.appendChild(document.createTextNode('x'.repeat(MAX_OUTLINE_HEADING_TEXT_CHARS + 20)));

    expect(readBoundedHeadingText(longHeading)).toHaveLength(MAX_OUTLINE_HEADING_TEXT_CHARS);
  });

  it('creates stable outline ids', () => {
    expect(createOutlineHeadingId(0, 2, 'My Heading')).toBe('outline-0-h2-my-heading');
    expect(createOutlineHeadingId(7, 4, '###')).toBe('outline-7-h4-heading');
  });

  it('compares outline arrays by semantic fields', () => {
    const left = [
      { id: 'a', level: 1, text: 'A', from: 0, to: 3 },
      { id: 'b', level: 2, text: 'B', from: 4, to: 7 },
    ];

    const right = [
      { id: 'a', level: 1, text: 'A', from: 0, to: 3 },
      { id: 'b', level: 2, text: 'B', from: 4, to: 7 },
    ];

    const changed = [
      { id: 'a', level: 1, text: 'A1', from: 0, to: 4 },
      { id: 'b', level: 2, text: 'B', from: 5, to: 8 },
    ];

    expect(areOutlineHeadingsEqual(left, right)).toBe(true);
    expect(areOutlineHeadingsEqual(left, changed)).toBe(false);
    expect(areOutlineHeadingsEqual(left, left.slice(0, 1))).toBe(false);
  });
});
