import { describe, expect, it } from "vitest";
import {
  extractCssRule,
  readCommonMarkdownSurfaceStyle,
  readStyleFile,
  readThemeCompatibilityStyle,
  readThemeStyle,
} from "./selectionStylesTestUtils";

describe("editor markdown presentation styles", () => {
  it('collapses paragraph line box around standalone image blocks', () => {
    const css = readStyleFile('markdown.css');

    expect(css).toContain('.milkdown p.editor-paragraph-has-image-block {');
    expect(css).toContain('font-size: var(--vlaina-font-0);');
    expect(css).toContain('line-height: var(--vlaina-leading-0);');
    expect(css).toContain('margin-top: var(--vlaina-space-1rem);');
    expect(css).toContain('margin-bottom: var(--vlaina-space-1rem);');
    expect(css).toContain('.milkdown p.editor-paragraph-has-image-block > .image-block-container {');
    expect(css).toContain('display: block;');
    expect(css).toContain('width: 100%;');
    expect(css).toContain('margin-top: 0;');
    expect(css).toContain('margin-bottom: 0;');
    expect(css).toContain('.milkdown .image-block-container {');
    expect(css).toContain('margin: var(--vlaina-space-0);');
  });

  it('scales note titles and markdown headings from the markdown body font size', () => {
    const themeCss = readThemeStyle();
    const commonCss = readCommonMarkdownSurfaceStyle();

    expect(themeCss).toContain('--vlaina-note-title-font-size: 1.882352941em;');
    expect(themeCss).toContain('--vlaina-note-title-compact-font-size: 1.176470588em;');
    expect(themeCss).toContain('--vlaina-note-title-padding-y: 0.08em;');
    expect(themeCss).toContain('--vlaina-note-title-margin-bottom: 0.941176471em;');
    expect(themeCss).toContain('--vlaina-markdown-font-heading-h1-size: 2em;');
    expect(themeCss).toContain('--vlaina-markdown-font-heading-h6-size: 1em;');
    expect(commonCss).toContain('font-size: var(--vlaina-markdown-font-heading-h1-size);');
    expect(commonCss).toContain('font-size: var(--vlaina-markdown-font-heading-h6-size);');
    expect(commonCss).not.toContain('font-size: var(--vlaina-font-h1, 34px);');
  });

  it('keeps floating toolbar colors independent from block selection state', () => {
    const css = readStyleFile('floating-toolbar.css');

    expect(css).toContain('.toolbar-btn {');
    expect(css).toContain('color: var(--vlaina-text-primary);');
    expect(css).toContain('.toolbar-btn:hover {');
    expect(css).toContain('color: var(--vlaina-sidebar-row-selected-text, var(--vlaina-accent));');
    expect(css).toContain('.toolbar-btn.active {');
    expect(css).toContain('color: var(--vlaina-accent);');
    expect(css).not.toContain('.editor-block-selected');
  });

  it('keeps raw HTML tables compact instead of using editable markdown table sizing', () => {
    const css = readStyleFile('markdown.css');

    expect(css).toContain(".milkdown [data-type='html-block'] table {");
    expect(css).toContain(".milkdown [data-type='html-block'] th,");
    expect(css).toContain('min-width: var(--vlaina-size-0);');
    expect(css).toContain('text-align: inherit;');
    expect(css).toContain(".milkdown [data-type='html-block'] img {");
    expect(css).toContain('border-radius: var(--vlaina-radius-0);');
    expect(css).toContain(".milkdown [data-type='html-block'] sub,");
    expect(css).toContain('line-height: var(--vlaina-leading-0);');
    expect(css).toContain('bottom: var(--vlaina-space--025em);');
  });

  it('shows a pointer cursor over coordinate-resolved task checkboxes', () => {
    const css = readStyleFile('markdown.css');

    expect(css).toContain('.milkdown .ProseMirror.editor-task-checkbox-hover,');
    expect(css).toContain('.milkdown .ProseMirror.editor-task-checkbox-hover * {');
    expect(css).toContain('cursor: pointer !important;');
  });

  it('keeps native list markers before center- and right-aligned list text', () => {
    const css = readStyleFile('markdown.css');
    const markerRule = extractCssRule(css, '.milkdown li.editor-list-item-align-center:not([data-item-type="task"]),');
    const textBlockRule = extractCssRule(css, '.milkdown li.editor-list-item-align-center:not([data-item-type="task"]) > [data-text-align],');
    const centerRule = extractCssRule(css, '.milkdown li.editor-list-item-align-center:not([data-item-type="task"]) > [data-text-align] {');
    const rightMarginRule = [
      '.milkdown li.editor-list-item-align-right:not([data-item-type="task"]) > [data-text-align] {',
      '  margin-left: auto;',
      '  margin-right: var(--vlaina-space-0);',
      '}',
    ].join('\n');

    expect(markerRule).toContain('.milkdown li.editor-list-item-align-right:not([data-item-type="task"]) {');
    expect(markerRule).toContain('list-style-position: outside;');
    expect(markerRule).not.toContain('list-style-position: inside;');
    expect(textBlockRule).toContain('display: block;');
    expect(textBlockRule).not.toContain('display: inline-block;');
    expect(centerRule).toContain('margin-left: auto;');
    expect(centerRule).toContain('margin-right: auto;');
    expect(css).toContain(rightMarginRule);
  });

  it('centers task checkboxes against the actual markdown body line height', () => {
    const css = readStyleFile('markdown.css');
    const commonCss = readCommonMarkdownSurfaceStyle();

    expect(css).toContain('margin-top: calc((var(--vlaina-markdown-line-height-body) - var(--vlaina-size-16px)) / 2);');
    expect(css).not.toContain('margin-top: var(--vlaina-space-35px);');
    expect(commonCss).toContain('margin: calc((var(--vlaina-markdown-line-height-body) - var(--vlaina-size-16px)) / 2) var(--vlaina-space-05rem) 0 calc(var(--vlaina-markdown-space-list-indent) * -1);');
    expect(commonCss).not.toContain('margin: var(--vlaina-space-35px) var(--vlaina-space-05rem)');
  });

  it('keeps markdown blank-line placeholders from adding extra top-level block gap', () => {
    const css = readStyleFile('markdown.css');
    const commonCss = readCommonMarkdownSurfaceStyle();

    expect(commonCss).toContain("p:not(.editor-editable-markdown-blank-line):not(.editor-empty-paragraph)");
    expect(css).toContain(".milkdown :is(#write, .ProseMirror) > :is([data-type='html-block'][data-value='<!--vlaina-markdown-blank-line-->'], [data-type='html-block'][data-value='<!--vlaina-rendered-html-boundary-blank-line-->']) + :is(p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, details, .md-alert, .callout, .milkdown-table-block, table, .code-block-container, .frontmatter-block-container, .toc-block, .footnote-def, .mermaid-block, .video-block, [data-type='math-block'], [data-type='mermaid'], [data-type='video'], [data-type='html-block']:not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->'])),");
    expect(css).toContain(".milkdown :is(#write, .ProseMirror) > p.editor-editable-markdown-blank-line + :is(p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, details, .md-alert, .callout, .milkdown-table-block, table, .code-block-container, .frontmatter-block-container, .toc-block, .footnote-def, .mermaid-block, .video-block, [data-type='math-block'], [data-type='mermaid'], [data-type='video'], [data-type='html-block']:not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->'])),");
    expect(css).toContain(".milkdown :is(#write, .ProseMirror) > p.editor-empty-paragraph:not(.is-editor-empty) + :is(p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, details, .md-alert, .callout, .milkdown-table-block, table, .code-block-container, .frontmatter-block-container, .toc-block, .footnote-def, .mermaid-block, .video-block, [data-type='math-block'], [data-type='mermaid'], [data-type='video'], [data-type='html-block']:not([data-value='<!--vlaina-markdown-blank-line-->']):not([data-value='<!--vlaina-rendered-html-boundary-blank-line-->'])) {");
    expect(css).toContain('margin-block-start: var(--vlaina-space-0);');
    expect(css).toContain(":where(.milkdown-editor[data-markdown-compat-layer='external'].theme-typora.ty-on-typewriter-mode) #write > p.editor-empty-paragraph:not(.is-editor-empty) {");
    expect(css).toContain('margin-block-start: var(--typora-block-gap);');
  });

  it('lets autolinks inherit the shared markdown link appearance', () => {
    const css = readStyleFile('extended.css');

    expect(css).not.toContain('.milkdown .autolink {');
    expect(css).not.toContain('text-underline-offset: 4px;');
  });

  it('lets links keep their existing color during block selection', () => {
    const css = readStyleFile('block-selection-list.css');

    expect(css).not.toContain(':is(a, .external-link, .internal-link, .editor-raw-markdown-link-text)');
  });

  it('uses explicit tag token run classes instead of sibling :has selectors', () => {
    const css = readStyleFile('extended.css');

    expect(css).toContain('.milkdown .editor-tag-token {');
    expect(css).toContain('-webkit-text-fill-color: var(--vlaina-markdown-color-link);');
    expect(css).toContain('.milkdown .ProseMirror .editor-tag-token.editor-tag-token-has-next {');
    expect(css).toContain('.milkdown .ProseMirror .editor-tag-token.editor-text-selection-overlay.editor-tag-token-has-next {');
    expect(css).not.toContain('.editor-tag-token:has(+ .editor-tag-token)');
  });

  it('keeps table-of-contents links from underlining on hover', () => {
    const css = readStyleFile('extended.css');

    expect(css).toContain('.milkdown .toc-link {');
    expect(css).toContain('text-decoration: none;');
    expect(css).not.toContain('text-underline-offset: 3px;');
    expect(css).not.toContain('text-decoration: underline;');
  });

  it('keeps notes editor links from drawing shared markdown hover borders', () => {
    const commonCss = readCommonMarkdownSurfaceStyle();
    const notesCss = readStyleFile('markdown.css');

    expect(commonCss).toContain('border-bottom: var(--vlaina-border-width-1) solid transparent;');
    expect(commonCss).toContain('border-bottom-color: var(--vlaina-markdown-color-link-hover);');
    expect(notesCss).toContain('.markdown-surface .milkdown a,');
    expect(notesCss).toContain('.markdown-surface .milkdown a:hover {');
    expect(notesCss).toContain('border-bottom: none;');
    expect(notesCss).toContain('transition: none;');
  });

  it('keeps external-theme readonly heading-to-rich-block spacing aligned with the editor', () => {
    const commonCss = readCommonMarkdownSurfaceStyle();

    expect(commonCss).toContain(
      ".milkdown-editor[data-markdown-compat-layer='external'] .markdown-surface > :is(h1, h2, h3, h4, h5, h6):has(+ :is(blockquote, details, .md-alert, .callout)) {"
    );
    expect(commonCss).toContain('margin-bottom: var(--vlaina-space-0) !important;');
  });

  it('keeps inline background geometry low-specificity so inline code can set its fill', () => {
    const notesCss = readStyleFile('markdown.css');
    const compatibilityCss = readStyleFile('theme-compatibility/base.css');
    const rootRule = extractCssRule(notesCss, '.milkdown .ProseMirror {');
    const sharedRule = extractCssRule(notesCss, '.milkdown .ProseMirror :where(');
    const codeRule = extractCssRule(notesCss, '.milkdown .ProseMirror code:not(pre code) {');
    const compatibilityRule = extractCssRule(
      compatibilityCss,
      ".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror :where("
    );

    expect(sharedRule).toContain('code:not(pre code),');
    expect(sharedRule).toContain('mark.highlight,');
    expect(sharedRule).toContain('mark[data-bg-color],');
    expect(rootRule).toContain('--vlaina-editor-inline-background-fill: transparent;');
    expect(rootRule).toContain('--vlaina-editor-inline-background-padding: var(--vlaina-space-0);');
    expect(sharedRule).toContain('background-color: var(--vlaina-editor-inline-background-fill);');
    expect(sharedRule).not.toContain('--vlaina-editor-inline-background-fill: transparent;');
    expect(sharedRule).not.toContain(':is(');
    expect(codeRule).toContain('--vlaina-editor-inline-background-fill: var(--vlaina-color-editor-inline-code-bg);');
    expect(compatibilityRule).toContain('code:not(pre code),');
    expect(compatibilityRule).not.toContain(':is(');
  });

  it('keeps inline code readable inside selected blocks', () => {
    const css = readStyleFile('markdown.css');
    const themeCompatibilityCss = readThemeCompatibilityStyle();
    const selectedInlineCodeRule = extractCssRule(
      css,
      '.milkdown .ProseMirror.editor-block-selection-enabled :is('
    );
    const externalSelectedInlineCodeRule = extractCssRule(
      themeCompatibilityCss,
      ".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror .editor-native-selected-textlike :is(code:not(pre code), .v-std-code, .cm-inline-code) {"
    );

    expect(selectedInlineCodeRule).toContain('.editor-block-selected,');
    expect(selectedInlineCodeRule).toContain('.editor-block-selected-textlike,');
    expect(selectedInlineCodeRule).toContain('.editor-block-drag-source,');
    expect(selectedInlineCodeRule).toContain(') code:not(pre code),');
    expect(selectedInlineCodeRule).toContain('.milkdown .ProseMirror .editor-native-selected-textlike code:not(pre code) {');
    expect(selectedInlineCodeRule).toContain('--vlaina-inline-code-selected-border-shadow: inset 0 0 0 var(--vlaina-code-block-selected-border-width, var(--vlaina-border-width-2)) var(--vlaina-color-white);');
    expect(selectedInlineCodeRule).toContain('background: var(--vlaina-block-selection-color, var(--vlaina-block-selection-color-default)) !important;');
    expect(selectedInlineCodeRule).toContain('background-color: var(--vlaina-block-selection-color, var(--vlaina-block-selection-color-default)) !important;');
    expect(selectedInlineCodeRule).toContain('outline: none;');
    expect(selectedInlineCodeRule).toContain('box-shadow: var(--vlaina-inline-code-selected-border-shadow);');
    expect(selectedInlineCodeRule).not.toContain('\n  color:');
    expect(selectedInlineCodeRule).not.toContain('\n  -webkit-text-fill-color:');

    expect(themeCompatibilityCss).toContain(".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror.editor-block-selection-enabled :is(");
    expect(themeCompatibilityCss).toContain(') :is(code:not(pre code), .v-std-code, .cm-inline-code),');
    expect(externalSelectedInlineCodeRule).toContain(".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror .editor-native-selected-textlike :is(code:not(pre code), .v-std-code, .cm-inline-code) {");
    expect(externalSelectedInlineCodeRule).toContain('background: var(--vlaina-block-selection-color, var(--vlaina-block-selection-color-default)) !important;');
    expect(externalSelectedInlineCodeRule).toContain('outline: none !important;');
    expect(externalSelectedInlineCodeRule).toContain('box-shadow: var(--vlaina-inline-code-selected-border-shadow) !important;');
    expect(externalSelectedInlineCodeRule).not.toContain('\n  color:');
    expect(externalSelectedInlineCodeRule).not.toContain('\n  -webkit-text-fill-color:');
  });

  it('keeps highlighted text readable inside selected blocks', () => {
    const css = readStyleFile('extended.css');
    const themeCompatibilityCss = readThemeCompatibilityStyle();
    const selectedHighlightRule = extractCssRule(
      css,
      '.milkdown .ProseMirror.editor-block-selection-enabled :is('
    );
    const externalSelectedHighlightRule = extractCssRule(
      themeCompatibilityCss,
      ".milkdown-editor[data-markdown-compat-layer='external'] .ProseMirror .editor-native-selected-textlike :is(mark.highlight, .highlight) {"
    );

    expect(selectedHighlightRule).toContain('.editor-block-selected,');
    expect(selectedHighlightRule).toContain('.editor-block-selected-textlike,');
    expect(selectedHighlightRule).toContain('.editor-block-drag-source,');
    expect(selectedHighlightRule).toContain(') :is(mark.highlight, .highlight),');
    expect(selectedHighlightRule).toContain('.milkdown .ProseMirror .editor-native-selected-textlike :is(mark.highlight, .highlight) {');
    expect(selectedHighlightRule).toContain('--vlaina-highlight-selected-border-shadow: inset 0 0 0 var(--vlaina-code-block-selected-border-width, var(--vlaina-border-width-2)) var(--vlaina-color-white);');
    expect(selectedHighlightRule).toContain('background: var(--vlaina-block-selection-color, var(--vlaina-block-selection-color-default)) !important;');
    expect(selectedHighlightRule).toContain('background-color: var(--vlaina-block-selection-color, var(--vlaina-block-selection-color-default)) !important;');
    expect(selectedHighlightRule).toContain('outline: none;');
    expect(selectedHighlightRule).toContain('box-shadow: var(--vlaina-highlight-selected-border-shadow);');
    expect(selectedHighlightRule).not.toContain('\n  color:');
    expect(selectedHighlightRule).not.toContain('\n  -webkit-text-fill-color:');

    expect(themeCompatibilityCss).toContain(') :is(mark.highlight, .highlight),');
    expect(externalSelectedHighlightRule).toContain('background: var(--vlaina-block-selection-color, var(--vlaina-block-selection-color-default)) !important;');
    expect(externalSelectedHighlightRule).toContain('outline: none !important;');
    expect(externalSelectedHighlightRule).toContain('box-shadow: var(--vlaina-highlight-selected-border-shadow) !important;');
    expect(externalSelectedHighlightRule).not.toContain('\n  color:');
    expect(externalSelectedHighlightRule).not.toContain('\n  -webkit-text-fill-color:');
  });

  it('renders footnote references as smaller inline-code chips with a capsule hover value', () => {
    const css = readStyleFile('extended.css');

    expect(css).toContain('.milkdown .footnote-ref {');
    expect(css).toContain('vertical-align: super;');
    expect(css).toContain('font-size: var(--vlaina-font-068em);');
    expect(css).toContain('cursor: pointer;');
    expect(css).toContain('user-select: none;');
    expect(css).toContain('-webkit-user-select: none;');
    expect(css).toContain('.milkdown .footnote-ref-label {');
    expect(css).toContain('background: var(--vlaina-color-footnote-ref-bg);');
    expect(css).toContain('color: var(--vlaina-markdown-color-link);');
    expect(css).toContain('font-family: var(--vlaina-markdown-font-code-family);');
    expect(css).toContain('.milkdown .footnote-ref::after {');
    expect(css).toContain('content: attr(data-footnote-value);');
    expect(css).toContain('border-radius: var(--vlaina-radius-pill-lg);');
    expect(css).toContain('box-shadow: var(--vlaina-shadow-raised-soft);');
    expect(css).toContain('transition: none;');
    expect(css).toContain('.milkdown .footnote-ref:hover::after,');
    expect(css).toContain('.milkdown .footnote-ref:focus-within::after {');
    expect(css).toContain('visibility: visible;');
    expect(css).toContain('.milkdown .footnote-def-label {');
    expect(css).toContain('user-select: none;');
    expect(css).toContain('-webkit-user-select: none;');
  });
});
