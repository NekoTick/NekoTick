import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';

import type { TableMenuState } from './types';
import {
  isTableMenuAction,
  isTableMenuCellPosValid,
  runTableMenuAction,
} from './tableMenuActions';
import { shouldIgnoreTableContextMenuTarget } from './tableContextMenuTarget';
import { translate } from '@/lib/i18n';
import { escapeToolbarHtml } from '../floating-toolbar/htmlEscape';

export const tablePluginKey = new PluginKey<TableMenuState>('tableMenu');
const TABLE_CONTEXT_MENU_MARGIN = 8;

function createClosedTableMenuState(): TableMenuState {
  return {
    isOpen: false,
    position: { x: 0, y: 0 },
    cellPos: -1,
  };
}

export function applyTableMenuState(
  state: TableMenuState,
  meta: Partial<TableMenuState> | undefined,
  changedByInput: boolean
): TableMenuState {
  if (meta) {
    return { ...state, ...meta };
  }

  if (state.isOpen && changedByInput) {
    return createClosedTableMenuState();
  }

  return state;
}

export function resolveTableContextMenuPosition({
  x,
  y,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
}: {
  x: number;
  y: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const maxLeft = Math.max(
    TABLE_CONTEXT_MENU_MARGIN,
    viewportWidth - menuWidth - TABLE_CONTEXT_MENU_MARGIN
  );
  const maxTop = Math.max(
    TABLE_CONTEXT_MENU_MARGIN,
    viewportHeight - menuHeight - TABLE_CONTEXT_MENU_MARGIN
  );

  return {
    left: Math.min(Math.max(x, TABLE_CONTEXT_MENU_MARGIN), maxLeft),
    top: Math.min(Math.max(y, TABLE_CONTEXT_MENU_MARGIN), maxTop),
  };
}

export const tableContextMenuPlugin = $prose(() => {
  return new Plugin({
    key: tablePluginKey,
    state: {
      init: createClosedTableMenuState,
      apply(tr, state) {
        return applyTableMenuState(
          state,
          tr.getMeta(tablePluginKey),
          tr.docChanged || tr.selectionSet
        );
      },
    },
    props: {
      handleDOMEvents: {
        contextmenu(view, event) {
          if (!view.editable) return false;

          if (shouldIgnoreTableContextMenuTarget(event.target)) {
            event.preventDefault();
            return true;
          }

          const { state } = view;
          const pos = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (!pos) return false;

          const $pos = state.doc.resolve(pos.pos);
          for (let depth = $pos.depth; depth > 0; depth--) {
            const node = $pos.node(depth);
            if (
              node.type.name !== 'table_cell' &&
              node.type.name !== 'table_header'
            ) {
              continue;
            }

            event.preventDefault();
            view.dispatch(
              state.tr.setMeta(tablePluginKey, {
                isOpen: true,
                position: { x: event.clientX, y: event.clientY },
                cellPos: $pos.before(depth),
              })
            );
            return true;
          }

          return false;
        },
      },
    },
    view(editorView) {
      let menuElement: HTMLElement | null = null;
      let lastRenderKey = '';

      const positionMenuElement = (
        element: HTMLElement,
        position: { x: number; y: number }
      ) => {
        const viewportWidth =
          window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight =
          window.innerHeight || document.documentElement.clientHeight;
        const menuWidth = element.offsetWidth || 196;
        const menuHeight = element.offsetHeight || 0;
        const resolved = resolveTableContextMenuPosition({
          x: position.x,
          y: position.y,
          menuWidth,
          menuHeight,
          viewportWidth,
          viewportHeight,
        });

        element.style.left = `${resolved.left}px`;
        element.style.top = `${resolved.top}px`;
      };

      const closeMenu = () => {
        const menuState = tablePluginKey.getState(editorView.state);
        if (!menuElement && !menuState?.isOpen) {
          return;
        }
        if (menuElement) {
          menuElement.remove();
          menuElement = null;
        }
        lastRenderKey = '';
        editorView.dispatch(
          editorView.state.tr.setMeta(tablePluginKey, {
            isOpen: false,
            position: { x: 0, y: 0 },
            cellPos: -1,
          })
        );
      };

      const handleClickOutside = (event: MouseEvent) => {
        if (menuElement && !menuElement.contains(event.target as Node)) {
          closeMenu();
        }
      };

      const handleMenuClick = (event: MouseEvent) => {
        const target = event.target;
        const button =
          target instanceof Element
            ? target.closest<HTMLElement>('.table-menu-item[data-action]')
            : null;
        if (!button || !menuElement?.contains(button)) {
          return;
        }

        if (!editorView.editable) {
          closeMenu();
          return;
        }

        const action = button.dataset.action || '';
        if (!isTableMenuAction(action)) {
          closeMenu();
          return;
        }
        const menuState = tablePluginKey.getState(editorView.state);
        if (menuState && menuState.cellPos >= 0) {
          runTableMenuAction(action, editorView, menuState.cellPos);
        }
        closeMenu();
      };

      window.addEventListener('mousedown', handleClickOutside, true);

      return {
        update() {
          const state = tablePluginKey.getState(editorView.state);
          if (!state?.isOpen) {
            if (menuElement) {
              menuElement.remove();
              menuElement = null;
            }
            lastRenderKey = '';
            return;
          }

          if (!editorView.editable) {
            closeMenu();
            return;
          }

          if (
            state.cellPos < 0 ||
            !isTableMenuCellPosValid(editorView, state.cellPos)
          ) {
            closeMenu();
            return;
          }

          if (!menuElement) {
            menuElement = document.createElement('div');
            menuElement.className = 'table-context-menu';
            menuElement.setAttribute('data-no-editor-drag-box', 'true');
            menuElement.addEventListener('click', handleMenuClick);
            document.body.appendChild(menuElement);
          }

          const renderKey = `${state.position.x}:${state.position.y}:${state.cellPos}`;
          if (renderKey !== lastRenderKey) {
            lastRenderKey = renderKey;
            menuElement.innerHTML = `
              <button class="table-menu-item" type="button" role="menuitem" data-action="insert-row-above">${escapeToolbarHtml(translate('editor.table.insertRowAbove'))}</button>
              <button class="table-menu-item" type="button" role="menuitem" data-action="insert-row-below">${escapeToolbarHtml(translate('editor.table.insertRowBelow'))}</button>
              <button class="table-menu-item" type="button" role="menuitem" data-action="insert-col-left">${escapeToolbarHtml(translate('editor.table.insertColumnLeft'))}</button>
              <button class="table-menu-item" type="button" role="menuitem" data-action="insert-col-right">${escapeToolbarHtml(translate('editor.table.insertColumnRight'))}</button>
              <div class="table-menu-divider"></div>
              <button class="table-menu-item danger" type="button" role="menuitem" data-action="delete-row">${escapeToolbarHtml(translate('editor.table.deleteRow'))}</button>
              <button class="table-menu-item danger" type="button" role="menuitem" data-action="delete-col">${escapeToolbarHtml(translate('editor.table.deleteColumn'))}</button>
              <button class="table-menu-item danger" type="button" role="menuitem" data-action="delete-table">${escapeToolbarHtml(translate('editor.table.deleteTable'))}</button>
            `;
            menuElement.setAttribute('role', 'menu');
            menuElement.setAttribute('aria-orientation', 'vertical');
            positionMenuElement(menuElement, state.position);
          }
        },
        destroy() {
          window.removeEventListener('mousedown', handleClickOutside, true);
          if (menuElement) {
            menuElement.removeEventListener('click', handleMenuClick);
            menuElement.remove();
          }
        },
      };
    },
  });
});
