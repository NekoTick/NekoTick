import postcss from 'postcss';
import { describe, expect, it } from "vitest";
import {
  readStyleFile,
  readBlockSelectionStyle,
  readThemeCompatibilityStyle,
  readThemeStyle,
  extractCssRule,
  extractSelectorListsContaining,
  readEditorStyleSourceFiles,
} from "./selectionStylesTestUtils";

describe("editor block selection styles", () => {
  it('keeps block selection rules free of foreground declarations', () => {
    const selectionSelector = /(?:editor-block-selection|editor-block-selected|editor-block-drag-active|editor-block-drag-source|editor-native-selected|ProseMirror-selectednode|editor-atomic-block-keyboard-selected|body-line-number-selected)/;
    const foregroundProperties = new Set(['color', '-webkit-text-fill-color', 'fill', 'stroke']);
    const violations: string[] = [];

    for (const { path, source } of readEditorStyleSourceFiles()) {
      postcss.parse(source, { from: path }).walkRules((rule) => {
        const selectedContentSelectors = rule.selectors.filter((selector) =>
          selectionSelector.test(selector) &&
          !selector.includes('::selection') &&
          !selector.includes('::-moz-selection')
        );
        if (selectedContentSelectors.length === 0) return;

        rule.walkDecls((declaration) => {
          if (!foregroundProperties.has(declaration.prop)) return;
          violations.push([
            `${path}:${declaration.source?.start?.line ?? 0}`,
            selectedContentSelectors.join(', '),
            declaration.toString(),
          ].join(' '));
        });
      });
    }

    expect(violations).toEqual([]);
  });

  it('keeps nested list block selection overlays from stacking darker backgrounds', () => {
    const css = readBlockSelectionStyle();

    expect(css).toContain('.milkdown .ProseMirror li.editor-block-selected .editor-block-selected {');
    expect(css).toContain('background-color: transparent;');
    expect(css).toContain('box-shadow: none;');
    expect(css).toContain('transition: none !important;');
  });

  it('does not replace native list markers during block selection', () => {
    const css = readBlockSelectionStyle();

    expect(css).not.toContain('content: attr(data-label)');
    expect(css).not.toContain('li.editor-block-selected:not([data-item-type="task"])::before');
    expect(css).not.toContain('list-style-type: none !important;');
  });

  it('keeps native list marker colors unchanged during block selection', () => {
    const css = readBlockSelectionStyle();

    expect(css).not.toContain('.milkdown .ProseMirror li.editor-block-selected::marker {');
    expect(css).not.toContain('.milkdown .ProseMirror li.editor-block-selected-parent-marker::marker {');
    expect(css).not.toContain('li:has(> p.editor-block-selected)::marker');
    expect(css).not.toContain('li:has(> .code-block-container.editor-block-selected)::marker');
  });

  it('keeps task checkbox colors unchanged during block selection', () => {
    const css = readBlockSelectionStyle();
    const markdownCss = readStyleFile('markdown.css');

    expect(css).not.toContain('li[data-item-type="task"].editor-block-selected::before');
    expect(css).not.toContain('li[data-item-type="task"].editor-block-selected-parent-marker::before');
    expect(css).not.toContain('.editor-block-selected li[data-item-type="task"]::before');
    const largeRule = extractCssRule(
      css,
      '.milkdown .ProseMirror.editor-block-selection-large li[data-item-type="task"].editor-block-selected.editor-block-selected-large-item::before {'
    );
    expect(largeRule).toContain("content: '';");
    expect(largeRule).toContain('display: inline-block !important;');
    expect(css).not.toContain('li[data-item-type="task"]:has(> p.editor-block-selected)::before');
    expect(markdownCss).toContain('.milkdown li[data-item-type="task"][data-checked="true"]::before {');
    expect(markdownCss).toContain('background-color: var(--vlaina-markdown-color-task-checked-bg);');
    expect(markdownCss).toContain('color: var(--vlaina-markdown-color-task-checked-text);');
    expect(markdownCss).not.toContain('.milkdown .ProseMirror li[data-item-type="task"][data-checked="true"] > .editor-block-selected {');
  });

  it('keeps hashtag tokens at their tag color inside block selections', () => {
    const css = readBlockSelectionStyle();
    const extendedCss = readStyleFile('extended.css');

    expect(css).not.toContain('.editor-tag-token');
    expect(extendedCss).toContain('.milkdown .editor-tag-token {');
    expect(extendedCss).toContain('color: var(--vlaina-markdown-color-link);');
  });

  it('keeps links at their link color inside block selections', () => {
    const css = readBlockSelectionStyle();
    const themeCompatibilityCss = readThemeCompatibilityStyle();
    expect(css).not.toContain(':is(a, .external-link, .internal-link, .editor-raw-markdown-link-text)');
    expect(themeCompatibilityCss).not.toContain(':is(a, .external-link, .internal-link, .editor-raw-markdown-link-text)');
  });

  it('hides editable list gap placeholder text while keeping the caret visible', () => {
    const css = readStyleFile('markdown.css');
    const itemRule = extractCssRule(css, '.milkdown .ProseMirror li.editor-list-gap-placeholder-item');
    const rule = extractCssRule(css, '.milkdown .ProseMirror li.editor-list-gap-placeholder-item > p');

    expect(itemRule).toContain('margin-left: calc(-1 * var(--vlaina-list-gap-placeholder-outdent));');
    expect(itemRule).toContain('width: calc(100% + var(--vlaina-list-gap-placeholder-outdent));');
    expect(rule).toContain('color: transparent;');
    expect(rule).toContain('-webkit-text-fill-color: transparent;');
    expect(rule).toContain('caret-color: transparent;');
  });

  it('keeps list gap placeholder block selection from extending farther left than normal list rows', () => {
    const css = readBlockSelectionStyle();
    const markdownCss = readStyleFile('markdown.css');
    const rule = extractCssRule(
      css,
      '.milkdown .ProseMirror li.editor-list-gap-placeholder-item.editor-block-selected,'
    );
    const taskGapRule = extractCssRule(
      css,
      '.milkdown .ProseMirror li.editor-list-gap-placeholder-item.editor-list-gap-placeholder-task-list.editor-block-selected,'
    );
    const nestedTaskGapRule = extractCssRule(
      css,
      '.milkdown .ProseMirror li :is(ul, ol) li.editor-list-gap-placeholder-item.editor-list-gap-placeholder-task-list.editor-block-selected,'
    );
    const nestedTaskRuleIndex = css.indexOf(
      '.milkdown .ProseMirror li :is(ul, ol) li[data-item-type="task"].editor-block-selected,'
    );
    const gapPlaceholderRuleIndex = css.indexOf(
      '.milkdown .ProseMirror li.editor-list-gap-placeholder-item.editor-block-selected,'
    );

    expect(rule).toContain('.milkdown .ProseMirror li.editor-list-gap-placeholder-item > .editor-block-selected');
    expect(rule).toContain('var(--vlaina-list-row-selection-bleed-x-start)');
    expect(rule).toContain('var(--vlaina-list-gap-placeholder-outdent)');
    expect(taskGapRule).toContain('.milkdown .ProseMirror li.editor-list-gap-placeholder-item.editor-list-gap-placeholder-task-list > .editor-block-selected');
    expect(taskGapRule).toContain('var(--vlaina-list-row-selection-bleed-x-start)');
    expect(taskGapRule).not.toContain('var(--vlaina-space-120px)');
    expect(taskGapRule).toContain('var(--vlaina-list-gap-placeholder-outdent)');
    expect(nestedTaskGapRule).toContain('.milkdown .ProseMirror li :is(ul, ol) li.editor-list-gap-placeholder-item.editor-list-gap-placeholder-task-list > .editor-block-selected');
    expect(nestedTaskGapRule).toContain('var(--vlaina-space-120px)');
    expect(nestedTaskGapRule).toContain('var(--vlaina-list-gap-placeholder-outdent)');
    expect(taskGapRule).not.toContain('li[data-item-type="task"] li.editor-list-gap-placeholder-item');
    expect(nestedTaskRuleIndex).toBeGreaterThanOrEqual(0);
    expect(gapPlaceholderRuleIndex).toBeGreaterThan(nestedTaskRuleIndex);
    expect(markdownCss).not.toContain('.milkdown .ProseMirror li.editor-list-gap-placeholder-item.editor-block-selected,');
  });

  it('keeps blockquote rails on their existing color during selection', () => {
    const css = readBlockSelectionStyle();

    expect(css).not.toContain('blockquote.editor-block-selected::before');
    expect(css).not.toContain('blockquote.editor-block-selected-parent-marker::before');
    expect(css).not.toContain('.editor-block-selected blockquote::before');
    const largeRule = extractCssRule(
      css,
      '.milkdown .ProseMirror.editor-block-selection-large blockquote.editor-block-selected.editor-block-selected-large-item::before {'
    );
    expect(largeRule).toContain("content: '';");
    expect(largeRule).toContain('display: block !important;');
  });

  it('keeps footnote definition rails and labels on their existing colors', () => {
    const css = readStyleFile('extended.css');

    expect(css).toContain('.milkdown .footnote-def:is(');
    expect(css).not.toContain('.milkdown .footnote-def:has(:is(');
    expect(css).toContain('.milkdown :is(');
    expect(css).toContain('.ProseMirror-selectednode');
    expect(css).toContain('.editor-native-selected-textlike');
    expect(css).toContain(') .footnote-def {');
    expect(css).toContain('position: relative;');
    expect(css).toContain('--vlaina-block-selection-fill-top: var(--vlaina-space-0) !important;');
    expect(css).toContain('--vlaina-block-selection-fill-bottom: var(--vlaina-space-0) !important;');
    expect(css).toContain(') .footnote-def::before {');
    expect(css).toContain('border-left: inherit !important;');
    expect(css).toContain('border-radius: inherit !important;');
    expect(css).not.toContain('.footnote-def-label,');
    expect(css).not.toContain('var(--vlaina-editor-block-selection-fg)');
  });

  it('keeps selected text block backgrounds separated by the shared vertical gap token', () => {
    const css = readBlockSelectionStyle();
    const extendedCss = readStyleFile('extended.css');
    const themeCss = readThemeStyle();
    const textBlockRule = extractCssRule(
      css,
      '.milkdown .ProseMirror .editor-block-selected-textlike,'
    );
    const textBlockFillRule = extractCssRule(
      css,
      '.milkdown .ProseMirror .editor-block-selected-textlike::after,'
    );
    const adjacentBottomRule = extractCssRule(
      css,
      '.milkdown .ProseMirror .editor-block-selected-textlike.editor-block-selected-has-next,'
    );
    const adjacentTopRule = extractCssRule(
      css,
      '.milkdown .ProseMirror .editor-block-selected-textlike.editor-block-selected-has-previous,'
    );

    expect(css).toContain('.milkdown .ProseMirror p.editor-block-selected {');
    expect(css).toContain('--vlaina-block-selection-bleed-y: var(--vlaina-block-selection-bleed-y-default);');
    expect(themeCss).toContain('--vlaina-block-selection-spacing-y-unit: var(--vlaina-space-1px);');
    expect(themeCss).toContain('--vlaina-block-selection-bleed-y-compact: calc(');
    expect(themeCss).toContain('--vlaina-block-selection-bleed-y-rich: calc(');
    expect(themeCss).toContain('--vlaina-block-selection-bleed-y-list-contained: calc(');
    expect(themeCss).toContain('--vlaina-block-selection-bleed-y-default: var(--vlaina-block-selection-bleed-y-compact);');
    expect(themeCss).toContain('--vlaina-block-selection-gap-y: var(--vlaina-block-selection-spacing-y-unit);');
    expect(themeCss).toContain('--vlaina-block-selection-fill-edge-default: calc(-1 * var(--vlaina-block-selection-bleed-y));');
    expect(themeCss).toContain('--vlaina-block-selection-fill-top: var(--vlaina-block-selection-fill-edge-default);');
    expect(themeCss).toContain('--vlaina-block-selection-fill-bottom: var(--vlaina-block-selection-fill-edge-default);');
    expect(themeCss).toContain('--vlaina-z-behind: -1;');
    expect(css).toContain('--vlaina-block-selection-fill-top: var(--vlaina-block-selection-fill-edge-default);');
    expect(css).toContain('--vlaina-block-selection-fill-bottom: var(--vlaina-block-selection-fill-edge-default);');
    expect(textBlockRule).toContain('.editor-block-selected-textlike');
    expect(textBlockRule).toContain('.editor-block-drag-source-textlike');
    expect(textBlockRule).toContain('.editor-native-selected-textlike');
    expect(css).not.toContain('.ProseMirror-selectednode:not(:has(> :where(');
    expect(css).not.toContain('.ProseMirror-selectednode):not(:has(> :where(');
    expect(css).not.toContain(':has(+ .ProseMirror-selectednode)');
    expect(textBlockRule).not.toContain('.editor-block-drag-source):not(:has(> :where(');
    expect(textBlockRule).toContain('isolation: isolate;');
    expect(textBlockRule).toContain('position: relative;');
    expect(textBlockRule).toContain('background-color: transparent;');
    expect(textBlockRule).toContain('box-shadow: none;');
    expect(textBlockRule).not.toContain('\n  color:');
    expect(css).not.toContain('var(--vlaina-editor-block-selection-fg)');
    expect(css).not.toContain([
      '.milkdown .ProseMirror:not(.editor-block-selection-large) .editor-block-selected-textlike {',
      '  background-color: var(--vlaina-block-selection-color);',
      '}',
    ].join('\n'));
    expect(extractCssRule(
      css,
      '.milkdown .ProseMirror:not(.editor-block-selection-large) .editor-block-selected-textlike > *:not(.code-block-container):not(.code-block-container *):not(.mermaid-block):not(.mermaid-block *):not(.heading-toggle-btn):not(.editor-collapse-btn):not(.ProseMirror-widget) {'
    )).toContain('z-index: var(--vlaina-z-1);');
    expect(textBlockFillRule).toContain('::after');
    expect(textBlockFillRule).toContain('top: var(--vlaina-block-selection-fill-top);');
    expect(textBlockFillRule).toContain('bottom: var(--vlaina-block-selection-fill-bottom);');
    expect(textBlockFillRule).toContain('z-index: var(--vlaina-z-behind);');
    expect(textBlockFillRule).toContain('background: var(--vlaina-block-selection-color);');
    expect(adjacentBottomRule).toContain('.editor-block-selected-has-next');
    expect(adjacentBottomRule).toContain('--vlaina-block-selection-fill-bottom: var(--vlaina-block-selection-gap-y);');
    expect(adjacentTopRule).toContain('.editor-block-selected-has-previous');
    expect(adjacentTopRule).toContain('--vlaina-block-selection-fill-top: var(--vlaina-block-selection-gap-y);');
    expect(extendedCss).toContain('.milkdown .ProseMirror .callout:is(.editor-block-selected-textlike, .editor-block-selected, .ProseMirror-selectednode) {');
    expect(extractCssRule(
      extendedCss,
      '.milkdown .ProseMirror .callout:is(.editor-block-selected-textlike, .editor-block-selected, .ProseMirror-selectednode) {'
    )).toContain('background: transparent !important;');
  });

  it('uses a lightweight paint path for large block selections', () => {
    const css = readBlockSelectionStyle();
    const largeSelectionRule = extractCssRule(
      css,
      '.milkdown .ProseMirror.editor-block-selection-large .editor-block-selected,'
    );
    const largeSelectionFillRule = extractCssRule(
      css,
      '.milkdown .ProseMirror.editor-block-selection-large .editor-block-selected-textlike::after'
    );
    const largeTextlikeSelectionRule = extractCssRule(
      css,
      '.milkdown .ProseMirror.editor-block-selection-large .editor-block-selected-large-textlike {'
    );
    const largeTextlikeSelectionFillRule = extractCssRule(
      css,
      '.milkdown .ProseMirror.editor-block-selection-large .editor-block-selected-large-textlike::after {'
    );
    const largeRichSelectionRule = extractCssRule(
      css,
      '.milkdown .ProseMirror.editor-block-selection-large .editor-block-selected-large-rich {'
    );
    const largeRichSelectionFillRule = extractCssRule(
      css,
      '.milkdown .ProseMirror.editor-block-selection-large .editor-block-selected-large-rich::after {'
    );

    expect(largeSelectionRule).toContain('background-color: var(--vlaina-block-selection-color);');
    expect(largeSelectionRule).toContain('box-shadow: none !important;');
    expect(largeSelectionRule).toContain('box-decoration-break: slice;');
    expect(largeSelectionRule).toContain('contain: paint;');
    expect(largeSelectionRule).not.toContain('\n  color:');
    expect(largeSelectionRule).not.toContain('\n  -webkit-text-fill-color:');
    expect(largeSelectionFillRule).toContain('display: none !important;');
    expect(largeTextlikeSelectionRule).toContain('background-color: transparent;');
    expect(largeTextlikeSelectionRule).toContain('box-decoration-break: clone;');
    expect(largeTextlikeSelectionRule).toContain('contain: none;');
    expect(css).toContain('.milkdown .ProseMirror.editor-block-selection-large .editor-block-selected-large-textlike.editor-block-selected-has-next,');
    expect(css).toContain('.milkdown .ProseMirror.editor-block-selection-large .editor-block-selected-large-textlike.editor-block-selected-has-previous,');
    expect(largeTextlikeSelectionFillRule).toContain('left: calc(-1 * var(--vlaina-block-selection-bleed-x-start));');
    expect(largeTextlikeSelectionFillRule).toContain('right: calc(-1 * var(--vlaina-block-selection-bleed-x-end));');
    expect(largeTextlikeSelectionFillRule).toContain('display: block !important;');
    expect(largeTextlikeSelectionFillRule).toContain('background: var(--vlaina-block-selection-color);');
    expect(largeRichSelectionRule).toContain('--vlaina-block-selection-rich-fill-top: calc(-1 * var(--vlaina-block-selection-bleed-y));');
    expect(largeRichSelectionRule).toContain('--vlaina-block-selection-rich-fill-bottom: calc(-1 * var(--vlaina-block-selection-bleed-y));');
    expect(largeRichSelectionRule).toContain('isolation: isolate;');
    expect(largeRichSelectionRule).toContain('contain: none;');
    expect(css).toContain('.milkdown .ProseMirror.editor-block-selection-large .editor-block-selected-large-rich.editor-block-selected-has-previous {');
    expect(css).toContain('--vlaina-block-selection-rich-fill-top: var(--vlaina-block-selection-gap-y);');
    expect(css).toContain('.milkdown .ProseMirror.editor-block-selection-large .editor-block-selected-large-rich.editor-block-selected-has-next {');
    expect(css).toContain('--vlaina-block-selection-rich-fill-bottom: var(--vlaina-block-selection-gap-y);');
    expect(largeRichSelectionFillRule).toContain('top: var(--vlaina-block-selection-rich-fill-top);');
    expect(largeRichSelectionFillRule).toContain('right: calc(-1 * var(--vlaina-block-selection-bleed-x-end));');
    expect(largeRichSelectionFillRule).toContain('bottom: var(--vlaina-block-selection-rich-fill-bottom);');
    expect(largeRichSelectionFillRule).toContain('left: calc(-1 * var(--vlaina-block-selection-bleed-x-start));');
    expect(largeRichSelectionFillRule).toContain('display: block !important;');
    expect(largeRichSelectionFillRule).toContain('background: var(--vlaina-block-selection-color);');
    expect(css).toContain('.milkdown .ProseMirror:not(.editor-block-selection-large) .editor-block-selected-textlike > *:not(');
  });

  it('uses explicit native selected text-like classes instead of repeated selector lists', () => {
    const css = readBlockSelectionStyle();
    const textLikeLists = extractSelectorListsContaining(css, ':where', '.definition-list');

    expect(textLikeLists).toHaveLength(0);
    expect(css).toContain('.milkdown .ProseMirror .editor-native-selected-textlike {');
    expect(css).toContain('.milkdown .ProseMirror .editor-native-selected-textlike::after {');
    expect(css).toContain('.milkdown .ProseMirror .editor-native-selected-textlike.editor-native-selected-has-next {');
    expect(css).toContain('.milkdown .ProseMirror .editor-native-selected-textlike.editor-native-selected-has-previous {');
  });

  it('renders markdown source blank lines as editor-only blank line blocks', () => {
    const markdownCss = readStyleFile('markdown.css');
    const blockSelectionCss = readBlockSelectionStyle();
    const editorBlankLineRule = extractCssRule(
      markdownCss,
      ".milkdown .ProseMirror > :is(\n  [data-type='html-block'][data-value='<!--vlaina-markdown-blank-line-->'],"
    );
    const editableBlankLineRule = extractCssRule(
      markdownCss,
      '.milkdown .ProseMirror > p.editor-editable-markdown-blank-line'
    );
    const trailingBreakBlankLineRule = extractCssRule(
      markdownCss,
      '.milkdown .ProseMirror > p.editor-empty-paragraph:not(.is-editor-empty)'
    );

    expect(editorBlankLineRule).toContain('min-height: var(--vlaina-markdown-size-blank-line);');
    expect(editorBlankLineRule).toContain('margin: var(--vlaina-space-0);');
    expect(editorBlankLineRule).toContain('padding: var(--vlaina-space-0);');
    expect(editableBlankLineRule).toContain('min-height: var(--vlaina-markdown-size-blank-line);');
    expect(editableBlankLineRule).toContain('margin: var(--vlaina-space-0);');
    expect(editableBlankLineRule).toContain('padding: var(--vlaina-space-0);');
    expect(trailingBreakBlankLineRule).toContain('min-height: var(--vlaina-markdown-size-blank-line);');
    expect(trailingBreakBlankLineRule).toContain('margin: var(--vlaina-space-0);');
    expect(trailingBreakBlankLineRule).toContain('padding: var(--vlaina-space-0);');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .editor-native-selected-textlike {');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .editor-block-selected-textlike,');
    expect(editorBlankLineRule).toContain("[data-type='html-block'][data-value='<!--vlaina-rendered-html-boundary-blank-line-->']");
    expect(blockSelectionCss).toContain(".milkdown .ProseMirror > :is(\n  [data-type='html-block'][data-value='<!--vlaina-markdown-blank-line-->'],\n  [data-type='html-block'][data-value='<!--vlaina-rendered-html-boundary-blank-line-->']\n).editor-block-selected {");
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .editor-block-selected-textlike::after,');
    expect(blockSelectionCss).toContain('--vlaina-block-selection-bleed-y: var(--vlaina-block-selection-bleed-y-default);');
    expect(blockSelectionCss).toContain('top: var(--vlaina-block-selection-fill-top);');
    expect(blockSelectionCss).toContain('bottom: var(--vlaina-block-selection-fill-bottom);');
    expect(blockSelectionCss).toContain('background: var(--vlaina-block-selection-color);');
  });

  it('keeps list selection overlays wide enough to cover native markers', () => {
    const css = readBlockSelectionStyle();
    const themeCss = readThemeStyle();

    expect(themeCss).toContain('--vlaina-block-selection-offset-x: 0px;');
    expect(themeCss).toContain('--vlaina-space-120px: 120px;');
    expect(themeCss).toContain('--vlaina-space-152px: 152px;');
    expect(themeCss).toContain('--vlaina-space-160px: 160px;');
    expect(css).toContain('--vlaina-block-selection-bleed-x-start: var(--vlaina-block-selection-bleed-x-default);');
    expect(css).toContain('.milkdown .ProseMirror li.editor-block-selected,');
    expect(css).toContain('--vlaina-list-row-selection-bleed-x-start: var(--vlaina-space-72px);');
    expect(css).toContain('--vlaina-block-selection-bleed-x-start: var(--vlaina-list-row-selection-bleed-x-start);');
    expect(css).toContain('--vlaina-block-selection-bleed-y: var(--vlaina-block-selection-bleed-y-default);');
    expect(css).toContain('--vlaina-block-selection-bleed-x-end: var(--vlaina-block-selection-bleed-x-default);');
    expect(css).toContain('.milkdown .ProseMirror :is(ul, ol) > li.editor-block-selected,');
    expect(css).toContain('--vlaina-list-row-selection-bleed-x-start: var(--vlaina-space-72px);');
    expect(css).toContain('.milkdown .ProseMirror ul > li.editor-block-selected,');
    expect(css).toContain('.milkdown .ProseMirror li[data-item-type="task"].editor-block-selected,');
    expect(css).toContain('--vlaina-list-row-selection-bleed-x-start: var(--vlaina-space-96px);');
    expect(css).toContain('.milkdown .ProseMirror ol > li.editor-block-selected,');
    expect(css).toContain('--vlaina-list-row-selection-bleed-x-start: var(--vlaina-space-96px);');
    expect(css).toContain('.milkdown .ProseMirror :is(ul, ol) :is(ul, ol) > li.editor-block-selected,');
    expect(css).toContain('--vlaina-list-row-selection-bleed-x-start: var(--vlaina-space-128px);');
    expect(css).toContain('.milkdown .ProseMirror :is(ul, ol) ol > li.editor-block-selected,');
    expect(css).toContain('--vlaina-list-row-selection-bleed-x-start: var(--vlaina-space-128px);');
    expect(css).toContain('.milkdown .ProseMirror :is(ul, ol) :is(ul, ol) :is(ul, ol) > li.editor-block-selected,');
    expect(css).toContain('--vlaina-list-row-selection-bleed-x-start: var(--vlaina-space-160px);');
    expect(css).toContain('.milkdown .ProseMirror :is(ul, ol) :is(ul, ol) ol > li.editor-block-selected,');
    expect(css).toContain('--vlaina-list-row-selection-bleed-x-start: var(--vlaina-space-152px);');
    expect(css).toContain('.milkdown .ProseMirror li :is(ul, ol) li[data-item-type="task"].editor-block-selected,');
    expect(css).toContain('--vlaina-list-row-selection-bleed-x-start: var(--vlaina-space-120px);');
    expect(css).toContain('.milkdown .ProseMirror li > :not(:is(');
    expect(css).toContain('p:first-of-type,');
    expect(css).toContain(')):is(.editor-block-selected, .ProseMirror-selectednode, .editor-block-drag-source) {');
    expect(css).toContain('background-color: var(--vlaina-block-selection-color);');
    expect(css).toContain('box-shadow: var(--vlaina-block-selection-shadow);');
    expect(css).toContain(')):is(.editor-block-selected, .ProseMirror-selectednode, .editor-block-drag-source)::after {');
    expect(css).toContain('display: none;');
    const nestedChildRule = extractCssRule(
      css,
      '.milkdown .ProseMirror li > :not(:is('
    );
    expect(nestedChildRule).not.toContain('--vlaina-list-row-selection-bleed-x-start: var(--vlaina-space-0);');
    expect(nestedChildRule).not.toContain('--vlaina-block-selection-bleed-x-start: var(--vlaina-list-row-selection-bleed-x-start);');
    expect(css).not.toContain('margin-left: calc(-1 * var(--vlaina-block-selection-offset-x));');
  });

  it('uses semantic vertical spacing roles for compact and rich selected blocks', () => {
    const css = readBlockSelectionStyle();
    const themeCss = readThemeStyle();
    const richBlockRule = extractCssRule(
      css,
      '.milkdown .ProseMirror :is(\n  .code-block-container,'
    );

    expect(themeCss).toContain('--vlaina-block-selection-list-contained-bleed-y: var(--vlaina-block-selection-bleed-y-list-contained);');
    expect(css).toContain('.milkdown .ProseMirror li.editor-block-selected,');
    expect(css).toContain('--vlaina-block-selection-bleed-y: var(--vlaina-block-selection-bleed-y-default);');
    expect(richBlockRule).toContain('.code-block-container,');
    expect(richBlockRule).toContain('.frontmatter-block-container,');
    expect(richBlockRule).toContain('.image-block-container,');
    expect(richBlockRule).toContain('.video-block,');
    expect(richBlockRule).toContain('.toc-block,');
    expect(richBlockRule).toContain("[data-type='math-block'],");
    expect(richBlockRule).toContain('.mermaid-block,');
    expect(richBlockRule).toContain('.milkdown-table-block,');
    expect(richBlockRule).toContain('table');
    expect(richBlockRule).toContain('--vlaina-block-selection-bleed-y: var(--vlaina-block-selection-bleed-y-rich);');
  });

  it('uses rich vertical bleed for image block selection overlays', () => {
    const css = readBlockSelectionStyle();
    const imageSelectionRule = extractCssRule(
      css,
      '.milkdown .ProseMirror .image-block-container.ProseMirror-selectednode,'
    );
    const imageSelectionBeforeRule = extractCssRule(
      css,
      '.milkdown .ProseMirror .image-block-container.ProseMirror-selectednode::before,'
    );
    const imageSelectionWrapperRule = extractCssRule(
      css,
      ".milkdown .ProseMirror .image-block-container:is(.ProseMirror-selectednode, .editor-block-selected) [data-image-selection-wrapper='true'] {"
    );
    const imageSelectionWrapperChildRule = extractCssRule(
      css,
      ".milkdown .ProseMirror .image-block-container:is(.ProseMirror-selectednode, .editor-block-selected) [data-image-selection-wrapper='true'] > * {"
    );

    expect(css).toContain('.milkdown .ProseMirror .image-block-container.ProseMirror-selectednode,');
    expect(css).toContain('.milkdown .ProseMirror .image-block-container.editor-block-selected {');
    expect(css).toContain('--vlaina-block-selection-color: var(--vlaina-block-selection-color-default);');
    expect(css).toContain('--vlaina-block-selection-bleed-y: var(--vlaina-block-selection-bleed-y-rich);');
    expect(imageSelectionRule).toContain('position: relative;');
    expect(imageSelectionRule).toContain('z-index: var(--vlaina-z-1);');
    expect(imageSelectionRule).toContain('display: block !important;');
    expect(imageSelectionRule).toContain('width: 100% !important;');
    expect(imageSelectionRule).toContain('min-width: 100% !important;');
    expect(imageSelectionRule).toContain('overflow: visible !important;');
    expect(imageSelectionRule).toContain('background-color: transparent;');
    expect(imageSelectionRule).toContain('box-shadow: var(--vlaina-block-selection-shadow);');
    expect(imageSelectionBeforeRule).toContain('display: none !important;');
    expect(imageSelectionBeforeRule).toContain('.image-block-container.editor-block-selected::after');
    expect(css).toContain(".milkdown .ProseMirror .image-block-container:is(.ProseMirror-selectednode, .editor-block-selected) [data-image-selection-wrapper='true'] {");
    expect(imageSelectionWrapperRule).toContain('z-index: var(--vlaina-z-1);');
    expect(imageSelectionWrapperRule).toContain('border-radius: inherit;');
    expect(imageSelectionWrapperRule).toContain('background: var(--vlaina-block-selection-color) !important;');
    expect(imageSelectionWrapperRule).toContain('background-color: var(--vlaina-block-selection-color) !important;');
    expect(css).toContain(".milkdown .ProseMirror .image-block-container:is(.ProseMirror-selectednode, .editor-block-selected) [data-image-selection-wrapper='true'] > * {");
    expect(imageSelectionWrapperChildRule).toContain('background: transparent !important;');
    expect(css).toContain(".milkdown .ProseMirror .image-block-container:is(.ProseMirror-selectednode, .editor-block-selected) [data-image-selection-surface='true'] {");
    expect(extractCssRule(
      css,
      ".milkdown .ProseMirror .image-block-container:is(.ProseMirror-selectednode, .editor-block-selected) [data-image-selection-surface='true'] {"
    )).toContain('background: transparent !important;');
    expect(css).toContain('.milkdown .ProseMirror .image-block-container.editor-block-selected:not(.ProseMirror-selectednode)::before {');
    expect(css).toContain('display: none !important;');
    expect(css).toContain('.milkdown .ProseMirror p.editor-block-selected.editor-block-selected-has-direct-image {');
    expect(css).toContain('.milkdown .ProseMirror p.editor-block-selected.editor-block-selected-has-direct-image > .image-block-container:is(.ProseMirror-selectednode, .editor-block-selected)::before {');
    expect(css).toContain('background: transparent !important;');
    expect(css).not.toContain('p.editor-block-selected:has(> .image-block-container)');
  });

  it('keeps structural markdown block selection styles centralized', () => {
    const blockSelectionCss = readBlockSelectionStyle();
    const markdownCss = readStyleFile('markdown.css');
    const hrSelectedRule = extractCssRule(
      blockSelectionCss,
      '.milkdown .ProseMirror hr.ProseMirror-selectednode,'
    );
    const hrSelectedFillRule = extractCssRule(
      blockSelectionCss,
      '.milkdown .ProseMirror hr.ProseMirror-selectednode::after,'
    );
    const largeHrRule = extractCssRule(
      blockSelectionCss,
      '.milkdown .ProseMirror.editor-block-selection-large hr.editor-block-selected.editor-block-selected-large-item::before,'
    );

    expect(blockSelectionCss).toContain('.milkdown .ProseMirror hr.ProseMirror-selectednode::before,');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror hr.editor-block-selected::before,');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror .md-hr.editor-block-selected::before {');
    expect(largeHrRule).toContain('.milkdown .ProseMirror.editor-block-selection-large .md-hr.editor-block-selected.editor-block-selected-hr-wrapper.editor-block-selected-large-item::before {');
    expect(largeHrRule).toContain("content: '';");
    expect(largeHrRule).toContain('display: block !important;');
    expect(blockSelectionCss).toContain('.milkdown .ProseMirror hr.ProseMirror-selectednode,\n.milkdown .ProseMirror hr.editor-block-selected,\n.milkdown .ProseMirror .md-hr.ProseMirror-selectednode,\n.milkdown .ProseMirror .md-hr.editor-block-selected {');
    expect(hrSelectedRule).not.toContain('min-height');
    expect(hrSelectedFillRule).toContain('top: var(--vlaina-block-selection-fill-top);');
    expect(hrSelectedFillRule).toContain('right: calc(-1 * var(--vlaina-block-selection-bleed-x-end));');
    expect(hrSelectedFillRule).toContain('bottom: var(--vlaina-block-selection-fill-bottom);');
    expect(hrSelectedFillRule).toContain('left: calc(-1 * var(--vlaina-block-selection-bleed-x-start));');
    expect(blockSelectionCss).toContain('box-shadow: var(--vlaina-shadow-hr-selected);');
    expect(blockSelectionCss).toContain('.editor-native-selected-textlike');
    expect(blockSelectionCss).not.toContain('.footnote-def,');
    expect(blockSelectionCss).toContain('.toc-block,');
    expect(blockSelectionCss).not.toContain('.callout,');
    expect(blockSelectionCss).toContain(".milkdown .ProseMirror > :is(\n  [data-type='html-block'][data-value='<!--vlaina-markdown-blank-line-->'],\n  [data-type='html-block'][data-value='<!--vlaina-rendered-html-boundary-blank-line-->']\n).editor-block-selected");
    expect(markdownCss).not.toContain('.milkdown .ProseMirror hr.ProseMirror-selectednode::before');
  });
});
