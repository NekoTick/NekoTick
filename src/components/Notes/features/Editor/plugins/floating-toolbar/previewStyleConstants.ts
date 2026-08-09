export const FORMAT_MARKS: Record<string, string> = {
  bold: 'strong',
  italic: 'emphasis',
  underline: 'underline',
  strike: 'strike_through',
  code: 'inlineCode',
  highlight: 'highlight',
};

// Large notes should not clone the full editor DOM for hover-only previews.
export const MAX_APPLIED_PREVIEW_DOC_SIZE = 256 * 1024;
export const MAX_APPLIED_PREVIEW_DOM_ELEMENTS = 2_500;
export const TOOLBAR_SELECTION_HIDDEN_PREVIEW_CLASS = 'toolbar-selection-hidden-preview';
export const TOOLBAR_COLOR_PREVIEW_ATTRIBUTE = 'data-toolbar-color-preview';
export const TOOLBAR_COLOR_PREVIEW_REMOVES_COUNTERPART_ATTRIBUTE = 'data-toolbar-color-preview-removes-counterpart';
export const TOOLBAR_FORMAT_PREVIEW_ATTRIBUTE = 'data-toolbar-format-preview';
export const TOOLBAR_FORMAT_PREVIEW_MODE_ATTRIBUTE = 'data-toolbar-format-preview-mode';
export const TOOLBAR_ALIGNMENT_PREVIEW_ATTRIBUTE = 'data-toolbar-alignment-preview';
export const TOOLBAR_BLOCK_PREVIEW_ATTRIBUTE = 'data-toolbar-block-preview';
export const TOOLBAR_BLOCK_PREVIEW_NODE_ATTRIBUTE = 'data-toolbar-block-preview-node';
export const TOOLBAR_PREVIEW_TEXT_COLOR_VAR = '--vlaina-toolbar-preview-text-color';
export const TOOLBAR_PREVIEW_BG_COLOR_VAR = '--vlaina-toolbar-preview-bg-color';
export const TEXT_SELECTION_OVERLAY_CLASS = 'editor-text-selection-overlay';
export const POINTER_NATIVE_SELECTION_CLASS = 'editor-pointer-native-selection';
export const BG_COLOR_MARK_SELECTOR = 'mark[data-bg-color], span[data-bg-color]';
export const TEXT_COLOR_MARK_SELECTOR = 'span[data-text-color]';
export const TOOLBAR_PREVIEW_DEFAULT_TEXT_COLOR = 'var(--vlaina-sidebar-notes-text, var(--vlaina-text-primary, currentColor))';
export const BG_COLOR_MARK_BG_VAR = '--vlaina-bg-color-mark-bg';
export const INLINE_BACKGROUND_PADDING = 'var(--vlaina-editor-inline-background-padding, var(--vlaina-space-0))';
export const INLINE_BACKGROUND_RADIUS = 'var(--vlaina-editor-inline-background-radius, var(--vlaina-radius-0))';
export const INLINE_BACKGROUND_SHADOW = 'var(--vlaina-editor-inline-background-shadow, none)';
export const TOOLBAR_PREVIEW_SURFACE_BG = 'var(--vlaina-bg-primary)';
export const NOTE_SCROLL_ROOT_SELECTOR = '[data-note-scroll-root="true"]';
