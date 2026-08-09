import { describe, expect, it } from "vitest";
import {
  readStyleFile,
  readThemeStyle,
  readCodeBlockThemeSource,
  readPreviewStylesSource,
  readAppliedPreviewSource,
  readFloatingToolbarPluginViewSource,
  readFloatingToolbarSourceFiles,
  readEditorStyleSourceFiles,
  readUrlRailEditorSource,
  readToolbarInteractionsSource,
} from "./selectionStylesTestUtils";

describe("editor floating toolbar and preview styles", () => {
  it('keeps toolbar previews on the applied shadow document path', () => {
    const codeBlockCss = readStyleFile('code-block.css');
    const markdownCss = readStyleFile('markdown.css');
    const source = readPreviewStylesSource();
    const appliedPreviewSource = readAppliedPreviewSource();

    expect(source).toContain('function renderAppliedPreview');
    expect(source).toContain('convertBlockType(previewView, blockType);');
    expect(source).toContain('toggleMark(previewView, markName);');
    expect(source).toContain('setLink(previewView, null);');
    expect(source).toContain('setTextColor(previewView, color);');
    expect(source).toContain('setBgColor(previewView, color);');
    expect(source).toContain('setTextAlignment(previewView, alignment);');
    expect(source).toContain('createAppliedPreviewState(view, apply)');
    expect(source).toContain('renderAppliedPreviewDocument(previewState, view.dom, view.dom.ownerDocument, undefined, view)');
    expect(appliedPreviewSource).toContain('DOMSerializer.fromSchema(state.schema)');
    expect(appliedPreviewSource).toContain('new CodeBlockNodeView(entry.node, view, () => undefined)');
    expect(source).toContain('cleanupAppliedPreviewDocument(node)');
    expect(source).not.toContain('data-preview-block-type');
    expect(codeBlockCss).not.toContain('data-preview-block-type');
    expect(markdownCss).not.toContain('data-preview-block-type');
    expect(markdownCss).not.toContain('data-preview-hide');
    expect(markdownCss).not.toContain('data-preview-restore');
    expect(source).not.toContain('renderResultSurfacePreview');
  });

  it('keeps all floating toolbar preview surfaces off the removed simulation paths', () => {
    const forbiddenPatterns = [
      'inlinePreviewPlugin',
      'blockPreviewDomAdjustments',
      'blockPreviewListLabel',
      'renderResultSurfacePreview',
      'data-preview-block-type',
      'data-preview-hide',
      'data-preview-restore',
    ];

    for (const file of [...readFloatingToolbarSourceFiles(), ...readEditorStyleSourceFiles()]) {
      for (const pattern of forbiddenPatterns) {
        expect(file.source, `${pattern} leaked into ${file.path}`).not.toContain(pattern);
      }
    }
  });

  it('keeps frontmatter selection rendering on the CodeMirror selection layer', () => {
    const css = readStyleFile('frontmatter.css');

    expect(css).toContain('.milkdown .frontmatter-block-container .frontmatter-block-editor {');
    expect(css).toContain('padding: var(--vlaina-padding-frontmatter-editor);');
    expect(css).toContain('.milkdown .frontmatter-block-container .cm-content {');
    expect(css).toContain('padding: 0 !important;');
    expect(css).toContain('.milkdown .frontmatter-block-container .cm-line {');
    expect(css).toContain('padding: var(--vlaina-padding-frontmatter-line) !important;');
    expect(css).toContain('transition: none !important;');
    expect(css).toContain('.milkdown .frontmatter-block-container.ProseMirror-selectednode,');
    expect(css).toContain('.milkdown .frontmatter-block-container.editor-block-selected {');
    expect(css).toContain('.milkdown .ProseMirror .frontmatter-block-container:is(');
    expect(css).toContain('.editor-block-drag-source,');
    expect(css).toContain(':is(.frontmatter-properties-host, .frontmatter-block-editor) {');
    expect(css).toContain('z-index: var(--vlaina-z-1);');
    expect(css).not.toContain('--vlaina-block-selection-bleed-y:');
    expect(css).toContain('--vlaina-block-selection-bleed-x-start: var(--vlaina-block-selection-bleed-x-default);');
    expect(css).toContain('--vlaina-block-selection-bleed-x-end: var(--vlaina-block-selection-bleed-x-default);');
    expect(css).toContain('border-color: var(--vlaina-color-white);');
    expect(css).toContain('background-color: var(--vlaina-block-selection-color);');
    expect(css).toContain(
      '.milkdown .frontmatter-block-container .cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {'
    );
    expect(css).toContain(
      ".milkdown .frontmatter-block-container:not(.ProseMirror-selectednode):not(.editor-block-selected):not([data-pm-selected='true']) .cm-editor:not(.cm-focused) > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {"
    );
    expect(css).toContain(
      ".milkdown .ProseMirror.editor-toolbar-copy-feedback-active .frontmatter-block-container[data-pm-selected='true'] .cm-editor:not(.cm-focused) > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {"
    );
    expect(css).toContain('background: transparent !important;');
    expect(css).not.toContain('.cm-editor.cm-focused .cm-content ::selection');
    expect(css).not.toContain('.cm-editor.cm-focused .cm-line ::selection');
  });

  it('does not hide unfocused embedded CodeMirror text selections', () => {
    const codeBlockCss = readStyleFile('code-block.css');
    const frontmatterCss = readStyleFile('frontmatter.css');

    expect(codeBlockCss).not.toContain(
      '.milkdown .code-block-container .cm-editor:not(.cm-focused) > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {\n  background: transparent !important;'
    );
    expect(frontmatterCss).not.toContain(
      '.milkdown .frontmatter-block-container .cm-editor:not(.cm-focused) > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {\n  background: transparent !important;'
    );
  });

  it('keeps floating toolbar hover backgrounds transparent without lift transforms', () => {
    const css = readStyleFile('floating-toolbar.css');

    expect(css).toContain('.toolbar-btn:hover {');
    expect(css).toContain('background-color: transparent;');
    expect(css).toContain('color: var(--vlaina-sidebar-row-selected-text, var(--vlaina-accent));');
    expect(css).not.toContain('transform: translateY(-1px);');
  });

  it('keeps toolbar SVG icons non-interactive and block-aligned', () => {
    const css = readStyleFile('floating-toolbar.css');
    const slashMenuCss = readStyleFile('slash-menu.css');

    const toolbarIconRule = css.slice(
      css.indexOf('.toolbar-btn svg {'),
      css.indexOf('.toolbar-btn:hover {')
    );
    const dropdownIconRule = css.slice(
      css.indexOf('.block-dropdown-item-icon svg {'),
      css.indexOf('.block-dropdown-item.active .block-dropdown-item-icon {')
    );
    const aiIconRule = css.slice(
      css.indexOf('.ai-dropdown-item-icon svg {'),
      css.indexOf('.dark .ai-dropdown-item {')
    );
    const slashIconRule = slashMenuCss.slice(
      slashMenuCss.indexOf('.slash-menu-item-icon svg {'),
      slashMenuCss.indexOf('.slash-menu-item.selected .slash-menu-item-icon,')
    );

    for (const rule of [toolbarIconRule, dropdownIconRule, aiIconRule, slashIconRule]) {
      expect(rule).toContain('display: block;');
      expect(rule).toContain('pointer-events: none;');
    }
  });

  it('keeps the floating toolbar link editor from drawing an accent rail line', () => {
    const css = readStyleFile('floating-toolbar.css');
    const source = readUrlRailEditorSource();

    expect(source).not.toContain('link-editor-rail-line');
    expect(css).not.toContain('.link-editor-rail-line');
    expect(css).not.toContain('.link-editor-rail-input:focus + .link-editor-rail-line');
    expect(css).not.toContain('transform-origin: center;');
  });

  it('keeps the floating toolbar color button hover surface transparent', () => {
    const css = readStyleFile('floating-toolbar.css');

    expect(css).toContain('.toolbar-btn[data-action="color"]:hover {');
    expect(css).toContain('background-color: transparent;');
    expect(css).toContain('.dark .toolbar-btn[data-action="color"]:hover {');
  });

  it('keeps active color swatch borders transparent', () => {
    const css = readStyleFile('floating-toolbar.css');

    expect(css).toContain('.color-picker-item.active {');
    expect(css).toContain('border-color: transparent !important;');
  });

  it('keeps the reduced color picker palette on two rows', () => {
    const css = readStyleFile('floating-toolbar.css');

    expect(css).toContain('.color-picker-grid {');
    expect(css).toContain('grid-template-columns: repeat(5, 1fr);');
  });

  it('allows long image caption names to wrap inside the floating caption button', () => {
    const css = readStyleFile('floating-toolbar.css');

    const captionButtonRule = css.slice(
      css.indexOf('.image-caption-btn {'),
      css.indexOf('.image-caption-btn svg {')
    );
    const captionTextRule = css.slice(
      css.indexOf('.image-caption-text {'),
      css.indexOf('/* Toolbar button tooltip */')
    );

    expect(captionButtonRule).toContain('height: auto;');
    expect(captionButtonRule).toContain('white-space: normal;');
    expect(captionTextRule).toContain('overflow-wrap: anywhere;');
    expect(captionTextRule).toContain('word-break: break-word;');
  });

  it('places floating toolbar shortcut tooltips below the hovered button', () => {
    const css = readStyleFile('floating-toolbar.css');
    const source = readToolbarInteractionsSource();

    expect(source).toContain("tooltip.dataset.side = 'bottom';");
    expect(source).toContain('tooltip.style.top = `${rect.bottom + themeDomStyleTokens.toolbarTooltipOffsetPx}px`;');
    expect(source).toContain('tooltip.style.transform = themeRenderingTokens.translateCenterTop;');
    expect(css).toContain('transform-origin: center top;');
    expect(css).toContain('transform: translate(var(--vlaina-translate--50pct), calc(var(--vlaina-translate-4px) * -1)) scale(var(--vlaina-scale-95));');
    expect(css).toContain('transform: translate(var(--vlaina-translate--50pct), 0) scale(var(--vlaina-scale-100));');
    expect(css).toContain('top: 0;');
    expect(css).toContain('transform: translate(var(--vlaina-translate--50pct), calc(var(--vlaina-translate--50pct) + var(--vlaina-translate-2px))) rotate(45deg);');
  });

  it('uses an opaque shortcut tooltip background', () => {
    const css = readStyleFile('floating-toolbar.css');
    const themeCss = readThemeStyle();

    expect(themeCss).toContain('--vlaina-toolbar-tooltip-bg: var(--vlaina-color-toolbar-tooltip-bg);');
    expect(themeCss).toContain('--vlaina-toolbar-tooltip-fg: var(--vlaina-color-toolbar-tooltip-fg);');
    expect(css).toContain('background-color: var(--vlaina-toolbar-tooltip-bg);');
    expect(css).toContain('.dark .toolbar-tooltip {');
    expect(css).not.toContain('background-color: hsl(var(--foreground));');
  });

  it('keeps block dropdown hover backgrounds transparent while tinting hovered icons', () => {
    const css = readStyleFile('floating-toolbar.css');
    const themeCss = readThemeStyle();

    expect(themeCss).toContain('--vlaina-toolbar-block-dropdown-active-bg: var(--vlaina-sidebar-notes-row-active');
    expect(themeCss).toContain('--vlaina-toolbar-block-dropdown-active-fg: var(--vlaina-sidebar-row-selected-text');
    expect(css).toContain('border-radius: var(--vlaina-radius-05rem);');
    expect(css).toContain('.block-dropdown-item:hover {');
    expect(css).toContain('background-color: transparent;');
    expect(css).toContain('.block-dropdown-item-icon {');
    expect(css).toContain('color: currentColor;');
    expect(css).toContain('.block-dropdown-item:hover .block-dropdown-item-icon {');
    expect(css).toContain('color: var(--vlaina-sidebar-row-selected-text);');
    expect(css).toContain('background-color: var(--vlaina-toolbar-block-dropdown-active-bg);');
    expect(css).toContain('color: var(--vlaina-toolbar-block-dropdown-active-fg);');
  });

  it('uses the selected notes sidebar row surface for AI dropdown hover states', () => {
    const css = readStyleFile('floating-toolbar.css');

    expect(css).toContain('.ai-dropdown-category:hover,');
    expect(css).toContain('.ai-dropdown-category.active {');
    expect(css).toContain('.ai-dropdown-item:hover {');
    expect(css).toContain('background-color: var(--vlaina-sidebar-notes-row-active);');
    expect(css).toContain('color: var(--vlaina-sidebar-row-selected-text);');
    expect(css).toContain('.ai-dropdown-item:hover .ai-dropdown-item-shortcut {');
    expect(css).toContain('color: currentColor;');
  });

  it('applies block preview sizes directly without transform scaling', () => {
    const source = readPreviewStylesSource();

    expect(source).not.toContain('delete nextStyles.fontSize;');
    expect(source).not.toContain('delete nextStyles.lineHeight;');
    expect(source).not.toContain('scale(');
    expect(source).not.toContain('transformOrigin');
  });

  it('serializes inline hover previews from the applied shadow editor schema', () => {
    const source = readAppliedPreviewSource();

    expect(source).toContain("DOMSerializer");
    expect(source).toContain(".fromSchema(state.schema)");
    expect(source).toContain("serializeFragment(");
  });

  it('keeps applied preview root typography pinned to the visible editor root', () => {
    const source = readAppliedPreviewSource();

    expect(source).toContain('stabilizePreviewRootTypography');
    expect(source).toContain('window.getComputedStyle(sourceDom)');
    expect(source).toContain("'lineHeight'");
  });

  it('rerenders AI review previews when the review width changes', () => {
    const source = readFloatingToolbarPluginViewSource();

    expect(source).toContain('reviewWidth === null ?');
    expect(source).toContain('const renderState = ctx.getReviewRenderState(review, reviewWidth);');
  });

  it('clears applied toolbar previews whenever the toolbar is hidden or reset', () => {
    const source = readFloatingToolbarPluginViewSource();

    expect(source).toContain('ctx.hideToolbarAndReset = () => {');
    expect(source).toContain('clearFormatPreview(ctx.editorView);');
  });

  it('self-heals stale applied toolbar previews on the next outside mouse down', () => {
    const source = readFloatingToolbarPluginViewSource();

    expect(source).toContain('ctx.isToolbarEventTarget = (target: EventTarget | null) => {');
    expect(source).toContain('if (hasActiveAppliedPreview(ctx.editorView) && !ctx.isToolbarEventTarget(event.target)) {');
    expect(source).toContain('clearFormatPreview(ctx.editorView);');
  });

  it('keeps the code block theme aligned with the CSS padding model', () => {
    const source = readCodeBlockThemeSource();

    expect(source).toContain('padding: themeCodeBlockEditorTokens.contentPadding');
    expect(source).toContain('minHeight: themeCodeBlockEditorTokens.contentMinHeight');
    expect(source).toContain("'.cm-line': {");
    expect(source).toContain('padding: themeCodeBlockEditorTokens.linePadding');
    expect(source).not.toContain('.cm-content::selection');
    expect(source).not.toContain('.cm-line::selection');
  });
});
