import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  PREVIEW_EXPORT_LABELS,
  savePreview,
  type PreviewExportFormat,
} from './previewExport';
import { escapeToolbarHtml } from '../floating-toolbar/htmlEscape';
import { suppressPreviewEditorOpen } from './previewContextMenuSuppression';
import { markEditorUserInput } from './userInputEvents';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { translate } from '@/lib/i18n';
import { themeIconTokens, themeRenderingTokens, themeStyleResetTokens } from '@/styles/themeTokens';

type InsertDirection = 'above' | 'below';
type PreviewContextMenuIcon = 'image' | 'paragraph' | 'arrow-up' | 'arrow-down';
const PREVIEW_EXPORT_MENU_ORDER: PreviewExportFormat[] = ['png', 'jpg', 'svg'];

interface PreviewContextMenuOptions {
  element: HTMLElement;
  fileBaseName: string;
  getPos: () => number | undefined;
  node: ProseNode;
  view: EditorView;
}

export interface PreviewContextMenuSession {
  destroy: () => void;
  updateNode: (node: ProseNode) => void;
}

export function resolvePreviewParagraphInsertPos(
  view: EditorView,
  node: ProseNode,
  getPos: () => number | undefined,
  direction: InsertDirection
) {
  const pos = getPos();
  if (typeof pos !== 'number') {
    return null;
  }

  if (!node.isInline) {
    return direction === 'above' ? pos : pos + node.nodeSize;
  }

  const $pos = view.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).isTextblock) {
      return direction === 'above' ? $pos.before(depth) : $pos.after(depth);
    }
  }

  return pos;
}

function insertParagraph(
  view: EditorView,
  node: ProseNode,
  getPos: () => number | undefined,
  direction: InsertDirection
) {
  const insertPos = resolvePreviewParagraphInsertPos(view, node, getPos, direction);
  const paragraphType = view.state.schema.nodes.paragraph;
  if (insertPos === null || !paragraphType) {
    return false;
  }

  const $insert = view.state.doc.resolve(insertPos);
  if (!$insert.parent.canReplaceWith($insert.index(), $insert.index(), paragraphType)) {
    return false;
  }

  const tr = view.state.tr.insert(insertPos, paragraphType.create());
  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1)).scrollIntoView();
  markEditorUserInput(view);
  view.dispatch(tr);
  view.focus();
  return true;
}

// Inline context-menu icons are adapted from Lucide Icons (ISC).
const MENU_ICON_SVG_ATTRS = 'aria-hidden="true" focusable="false"';
const MENU_ICONS: Record<PreviewContextMenuIcon, string> = {
  image: `<svg ${MENU_ICON_SVG_ATTRS} viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}"><rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8.5" cy="10.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path></svg>`,
  paragraph: `<svg ${MENU_ICON_SVG_ATTRS} viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}"><path d="M13 4v16"></path><path d="M17 4v16"></path><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"></path></svg>`,
  'arrow-up': `<svg ${MENU_ICON_SVG_ATTRS} viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}"><path d="m12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>`,
  'arrow-down': `<svg ${MENU_ICON_SVG_ATTRS} viewBox="${themeIconTokens.viewBoxDefault}" fill="${themeStyleResetTokens.fillNone}" stroke="${themeStyleResetTokens.currentColor}" stroke-width="${themeIconTokens.strokeDefault}"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>`,
};

function positionMenu(menu: HTMLElement, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  menu.style.left = `${rect.left + rect.width / 2}px`;
  menu.style.top = `${rect.top + rect.height / 2}px`;
  menu.style.transform = themeRenderingTokens.translateCenter;
  updateSubmenuDirection(menu);
}

function updateSubmenuDirection(menu: HTMLElement) {
  const submenuWidth = 180;
  const rect = menu.getBoundingClientRect();
  const spaceRight = window.innerWidth - rect.right;
  const spaceLeft = rect.left;
  menu.classList.toggle(
    'editor-preview-context-menu-submenu-left',
    spaceRight < submenuWidth && spaceLeft > spaceRight
  );
}

