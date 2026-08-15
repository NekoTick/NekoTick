import type { BlockType, FloatingToolbarState, TextAlignment } from './types';
import type { ToolbarButtonConfig, ToolbarGroupKey, ToolbarLayout } from './toolbarConfig';
import { EXTRA_BUTTONS, FORMAT_BUTTONS, TOOLBAR_LAYOUTS } from './toolbarConfig';
import { getBlockTypeIconMarkup } from './components/BlockDropdown';
import { EDITOR_ICONS } from '@/components/ui/icons/editor-svgs';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { translate } from '@/lib/i18n';
import { escapeToolbarHtml } from './htmlEscape';
import { sanitizeCssColorValue } from './colorMarkdownHtml';

const IS_MAC =
  typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

function toPlatformShortcutLabel(shortcut: string): string {
  if (!IS_MAC) {
    return shortcut;
  }

  return shortcut
    .replace(/\bCtrl\b/g, '⌘')
    .replace(/\bControl\b/g, '⌘')
    .replace(/\bAlt\b/g, '⌥')
    .replace(/\bOption\b/g, '⌥');
}

function renderButton(
  config: ToolbarButtonConfig,
  activeMarks: Set<string>,
  extraContent?: string,
  activeOverride?: boolean,
  shortcutOverride?: string
): string {
  const isActive = activeOverride ?? Boolean(config.mark && activeMarks.has(config.mark));
  const shortcutSource = shortcutOverride ?? config.shortcut ?? '';
  const shortcutLabel = shortcutSource ? toPlatformShortcutLabel(shortcutSource) : '';
  const escapedShortcutLabel = escapeToolbarHtml(shortcutLabel);
  const shortcutAttr = escapedShortcutLabel ? `data-shortcut="${escapedShortcutLabel}"` : '';
  const tooltipLabel = shortcutOverride ? shortcutLabel : translate(config.tooltipKey);
  const escapedTooltipLabel = escapeToolbarHtml(tooltipLabel);
  const tooltipAttr = escapedTooltipLabel ? `data-tooltip="${escapedTooltipLabel}"` : '';

  return `
    <button class="toolbar-btn has-tooltip ${isActive ? 'active' : ''}" 
            data-action="${config.action}" 
            ${tooltipAttr}
            ${shortcutAttr}>
      ${config.icon}
      ${extraContent || ''}
    </button>
  `;
}

function renderButtonGroup(
  buttons: ToolbarButtonConfig[],
  activeMarks: Set<string>,
  extraClass?: string
): string {
  const buttonsHtml = buttons.map((button) => renderButton(button, activeMarks)).join('');
  return `<div class="toolbar-group ${extraClass || ''}">${buttonsHtml}</div>`;
}

function getExtraButton(action: string): ToolbarButtonConfig {
  const button = EXTRA_BUTTONS.find((item) => item.action === action);
  if (!button) {
    throw new Error(`Missing toolbar button config for action: ${action}`);
  }
  return button;
}

function renderBlockTypeContent(blockType: BlockType | null): string {
  return getBlockTypeIconMarkup(blockType);
}

function getAlignmentIcon(alignment: TextAlignment | null): string {
  if (alignment === null) {
    return EDITOR_ICONS.align;
  }

  if (alignment === 'center') {
    return EDITOR_ICONS.alignCenter;
  }

  if (alignment === 'right') {
    return EDITOR_ICONS.alignRight;
  }

  return EDITOR_ICONS.alignLeft;
}

function renderAiButton(): string {
  const label = escapeToolbarHtml(translate('editor.ai.askAi'));
  return `
    <button class="toolbar-btn toolbar-ai-btn has-tooltip"
            data-action="ai"
            aria-label="${label}"
            data-tooltip="${label}">
      <span class="toolbar-ai-btn-icon" aria-hidden="true">${EDITOR_ICONS.shootingStar}</span>
    </button>
  `;
}

function renderBlockButton(state: FloatingToolbarState): string {
  const blockButtonActive = state.subMenu === 'block' ? 'active' : '';
  const textTypeLabel = escapeToolbarHtml(translate('editor.textType'));
  return `
    <button class="toolbar-btn toolbar-dropdown-btn has-tooltip ${blockButtonActive}" 
            data-action="block" 
            data-tooltip="${textTypeLabel}">
      ${renderBlockTypeContent(state.currentBlockType)}
      ${EDITOR_ICONS.chevronDown}
    </button>
  `;
}

