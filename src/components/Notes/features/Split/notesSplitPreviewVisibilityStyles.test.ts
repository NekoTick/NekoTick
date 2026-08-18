import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('split preview visibility styles', () => {
  it('skips offscreen layout and paint for ordinary top-level Markdown blocks', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/common/markdown/markdownSurface.css'),
      'utf8',
    );
    const rule = css.match(
      /\[data-notes-split-preview-content='true'\]\s*>\s*:is\([\s\S]*?\)\s*\{[\s\S]*?\n\}/,
    )?.[0] ?? '';

    expect(rule).toContain('content-visibility: auto;');
    expect(rule).toContain('contain-intrinsic-size: auto var(--vlaina-height-block-intrinsic);');
  });
});
