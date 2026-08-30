import { EditorView as CodeMirror } from '@codemirror/view';
import {
  CARET_BLINK_HELD_ATTR,
} from '@/lib/ui/caretOverlayStyles';
import { themeCaretOverlayTokens, themeCodeBlockEditorTokens, themeStyleResetTokens } from '@/styles/themeTokens';

export function createCodeBlockEditorBaseTheme(selectionActiveClass: string) {
  return CodeMirror.theme({
    '&': {
      backgroundColor: 'var(--vlaina-markdown-color-code-block-bg)',
      color: 'var(--vlaina-markdown-color-code-text)',
      fontSize: themeCodeBlockEditorTokens.fontSize,
    },
    '.cm-editor': {
      backgroundColor: 'var(--vlaina-markdown-color-code-block-bg)',
    },
    '.cm-scroller': {
      fontFamily: 'var(--vlaina-markdown-font-code-family), monospace',
      lineHeight: themeCodeBlockEditorTokens.lineHeight,
      overflowX: 'auto',
      textRendering: 'auto',
      fontKerning: 'none',
      fontVariantLigatures: 'none',
      fontFeatureSettings: '"liga" 0, "calt" 0, "dlig" 0',
    },
    '.cm-content, .cm-line, .cm-gutter, .cm-gutterElement': {
      fontFamily: 'inherit',
      textRendering: 'inherit',
      fontKerning: 'inherit',
      fontVariantLigatures: 'inherit',
      fontFeatureSettings: 'inherit',
    },
    '.cm-content': {
      padding: themeCodeBlockEditorTokens.contentPadding,
      minHeight: themeCodeBlockEditorTokens.contentMinHeight,
      caretColor: themeStyleResetTokens.colorTransparentImportant,
    },
    '.cm-line': {
      padding: themeCodeBlockEditorTokens.linePadding,
    },
    '.cm-gutters': {
      position: 'sticky',
      left: themeCodeBlockEditorTokens.contentPadding,
      zIndex: themeCodeBlockEditorTokens.gutterZIndex,
      paddingLeft: themeCodeBlockEditorTokens.gutterPaddingLeft,
      color: 'var(--vlaina-markdown-color-code-muted)',
      backgroundColor: 'var(--vlaina-markdown-color-code-block-bg) !important',
      borderRight: themeStyleResetTokens.borderNoneImportant,
      border: themeStyleResetTokens.borderNoneImportant,
    },
    '.cm-gutter, .cm-lineNumbers, .cm-gutterElement, .cm-gutter-filler': {
      backgroundColor: 'var(--vlaina-markdown-color-code-block-bg) !important',
      borderRight: themeStyleResetTokens.borderNoneImportant,
      border: themeStyleResetTokens.borderNoneImportant,
    },
    '.cm-activeLine, .cm-activeLineGutter': {
      backgroundColor: themeStyleResetTokens.backgroundTransparent,
    },
    '&.cm-focused': {
      outline: themeStyleResetTokens.outlineNone,
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--vlaina-markdown-color-selection)',
    },
    '.cm-selectionLayer, .cm-selectionBackground': {
      pointerEvents: 'none',
    },
    '.cm-selectionBackground': {
      backgroundColor: themeStyleResetTokens.backgroundTransparent,
    },
    '.cm-cursor, .cm-dropCursor, &.cm-focused .cm-cursor, &.cm-focused .cm-dropCursor': {
      borderLeftColor: 'var(--vlaina-caret-color) !important',
      borderLeftStyle: 'solid',
      borderLeftWidth: 'var(--vlaina-caret-width)',
    },
    [`&[${CARET_BLINK_HELD_ATTR}="true"] .cm-cursorLayer`]: {
      animation: `${themeStyleResetTokens.animationNone} !important`,
      opacity: `${themeCaretOverlayTokens.opacityVisible} !important`,
    },
    [`&[${CARET_BLINK_HELD_ATTR}="true"] .cm-cursor`]: {
      opacity: `${themeCaretOverlayTokens.opacityVisible} !important`,
    },
    [`&.${selectionActiveClass} .cm-cursorLayer, &.${selectionActiveClass} .cm-cursor, &.${selectionActiveClass} .cm-dropCursor`]: {
      animation: `${themeStyleResetTokens.animationNone} !important`,
      opacity: `${themeCaretOverlayTokens.opacityHidden} !important`,
    },
  }, { dark: false });
}
