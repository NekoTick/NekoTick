import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { buildImportedMarkdownThemePostBridgeCss } from './postBridge';

describe('imported markdown theme post bridge', () => {
  it('builds a Typora post bridge for DOM compatibility fixes', () => {
    const css = buildImportedMarkdownThemePostBridgeCss('clean-light', 'typora');

    expect(css).toContain('[data-markdown-theme-root="true"][data-markdown-imported-theme="clean-light"].theme-typora#write');
    expect(css).toContain('[data-markdown-theme-root="true"][data-markdown-imported-theme="clean-light"].theme-typora #write');
    expect(css).toContain('--typora-page-max-width: min(100%, var(--v-write-w, var(--max-width, var(--vlaina-size-1080px))));');
    expect(css).toContain('max-width: var(--typora-page-max-width) !important;');
    expect(css).toContain('padding-block: var(--typora-page-padding-block) !important;');
    expect(css).toContain('padding-inline: var(--typora-page-padding-inline) !important;');
    expect(css).toContain('background: transparent !important;');
    expect(css).toContain('font-size: var(--v-f-size, var(--vlaina-size-16px)) !important;');
    expect(css).not.toContain('font-family: var(--typora-content-font) !important;');
    expect(css).not.toContain('line-height: var(--typora-body-line-height) !important;');
    expect(css).toContain(':is(strong, em, mark, u, del, code, sup, sub)');
    expect(css).toContain('display: inline !important;');
    expect(css).toContain('.milkdown-table-block.table-figure .table-wrapper');
    expect(css).toContain('.v-caption.full');
    expect(css).toContain('.v-svg-input-checkbox[data-vlook-checkbox=\'checked\']::before');
    expect(css).toContain('.vlook-column-list');
    expect(css).toContain(':is(.v-tag, .editor-tag-token, .v-badge-name, .v-badge-value, .v-stepwise, .v-coating)');
    expect(css).toContain('white-space: break-spaces !important;');
    expect(css).toContain('overflow-wrap: break-word !important;');
    expect(css).toContain('.editor-tag-token {');
    expect(css).toContain('white-space: normal !important;');
    expect(css).toContain('#write).ProseMirror,');
    expect(css).toContain(':not(.heading-toggle-btn):not(.editor-collapse-btn):not(.ProseMirror-widget)');
    expect(css).not.toContain('var(--vlaina-editor-block-selection-fg)');
    expect(css).not.toContain('.ProseMirror):is(.editor-block-selection-active, .editor-block-selection-pending) .editor-block-selected');
    expect(css).toContain('.ProseMirror).editor-block-selection-pending .code-block-chrome-language-label');
    expect(css).toContain('display: inline !important;');
    expect(css).toContain('opacity: var(--vlaina-opacity-0) !important;');

    const foregroundProperties = new Set(['color', '-webkit-text-fill-color', 'fill', 'stroke']);
    const selectionForegroundDeclarations: string[] = [];
    postcss.parse(css).walkRules((rule) => {
      if (!/(?:editor-block-selection|editor-block-selected|editor-block-drag-source|ProseMirror-selectednode)/.test(rule.selector)) return;
      rule.walkDecls((declaration) => {
        if (foregroundProperties.has(declaration.prop)) {
          selectionForegroundDeclarations.push(declaration.toString());
        }
      });
    });
    expect(selectionForegroundDeclarations).toEqual([]);
  });

  it('skips non-Typora themes', () => {
    expect(buildImportedMarkdownThemePostBridgeCss('clean-light', 'typora')).not.toBe('');
    expect(buildImportedMarkdownThemePostBridgeCss('obsidian-sample', 'obsidian')).toBe('');
  });
});