function renderAlignmentButton(state: FloatingToolbarState): string {
  const alignmentButtonActive = state.subMenu === 'alignment' ? 'active' : '';
  const alignLabel = escapeToolbarHtml(translate('editor.align'));
  return `
    <button class="toolbar-btn toolbar-dropdown-btn has-tooltip ${alignmentButtonActive}"
            data-action="alignment"
            data-tooltip="${alignLabel}">
      ${getAlignmentIcon(state.currentAlignment)}
      ${EDITOR_ICONS.chevronDown}
    </button>
  `;
}

function renderColorIconContent(state: FloatingToolbarState, icon: string): string {
  const styleParts: string[] = [];
  const textColor = state.textColor ? sanitizeCssColorValue(state.textColor) : null;
  const bgColor = state.bgColor ? sanitizeCssColorValue(state.bgColor) : null;
  if (textColor) {
    styleParts.push(`color: ${textColor}`);
  } else if (bgColor) {
    styleParts.push(`background-color: ${bgColor}`);
  }

  const styleAttr = styleParts.length > 0 ? ` style="${styleParts.join('; ')}"` : '';
  return `<span class="toolbar-color-icon"${styleAttr}>${icon}</span>`;
}

function renderLinkColorGroup(state: FloatingToolbarState): string {
  const linkButton = getExtraButton('link');
  const colorButtonConfig = getExtraButton('color');
  const colorButton = renderButton(
    {
      ...colorButtonConfig,
      icon: renderColorIconContent(state, colorButtonConfig.icon),
    },
    state.activeMarks,
    '',
    false
  );

  return `
    <div class="toolbar-group toolbar-link-color-group">
      ${renderButton(linkButton, state.activeMarks, '', Boolean(state.linkUrl))}
      ${colorButton}
    </div>
  `;
}

function renderCopyDeleteGroup(state: FloatingToolbarState): string {
  const copyButton = getExtraButton('copy');
  const deleteButton = getExtraButton('delete');
  const copiedButton = {
    ...copyButton,
    icon: state.copied ? EDITOR_ICONS.check : copyButton.icon,
  };
  return `
    <div class="toolbar-group">
      ${renderButton(copiedButton, state.activeMarks, '', state.copied, state.copied ? translate('common.copied') : undefined)}
      ${renderButton(deleteButton, state.activeMarks)}
    </div>
  `;
}

function renderToolbarGroup(group: ToolbarGroupKey, state: FloatingToolbarState): string {
  switch (group) {
    case 'ai':
      return `<div class="toolbar-group toolbar-ai-group">${renderAiButton()}</div>`;
    case 'block':
      return `<div class="toolbar-group toolbar-block-group">${renderBlockButton(state)}</div>`;
    case 'alignment':
      return `<div class="toolbar-group toolbar-alignment-group">${renderAlignmentButton(state)}</div>`;
    case 'format':
      return renderButtonGroup(FORMAT_BUTTONS, state.activeMarks, 'toolbar-format-group');
    case 'linkColor':
      return renderLinkColorGroup(state);
    case 'copyDelete':
      return renderCopyDeleteGroup(state);
  }
}

function getToolbarLayout(state: FloatingToolbarState): ToolbarLayout {
  if (state.currentBlockType === 'codeBlock') {
    return 'codeBlock';
  }

  if (state.currentBlockType?.startsWith('heading')) {
    return 'heading';
  }

  return 'default';
}

export function renderToolbarBodyMarkup(state: FloatingToolbarState): string {
  const groups = TOOLBAR_LAYOUTS[getToolbarLayout(state)];
  const parts: string[] = [];

  groups.forEach((group) => {
    const groupMarkup = renderToolbarGroup(group, state);
    if (!groupMarkup) {
      return;
    }

    if (parts.length > 0) {
      parts.push('<div class="toolbar-divider"></div>');
    }
    parts.push(groupMarkup);
  });

  return `
    <div class="floating-toolbar-inner !rounded-[var(--vlaina-notes-ui-radius-floating)] ${raisedPillSurfaceClass}">
      ${parts.join('')}
    </div>
  `;
}
