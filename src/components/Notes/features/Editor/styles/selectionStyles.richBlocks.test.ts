import { describe, expect, it } from "vitest";
import {
  readStyleFile,
  readBlockSelectionStyle,
  readThemeStyle,
  readThemeCompatibilityStyle,
  extractCssRule,
  extractSelectorListsContaining,
} from "./selectionStylesTestUtils";

describe("editor rich block selection styles", () => {
  it('keeps code block selection rendering on the CodeMirror selection layer', () => {
    const css = readStyleFile('code-block.css');

    expect(css).toContain('.milkdown .code-block-container > .code-block-container {');
    expect(css).toContain('margin-top: 0 !important;');
    expect(css).toContain('margin-bottom: 0 !important;');
    expect(css).toContain('border-radius: inherit;');
    expect(css).toContain('border: var(--vlaina-code-block-selected-border-width, var(--vlaina-border-width-2)) solid transparent;');
    expect(css).toContain('box-sizing: border-box;');
    expect(css).toContain('--vlaina-code-block-selected-border-outline: var(--vlaina-code-block-selected-border-width, var(--vlaina-border-width-2)) solid var(--vlaina-color-white);');
    expect(css).toContain('--vlaina-code-block-selected-border-outline-offset: calc(-1 * var(--vlaina-code-block-selected-border-width, var(--vlaina-border-width-2)));');
    expect(css).toContain('.milkdown .code-block-container .code-block-editable {');
    expect(css).toContain('padding: var(--vlaina-padding-code-block-editable);');
    expect(css).toContain('.milkdown .code-block-container .cm-editor {');
    expect(css).toContain('background: transparent !important;');
    expect(css).toContain('.milkdown .code-block-container .cm-content {');
    expect(css).toContain('padding: 0 !important;');
    expect(css).toContain('color: var(--vlaina-markdown-color-code-text);');
    expect(css).toContain('.milkdown .code-block-container .cm-line {');
    expect(css).toContain('padding: var(--vlaina-padding-code-block-line) !important;');
    expect(css).toContain(
      '.milkdown .code-block-container .cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {'
    );
    expect(css).toContain(
      ".milkdown .code-block-container:not(.ProseMirror-selectednode):not(.editor-block-selected):not([data-pm-selected='true']) .cm-editor:not(.cm-focused) > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {"
    );
    expect(css).toContain(
      ".milkdown .code-block-container[data-pm-selected='true'] .cm-editor:not(.cm-focused) > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {"
    );
    expect(css).toContain(
      ".milkdown .ProseMirror.editor-toolbar-copy-feedback-active .code-block-container[data-pm-selected='true'] .cm-editor:not(.cm-focused) > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {"
    );
    expect(css).toContain('.milkdown .code-block-container.ProseMirror-selectednode .cm-editor > .cm-scroller > .cm-selectionLayer .cm-selectionBackground,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-selected .cm-editor > .cm-scroller > .cm-selectionLayer .cm-selectionBackground,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-drag-source .cm-editor > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {');
    expect(css).not.toContain(".milkdown .code-block-container[data-pm-selected='true'] .cm-editor > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {");
    expect(css).toContain('.milkdown .code-block-container.editor-block-selected .cm-editor,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-selected .cm-scroller,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-selected .cm-content,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-selected .cm-line,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-selected .cm-activeLine,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-drag-source .cm-editor,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-drag-source .cm-scroller,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-drag-source .cm-content,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-drag-source .cm-line,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-drag-source .cm-activeLine,');
    expect(css).not.toContain(".milkdown .code-block-container[data-pm-selected='true'] .cm-gutter-filler");
    expect(css).toContain('.milkdown .code-block-container.ProseMirror-selectednode .code-block-chrome-header,');
    expect(css).toContain('.milkdown .code-block-container.ProseMirror-selectednode .code-block-editable,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-selected .code-block-lazy-preview,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-drag-source .code-block-lazy-preview,');
    expect(css).toContain('.milkdown .ProseMirror.editor-block-selection-enabled :is(');
    expect(css).not.toContain('editor-block-selection-pending');
    expect(css).not.toContain(".milkdown .code-block-container[data-pm-selected='true'] .code-block-lazy-line-numbers");
    expect(extractCssRule(
      css,
      '.milkdown .code-block-container.ProseMirror-selectednode .cm-editor,'
    )).toContain('background: transparent !important;');
    expect(extractCssRule(
      css,
      '.milkdown .code-block-container.ProseMirror-selectednode .code-block-chrome-header,'
    )).toContain('background: transparent !important;');
    expect(extractCssRule(
      css,
      '.milkdown .code-block-container.ProseMirror-selectednode .cm-gutters,'
    )).toContain('background-color: transparent !important;');
    expect(css).toContain('.milkdown .code-block-container.editor-block-selected-contained {');
    expect(css).not.toContain('.milkdown .ProseMirror li.editor-block-selected > .code-block-container {');
    expect(css).not.toContain('.milkdown .ProseMirror li.editor-block-selected > .code-block-container::before {');
    expect(css).toContain('.milkdown .ProseMirror .editor-block-selected .code-block-container {');
    expect(css).toContain('background: var(--vlaina-markdown-color-code-block-bg);');
    expect(css).toContain('background-color: var(--vlaina-markdown-color-code-block-bg);');
    expect(css).not.toContain('.milkdown .ProseMirror .editor-block-selected .code-block-container * {');
    expect(css).not.toContain('.milkdown .ProseMirror .editor-block-selected .code-block-container .code-block-chrome-language,');
    expect(css).toContain('.milkdown .ProseMirror .editor-block-selected .code-block-container .cm-gutters,');
    expect(css).toContain('.milkdown .ProseMirror .editor-block-selected .code-block-container .cm-gutterElement,');
    expect(css).toContain('.milkdown .ProseMirror .editor-block-selected .code-block-container .cm-lineNumbers,');
    expect(css).not.toContain('.milkdown .ProseMirror li .code-block-container.editor-block-selected {');
    expect(css).not.toContain('.milkdown .ProseMirror li .code-block-container.editor-block-selected .cm-gutters,');
    expect(css).not.toContain('background-color: color-mix(in srgb, var(--vlaina-markdown-color-code-block-bg), var(--vlaina-block-selection-color)) !important;');
    expect(css).toContain('background: var(--vlaina-markdown-color-code-block-bg) !important;');
    expect(css).toContain('background-color: var(--vlaina-markdown-color-code-block-bg) !important;');
    expect(css).toContain('--vlaina-block-selection-color: var(--vlaina-block-selection-color-default);');
    expect(css).toContain('isolation: isolate;');
    expect(css).toContain('overflow: visible !important;');
    expect(css).toContain('background-color: transparent;');
    expect(css).toContain('border-color: var(--vlaina-color-white);');
    expect(css).toContain('position: relative;');
    expect(css).toContain('--vlaina-code-block-selection-fill-top: calc(-1 * var(--vlaina-block-selection-bleed-y, var(--vlaina-block-selection-bleed-y-rich)));');
    expect(css).toContain('--vlaina-code-block-selection-fill-bottom: calc(-1 * var(--vlaina-block-selection-bleed-y, var(--vlaina-block-selection-bleed-y-rich)));');
    expect(css).toContain('.milkdown .code-block-container.editor-block-selected.editor-block-selected-has-previous,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-drag-source.editor-block-drag-source-has-previous {');
    expect(css).toContain('--vlaina-code-block-selection-fill-top: var(--vlaina-block-selection-gap-y);');
    expect(css).toContain('.milkdown .code-block-container.editor-block-selected.editor-block-selected-has-next,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-drag-source.editor-block-drag-source-has-next {');
    expect(css).toContain('--vlaina-code-block-selection-fill-bottom: var(--vlaina-block-selection-gap-y);');
    expect(css).toContain('.milkdown .code-block-container.ProseMirror-selectednode::after,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-selected::after,');
    expect(css).toContain('.milkdown .code-block-container.editor-block-drag-source::after {');
    expect(css).toContain('top: var(--vlaina-code-block-selection-fill-top);');
    expect(css).toContain('bottom: var(--vlaina-code-block-selection-fill-bottom);');
    expect(css).toContain('left: calc(-1 * var(--vlaina-block-selection-bleed-x-start));');
    expect(css).toContain('display: block !important;');
    expect(css).toContain('transition: none;');
    expect(css).toContain('.milkdown .code-block-container {');
    expect(css).toContain('transition: none;');
    expect(css).toContain('transition: none !important;');
    expect(css).toContain('border-radius: var(--vlaina-radius-1rem);');
    expect(css).toContain('outline: var(--vlaina-code-block-selected-border-outline);');
    expect(css).toContain('outline-offset: var(--vlaina-code-block-selected-border-outline-offset);');
    expect(css).toContain('box-shadow: var(--vlaina-block-selection-shadow);');
    expect(css).not.toContain('--vlaina-block-selection-bleed-y:');
    expect(css).not.toContain('.milkdown .code-block-container.editor-block-selected *,');
    expect(css).not.toContain('.milkdown .code-block-container.editor-block-drag-source * {');
    expect(css).not.toContain('.cm-editor.cm-focused .cm-content ::selection');
    expect(css).not.toContain('.cm-editor.cm-focused .cm-line ::selection');
  });

  it('keeps selected markdown blank lines separated from following rich block frames', () => {
    const css = readBlockSelectionStyle();
    const rule = extractCssRule(
      css,
      ".milkdown .ProseMirror > :is(\n  [data-type='html-block'][data-value='<!--vlaina-markdown-blank-line-->'],\n  [data-type='html-block'][data-value='<!--vlaina-rendered-html-boundary-blank-line-->'],\n  p.editor-editable-markdown-blank-line,"
    );
    const selectedBlankLinePreviousGapRule = extractCssRule(
      css,
      ".milkdown .ProseMirror > :is(\n  [data-type='math-block'].math-block-wrapper,"
    );

    expect(rule).toContain('p.editor-editable-markdown-blank-line,');
    expect(rule).toContain('p.editor-empty-paragraph:not(.is-editor-empty)');
    expect(rule).toContain("[data-type='html-block'][data-value='<!--vlaina-rendered-html-boundary-blank-line-->'],");
    expect(rule).toContain(').editor-block-selected.editor-block-selected-has-next + :is(');
    expect(rule).toContain('.code-block-container,');
    expect(rule).toContain('.frontmatter-block-container,');
    expect(rule).toContain('.image-block-container,');
    expect(rule).toContain('.video-block,');
    expect(rule).toContain('.toc-block,');
    expect(rule).toContain("[data-type='math-block'],");
    expect(rule).toContain("[data-type='html-block'].md-htmlblock-container:not(.md-htmlblock-literal-text):not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->']):not([data-value='<!--vlaina-markdown-tight-heading-->'])");
    expect(rule).not.toContain('.mermaid-block');
    expect(rule).toContain(').editor-block-selected.editor-block-selected-has-previous,');
    expect(rule).toContain(').editor-block-drag-source.editor-block-drag-source-has-next + :is(');
    expect(rule).toContain(').editor-block-drag-source.editor-block-drag-source-has-previous {');
    expect(rule).toContain('box-shadow: none !important;');
    expect(rule).not.toContain(':has(');
    expect(selectedBlankLinePreviousGapRule).toContain("[data-type='math-block'].math-block-wrapper");
    expect(selectedBlankLinePreviousGapRule).toContain('.mermaid-block');
    expect(selectedBlankLinePreviousGapRule).toContain("[data-type='html-block'][data-value='<!--vlaina-markdown-blank-line-->']");
    expect(selectedBlankLinePreviousGapRule).toContain("[data-type='html-block'][data-value='<!--vlaina-rendered-html-boundary-blank-line-->']");
    expect(selectedBlankLinePreviousGapRule).toContain('p.editor-editable-markdown-blank-line');
    expect(selectedBlankLinePreviousGapRule).toContain('p.editor-empty-paragraph:not(.is-editor-empty)');
    expect(selectedBlankLinePreviousGapRule).toContain(').editor-block-selected.editor-block-selected-textlike.editor-block-selected-has-previous::before {');
    expect(selectedBlankLinePreviousGapRule).toContain('top: calc(-1 * var(--vlaina-space-1rem));');
    expect(selectedBlankLinePreviousGapRule).toContain('right: calc(-1 * var(--vlaina-block-selection-bleed-x-end));');
    expect(selectedBlankLinePreviousGapRule).toContain('left: calc(-1 * var(--vlaina-block-selection-bleed-x-start));');
    expect(selectedBlankLinePreviousGapRule).toContain('height: var(--vlaina-space-1rem);');
    expect(selectedBlankLinePreviousGapRule).toContain('background: var(--vlaina-block-selection-color);');
  });

  it('keeps raw html block descendants on GitHub-like whitespace while preserving pre blocks', () => {
    const themeCompatibilityCss = readThemeCompatibilityStyle();
    const rawHtmlWhitespaceRule = extractCssRule(
      themeCompatibilityCss,
      ":where(.milkdown-editor[data-markdown-compat-layer='external'].theme-typora) #write [data-type='html-block'].md-htmlblock-container:not(.md-htmlblock-literal-text):not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->']):not([data-value='<!--vlaina-markdown-tight-heading-->']) * {"
    );
    const rawHtmlPreWhitespaceRule = extractCssRule(
      themeCompatibilityCss,
      ":where(.milkdown-editor[data-markdown-compat-layer='external'].theme-typora) #write [data-type='html-block'].md-htmlblock-container:not(.md-htmlblock-literal-text):not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->']):not([data-value='<!--vlaina-markdown-tight-heading-->']) :is(pre, pre *) {"
    );

    expect(rawHtmlWhitespaceRule).toContain('white-space: normal;');
    expect(rawHtmlPreWhitespaceRule).toContain('white-space: pre;');
  });

  it('keeps code block drag previews transparent while carrying the code block frame', () => {
    const codeCss = readStyleFile('code-block.css');
    const themeCompatibilityCss = readThemeCompatibilityStyle();
    const codePreviewRule = extractCssRule(
      codeCss,
      '.editor-block-drag-preview .code-block-container {'
    );
    const codePreviewPseudoRule = extractCssRule(
      codeCss,
      '.editor-block-drag-preview .code-block-container::before,'
    );
    const codePreviewInnerRule = extractCssRule(
      codeCss,
      '.editor-block-drag-preview .code-block-container :is('
    );

    expect(codePreviewRule).toContain('background: transparent !important;');
    expect(codePreviewRule).toContain('background-color: transparent !important;');
    expect(codePreviewRule).toContain('--vlaina-code-block-selected-border-outline: var(--vlaina-code-block-selected-border-width, var(--vlaina-border-width-2)) solid var(--vlaina-color-white);');
    expect(codePreviewRule).toContain('--vlaina-code-block-selected-border-outline-offset: calc(-1 * var(--vlaina-code-block-selected-border-width, var(--vlaina-border-width-2)));');
    expect(codePreviewRule).toContain('border: var(--vlaina-code-block-selected-border-width, var(--vlaina-border-width-2)) solid var(--vlaina-color-white) !important;');
    expect(codePreviewRule).toContain('box-sizing: border-box;');
    expect(codePreviewRule).toContain('outline: var(--vlaina-code-block-selected-border-outline) !important;');
    expect(codePreviewRule).toContain('outline-offset: var(--vlaina-code-block-selected-border-outline-offset) !important;');
    expect(codePreviewRule).toContain('box-shadow: none !important;');
    expect(codePreviewPseudoRule).toContain('display: none !important;');
    expect(codePreviewPseudoRule).toContain('background: transparent !important;');
    expect(codePreviewPseudoRule).toContain('box-shadow: none !important;');
    expect(codePreviewInnerRule).toContain('.code-block-chrome,');
    expect(codePreviewInnerRule).toContain('.cm-editor,');
    expect(codePreviewInnerRule).toContain('background: transparent !important;');
    expect(codePreviewInnerRule).toContain('border-color: transparent !important;');
    expect(codeCss).toContain('border-color: var(--vlaina-color-white);');
    expect(codeCss).toContain('outline: var(--vlaina-code-block-selected-border-outline);');
    expect(codeCss).toContain('.milkdown .code-block-container.editor-block-drag-source {');
    expect(codeCss).toContain('.milkdown .code-block-container.editor-block-drag-source::after {');
    expect(codeCss).not.toContain('body.editor-block-drag-active .milkdown .ProseMirror .code-block-container:is(');
    expect(themeCompatibilityCss).not.toContain("body.editor-block-drag-active .milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror .code-block-container:is(");
  });

  it('extends selected list items below direct code blocks without changing code block layout', () => {
    const blockSelectionCss = readBlockSelectionStyle();
    const codeCss = readStyleFile('code-block.css');

    expect(blockSelectionCss).toContain('.milkdown .ProseMirror li.editor-block-selected.editor-block-selected-has-direct-code-block {');
    expect(blockSelectionCss).toContain('--vlaina-list-contained-block-selection-bleed-y: var(--vlaina-block-selection-list-contained-bleed-y);');
    expect(blockSelectionCss).toContain('--vlaina-list-contained-block-selection-fill-bottom: calc(-1 * var(--vlaina-list-contained-block-selection-bleed-y));');
    expect(blockSelectionCss).toContain('--vlaina-block-selection-fill-bottom: var(--vlaina-list-contained-block-selection-fill-bottom);');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror li.editor-block-selected.editor-block-selected-has-direct-code-block.editor-block-selected-has-next {');
    expect(blockSelectionCss).toContain('--vlaina-list-contained-block-selection-fill-bottom: var(--vlaina-block-selection-gap-y);');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror li.editor-block-selected.editor-block-selected-has-direct-code-block::after {');
    expect(blockSelectionCss).toContain('right: calc(-1 * var(--vlaina-block-selection-bleed-x-end));');
    expect(blockSelectionCss).toContain('left: calc(-1 * var(--vlaina-block-selection-bleed-x-start));');
    expect(blockSelectionCss).toContain('bottom: var(--vlaina-block-selection-fill-bottom);');
    expect(blockSelectionCss).not.toContain('height: calc(var(--vlaina-list-contained-block-selection-bleed-y) + var(--vlaina-space-8px));');
    expect(blockSelectionCss).toContain('border-bottom-right-radius: var(--vlaina-radius-8px);');
    expect(blockSelectionCss).toContain('border-bottom-left-radius: var(--vlaina-radius-8px);');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror li.editor-block-selected.editor-block-selected-has-direct-code-block > *:not(.editor-collapse-btn):not(.ProseMirror-widget) {');
    expect(blockSelectionCss).not.toContain('li.editor-block-selected:has(> .code-block-container)');
    expect(codeCss).not.toContain('display: flow-root;');
    expect(codeCss).not.toContain('overflow: visible;');
  });

  it('lets selected code block internals reveal the block selection surface while selecting blocks', () => {
    const codeCss = readStyleFile('code-block.css');
    const rule = extractCssRule(
      codeCss,
      [
        '.milkdown .ProseMirror.editor-block-selection-enabled :is(',
        '  .code-block-container.editor-block-selected,',
        '  .code-block-container.editor-block-drag-source,',
        '  .editor-block-selected .code-block-container,',
        '  .code-block-container.editor-block-selected-contained',
        ') :is(',
        '  .code-block-chrome-header,',
        '  .code-block-editable,',
      ].join('\n')
    );
    const containedRule = extractCssRule(
      codeCss,
      '.milkdown .ProseMirror.editor-block-selection-enabled .editor-block-selected .code-block-container:not(.editor-block-selected),'
    );
    const largeCodeRule = extractCssRule(
      codeCss,
      '.milkdown .ProseMirror.editor-block-selection-large .code-block-container.editor-block-selected.editor-block-selected-large-rich {'
    );
    const largeCodeFillRule = extractCssRule(
      codeCss,
      '.milkdown .ProseMirror.editor-block-selection-large .code-block-container.editor-block-selected.editor-block-selected-large-rich::after {'
    );
    const borderRule = extractCssRule(
      codeCss,
      '.milkdown .ProseMirror.editor-block-selection-enabled :is('
    );

    expect(rule).toContain('.code-block-container.editor-block-selected,');
    expect(rule).toContain('.code-block-container.editor-block-drag-source,');
    expect(rule).toContain('.editor-block-selected .code-block-container,');
    expect(rule).toContain('.code-block-container.editor-block-selected-contained');
    expect(rule).toContain('.code-block-chrome-header,');
    expect(rule).toContain('.code-block-editable,');
    expect(rule).toContain('.code-block-lazy-preview,');
    expect(rule).toContain('.code-block-lazy-line-numbers,');
    expect(rule).toContain('.cm-editor,');
    expect(rule).toContain('.cm-scroller,');
    expect(rule).toContain('.cm-content,');
    expect(rule).toContain('.cm-line,');
    expect(rule).toContain('.cm-gutters,');
    expect(rule).toContain('background: transparent !important;');
    expect(rule).toContain('background-color: transparent !important;');
    expect(codeCss).not.toContain('editor-block-selection-pending');
    expect(containedRule).toContain('.code-block-container.editor-block-selected-contained');
    expect(containedRule).toContain('background: transparent !important;');
    expect(containedRule).toContain('background-color: transparent !important;');
    expect(containedRule).toContain('border-color: var(--vlaina-color-white) !important;');
    expect(containedRule).toContain('outline: var(--vlaina-code-block-selected-border-outline) !important;');
    expect(containedRule).toContain('outline-offset: var(--vlaina-code-block-selected-border-outline-offset) !important;');
    expect(containedRule).toContain('box-shadow: none !important;');
    expect(largeCodeRule).toContain('isolation: isolate;');
    expect(largeCodeRule).toContain('border-color: var(--vlaina-color-white);');
    expect(largeCodeRule).toContain('outline: var(--vlaina-code-block-selected-border-outline);');
    expect(largeCodeRule).toContain('outline-offset: var(--vlaina-code-block-selected-border-outline-offset);');
    expect(largeCodeRule).toContain('box-shadow: none !important;');
    expect(largeCodeRule).toContain('contain: none;');
    expect(largeCodeFillRule).toContain('top: var(--vlaina-code-block-selection-fill-top);');
    expect(largeCodeFillRule).toContain('right: calc(-1 * var(--vlaina-block-selection-bleed-x-end));');
    expect(largeCodeFillRule).toContain('bottom: var(--vlaina-code-block-selection-fill-bottom);');
    expect(largeCodeFillRule).toContain('left: calc(-1 * var(--vlaina-block-selection-bleed-x-start));');
    expect(largeCodeFillRule).toContain('display: block !important;');
    expect(largeCodeFillRule).toContain('background: var(--vlaina-block-selection-color);');
    expect(borderRule).toContain('.code-block-container.editor-block-selected,');
    expect(borderRule).toContain('.code-block-container.editor-block-drag-source,');
    expect(borderRule).toContain('.editor-block-selected .code-block-container,');
    expect(borderRule).toContain('.code-block-container.editor-block-selected-contained');
    expect(borderRule).toContain('border-color: var(--vlaina-color-white) !important;');
    expect(borderRule).toContain('outline: var(--vlaina-code-block-selected-border-outline) !important;');
    expect(borderRule).toContain('outline-offset: var(--vlaina-code-block-selected-border-outline-offset) !important;');
    expect(codeCss).not.toContain('var(--vlaina-editor-block-selection-fg)');
  });

  it('sizes selected image parent blocks without selected-state child scans', () => {
    const blockSelectionCss = readBlockSelectionStyle();

    expect(blockSelectionCss).toContain('.milkdown .ProseMirror p.editor-block-selected.editor-block-selected-has-direct-image {');
    expect(blockSelectionCss).toContain('--vlaina-block-selection-bleed-y: var(--vlaina-block-selection-bleed-y-rich);');
    expect(blockSelectionCss).not.toContain('p.editor-block-selected:has(> .image-block-container)');
  });

  it('keeps selected atomic rich block fills aligned without showing selection scrollbars', () => {
    const blockSelectionCss = readBlockSelectionStyle();
    const indexCss = readStyleFile('index.css');
    const mathCss = readStyleFile('math-editor.css');
    const atomicBlockSelectorMarker = ".milkdown .ProseMirror :is(\n  [data-type='math-block'].math-block-wrapper,";
    const htmlBlockRule = extractCssRule(
      mathCss,
      ".milkdown [data-type='html-block'].md-htmlblock-container:not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->']):not([data-value='<!--vlaina-markdown-tight-heading-->']) {"
    );
    const htmlBlockDescendantRule = extractCssRule(
      mathCss,
      ".milkdown [data-type='html-block'].md-htmlblock-container:not(.md-htmlblock-literal-text):not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->']):not([data-value='<!--vlaina-markdown-tight-heading-->']) * {"
    );
    const htmlBlockPreDescendantRule = extractCssRule(
      mathCss,
      ".milkdown [data-type='html-block'].md-htmlblock-container:not(.md-htmlblock-literal-text):not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->']):not([data-value='<!--vlaina-markdown-tight-heading-->']) :is(pre, pre *) {"
    );
    const literalHtmlBlockRule = extractCssRule(
      mathCss,
      ".milkdown [data-type='html-block'].md-htmlblock-container.md-htmlblock-literal-text:not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->']):not([data-value='<!--vlaina-markdown-tight-heading-->']) {"
    );
    const atomicBlockFrameRule = extractCssRule(blockSelectionCss, atomicBlockSelectorMarker);
    const atomicTransparentFrameRule = extractCssRule(
      blockSelectionCss.slice(blockSelectionCss.indexOf(atomicBlockFrameRule) + atomicBlockFrameRule.length),
      atomicBlockSelectorMarker
    );
    const atomicBlockFillRule = extractCssRule(
      blockSelectionCss.slice(
        blockSelectionCss.indexOf(atomicTransparentFrameRule) + atomicTransparentFrameRule.length
      ),
      atomicBlockSelectorMarker
    );
    const atomicBlockNextGapRule = extractCssRule(
      blockSelectionCss,
      ".milkdown .ProseMirror :is(\n  [data-type='math-block'].math-block-wrapper,\n  [data-type='html-block'].md-htmlblock-container:not(.md-htmlblock-literal-text):not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->']):not([data-value='<!--vlaina-markdown-tight-heading-->']),\n  .toc-block,\n  .mermaid-block\n):is(.editor-block-selected, .editor-block-drag-source).editor-block-selected-has-next,"
    );
    const atomicMermaidBackgroundRule = extractCssRule(
      blockSelectionCss,
      ".milkdown .ProseMirror .mermaid-block[data-type='mermaid']:is(\n  .editor-block-selected,"
    );
    const atomicMermaidOverflowRule = extractCssRule(
      blockSelectionCss,
      ".milkdown .ProseMirror .mermaid-block[data-type='mermaid'][data-mermaid-diagram='gantt'].mermaid-block:is(\n  .editor-block-selected,"
    );
    const keyboardAtomicSelectionRule = extractCssRule(
      blockSelectionCss,
      ".milkdown .ProseMirror.editor-atomic-block-keyboard-selected :is(\n  [data-type='math-block'].math-block-wrapper,"
    );

    expect(indexCss.indexOf("@import './math-editor.css';")).toBeGreaterThanOrEqual(0);
    expect(indexCss.indexOf("@import './block-selection-atomic-rich.css';")).toBeGreaterThan(
      indexCss.indexOf("@import './math-editor.css';")
    );
    expect(indexCss.indexOf("@import './block-selection-atomic-rich.css';")).toBeGreaterThan(
      indexCss.indexOf("@import './theme-compatibility.css';")
    );
    expect(htmlBlockRule).toContain('overflow-x: auto;');
    expect(htmlBlockRule).toContain('white-space: normal;');
    expect(htmlBlockDescendantRule).toContain('white-space: normal;');
    expect(htmlBlockPreDescendantRule).toContain('white-space: pre;');
    expect(literalHtmlBlockRule).toContain('overflow: visible;');
    expect(literalHtmlBlockRule).toContain('overflow-x: visible;');
    expect(literalHtmlBlockRule).toContain('overflow-y: visible;');
    expect(literalHtmlBlockRule).toContain('white-space: pre-wrap;');
    expect(literalHtmlBlockRule).toContain('overflow-wrap: anywhere;');
    expect(atomicBlockFillRule).toContain("[data-type='math-block'].math-block-wrapper");
    expect(atomicBlockFillRule).toContain("[data-type='html-block'].md-htmlblock-container:not(.md-htmlblock-literal-text):not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->']):not([data-value='<!--vlaina-markdown-tight-heading-->'])");
    expect(atomicBlockFillRule).toContain('.toc-block');
    expect(atomicBlockFillRule).toContain('.mermaid-block');
    expect(atomicBlockFillRule).toContain('.editor-block-selected');
    expect(atomicBlockFillRule).toContain('.editor-block-drag-source');
    expect(atomicBlockFillRule).toContain('.ProseMirror-selectednode');
    expect(atomicBlockFillRule).toContain('.editor-block-selected-textlike');
    expect(atomicBlockFillRule).toContain('.editor-block-drag-source-textlike');
    expect(atomicBlockFillRule).toContain('.editor-native-selected-textlike');
    expect(atomicBlockFillRule).toContain("content: '';");
    expect(atomicBlockFillRule).toContain('top: var(--vlaina-block-selection-fill-top);');
    expect(atomicBlockFillRule).toContain('right: calc(-1 * var(--vlaina-block-selection-bleed-x-end));');
    expect(atomicBlockFillRule).toContain('bottom: var(--vlaina-block-selection-fill-bottom);');
    expect(atomicBlockFillRule).toContain('left: calc(-1 * var(--vlaina-block-selection-bleed-x-start));');
    expect(atomicBlockFillRule).toContain('display: block !important;');
    expect(atomicBlockFillRule).toContain('background: var(--vlaina-block-selection-color);');
    expect(atomicBlockNextGapRule).toContain('--vlaina-block-selection-fill-bottom: var(--vlaina-block-selection-gap-y);');
    expect(blockSelectionCss).toContain('--vlaina-block-selection-fill-top: var(--vlaina-block-selection-gap-y);');
    expect(atomicBlockFrameRule).toContain("[data-type='math-block'].math-block-wrapper");
    expect(atomicBlockFrameRule).toContain('.toc-block');
    expect(atomicBlockFrameRule).toContain('.mermaid-block');
    expect(atomicBlockFrameRule).toContain('content-visibility: visible;');
    expect(atomicBlockFrameRule).toContain('contain: none;');
    expect(atomicBlockFrameRule).toContain('isolation: isolate;');
    expect(atomicBlockFrameRule).toContain('position: relative;');
    expect(atomicBlockFrameRule).toContain('z-index: var(--vlaina-z-1);');
    expect(atomicBlockFrameRule).not.toContain('background: transparent !important;');
    expect(atomicTransparentFrameRule).not.toContain('.mermaid-block');
    expect(atomicTransparentFrameRule).toContain('background: transparent !important;');
    expect(atomicTransparentFrameRule).toContain('background-color: transparent !important;');
    expect(atomicBlockFrameRule).toContain('overflow: visible;');
    expect(atomicBlockFrameRule).toContain('overflow-x: visible;');
    expect(atomicBlockFrameRule).toContain('overflow-y: visible;');
    expect(atomicMermaidBackgroundRule).toContain('.editor-block-selected');
    expect(atomicMermaidBackgroundRule).toContain('.editor-block-drag-source');
    expect(atomicMermaidBackgroundRule).toContain('.ProseMirror-selectednode');
    expect(atomicMermaidBackgroundRule).toContain('background: var(--vlaina-block-selection-color) !important;');
    expect(atomicMermaidBackgroundRule).toContain('background-color: var(--vlaina-block-selection-color) !important;');
    expect(atomicMermaidBackgroundRule).toContain('box-shadow: var(--vlaina-block-selection-shadow) !important;');
    expect(atomicMermaidOverflowRule).toContain('.editor-block-selected');
    expect(atomicMermaidOverflowRule).toContain('.editor-block-drag-source');
    expect(atomicMermaidOverflowRule).toContain('.ProseMirror-selectednode');
    expect(atomicMermaidOverflowRule).toContain('overflow-x: auto !important;');
    expect(atomicMermaidOverflowRule).toContain('overflow-y: auto !important;');
    expect(atomicBlockFrameRule).toContain('--vlaina-atomic-rich-selected-border-outline: var(--vlaina-code-block-selected-border-width, var(--vlaina-border-width-2)) solid var(--vlaina-color-white);');
    expect(atomicBlockFrameRule).toContain('--vlaina-atomic-rich-selected-border-outline-offset: calc(-1 * var(--vlaina-code-block-selected-border-width, var(--vlaina-border-width-2)));');
    expect(atomicBlockFrameRule).toContain('outline: var(--vlaina-atomic-rich-selected-border-outline);');
    expect(atomicBlockFrameRule).toContain('outline-offset: var(--vlaina-atomic-rich-selected-border-outline-offset);');
    expect(atomicBlockFrameRule).toContain('box-shadow: var(--vlaina-block-selection-shadow);');
    expect(atomicBlockFrameRule).toContain('transition: none !important;');
    expect(blockSelectionCss).not.toContain('var(--vlaina-editor-block-selection-fg)');
    expect(keyboardAtomicSelectionRule).toContain("[data-type='html-block'].md-htmlblock-container:not(.md-htmlblock-literal-text)");
    expect(keyboardAtomicSelectionRule).toContain('.ProseMirror-selectednode');
    expect(keyboardAtomicSelectionRule).toContain('background: var(--vlaina-math-hover-color) !important;');
    expect(keyboardAtomicSelectionRule).toContain('box-shadow:');
    expect(keyboardAtomicSelectionRule).toContain('var(--vlaina-math-hover-color) !important;');

    expect(mathCss).not.toContain('var(--vlaina-editor-block-selection-fg)');
    expect(mathCss).toContain(".milkdown [data-type='math-inline'],");
    expect(mathCss).toContain(".milkdown [data-type='math-block'],");
    expect(mathCss).toContain(".milkdown [data-type='html-block']:not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->']):not([data-value='<!--vlaina-markdown-tight-heading-->']),");
    expect(mathCss).toContain('.milkdown .mermaid-block {\n  transition: none;');
    expect(mathCss).not.toContain('background-color var(--vlaina-duration-160) var(--vlaina-ease-css-default)');
    expect(mathCss).not.toContain('box-shadow var(--vlaina-duration-160) var(--vlaina-ease-css-default)');
  });

  it('keeps rich child blocks at their original colors during block selection', () => {
    const blockSelectionCss = readBlockSelectionStyle();
    const mathCss = readStyleFile('math-editor.css');
    const richChildLists = extractSelectorListsContaining(blockSelectionCss, ':is', '.image-block-container')
      .filter((list) => list.includes("[data-type='math-inline']"));
    const listContainedRichBlockLists = extractSelectorListsContaining(blockSelectionCss, ':is', '.image-block-container')
      .filter((list) => list.includes('.code-block-container') && list.includes('.milkdown-table-block'));
    const expectedRichChildList = [
      '.image-block-container',
      '.video-block',
      "[data-type='html-block']",
      "[data-type='math-block']",
      "[data-type='math-inline']",
      '.mermaid-block',
      '.milkdown-table-block',
      'table',
    ];

    expect(blockSelectionCss).not.toContain('.milkdown .ProseMirror .editor-block-selected:is(');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .editor-block-selected :is(');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .editor-block-selected-contained:is(');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror li.editor-block-selected :is(');
    expect(blockSelectionCss).toContain(').editor-block-selected-contained {');
    expect(blockSelectionCss).not.toContain('.milkdown .ProseMirror li :is(\n  .image-block-container,\n  .video-block,\n  [data-type=\'math-block\'],\n  [data-type=\'math-inline\'],\n  .mermaid-block,\n  .milkdown-table-block,\n  table\n).editor-block-selected {');
    expect(blockSelectionCss).toContain('.image-block-container,');
    expect(blockSelectionCss).toContain('.video-block,');
    expect(blockSelectionCss).toContain("[data-type='html-block'],");
    expect(blockSelectionCss).toContain("[data-type='math-block'],");
    expect(blockSelectionCss).toContain("[data-type='math-inline'],");
    expect(blockSelectionCss).toContain('.mermaid-block,');
    expect(blockSelectionCss).toContain('.milkdown-table-block,');
    expect(blockSelectionCss).toContain('table');
    expect(blockSelectionCss).toContain('background: transparent !important;');
    expect(blockSelectionCss).toContain('box-shadow: none !important;');
    expect(blockSelectionCss).not.toContain('background-color: inherit;');
    expect(mathCss).not.toContain('.milkdown .ProseMirror .editor-block-selected:is(');
    expect(mathCss).not.toContain('.milkdown .ProseMirror .editor-block-selected :is(');
    expect(mathCss).not.toContain('.milkdown .ProseMirror .editor-block-selected-contained:is(');
    expect(mathCss).not.toContain('.milkdown .ProseMirror li.editor-block-selected :is(');
    expect(mathCss).toContain('.mermaid-block');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .editor-block-selected-textlike,');
    expect(blockSelectionCss).not.toContain('var(--vlaina-editor-block-selection-fg)');
    expect(blockSelectionCss).not.toContain('.milkdown .ProseMirror .mermaid-block.editor-block-selected * {');
    expect(mathCss).not.toContain('editor-block-selection-pending');
    expect(mathCss).not.toContain('var(--vlaina-editor-block-selection-fg)');
    expect(richChildLists).toHaveLength(4);
    for (const list of richChildLists) {
      expect(list).toEqual(expectedRichChildList);
    }
    expect(listContainedRichBlockLists).toEqual([[
      '.code-block-container',
      '.frontmatter-block-container',
      '.image-block-container',
      '.video-block',
      '.toc-block',
      "[data-type='html-block']",
      "[data-type='math-block']",
      '.mermaid-block',
      '.milkdown-table-block',
      'table',
    ]]);
  });

  it('paints selected tables with the standard block selection frame', () => {
    const tableBlockCss = readStyleFile('table-block.css');
    const blockSelectionCss = readBlockSelectionStyle();
    const themeCss = readThemeStyle();

    expect(themeCss).toContain('--vlaina-block-selection-top-reserve-default: 0px;');
    expect(themeCss).toContain('--vlaina-block-selection-scrollbar-reserve-default: 0px;');
    expect(tableBlockCss).toContain('.milkdown .milkdown-table-block {');
    expect(tableBlockCss).toContain('margin: var(--vlaina-space-8px) var(--vlaina-space-0) var(--vlaina-space-0);');
    expect(tableBlockCss).toContain('.milkdown .milkdown-table-block:first-child {');
    expect(tableBlockCss).toContain('margin-top: var(--vlaina-space-0);');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected .table-content-host,');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.ProseMirror-selectednode .table-content-host {');
    expect(blockSelectionCss).toContain('background: transparent !important;');
    expect(blockSelectionCss).toContain('box-shadow: none !important;');
    expect(tableBlockCss).toContain('align-items: flex-start;');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected,');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.ProseMirror-selectednode {');
    expect(blockSelectionCss).toContain('--vlaina-block-selection-bleed-y: var(--vlaina-block-selection-bleed-y-rich);');
    expect(blockSelectionCss).toContain('--vlaina-block-selection-bleed-x-start: var(--vlaina-block-selection-bleed-x-default);');
    expect(blockSelectionCss).toContain('--vlaina-block-selection-bleed-x-end: var(--vlaina-block-selection-bleed-x-default);');
    expect(blockSelectionCss).toContain('--vlaina-block-selection-top-reserve: var(--vlaina-block-selection-top-reserve-default);');
    expect(blockSelectionCss).toContain('--vlaina-block-selection-scrollbar-reserve: var(--vlaina-block-selection-scrollbar-reserve-default);');
    expect(blockSelectionCss).toContain('--vlaina-table-block-selection-fill-top: calc(var(--vlaina-block-selection-top-reserve, var(--vlaina-block-selection-top-reserve-default)) - var(--vlaina-block-selection-bleed-y));');
    expect(blockSelectionCss).toContain('--vlaina-table-block-selection-fill-bottom: calc(var(--vlaina-block-selection-scrollbar-reserve, var(--vlaina-block-selection-scrollbar-reserve-default)) - var(--vlaina-block-selection-bleed-y));');
    expect(blockSelectionCss).toContain('--vlaina-table-block-selection-content-fill-top: calc(-1 * var(--vlaina-block-selection-bleed-y));');
    expect(blockSelectionCss).toContain('--vlaina-table-block-selection-content-fill-bottom: calc(-1 * var(--vlaina-block-selection-bleed-y));');
    expect(blockSelectionCss).toContain('background: transparent !important;');
    expect(blockSelectionCss).toContain('border-radius: var(--vlaina-radius-8px);');
    expect(blockSelectionCss).not.toContain('var(--vlaina-editor-block-selection-fg)');
    expect(blockSelectionCss).not.toContain(".milkdown .ProseMirror .milkdown-table-block:is(.editor-block-selected, .ProseMirror-selectednode, .editor-block-drag-source) .table-content-host");
    expect(blockSelectionCss).not.toContain('.milkdown-table-block.editor-block-selected:has(');
    expect(blockSelectionCss).not.toContain('.milkdown-table-block.ProseMirror-selectednode:has(');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected.editor-table-block-zero-min-width,');
    expect(blockSelectionCss).toContain('--vlaina-block-selection-top-reserve: var(--vlaina-block-selection-bleed-y);');
    expect(blockSelectionCss).toContain('--vlaina-block-selection-scrollbar-reserve: var(--table-block-scrollbar-reserve, var(--vlaina-block-selection-table-scrollbar-reserve));');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected.editor-block-selected-has-previous {');
    expect(blockSelectionCss).toContain('--vlaina-table-block-selection-fill-top: var(--vlaina-block-selection-gap-y);');
    expect(blockSelectionCss).toContain('--vlaina-table-block-selection-content-fill-top: var(--vlaina-block-selection-gap-y);');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected.editor-block-selected-has-next {');
    expect(blockSelectionCss).toContain('--vlaina-table-block-selection-fill-bottom: var(--vlaina-block-selection-gap-y);');
    expect(blockSelectionCss).toContain('--vlaina-table-block-selection-content-fill-bottom: var(--vlaina-block-selection-gap-y);');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected::before,');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.ProseMirror-selectednode::before {');
    expect(blockSelectionCss).toContain('top: var(--vlaina-table-block-selection-fill-top);');
    expect(blockSelectionCss).toContain('bottom: var(--vlaina-table-block-selection-fill-bottom);');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected > *,');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.ProseMirror-selectednode > * {');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected.editor-table-block-zero-min-width .table-scroll,');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.ProseMirror-selectednode.editor-table-block-zero-min-width .table-scroll {');
    expect(blockSelectionCss).toContain('margin-top: calc(-1 * var(--vlaina-block-selection-bleed-y));');
    expect(blockSelectionCss).toContain('margin-bottom: calc(-1 * var(--vlaina-block-selection-bleed-y));');
    expect(blockSelectionCss).toContain('padding-top: var(--vlaina-block-selection-bleed-y);');
    expect(blockSelectionCss).toContain('padding-bottom: var(--vlaina-block-selection-bleed-y);');
    expect(
      extractCssRule(
        blockSelectionCss,
        '.milkdown .ProseMirror .milkdown-table-block.editor-block-selected.editor-table-block-zero-min-width .table-scroll,'
      )
    ).not.toContain('background: var(--vlaina-block-selection-color);');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected .table-scroll-track,');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.ProseMirror-selectednode .table-scroll-track {');
    expect(blockSelectionCss).toContain('position: relative;');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected.editor-table-block-zero-min-width .table-content-host::before,');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.ProseMirror-selectednode.editor-table-block-zero-min-width .table-content-host::before {');
    expect(blockSelectionCss).toContain("content: '';");
    expect(blockSelectionCss).toContain('top: var(--vlaina-table-block-selection-content-fill-top);');
    expect(blockSelectionCss).toContain('right: calc(-1 * var(--vlaina-block-selection-bleed-x-end));');
    expect(blockSelectionCss).toContain('bottom: var(--vlaina-table-block-selection-content-fill-bottom);');
    expect(blockSelectionCss).toContain('left: calc(-1 * var(--vlaina-block-selection-bleed-x-start));');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected .table-scroll-spacer,');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected .table-content-host > *,');
    expect(blockSelectionCss).toContain('z-index: var(--vlaina-z-1);');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.editor-block-selected :is(th, td),');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .milkdown-table-block.ProseMirror-selectednode :is(th, td) {');
    expect(blockSelectionCss).toContain('background-color: transparent !important;');
  });

  it('keeps table column drag handles dark even inside selected table blocks', () => {
    const tableBlockCss = readStyleFile('table-block.css');

    expect(tableBlockCss).toContain('.milkdown .milkdown-table-block .column-header-drag-control,');
    expect(tableBlockCss).toContain('.milkdown .milkdown-table-block .row-header-drag-control,');
    expect(tableBlockCss).toContain(".milkdown .milkdown-table-block .column-header-drag-control[data-active='true'],");
    expect(tableBlockCss).toContain(".milkdown .milkdown-table-block .row-header-drag-control[data-active='true'],");
    expect(tableBlockCss).toContain('.milkdown .milkdown-table-block .column-header-drag-control__grip {');
    expect(tableBlockCss).toContain('.milkdown .milkdown-table-block .row-header-drag-control__grip {');
    expect(tableBlockCss).toContain('color: var(--vlaina-text-primary) !important;');
    expect(tableBlockCss).toContain('-webkit-text-fill-color: var(--vlaina-text-primary) !important;');
    expect(tableBlockCss).toContain('background: currentColor;');
    expect(tableBlockCss).toContain('box-shadow: var(--vlaina-shadow-table-grip-dots);');
  });

  it('keeps table column menus readable inside selected table blocks', () => {
    const tableBlockCss = readStyleFile('table-block.css');

    expect(tableBlockCss).toContain('border-radius: var(--vlaina-radius-22px);');
    expect(tableBlockCss).toContain('.milkdown .milkdown-table-block .column-header-drag-menu__item,');
    expect(tableBlockCss).toContain('.milkdown .milkdown-table-block .row-header-drag-menu__item {');
    expect(tableBlockCss).toContain('color: var(--vlaina-sidebar-notes-text) !important;');
    expect(tableBlockCss).toContain('-webkit-text-fill-color: var(--vlaina-sidebar-notes-text) !important;');
    expect(tableBlockCss).toContain('background: var(--vlaina-sidebar-notes-row-hover);');
    expect(tableBlockCss).toContain('color: var(--vlaina-color-status-danger-fg) !important;');
    expect(tableBlockCss).toContain('-webkit-text-fill-color: var(--vlaina-color-status-danger-fg) !important;');
    expect(tableBlockCss).toContain('background: var(--vlaina-color-status-danger-bg);');
  });

  it('keeps selected math blocks inside selected list items vertically covered', () => {
    const blockSelectionCss = readBlockSelectionStyle();
    const mathCss = readStyleFile('math-editor.css');

    expect(blockSelectionCss).toContain('.milkdown .ProseMirror li.editor-block-selected :is(');
    expect(blockSelectionCss).toContain(').editor-block-selected-contained {');
    expect(blockSelectionCss).toContain('box-shadow: var(--vlaina-block-selection-shadow-y) !important;');
    expect(mathCss).not.toContain('.milkdown .ProseMirror li.editor-block-selected :is(');
    expect(mathCss).not.toContain(').editor-block-selected-contained {');
    expect(mathCss).not.toContain('box-shadow: var(--vlaina-block-selection-shadow-y) !important;');
  });

  it('keeps formula and Mermaid colors unchanged during block selection', () => {
    const css = readStyleFile('math-editor.css');
    const themeCss = readThemeStyle();

    expect(themeCss).toContain('--vlaina-math-hover-bleed-x-start-default: 0px;');
    expect(themeCss).toContain('--vlaina-mermaid-text: var(--vlaina-markdown-color-text);');
    expect(css).not.toContain('.milkdown .ProseMirror .editor-block-selected :is(');
    expect(css).not.toContain('var(--vlaina-editor-block-selection-fg)');
  });

  it('keeps selected CodeMirror gutter surfaces transition-free', () => {
    const codeBlockCss = readStyleFile('code-block.css');
    const frontmatterCss = readStyleFile('frontmatter.css');

    expect(codeBlockCss).toContain('.milkdown .code-block-container .cm-gutters,');
    expect(codeBlockCss).toContain('.milkdown .code-block-container .cm-gutterElement,');
    expect(codeBlockCss).toContain('.milkdown .code-block-container .cm-lineNumbers,');
    expect(codeBlockCss).toContain('transition: none !important;');
    expect(frontmatterCss).toContain('.milkdown .frontmatter-block-container .cm-gutters,');
    expect(frontmatterCss).toContain('.milkdown .frontmatter-block-container .cm-gutterElement,');
    expect(frontmatterCss).toContain('.milkdown .frontmatter-block-container .cm-lineNumbers,');
    expect(frontmatterCss).toContain('transition: none !important;');
  });

  it('keeps frontmatter YAML token colors unchanged during block selection', () => {
    const frontmatterCss = readStyleFile('frontmatter.css');

    expect(frontmatterCss).toContain('.milkdown .frontmatter-block-container.ProseMirror-selectednode,');
    expect(frontmatterCss).toContain('background-color: var(--vlaina-block-selection-color);');
    expect(frontmatterCss).not.toContain('var(--vlaina-editor-block-selection-fg)');
  });
});
