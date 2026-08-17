import type { EditorView } from '@milkdown/kit/prose/view';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { UniversalIconPicker } from '@/components/common/UniversalIconPicker';
import { notifyNotesOverlayOpen, onNotesOverlayOpen } from '@/components/Notes/features/overlays/notesOverlayEvents';
import { getContentLayoutContext } from '../floating-toolbar/floatingToolbarLayout';
import { getScrollRoot, getToolbarRoot, toContainerPosition } from '../floating-toolbar/floatingToolbarDom';
import { emojiShortcutPluginKey } from './emojiShortcutPluginKey';
import { filterEmojiShortcutItems } from './emojiShortcutQuery';
import { createEmojiShortcutState, getEmojiShortcutMenuPosition, getEmojiShortcutTextRange } from './emojiShortcutState';

const EMOJI_MENU_MARGIN_PX = 12;

function markEmojiShortcutUserInput(view: EditorView): void {
  view.dom.dispatchEvent(new CustomEvent('editor:block-user-input', { bubbles: true }));
}

export class EmojiShortcutMenuView {
  private menuElement: HTMLElement | null = null;
  private root: Root | null = null;
  private readonly scrollRoot: HTMLElement | null;
  private readonly positionRoot: HTMLElement | null;
  private readonly resizeObserver: ResizeObserver | null;
  private layoutRaf = 0;
  private wasOpen = false;
  private readonly unlistenOverlayOpen: () => void;

