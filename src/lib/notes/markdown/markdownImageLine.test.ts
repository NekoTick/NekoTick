import { describe, expect, it, vi } from 'vitest';
import {
  isMarkdownImageOnlyLine,
  MAX_MARKDOWN_IMAGE_ONLY_LINE_SCAN_CHARS,
} from './markdownImageLine';
import {
  normalizeSerializedMarkdownDocument,
  preserveMarkdownBlankLinesForEditor,
} from './markdownSerializationUtils';

const MARKDOWN_BLANK_LINE_PLACEHOLDER = '<!--vlaina-markdown-blank-line-->';

describe('markdown image line helpers', () => {
  it('recognizes standalone markdown image lines with nested labels and parenthesized targets', () => {
    expect(
      isMarkdownImageOnlyLine('![outer [nested] label](assets/file(one).png "Demo title")')
    ).toBe(true);
    expect(
      isMarkdownImageOnlyLine('  ![alt `](not target)`](<assets/file(one).png>)  ')
    ).toBe(true);
    expect(
      isMarkdownImageOnlyLine('![angle](<assets/file) with space.png> "Demo title")')
    ).toBe(true);
  });

  it('rejects escaped, indented, and inline markdown image text', () => {
    expect(isMarkdownImageOnlyLine('\\![alt](image.png)')).toBe(false);
    expect(isMarkdownImageOnlyLine('    ![alt](image.png)')).toBe(false);
    expect(isMarkdownImageOnlyLine('before ![alt](image.png)')).toBe(false);
    expect(isMarkdownImageOnlyLine('[link](image.png)')).toBe(false);
  });

  it('handles long escaped bracket runs without repeated backslash scans', () => {
    const escapedBrackets = Array.from({ length: 500 }, () => '\\]').join('');

    expect(isMarkdownImageOnlyLine(`![${escapedBrackets}](image.png)`)).toBe(true);
    expect(isMarkdownImageOnlyLine(`${'\\'.repeat(501)}![alt](image.png)`)).toBe(false);
  });

  it('does not allocate escaped state for oversized image-only candidates', () => {
    const arrayFromSpy = vi.spyOn(Array, 'from');
    const line = `![${'a'.repeat(MAX_MARKDOWN_IMAGE_ONLY_LINE_SCAN_CHARS)}](image.png)`;

    try {
      expect(isMarkdownImageOnlyLine(line)).toBe(false);
      expect(arrayFromSpy).not.toHaveBeenCalled();
    } finally {
      arrayFromSpy.mockRestore();
    }
  });

  it('keeps structural blank lines after complex markdown images during editor input', () => {
    const markdown = [
      '![outer [nested] label](assets/file(one).png "Demo title")',
      '',
      '',
      '# Next',
    ].join('\n');

    expect(preserveMarkdownBlankLinesForEditor(markdown)).toBe([
      '![outer [nested] label](assets/file(one).png "Demo title")',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '# Next',
    ].join('\n'));
    expect(normalizeSerializedMarkdownDocument(preserveMarkdownBlankLinesForEditor(markdown))).toBe(markdown);
  });

  it('keeps structural blank lines after complex markdown images during serialization cleanup', () => {
    const markdown = [
      '![outer [nested] label](assets/file(one).png "Demo title")',
      '',
      MARKDOWN_BLANK_LINE_PLACEHOLDER,
      '# Next',
    ].join('\n');

    expect(normalizeSerializedMarkdownDocument(markdown)).toBe([
      '![outer [nested] label](assets/file(one).png "Demo title")',
      '',
      '',
      '# Next',
    ].join('\n'));
  });
});
