import { describe, expect, it } from "vitest";
import { extractCssRule, readEditorStyleSourceFiles, readStyleFile, readThemeCompatibilityStyle } from "./selectionStylesTestUtils";

describe("editor style theme compatibility", () => {
  it('keeps the Typora compatibility bridge scoped to imported external themes', () => {
    const css = readThemeCompatibilityStyle();

    expect(css).toContain(":where(.milkdown-editor[data-markdown-compat-layer='external'].theme-typora)");
    expect(css).toContain('--typora-inline-code-bg');
    expect(css).toContain('--typora-table-hover-bg');
    expect(css).toContain('--typora-code-editor-bg: var(--d-cb, var(--code-bg, var(--code-block-bg, var(--background-primary, transparent))));');
    expect(css).toContain("[data-markdown-theme-color-scheme-mode='fixed-light']");
    expect(css).toContain('color-scheme: light;');
    expect(css).toContain('--vlaina-code-block-background: var(--vlaina-typora-fixed-light-code-block-bg);');
    expect(css).toContain('--vlaina-color-editor-inline-code-bg: var(--vlaina-code-inline-background);');
    expect(css).toContain('--vlaina-text-primary: var(--vlaina-typora-fixed-light-text-primary);');
    expect(css).toContain("#write .callout.md-alert");
    expect(css).toContain("#write .md-hr::before");
    expect(css).toContain(".milkdown table tr:hover > :is(th, td)");
    expect(css).not.toContain(".theme-vlaina.theme-typora");
  });

  it('keeps Typora ecosystem semantic compatibility scoped to imported Typora themes', () => {
    const css = readThemeCompatibilityStyle();
    const scope = ":where(.milkdown-editor[data-markdown-compat-layer='external'].theme-typora)";

    expect(css).toContain(`${scope} #write {`);
    expect(css).toContain('--typora-page-max-width: min(100%, var(--v-write-w, var(--max-width, 1200px)));');
    expect(css).toContain('max-width: var(--typora-page-max-width);');
    expect(css).toContain('padding-inline: var(--typora-page-padding-inline);');
    expect(css).toContain('--code-size: 0.9rem;');
    expect(css).toContain('background: transparent !important;');
    expect(css).not.toContain(`${scope} #write.done::before,`);
    expect(css).toContain(`${scope} #write :is(.md-htmlblock, .video-block, .v-caption.iframe) :is(iframe, video, object, embed),`);
    const typoraHtmlBlockOverflowRule = extractCssRule(
      css,
      `${scope} #write :is(.md-htmlblock, [data-type='html-block'].md-htmlblock):not(`
    );
    expect(typoraHtmlBlockOverflowRule).toContain(":not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->'])");
    expect(typoraHtmlBlockOverflowRule).toContain(":not([data-value='<!--vlaina-markdown-tight-heading-->'])");
    expect(typoraHtmlBlockOverflowRule).toContain('overflow-x: auto;');
    expect(css).not.toContain(`${scope} #write :is(.md-htmlblock, [data-type='html-block'].md-htmlblock) {\n`);
    expect(css).toContain(`${scope} #write .milkdown-table-block.table-figure {`);
    expect(css).toContain(`${scope} #write .v-caption.full {`);
    expect(css).toContain(`${scope} #write .v-btn {`);
    expect(css).toContain(`${scope} #write .v-tab-group {`);
    expect(css).toContain(`${scope} #write .v-tab-box {`);
    expect(css).toContain(`${scope} #write .v-post-card.vlook-post-card {`);
    expect(css).toContain(`${scope} #write blockquote.vlook-post-card {`);
    expect(css).toContain(`${scope} #write :is(.md-htmlblock.vlook-media-html-block, [data-type='html-block'].md-htmlblock.vlook-media-html-block) {`);
    expect(css).toContain('.milkdown-table-block.table-figure.editor-typora-table-figure-without-caption');
    expect(css).toContain(`${scope} #write .v-btn-group.editor-typora-button-group-has-selected {`);
    expect(css).toContain(`:where(.milkdown-editor[data-markdown-compat-layer='external'].theme-typora #write :is(blockquote, details, .md-alert)) {`);
    expect(css).toContain(`${scope} #write table :is(th, td).td-span {`);
    expect(css).toContain(`${scope} #write .vlook-caption-gap {`);
    expect(css).toContain(`${scope} #write .vlook-caption-target-codeblock.code-block-container.md-fences,`);
    expect(css).toContain(`${scope} #write .v-page-break.vlook-page-break {`);
    const typoraImageCaptionRule = extractCssRule(
      css,
      `${scope} #write .image-block-container[data-alt]:not([data-alt='']):not([src*='#logo']):not([src*='#icon']):not([src*='#card'])::after`
    );
    expect(typoraImageCaptionRule).toContain('overflow-wrap: anywhere;');
    expect(typoraImageCaptionRule).toContain('word-break: break-word;');
    expect(css).toContain('break-before: page;');
    expect(css).toContain(`${scope} #write .v-tbl-row-g-btn,`);
    expect(css).toContain(`${scope} #write .v-svg-input-checkbox {`);
    expect(css).toContain(`${scope} #write :is(.v-fig-content, .v-caption) :is(img, svg) {`);
    expect(css).toContain(`${scope} #write .v-audio-mini-control {`);
    expect(css).toContain(`${scope} #write .v-backdrop-blurs {`);
    expect(css).toContain(`${scope} #write :is(.v-info-tips, .v-tool-tips) {`);
    expect(css).toContain(`${scope} #write .vlook-column-list {`);
    expect(css).toContain('--typora-vlook-column-gap: var(--vlaina-size-2rem);');
    expect(css).not.toContain("data-markdown-imported-theme^='vlook-'");
    expect(css).not.toContain("#write .md-hr + :is(ul, ol)");
    expect(css).not.toContain("#write hr + :is(ul, ol)");
    expect(css).not.toContain("#write .md-hr + :is(blockquote, details, .md-alert)");
    expect(css).not.toContain("#write hr + :is(blockquote, details, .md-alert)");
    expect(css).not.toContain(":has(+ :is(ul, ol))");
    expect(css).not.toContain(":has(");
  });

  it('keeps external theme code block backgrounds from covering block selection paint', () => {
    const css = readThemeCompatibilityStyle();

    expect(css).toContain(".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror.editor-block-selection-enabled .code-block-container.editor-block-selected,");
    expect(css).toContain(".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror.editor-block-selection-enabled .code-block-container.editor-block-drag-source {");
    expect(css).toContain("background: var(--vlaina-block-selection-color, var(--vlaina-block-selection-color-default)) !important;");
    expect(css).toContain(".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror.editor-block-selection-enabled .editor-block-selected .code-block-container:not(.editor-block-selected),");
    expect(css).toContain(".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror.editor-block-selection-enabled .code-block-container.editor-block-selected-contained {");
    expect(css).toContain("box-shadow: none !important;");
  });

  it('keeps external theme selection surfaces from overriding content colors', () => {
    const css = readThemeCompatibilityStyle();
    const selectedCodeBorderRule = extractCssRule(
      css,
      [
        ".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror.editor-block-selection-enabled :is(",
        "  .code-block-container.editor-block-selected,",
        "  .code-block-container.editor-block-drag-source,",
        "  .editor-block-selected .code-block-container,",
        "  .code-block-container.editor-block-selected-contained",
        ") {",
      ].join('\n')
    );
    const selectedRichNodeSurfaceRule = extractCssRule(
      css,
      ".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror :is(\n  [data-type='math-inline'],"
    );
    const keyboardRichNodeRule = extractCssRule(
      css,
      ".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror.editor-atomic-block-keyboard-selected :is("
    );

    expect(css).not.toContain(".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror:not(.editor-block-selection-large) .editor-block-selected-textlike {\n  background-color:");
    expect(css).toContain(".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror:not(.editor-block-selection-large) .editor-block-selected-textlike > *:not(.code-block-container):not(.code-block-container *):not(.mermaid-block):not(.mermaid-block *):not(.heading-toggle-btn):not(.editor-collapse-btn):not(.ProseMirror-widget) {");
    expect(css).not.toContain('var(--vlaina-editor-block-selection-fg)');
    expect(css).not.toContain('editor-block-selection-pending');
    expect(selectedCodeBorderRule).toContain(".code-block-container.editor-block-selected,");
    expect(selectedCodeBorderRule).toContain(".code-block-container.editor-block-drag-source,");
    expect(selectedCodeBorderRule).toContain(".editor-block-selected .code-block-container,");
    expect(selectedCodeBorderRule).toContain(".code-block-container.editor-block-selected-contained");
    expect(selectedCodeBorderRule).toContain("border-color: var(--vlaina-color-white) !important;");
    expect(selectedCodeBorderRule).toContain("outline: var(--vlaina-code-block-selected-border-outline) !important;");
    expect(selectedCodeBorderRule).toContain("outline-offset: var(--vlaina-code-block-selected-border-outline-offset) !important;");
    expect(selectedRichNodeSurfaceRule).toContain("[data-type='math-inline'],");
    expect(selectedRichNodeSurfaceRule).toContain("[data-type='math-block'],");
    expect(selectedRichNodeSurfaceRule).toContain("[data-type='html-block']:not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->']):not([data-value='<!--vlaina-markdown-tight-heading-->']),");
    expect(selectedRichNodeSurfaceRule).toContain(".mermaid-block");
    expect(selectedRichNodeSurfaceRule).toContain(".ProseMirror-selectednode {");
    expect(selectedRichNodeSurfaceRule).toContain("--vlaina-block-selection-color: var(--vlaina-block-selection-color-default);");
    expect(selectedRichNodeSurfaceRule).toContain("background: var(--vlaina-block-selection-color) !important;");
    expect(selectedRichNodeSurfaceRule).toContain("background-color: var(--vlaina-block-selection-color) !important;");
    expect(selectedRichNodeSurfaceRule).toContain("box-shadow: var(--vlaina-block-selection-shadow) !important;");
    expect(keyboardRichNodeRule).toContain(".ProseMirror-selectednode {");
    expect(keyboardRichNodeRule).toContain("background: var(--vlaina-math-hover-color) !important;");
    expect(keyboardRichNodeRule).toContain("box-shadow:");
    expect(keyboardRichNodeRule).not.toContain("\n  color:");
  });

  it('does not use CSS :has selectors in editor styles', () => {
    const offenders = readEditorStyleSourceFiles()
      .filter(({ source }) => source.includes(':has('))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('scopes body line number gutter styles behind the markdown body line number class', () => {
    const coreCss = readStyleFile('core.css');

    expect(coreCss).toContain(
      '.milkdown-editor.markdown-body-line-numbers .body-line-number-gutter'
    );
    expect(coreCss).toContain(
      '.milkdown-editor.markdown-body-line-numbers .body-line-number'
    );
    expect(coreCss).toContain('color: var(--vlaina-markdown-color-text-subtle);');
    expect(coreCss).not.toContain(
      '.milkdown-editor.markdown-body-line-numbers .body-line-number.body-line-number-selected'
    );
    expect(coreCss).not.toContain('.milkdown-editor .body-line-number-gutter');
    expect(coreCss).not.toContain('.milkdown-editor .body-line-number {');
  });
});
