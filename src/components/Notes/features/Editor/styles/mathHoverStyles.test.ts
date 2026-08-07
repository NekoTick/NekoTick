import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function extractCssRuleContaining(source: string, marker: string | RegExp) {
  const markerIndex = typeof marker === 'string' ? source.indexOf(marker) : source.search(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);

  const previousRuleEnd = source.lastIndexOf('}', markerIndex);
  const selectorIndex = previousRuleEnd < 0 ? 0 : previousRuleEnd + 1;
  const start = source.indexOf('{', selectorIndex);
  expect(start).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(selectorIndex, index + 1).trimStart();
      }
    }
  }

  throw new Error(`Could not extract CSS rule containing marker: ${marker}`);
}

function readMathStyles() {
  return readFileSync(
    resolve(process.cwd(), 'src/components/Notes/features/Editor/styles/math-editor.css'),
    'utf8'
  );
}

function readAtomicRichBlockSelectionStyles() {
  return readFileSync(
    resolve(process.cwd(), 'src/components/Notes/features/Editor/styles/block-selection-atomic-rich.css'),
    'utf8'
  );
}

function readThemeStyle() {
  return readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');
}

describe('math hover styles', () => {
  it('keeps clickable hover affordances for inline and block math nodes', () => {
    const css = readMathStyles();
    const themeCss = readThemeStyle();

    expect(css).toContain(".milkdown [data-type='math-inline'],");
    expect(css).toContain(".milkdown [data-type='math-block'],");
    expect(css).toContain(".milkdown .mermaid-block {");
    expect(themeCss).toContain('--vlaina-math-hover-color: var(--vlaina-hover-filled);');
    expect(themeCss).toContain('--vlaina-math-hover-bleed-y-default: var(--vlaina-space-4px);');
    expect(themeCss).toContain('--vlaina-math-hover-bleed-y: var(--vlaina-math-hover-bleed-y-default);');
    expect(css).toContain('box-decoration-break: clone;');
    expect(css).toContain(".milkdown [data-type='math-inline']:hover,");
    expect(css).toContain(".milkdown .mermaid-block:hover,");
    expect(css).toContain(".milkdown [data-type='math-block'].ProseMirror-selectednode,");
    expect(css).toContain(".milkdown .mermaid-block.ProseMirror-selectednode,");
    expect(css).toContain('.milkdown .ProseMirror.editor-atomic-block-keyboard-selected,');
    expect(css).toContain('caret-color: transparent;');
    expect(css).toContain('background: var(--vlaina-math-hover-color);');
    expect(css).toContain('inset 0 0 0 1px var(--vlaina-math-hover-color),');
    expect(css).toContain('border-radius: var(--vlaina-radius-0);');
    expect(css).toContain('cursor: pointer !important;');
  });

  it('uses the shared block selection surface for selected math, HTML, and mermaid nodes', () => {
    const css = readMathStyles();
    const selectedRule = extractCssRuleContaining(
      css,
      '--vlaina-block-selection-color: var(--vlaina-block-selection-color-default);'
    );

    expect(selectedRule).toContain(".milkdown [data-type='math-inline'].ProseMirror-selectednode,");
    expect(selectedRule).toContain(".milkdown [data-type='math-block'].ProseMirror-selectednode,");
    expect(selectedRule).toContain(".milkdown [data-type='html-block']:not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->']):not([data-value='<!--vlaina-markdown-tight-heading-->']).ProseMirror-selectednode,");
    expect(selectedRule).toContain('.milkdown .mermaid-block.ProseMirror-selectednode {');
    expect(selectedRule).toContain('--vlaina-block-selection-color: var(--vlaina-block-selection-color-default);');
    expect(selectedRule).toContain('background: var(--vlaina-block-selection-color);');
    expect(selectedRule).toContain('box-shadow: var(--vlaina-block-selection-shadow);');
  });

  it('keeps mermaid blocks on the shared math hover treatment without a standalone frame', () => {
    const mathCss = readMathStyles();
    const themeCss = readThemeStyle();
    const extendedCss = readFileSync(
      resolve(process.cwd(), 'src/components/Notes/features/Editor/styles/extended.css'),
      'utf8'
    );

    expect(mathCss).toContain(".milkdown .mermaid-block:hover,");
    const mermaidRule = extendedCss.match(/^\.milkdown \.mermaid-block \{(?<body>[\s\S]*?)\n\}/m)?.groups?.body ?? '';
    const lazyMermaidRule = extendedCss.match(
      /\.milkdown-editor\[data-note-lazy-block-visibility='true'\]\[data-markdown-compat-layer='native'\][\s\S]*?\.milkdown \.ProseMirror:not\(\.editor-find-active\) \.mermaid-block \{(?<body>[\s\S]*?)\n\}/,
    )?.groups?.body ?? '';
    const placeholderRule = extendedCss.match(
      /\.milkdown \.mermaid-placeholder \{(?<body>[\s\S]*?)\n\}/,
    )?.groups?.body ?? '';

    expect(mermaidRule).not.toContain('content-visibility: auto;');
    expect(lazyMermaidRule).toContain('content-visibility: auto;');
    expect(lazyMermaidRule).toContain('contain-intrinsic-size: var(--vlaina-height-mermaid-intrinsic);');
    expect(themeCss).toContain('--vlaina-height-mermaid-intrinsic: auto var(--vlaina-size-180px);');
    expect(placeholderRule).toContain('min-height: var(--vlaina-size-180px);');
    expect(mermaidRule).toContain('background: transparent;');
    expect(mermaidRule).toContain('border: var(--vlaina-border-width-0);');
    expect(mermaidRule).toContain('border-radius: var(--vlaina-radius-0);');
    expect(extendedCss).not.toContain('.milkdown .mermaid-block:hover,\n.milkdown .mermaid-block:focus-visible {');
    expect(extendedCss).not.toContain('border-color: var(--vlaina-accent);');
    expect(extendedCss).not.toContain('box-shadow: 0 0 0 2px var(--vlaina-accent-light);');
  });

  it('suppresses math and mermaid hover affordances while dragging a block selection', () => {
    const mathCss = readMathStyles();
    const blockSelectionCss = readFileSync(
      resolve(process.cwd(), 'src/components/Notes/features/Editor/styles/block-selection.css'),
      'utf8'
    );

    expect(blockSelectionCss).toContain('.editor-block-selection-interaction-shield {');
    expect(blockSelectionCss).toContain('position: fixed;');
    expect(blockSelectionCss).toContain('inset: 0;');
    expect(blockSelectionCss).toContain('pointer-events: auto;');
    expect(mathCss).not.toContain('editor-block-selection-pending');
  });

  it('keeps selected atomic blocks from regaining hover affordances after block drag ends', () => {
    const css = readMathStyles();
    const atomicBlockSelectionCss = readAtomicRichBlockSelectionStyles();
    const selectedHoverCursorRule = extractCssRuleContaining(
      css,
      ').editor-block-selected:is(:hover, :focus-visible) * {'
    );
    const inlineSelectedHoverRule = extractCssRuleContaining(
      css,
      /\[data-type='math-inline'\]\s*\)\.editor-block-selected:is\(:hover, :focus-visible\)\s*\{/
    );
    const selectedAtomicSurfaceRule = extractCssRuleContaining(
      atomicBlockSelectionCss,
      /\[data-type='math-block'\]\.math-block-wrapper,\s*\[data-type='html-block'\]\.md-htmlblock-container/
    );

    expect(css).toContain('.milkdown .ProseMirror.editor-block-selection-enabled :is(');
    expect(selectedHoverCursorRule).toContain("[data-type='math-block'],");
    expect(selectedHoverCursorRule).toContain('.mermaid-block');
    expect(selectedHoverCursorRule).toContain('cursor: default !important;');
    expect(inlineSelectedHoverRule).toContain('background: transparent !important;');
    expect(inlineSelectedHoverRule).not.toContain('box-shadow: none !important;');
    expect(selectedAtomicSurfaceRule).toContain("[data-type='math-block'].math-block-wrapper");
    expect(selectedAtomicSurfaceRule).toContain("[data-type='html-block'].md-htmlblock-container");
    expect(selectedAtomicSurfaceRule).toContain('.mermaid-block');
    expect(selectedAtomicSurfaceRule).toContain('content-visibility: visible;');
    expect(selectedAtomicSurfaceRule).toContain('contain: none;');
    expect(selectedAtomicSurfaceRule).toContain('position: relative;');
    expect(selectedAtomicSurfaceRule).toContain('z-index: var(--vlaina-z-1);');
    expect(selectedAtomicSurfaceRule).toContain('overflow-x: visible;');
    expect(selectedAtomicSurfaceRule).toContain('overflow-y: visible;');
    expect(selectedAtomicSurfaceRule).toContain('--vlaina-atomic-rich-selected-border-outline: var(--vlaina-code-block-selected-border-width, var(--vlaina-border-width-2)) solid var(--vlaina-color-white);');
    expect(selectedAtomicSurfaceRule).toContain('--vlaina-atomic-rich-selected-border-outline-offset: calc(-1 * var(--vlaina-code-block-selected-border-width, var(--vlaina-border-width-2)));');
    expect(selectedAtomicSurfaceRule).toContain('outline: var(--vlaina-atomic-rich-selected-border-outline);');
    expect(selectedAtomicSurfaceRule).toContain('outline-offset: var(--vlaina-atomic-rich-selected-border-outline-offset);');
    expect(selectedAtomicSurfaceRule).toContain('box-shadow: var(--vlaina-block-selection-shadow);');
    expect(css).not.toContain('editor-block-selection-pending');
    expect(css).not.toContain('.milkdown .ProseMirror.editor-block-selection-active .mermaid-block.editor-block-selected:is(:hover, :focus-visible)');
  });

  it('keeps oversized block formulas inside a horizontal scroll container', () => {
    const css = readMathStyles();
    const themeCss = readThemeStyle();

    expect(css).toContain(".milkdown-editor[data-note-lazy-block-visibility='true'][data-markdown-compat-layer='native']");
    expect(css).toContain(".milkdown .ProseMirror:not(.editor-find-active) [data-type='math-block'].math-block-wrapper {");
    expect(css).toContain('content-visibility: auto;');
    expect(css).toContain('contain-intrinsic-size: var(--vlaina-height-math-block-intrinsic);');
    expect(themeCss).toContain('--vlaina-height-math-block-intrinsic: auto var(--vlaina-size-96px);');
    expect(css).toContain('overflow-x: auto;');
    expect(css).toContain(".milkdown [data-type='math-block'].math-block-wrapper .katex-display {");
    expect(css).toContain('max-width: 100%;');
    expect(css).toContain('padding-block: var(--vlaina-space-2px);');
    expect(css).toContain(".milkdown [data-type='math-block'].math-block-wrapper .katex-display > .katex {");
    expect(css).toContain('min-width: max-content;');
  });

  it('uses the app accent blue for the primary math editor action', () => {
    const css = readMathStyles();

    expect(css).toContain('.math-editor-action-button-primary {');
    expect(css).toContain('border-color: var(--vlaina-accent);');
    expect(css).toContain('background: var(--vlaina-accent);');
    expect(css).toContain('.math-editor-action-button-primary:hover {');
    expect(css).toContain('border-color: var(--vlaina-accent-hover);');
    expect(css).toContain('background: var(--vlaina-accent-hover);');
  });

  it('does not force a minimum or fixed textarea height in the shared editor popup', () => {
    const css = readMathStyles();

    const textareaRule = css.match(/\.math-editor-textarea \{(?<body>[\s\S]*?)\n\}/)?.groups?.body ?? '';

    expect(textareaRule).toContain('box-sizing: border-box;');
    expect(textareaRule).toContain('resize: vertical;');
    expect(textareaRule).not.toMatch(/(^|\n)\s*min-height:/);
    expect(textareaRule).not.toMatch(/(^|\n)\s*height:/);
  });
});
