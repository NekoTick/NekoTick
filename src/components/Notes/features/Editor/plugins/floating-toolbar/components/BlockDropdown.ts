import type { EditorView } from '@milkdown/kit/prose/view';
import type { BlockType, FloatingToolbarState } from '../types';
import { BLOCK_TYPES, getLocalizedBlockTypeLabel } from '../utils';
import { translate } from '@/lib/i18n';
import { convertBlockType } from '../commands';
import { applyBlockPreview, clearFormatPreview, commitBlockPreview, hasBlockPreview } from '../previewStyles';
import { collapseSelectionAfterToolbarApply } from '../selectionCollapse';
import { ICON_SIZES } from '@/components/ui/icons/sizes';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { themeIconTokens, themeStyleResetTokens } from '@/styles/themeTokens';
import { escapeToolbarHtml } from '../htmlEscape';

const DROPDOWN_ICON_SIZE = ICON_SIZES.md;
const DROPDOWN_ICON_SVG_ATTRS = 'aria-hidden="true" focusable="false"';

// Inline block-type icons are custom app artwork or adapted from Lucide Icons
// (ISC). Keep THIRD_PARTY_NOTICES.md in sync when adding other sources.
const BLOCK_ICONS: Record<string, string> = {
  text: `<svg ${DROPDOWN_ICON_SVG_ATTRS} width="${DROPDOWN_ICON_SIZE}" height="${DROPDOWN_ICON_SIZE}" viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}">
    <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
  </svg>`,
  h1: `<svg ${DROPDOWN_ICON_SVG_ATTRS} width="${DROPDOWN_ICON_SIZE}" height="${DROPDOWN_ICON_SIZE}" viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}">
    <path d="M4 12h8M4 18V6M12 18V6M17 12l3-2v8"/>
  </svg>`,
  h2: `<svg ${DROPDOWN_ICON_SVG_ATTRS} width="${DROPDOWN_ICON_SIZE}" height="${DROPDOWN_ICON_SIZE}" viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}">
    <path d="M4 12h8M4 18V6M12 18V6M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/>
  </svg>`,
  h3: `<svg ${DROPDOWN_ICON_SVG_ATTRS} width="${DROPDOWN_ICON_SIZE}" height="${DROPDOWN_ICON_SIZE}" viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}">
    <path d="M4 12h8M4 18V6M12 18V6M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2M17.5 13.5c1.7 1 3.5 0 3.5-1.5a2 2 0 0 0-2-2"/>
  </svg>`,
  h4: `<svg ${DROPDOWN_ICON_SVG_ATTRS} width="${DROPDOWN_ICON_SIZE}" height="${DROPDOWN_ICON_SIZE}" viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}">
    <path d="M4 12h8M4 18V6M12 18V6M17 10v4h4M21 10v8"/>
  </svg>`,
  h5: `<svg ${DROPDOWN_ICON_SVG_ATTRS} width="${DROPDOWN_ICON_SIZE}" height="${DROPDOWN_ICON_SIZE}" viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}">
    <path d="M4 12h8M4 18V6M12 18V6M17 18h4c0-4-4-3-4-6h4"/>
  </svg>`,
  h6: `<svg ${DROPDOWN_ICON_SVG_ATTRS} width="${DROPDOWN_ICON_SIZE}" height="${DROPDOWN_ICON_SIZE}" viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}">
    <path d="M4 12h8M4 18V6M12 18V6M19.5 10a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M19.5 10c-1.5 0-2.5 1-2.5 2.5"/>
  </svg>`,
  quote: `<svg ${DROPDOWN_ICON_SVG_ATTRS} width="${DROPDOWN_ICON_SIZE}" height="${DROPDOWN_ICON_SIZE}" viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}">
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21"/>
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3"/>
  </svg>`,
  list: `<svg ${DROPDOWN_ICON_SVG_ATTRS} width="${DROPDOWN_ICON_SIZE}" height="${DROPDOWN_ICON_SIZE}" viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <circle cx="4" cy="6" r="1" fill="${themeStyleResetTokens.currentColor}"/><circle cx="4" cy="12" r="1" fill="${themeStyleResetTokens.currentColor}"/><circle cx="4" cy="18" r="1" fill="${themeStyleResetTokens.currentColor}"/>
  </svg>`,
  listOrdered: `<svg ${DROPDOWN_ICON_SVG_ATTRS} width="${DROPDOWN_ICON_SIZE}" height="${DROPDOWN_ICON_SIZE}" viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}">
    <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
    <path d="M4 6h1v4M3 10h3M4 14.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-1a.5.5 0 0 0-.5.5v.5a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5"/>
  </svg>`,
  listCheck: `<svg ${DROPDOWN_ICON_SVG_ATTRS} width="${DROPDOWN_ICON_SIZE}" height="${DROPDOWN_ICON_SIZE}" viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}">
    <path d="M3.5 5.5L5 7l2.5-2.5M3.5 11.5L5 13l2.5-2.5M3.5 17.5L5 19l2.5-2.5"/>
    <line x1="11" y1="6" x2="21" y2="6"/><line x1="11" y1="12" x2="21" y2="12"/><line x1="11" y1="18" x2="21" y2="18"/>
  </svg>`,
  code: `<svg ${DROPDOWN_ICON_SVG_ATTRS} width="${DROPDOWN_ICON_SIZE}" height="${DROPDOWN_ICON_SIZE}" viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}">
    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
  </svg>`,
};

