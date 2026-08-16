import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readCoreStyles() {
  return readFileSync(
    resolve(process.cwd(), 'src/components/Notes/features/Editor/styles/core.css'),
    'utf8',
  );
}

describe('lazy block visibility styles', () => {
  it('keeps ordinary paragraphs in normal layout while retaining heavy block containment', () => {
    const css = readCoreStyles();
    const ruleStart = css.indexOf(
      ".milkdown-editor[data-note-lazy-block-visibility='true'][data-markdown-compat-layer='native']",
    );
    expect(ruleStart).toBeGreaterThanOrEqual(0);

    const selectorEnd = css.indexOf('{', ruleStart);
    const ruleEnd = css.indexOf('}', selectorEnd);
    expect(selectorEnd).toBeGreaterThan(ruleStart);
    expect(ruleEnd).toBeGreaterThan(selectorEnd);

    const selector = css.slice(ruleStart, selectorEnd);
    const rule = css.slice(ruleStart, ruleEnd + 1);
    expect(selector).not.toContain('\n  p,');
    expect(selector).toContain('\n  p.editor-paragraph-has-image-block,');
    expect(selector).toContain('\n  pre,');
    expect(selector).toContain('\n  .code-block-container,');
    expect(rule).toContain('content-visibility: auto;');
    expect(rule).toContain('contain-intrinsic-size: auto var(--vlaina-height-block-intrinsic);');
  });
});