export function attachPreviewContextMenu(options: PreviewContextMenuOptions) {
  const { element, fileBaseName, getPos, view } = options;
  let currentNode = options.node;
  let menu: HTMLElement | null = null;
  let suppressClickUntil = 0;
  let transientListenersAttached = false;
  let positionFrameId = 0;
  let positionFrameScheduled = false;

  const cancelPositionFrame = () => {
    if (positionFrameId !== 0) {
      cancelAnimationFrame(positionFrameId);
    }
    positionFrameId = 0;
    positionFrameScheduled = false;
  };

  const schedulePosition = () => {
    if (positionFrameScheduled) return;

    positionFrameScheduled = true;
    const frameId = requestAnimationFrame(() => {
      positionFrameId = 0;
      positionFrameScheduled = false;
      if (menu) {
        positionMenu(menu, element);
      }
    });
    if (positionFrameScheduled) {
      positionFrameId = frameId;
    }
  };

  const closeMenu = () => {
    cancelPositionFrame();
    menu?.remove();
    menu = null;
    element.classList.remove('editor-preview-context-menu-active');
    detachTransientListeners();
  };

  const attachTransientListeners = () => {
    if (transientListenersAttached) {
      return;
    }

    transientListenersAttached = true;
    window.addEventListener('mousedown', handleWindowMouseDown, true);
    document.addEventListener('keydown', handleDocumentKey);
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('scroll', handleScroll, true);
  };

  const detachTransientListeners = () => {
    if (!transientListenersAttached) {
      return;
    }

    transientListenersAttached = false;
    window.removeEventListener('mousedown', handleWindowMouseDown, true);
    document.removeEventListener('keydown', handleDocumentKey);
    window.removeEventListener('resize', handleWindowResize);
    window.removeEventListener('scroll', handleScroll, true);
  };

  const runSave = (format: PreviewExportFormat) => {
    closeMenu();
    savePreview(element, fileBaseName, format).catch((_error) => {
    });
  };

  const createMenu = () => {
    closeMenu();
    menu = document.createElement('div');
    menu.className = `slash-menu editor-preview-context-menu !rounded-[var(--vlaina-notes-ui-radius-panel)] ${raisedPillSurfaceClass}`;
    menu.setAttribute('data-no-editor-drag-box', 'true');
    element.classList.add('editor-preview-context-menu-active');

    document.body.appendChild(menu);
    attachTransientListeners();
    renderMenu();
    positionMenu(menu, element);
  };

  const createMenuButton = (label: string, onSelect: () => void, icon?: PreviewContextMenuIcon) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'slash-menu-item';
    button.innerHTML = `
      <span class="slash-menu-item-icon" aria-hidden="true">${icon ? MENU_ICONS[icon] : ''}</span>
      <span class="slash-menu-item-content">
        <span class="slash-menu-item-name">${escapeToolbarHtml(label)}</span>
      </span>
    `;
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect();
    });
    return button;
  };

  const createSubmenu = (label: string, items: HTMLElement[], icon: PreviewContextMenuIcon) => {
    const group = document.createElement('div');
    group.className = 'editor-preview-context-menu-group';
    const parentButton = createMenuButton(
      label,
      () => undefined,
      icon
    );
    parentButton.classList.add('editor-preview-context-menu-parent');
    parentButton.setAttribute('aria-haspopup', 'menu');

    const submenu = document.createElement('div');
    submenu.className = `slash-menu editor-preview-context-submenu !rounded-[var(--vlaina-notes-ui-radius-panel)] ${raisedPillSurfaceClass}`;
    submenu.setAttribute('data-no-editor-drag-box', 'true');
    submenu.setAttribute('role', 'menu');
    items.forEach((item) => submenu.appendChild(item));

    group.appendChild(parentButton);
    group.appendChild(submenu);
    return group;
  };

  const renderMenu = () => {
    if (!menu) {
      return;
    }

    menu.replaceChildren();
    menu.appendChild(
      createSubmenu(
        translate('editor.preview.saveAsImage'),
        PREVIEW_EXPORT_MENU_ORDER.map((format) =>
          createMenuButton(PREVIEW_EXPORT_LABELS[format], () => runSave(format))
        ),
        'image'
      )
    );
    menu.appendChild(
      createSubmenu(translate('editor.preview.insertParagraph'), [
        createMenuButton(translate('editor.preview.above'), () => {
          insertParagraph(view, currentNode, getPos, 'above');
          closeMenu();
        }, 'arrow-up'),
        createMenuButton(translate('editor.preview.below'), () => {
          insertParagraph(view, currentNode, getPos, 'below');
          closeMenu();
        }, 'arrow-down'),
      ], 'paragraph')
    );
  };

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    suppressPreviewEditorOpen();
    suppressClickUntil = Date.now() + 350;
    createMenu();
  };

  const handleClickCapture = (event: MouseEvent) => {
    if (!menu && Date.now() > suppressClickUntil) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const handleWindowMouseDown = (event: MouseEvent) => {
    if (menu && !menu.contains(event.target as Node)) {
      closeMenu();
    }
  };

  const handleDocumentKey = (event: KeyboardEvent) => {
    if (!event.isComposing && event.key === 'Escape') {
      closeMenu();
    }
  };

  const handleWindowResize = () => {
    if (menu) {
      positionMenu(menu, element);
    }
  };

  const handleScroll = () => {
    if (menu) {
      schedulePosition();
    }
  };

  element.addEventListener('contextmenu', handleContextMenu);
  element.addEventListener('click', handleClickCapture, true);

  return {
    updateNode(node: ProseNode) {
      currentNode = node;
    },
    destroy() {
      element.removeEventListener('contextmenu', handleContextMenu);
      element.removeEventListener('click', handleClickCapture, true);
      closeMenu();
    },
  };
}