const BLOCK_TYPE_ICON_KEYS: Record<BlockType, keyof typeof BLOCK_ICONS> = {
  paragraph: 'text',
  heading1: 'h1',
  heading2: 'h2',
  heading3: 'h3',
  heading4: 'h4',
  heading5: 'h5',
  heading6: 'h6',
  blockquote: 'quote',
  bulletList: 'list',
  orderedList: 'listOrdered',
  taskList: 'listCheck',
  codeBlock: 'code',
};

export function getBlockTypeIconMarkup(blockType: BlockType | null): string {
  if (!blockType) {
    return BLOCK_ICONS.text;
  }

  const iconKey = BLOCK_TYPE_ICON_KEYS[blockType];
  return BLOCK_ICONS[iconKey] || BLOCK_ICONS.text;
}

export function renderBlockDropdown(
  container: HTMLElement,
  view: EditorView,
  state: FloatingToolbarState,
  onClose: () => void
): void {
  const dropdown = document.createElement('div');
  dropdown.className = `toolbar-submenu block-dropdown !rounded-[var(--vlaina-notes-ui-radius-panel)] ${raisedPillSurfaceClass}`;
  
  let html = '';
  
  BLOCK_TYPES.forEach((config) => {
    const isActive = state.currentBlockType === config.type;
    const icon = getBlockTypeIconMarkup(config.type);
    
    html += `
      <button
        class="block-dropdown-item ${isActive ? 'active' : ''}"
        data-block-type="${config.type}"
        aria-label="${escapeToolbarHtml(getLocalizedBlockTypeLabel(config.type))}"
      >
        <span class="block-dropdown-item-icon">${icon}</span>
      </button>
    `;
  });
  
  dropdown.innerHTML = html;
  container.appendChild(dropdown);

  dropdown.addEventListener('mouseleave', () => {
    clearFormatPreview(view);
  });

  dropdown.querySelectorAll('[data-block-type]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener('mouseenter', () => {
      const button = btn as HTMLElement;
      const blockType = button.dataset.blockType as BlockType;
      if (!hasBlockPreview(blockType)) {
        clearFormatPreview(view);
        return;
      }

      applyBlockPreview(view, blockType);
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const blockType = (btn as HTMLElement).dataset.blockType as BlockType;
      let committedPreview = false;
      try {
        committedPreview = commitBlockPreview(view, blockType);
        if (!committedPreview) {
          convertBlockType(view, blockType);
        }
      } finally {
        clearFormatPreview(view);
        if (!committedPreview) {
          view.focus();
        }
      }
      onClose();
      const isTextBlockType = blockType === 'paragraph' || blockType.startsWith('heading');
      collapseSelectionAfterToolbarApply(view, isTextBlockType ? state.selectionRange : null);
    });
  });
}

export function getBlockTypeDisplayLabel(blockType: BlockType): string {
  const config = BLOCK_TYPES.find(b => b.type === blockType);
  return config ? getLocalizedBlockTypeLabel(config.type) : translate('editor.blockType.text');
}

export function getBlockTypeShortLabel(blockType: BlockType): string {
  const shortLabels: Record<BlockType, string> = {
    paragraph: translate('editor.blockType.text'),
    heading1: 'H1',
    heading2: 'H2',
    heading3: 'H3',
    heading4: 'H4',
    heading5: 'H5',
    heading6: 'H6',
    blockquote: translate('editor.blockType.blockquote'),
    bulletList: translate('editor.blockType.bulletList'),
    orderedList: translate('editor.blockType.orderedList'),
    taskList: translate('editor.blockType.taskList'),
    codeBlock: translate('editor.blockType.codeBlock'),
  };
  return shortLabels[blockType] || translate('editor.blockType.text');
}
