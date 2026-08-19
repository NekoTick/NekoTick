import { afterEach, describe, expect, it, vi } from 'vitest';
import { highlightMarkdownCode, markdownHighlighter } from './highlighter';

describe('highlightMarkdownCode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not auto-detect an explicitly unsupported language', () => {
    const highlightAuto = vi.spyOn(markdownHighlighter, 'highlightAuto');
    const code = `<tag data-probe="${Date.now()}">plain</tag>`;

    expect(highlightMarkdownCode(code, 'unsupported-plain-text')).toContain('&lt;tag');
    expect(highlightAuto).not.toHaveBeenCalled();
  });

  it('reuses highlighted output for repeated code blocks', () => {
    const highlight = vi.spyOn(markdownHighlighter, 'highlight');
    const code = `const cacheProbe${Date.now()} = true;`;

    const first = highlightMarkdownCode(code, 'typescript');
    const second = highlightMarkdownCode(code, 'typescript');

    expect(second).toBe(first);
    expect(highlight).toHaveBeenCalledOnce();
  });
});