  constructor(private readonly editorView: EditorView) {
    this.scrollRoot = getScrollRoot(editorView);
    this.positionRoot = getToolbarRoot(editorView) ?? this.scrollRoot;
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          this.scheduleViewportChange();
        });

    window.addEventListener('resize', this.handleViewportChange);
    this.scrollRoot?.addEventListener('scroll', this.handleViewportChange, { passive: true });
    document.addEventListener('mousedown', this.handleDocumentMouseDown, true);
    document.addEventListener('keydown', this.handleDocumentKeyDown, true);
    this.unlistenOverlayOpen = onNotesOverlayOpen(({ source }) => {
      if (source === 'emoji-shortcut') return;
      if (!emojiShortcutPluginKey.getState(this.editorView.state)?.isOpen) return;
      this.editorView.dispatch(this.editorView.state.tr.setMeta(emojiShortcutPluginKey, createEmojiShortcutState()));
    });
    this.resizeObserver?.observe(this.editorView.dom);
    if (this.scrollRoot) {
      this.resizeObserver?.observe(this.scrollRoot);
    }
    if (this.positionRoot && this.positionRoot !== this.scrollRoot) {
      this.resizeObserver?.observe(this.positionRoot);
    }
  }

  update() {
    const state = emojiShortcutPluginKey.getState(this.editorView.state);
    if (!state?.isOpen) {
      this.wasOpen = false;
      this.destroyMenu();
      return;
    }

    if (filterEmojiShortcutItems(state.query).length === 0) {
      this.wasOpen = false;
      this.destroyMenu();
      return;
    }

    if (!this.wasOpen) {
      this.wasOpen = true;
      notifyNotesOverlayOpen('emoji-shortcut');
    }

    this.ensureMenu();

    this.root?.render(
      React.createElement(UniversalIconPicker, {
        onSelect: this.insertSelectedIcon,
        onClose: this.closeMenu,
        embedded: true,
        emojiOnly: true,
        surface: true,
        emojiSearchQuery: state.query,
        alwaysShowEmojiCategories: true,
      })
    );

    this.scheduleViewportChange();
  }

  destroy() {
    if (this.layoutRaf !== 0) {
      cancelAnimationFrame(this.layoutRaf);
      this.layoutRaf = 0;
    }
    window.removeEventListener('resize', this.handleViewportChange);
    this.scrollRoot?.removeEventListener('scroll', this.handleViewportChange);
    document.removeEventListener('mousedown', this.handleDocumentMouseDown, true);
    document.removeEventListener('keydown', this.handleDocumentKeyDown, true);
    this.unlistenOverlayOpen();
    this.resizeObserver?.disconnect();
    this.destroyMenu();
  }

  private insertSelectedIcon = (icon: string) => {
    const emojiRange = getEmojiShortcutTextRange(this.editorView);
    if (!emojiRange) return;

    markEmojiShortcutUserInput(this.editorView);
    this.editorView.dispatch(
      this.editorView.state.tr
        .insertText(icon, emojiRange.deleteFrom, emojiRange.deleteTo)
        .setMeta(emojiShortcutPluginKey, createEmojiShortcutState())
    );
    this.editorView.focus();
  };

  private closeMenu = () => {
    if (!emojiShortcutPluginKey.getState(this.editorView.state)?.isOpen) return;
    this.editorView.dispatch(this.editorView.state.tr.setMeta(emojiShortcutPluginKey, createEmojiShortcutState()));
    this.editorView.focus();
  };

  private ensureMenu() {
    if (this.menuElement) {
      return this.menuElement;
    }

    const menu = document.createElement('div');
    menu.className = 'emoji-shortcut-menu';
    menu.setAttribute('data-no-editor-drag-box', 'true');
    menu.style.position = this.positionRoot ? 'absolute' : 'fixed';
    (this.positionRoot ?? document.body).appendChild(menu);
    this.root = createRoot(menu);
    this.menuElement = menu;
    return menu;
  }

  private destroyMenu() {
    const root = this.root;
    this.root = null;
    if (root) {
      window.setTimeout(() => root.unmount(), 0);
    }

    if (!this.menuElement) return;
    this.menuElement.remove();
    this.menuElement = null;
  }

  private syncPosition() {
    if (!this.menuElement) return;

    const viewportPosition = getEmojiShortcutMenuPosition(this.editorView);
    const containerPosition = toContainerPosition(viewportPosition, this.positionRoot);
    const layout = getContentLayoutContext(this.editorView, this.positionRoot);
    const menuWidth = this.menuElement.offsetWidth || 336;
    const menuHeight = this.menuElement.offsetHeight || 420;
    const horizontalBounds = this.positionRoot
      ? {
          left: layout.containerBounds?.left ?? EMOJI_MENU_MARGIN_PX,
          right: layout.containerBounds?.right ?? this.positionRoot.clientWidth,
        }
      : {
          left: layout.viewportBounds.left,
          right: layout.viewportBounds.right,
        };
    const minX = horizontalBounds.left + EMOJI_MENU_MARGIN_PX;
    const maxX = horizontalBounds.right - EMOJI_MENU_MARGIN_PX - menuWidth;
    const nextX = maxX < minX
      ? minX
      : Math.max(minX, Math.min(containerPosition.x, maxX));
    const availableBelow = this.positionRoot
      ? this.positionRoot.clientHeight - containerPosition.y - 24
      : window.innerHeight - viewportPosition.y - 24;
    const availableAbove = containerPosition.y - 24;
    const shouldPlaceAbove =
      availableBelow < Math.min(menuHeight, 220) &&
      availableAbove > availableBelow;
    const nextY = shouldPlaceAbove
      ? Math.max(24, containerPosition.y - menuHeight - 8)
      : containerPosition.y;

    this.menuElement.style.left = `${Math.round(nextX)}px`;
    this.menuElement.style.top = `${Math.round(nextY)}px`;
  }

  private scheduleViewportChange() {
    if (!this.menuElement) {
      return;
    }
    if (this.layoutRaf !== 0) {
      return;
    }

    this.layoutRaf = requestAnimationFrame(() => {
      this.layoutRaf = 0;
      if (!emojiShortcutPluginKey.getState(this.editorView.state)?.isOpen) {
        return;
      }
      this.syncPosition();
    });
  }

  private handleViewportChange = () => {
    this.scheduleViewportChange();
  };

  private handleDocumentMouseDown = (event: MouseEvent) => {
    if (!emojiShortcutPluginKey.getState(this.editorView.state)?.isOpen) return;

    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.menuElement?.contains(target)) return;

    this.editorView.dispatch(this.editorView.state.tr.setMeta(emojiShortcutPluginKey, createEmojiShortcutState()));
  };

  private handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (!emojiShortcutPluginKey.getState(this.editorView.state)?.isOpen) return;
    if (event.isComposing || this.editorView.composing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== ' ' && event.key !== 'Spacebar') return;

    const target = event.target;
    if (target instanceof Node && this.menuElement?.contains(target)) return;

    event.preventDefault();
    event.stopPropagation();
    this.editorView.dispatch(this.editorView.state.tr.setMeta(emojiShortcutPluginKey, createEmojiShortcutState()));
    this.editorView.focus();
  };
}
