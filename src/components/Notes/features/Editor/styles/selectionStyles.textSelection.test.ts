import { describe, expect, it } from "vitest";
import {
  readStyleFile,
  readBlockSelectionStyle,
  normalizeLineEndings,
  readTextSelectionOverlaySource,
  readSharedBlockNodeTypesSource,
  readAiReviewSelectionSource,
  readLinkTooltipSource,
  readLinkTooltipStateSource,
  readLinkTooltipEditorSource,
  readMilkdownLinkTooltipThemeSource,
} from "./selectionStylesTestUtils";

describe("editor text selection and link styles", () => {
  it('shrinks plain top-level paragraph line boxes so multiline text selections fit content width', () => {
    const css = readStyleFile('selection-width.css');

    expect(css).toContain(
      '.milkdown .ProseMirror > p:not([data-text-align]):not(.is-editor-empty):not(.editor-block-selected):not(.editor-editable-markdown-blank-line):not(.editor-empty-paragraph):not(.editor-paragraph-has-image-block) {'
    );
    expect(css).toContain('width: fit-content;');
    expect(css).toContain('max-width: 100%;');
  });

  it('keeps temporary tail empty paragraphs at the default block width for bottom typing', () => {
    const css = readStyleFile('selection-width.css');

    expect(css).toContain(':not(.editor-empty-paragraph)');
  });

  it('keeps top-level image block paragraphs from collapsing when structural classes are not present yet', () => {
    const css = readStyleFile('selection-width.css');

    expect(css).toContain('container-type: inline-size;');
    expect(css).toContain('.milkdown .ProseMirror > p > .image-block-container {');
    expect(css).toContain('min-width: min(100cqi, var(--vlaina-width-editor-content-max));');
  });

  it('uses tabular numeric glyphs so digit-only line selections have equal width', () => {
    const css = readStyleFile('selection-width.css');

    expect(css).toContain('font-variant-numeric: tabular-nums;');
    expect(css).toContain('font-feature-settings: "tnum";');
  });

  it('renders editor text selections with inline overlays instead of block line boxes', () => {
    const css = normalizeLineEndings(readStyleFile('selection-width.css'));
    const source = readTextSelectionOverlaySource();
    const sharedSource = readSharedBlockNodeTypesSource();

    expect(css).toContain('.milkdown .ProseMirror.editor-text-selection-overlay-active:not(.editor-pointer-native-selection) *::selection {');
    expect(css).not.toContain('.milkdown .ProseMirror.editor-text-selection-overlay-active *::selection {');
    expect(css).toContain('background-color: transparent !important;');
    expect(css).toContain('.milkdown .ProseMirror.editor-keyboard-selection-pending::selection,');
    expect(css).toContain('.milkdown .ProseMirror.editor-keyboard-selection-pending *::selection {');
    expect(css).toContain('editor-pointer-native-selection');
    expect(source).toContain("const KEYBOARD_SELECTION_PENDING_CLASS = 'editor-keyboard-selection-pending'");
    expect(source).toContain('view.dom.classList.add(KEYBOARD_SELECTION_PENDING_CLASS)');
    expect(css).toContain([
      '.milkdown .ProseMirror.editor-keyboard-selection-pending::selection,',
      '.milkdown .ProseMirror.editor-keyboard-selection-pending *::selection {',
      '  background-color: transparent !important;',
      '  color: inherit !important;',
      '  -webkit-text-fill-color: inherit !important;',
      '}',
    ].join('\n'));
    expect(css).toContain('.milkdown .ProseMirror .editor-text-selection-overlay {');
    expect(css).toContain('background-color: var(--vlaina-markdown-color-selection);');
    expect(css).toContain('pointer-events: none;');
    expect(css).toContain('color: var(--vlaina-color-white) !important;');
    expect(css).toContain('-webkit-text-fill-color: var(--vlaina-color-white) !important;');
    expect(css).toContain('box-shadow: none;');
    expect(css).toContain('border-radius: var(--vlaina-radius-3px);');
    expect(css).toContain('line-height: inherit;');
    expect(css).toContain('padding-block: max(0px, calc((1lh - 1em) / 2));');
    expect(css).not.toContain('background-color: var(--vlaina-block-selection-color-default);');
    expect(css).not.toContain('vlaina-ai-review-selection');
    expect(css).not.toContain('vlaina-link-selection-visible');
    expect(source).toContain("export const TEXT_SELECTION_OVERLAY_CLASS = 'editor-text-selection-overlay'");
    expect(source).toContain("const EDITOR_ONLY_TEXT_SELECTION_PLACEHOLDERS = new Set(['\\u200B', '\\u200C', '\\u2800']);");
    expect(source).toContain('EDITOR_ONLY_TEXT_SELECTION_PLACEHOLDERS.has(char)');
    expect(source).toContain('export function addTextSelectionOverlayDecorations(');
    expect(source).toContain('Decoration.inline(rangeFrom, rangeTo, {');
    expect(source).toContain('ATOMIC_TEXT_SELECTION_OVERLAY_NODE_NAMES.has(node.type.name)');
    expect(sharedSource).toContain('ATOMIC_TEXT_SELECTION_OVERLAY_NODE_NAMES');
    expect(sharedSource).toContain("'video'");
    expect(sharedSource).toContain("'toc'");
    expect(source).toContain('Decoration.node(pos, pos + node.nodeSize, {');
    expect(source).toContain("class: 'editor-block-selected md-focus editor-atomic-selected'");
    expect(source).toContain("class: TEXT_SELECTION_OVERLAY_CLASS");
    expect(source).toContain('node.isText');
    expect(source).toContain('selection instanceof TextSelection');
    expect(source).toContain('selection instanceof AllSelection');
    expect(source).toContain('hasSelectedBlocks(state)');
    expect(source).toContain('isTextSelectionOverlayEligible(view.state)');
  });

  it('keeps atomic select-all overlays visible when native selections are hidden', () => {
    const blockSelectionCss = readBlockSelectionStyle();
    const selectionCss = readStyleFile('selection-width.css');

    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .editor-block-selected-textlike,');
    expect(blockSelectionCss).not.toContain('var(--vlaina-editor-block-selection-fg)');
    expect(selectionCss).toContain(
      '.milkdown .ProseMirror.editor-text-selection-overlay-active .editor-atomic-selected,'
    );
    expect(selectionCss).toContain(
      '.milkdown .ProseMirror.editor-text-selection-overlay-active .editor-atomic-selected * {'
    );
    expect(selectionCss).toContain('user-select: none;');
    expect(selectionCss).toContain('-webkit-user-select: none;');
    expect(selectionCss).toContain('-webkit-text-fill-color: currentColor !important;');
    expect(selectionCss).toContain(
      '.milkdown .ProseMirror.editor-text-selection-overlay-active .editor-atomic-selected::selection,'
    );
    expect(selectionCss).toContain(
      '.milkdown .ProseMirror.editor-text-selection-overlay-active .editor-atomic-selected *::selection {'
    );
  });

  it('hides editor selection paint inside toolbar preview clones', () => {
    const css = readStyleFile('selection-width.css');

    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview::selection,');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview .editor-text-selection-overlay::selection,');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview .editor-text-selection-overlay *::selection {');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-applied-preview-overlay.toolbar-selection-hidden-preview,');
    expect(css).toContain('user-select: none !important;');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview[data-toolbar-color-preview],');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview[data-toolbar-color-preview] .editor-text-selection-overlay,');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview[data-toolbar-color-preview] .editor-text-selection-overlay * {');
    expect(css).not.toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview[data-toolbar-color-preview] * {');
    expect(css).not.toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview[data-toolbar-color-preview="bg"] *::selection');
    expect(css).not.toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview[data-toolbar-color-preview="text"] *::selection');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview .editor-text-selection-overlay {');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview .cm-selectionBackground {');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview[data-toolbar-color-preview="text"] .editor-text-selection-overlay {');
    expect(css).toContain('color: var(--vlaina-toolbar-preview-text-color, inherit) !important;');
    expect(css).not.toContain('box-shadow: 0 0 0 1em');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview[data-toolbar-color-preview="text"][data-toolbar-color-preview-removes-counterpart="true"] .editor-text-selection-overlay {');
    expect(css).toContain('background: var(--vlaina-markdown-color-canvas, var(--background, transparent)) !important;');
    expect(css).toContain('padding: var(--vlaina-editor-inline-background-padding, var(--vlaina-space-0)) !important;');
    expect(css).not.toContain(':has(.editor-text-selection-overlay)');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview[data-toolbar-color-preview="text"][data-toolbar-color-preview-removes-counterpart="true"] .editor-text-selection-overlay :is(mark[data-bg-color], span[data-bg-color]) {');
    expect(css).toContain('background: transparent !important;');
    expect(css).toContain('box-shadow: none !important;');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview[data-toolbar-color-preview="bg"] .editor-text-selection-overlay {');
    expect(css).toContain('background-color: var(--vlaina-toolbar-preview-bg-color, transparent) !important;');
    expect(css).toContain('border-radius: var(--vlaina-editor-inline-background-radius, var(--vlaina-radius-0)) !important;');
    expect(css).toContain('box-shadow: var(--vlaina-editor-inline-background-shadow, none) !important;');
    expect(css).toContain('padding: var(--vlaina-editor-inline-background-padding, var(--vlaina-space-0)) !important;');
    expect(css).toContain('.milkdown .ProseMirror.toolbar-selection-hidden-preview[data-toolbar-color-preview="bg"][data-toolbar-color-preview-removes-counterpart="true"] .editor-text-selection-overlay,');
    expect(css).toContain('color: var(--vlaina-markdown-color-text, currentColor) !important;');
  });

  it('hides carets inside inline content while block selection is active', () => {
    const blockSelectionCss = readBlockSelectionStyle();

    expect(blockSelectionCss).toContain('.milkdown .ProseMirror.editor-block-selection-active {');
    expect(blockSelectionCss).toContain('caret-color: transparent !important;');
  });

  it('keeps mermaid drag previews from inheriting generic preview text color', () => {
    const css = readStyleFile('extended.css');

    expect(css).toContain('.editor-block-drag-preview .mermaid-block,');
    expect(css).toContain('.editor-block-drag-preview .mermaid-block * {');
    expect(css).toContain('color: initial !important;');
    expect(css).toContain('-webkit-text-fill-color: initial !important;');
    expect(css).toContain('.editor-block-drag-preview .mermaid-drag-preview-surface {');
    expect(css).toContain('.editor-block-drag-preview .mermaid-drag-preview-image {');
  });

  it('reuses the standard text selection overlay for AI review ranges', () => {
    const css = readStyleFile('core.css');
    const source = readAiReviewSelectionSource();

    expect(source).toContain("from '../../selection/textSelectionOverlayPlugin'");
    expect(source).toContain('addTextSelectionOverlayDecorationsForRange(');
    expect(source).not.toContain('vlaina-ai-review-selection');
    expect(css).not.toContain('vlaina-ai-review-selection');
  });

  it('keeps link tooltip editing from drawing a persistent editor selection overlay', () => {
    const css = readStyleFile('core.css');
    const source = readLinkTooltipSource();
    const stateSource = readLinkTooltipStateSource();

    expect(source).not.toContain("import { TEXT_SELECTION_OVERLAY_CLASS }");
    expect(source).not.toContain("class: TEXT_SELECTION_OVERLAY_CLASS");
    expect(stateSource).not.toContain('visibleSelectionFrom');
    expect(stateSource).not.toContain('visibleSelectionTo');
    expect(source).not.toContain('vlaina-link-selection-visible');
    expect(css).not.toContain('data-link-selection-visible');
    expect(css).not.toContain('vlaina-link-selection-visible');
  });

  it('keeps the link tooltip editor from drawing an animated accent underline', () => {
    const source = readLinkTooltipEditorSource();

    expect(source).not.toContain('scaleX');
    expect(source).not.toContain('bg-[var(--vlaina-accent)] origin-left');
  });

  it('keeps Milkdown link tooltip preview links from underlining on hover', () => {
    const source = readMilkdownLinkTooltipThemeSource();

    expect(source).toContain('& > .link-display {');
    expect(source).not.toContain('text-decoration: underline;');
  });
});
