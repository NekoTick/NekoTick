import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';
import React from 'react';
import type { Root } from 'react-dom/client';
import { SlashMenuPanel } from './SlashMenuPanel';
import { applySlashCommand } from './slashCommands';
import { getSlashMenuItems } from './slashItems';
import { isPlainSlashMenuNavigationKey } from './slashKeyboard';
import { slashPluginKey } from './slashPluginKey';
import { filterSlashItems } from './slashQuery';
import {
  createDismissedSlashState,
  createSlashState,
  getSlashTextRange,
} from './slashState';
import { getScrollRoot, getToolbarRoot } from '../floating-toolbar/floatingToolbarDom';
import { notifyNotesOverlayOpen, onNotesOverlayOpen } from '@/components/Notes/features/overlays/notesOverlayEvents';
import { applySlashMenuPosition } from './slashMenuPositioning';
import { createSlashMenuElement, destroySlashMenuElement } from './slashMenuDom';
import { keepSlashMenuSelectedItemVisible } from './slashMenuScroll';

function markSlashUserInput(view: EditorView): void {
  view.dom.dispatchEvent(new CustomEvent('editor:block-user-input', { bubbles: true }));
}

export class SlashMenuView {
  private menuElement: HTMLElement | null = null;
  private root: Root | null = null;
  private filtered = getSlashMenuItems();
  private readonly scrollRoot: HTMLElement | null;
  private readonly positionRoot: HTMLElement | null;
  private readonly resizeObserver: ResizeObserver | null;
  private layoutRaf = 0;
  private selectedScrollRaf = 0;
  private skipNextSelectedScroll = false;
  private wasOpen = false;
  private lastPointerHover: { clientX: number; clientY: number } | null = null;
  private readonly unlistenOverlayOpen: () => void;

  constructor(
    private readonly editorView: EditorView,
    private readonly ctx: Ctx
  ) {
    this.scrollRoot = getScrollRoot(editorView);
    this.positionRoot = getToolbarRoot(editorView) ?? this.scrollRoot;
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          this.scheduleViewportChange();
        });

    window.addEventListener('resize', this.handleViewportChange);
    this.scrollRoot?.addEventListener('scroll', this.handleViewportChange, { passive: true });
    window.addEventListener('mousedown', this.handleWindowMouseDown, true);
    document.addEventListener('keydown', this.handleDocumentKeyDown, true);
    this.unlistenOverlayOpen = onNotesOverlayOpen(({ source }) => {
      if (source === 'slash-menu') return;
      if (!slashPluginKey.getState(this.editorView.state)?.isOpen) return;
      this.editorView.dispatch(
        this.editorView.state.tr.setMeta(
          slashPluginKey,
          createDismissedSlashState(this.editorView.state.selection)
        )
      );
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
    const state = slashPluginKey.getState(this.editorView.state);
    if (!state?.isOpen) {
      this.wasOpen = false;
      this.lastPointerHover = null;
      this.destroyMenu();
      return;
    }

    this.filtered = filterSlashItems(state.query, getSlashMenuItems());
    if (this.filtered.length === 0) {
      this.wasOpen = false;
      this.lastPointerHover = null;
      this.destroyMenu();
      return;
    }

    if (!this.wasOpen) {
      this.wasOpen = true;
      notifyNotesOverlayOpen('slash-menu');
    }

    this.ensureMenu();

    this.root?.render(
      React.createElement(SlashMenuPanel, {
        items: this.filtered,
        selectedIndex: state.selectedIndex,
        onHoverItem: this.handleHoverItem,
        onSelectItem: this.applySelectedItem.bind(this),
      })
    );

    this.scheduleViewportChange();
    if (this.skipNextSelectedScroll) {
      this.skipNextSelectedScroll = false;
    } else {
      this.scheduleSelectedItemScroll();
    }
  }

  destroy() {
    if (this.layoutRaf !== 0) {
      cancelAnimationFrame(this.layoutRaf);
      this.layoutRaf = 0;
    }
    if (this.selectedScrollRaf !== 0) {
      cancelAnimationFrame(this.selectedScrollRaf);
      this.selectedScrollRaf = 0;
    }
    window.removeEventListener('resize', this.handleViewportChange);
    this.scrollRoot?.removeEventListener('scroll', this.handleViewportChange);
    window.removeEventListener('mousedown', this.handleWindowMouseDown, true);
    document.removeEventListener('keydown', this.handleDocumentKeyDown, true);
    this.unlistenOverlayOpen();
    this.resizeObserver?.disconnect();
    this.destroyMenu();
  }

  applySelectedItem(index: number) {
    if (index < 0 || index >= this.filtered.length) return;

    const slashRange = getSlashTextRange(this.editorView);
    if (!slashRange) return;

    markSlashUserInput(this.editorView);
    this.editorView.dispatch(
      this.editorView.state.tr
        .delete(slashRange.deleteFrom, slashRange.deleteTo)
        .setMeta(slashPluginKey, createSlashState())
    );

    applySlashCommand(this.ctx, this.filtered[index].commandId);
  }

  private ensureMenu() {
    if (this.menuElement) {
      return this.menuElement;
    }

    const { menuElement, root } = createSlashMenuElement(this.positionRoot);
    this.root = root;
    this.menuElement = menuElement;
    return menuElement;
  }

  private destroyMenu() {
    const root = this.root;
    const menuElement = this.menuElement;
    this.root = null;
    this.menuElement = null;
    destroySlashMenuElement(menuElement, root);
  }

  private syncPosition() {
    if (!this.menuElement) return;
    applySlashMenuPosition(this.editorView, this.menuElement, this.positionRoot);
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
      if (!slashPluginKey.getState(this.editorView.state)?.isOpen) {
        return;
      }
      this.syncPosition();
    });
  }

  private scheduleSelectedItemScroll() {
    if (this.selectedScrollRaf !== 0) {
      return;
    }

    this.selectedScrollRaf = requestAnimationFrame(() => {
      this.selectedScrollRaf = 0;
      this.keepSelectedItemVisible();
    });
  }

  private keepSelectedItemVisible() {
    if (!this.menuElement) return;
    keepSlashMenuSelectedItemVisible(this.menuElement);
  }

  private handleViewportChange = () => {
    this.scheduleViewportChange();
  };

  private handleWindowMouseDown = (event: MouseEvent) => {
    if (!slashPluginKey.getState(this.editorView.state)?.isOpen) return;

    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.menuElement?.contains(target)) return;

    this.editorView.dispatch(
      this.editorView.state.tr.setMeta(
        slashPluginKey,
        createDismissedSlashState(this.editorView.state.selection)
      )
    );
  };

  private handleDocumentKeyDown = (event: KeyboardEvent) => {
    const state = slashPluginKey.getState(this.editorView.state);
    if (!state?.isOpen || event.isComposing || this.editorView.composing) return;

    const filtered = filterSlashItems(state.query, getSlashMenuItems());
    if (filtered.length === 0) return;

    if (isPlainSlashMenuNavigationKey(event)) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        this.editorView.dispatch(
          this.editorView.state.tr.setMeta(slashPluginKey, {
            selectedIndex: (state.selectedIndex + 1) % filtered.length,
          })
        );
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        this.editorView.dispatch(
          this.editorView.state.tr.setMeta(slashPluginKey, {
            selectedIndex: (state.selectedIndex - 1 + filtered.length) % filtered.length,
          })
        );
        return;
      }
    }

    switch (event.key) {
      case 'Enter':
      case 'Tab':
        event.preventDefault();
        event.stopPropagation();
        this.applySelectedItem(state.selectedIndex);
        break;

      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.editorView.dispatch(
          this.editorView.state.tr.setMeta(
            slashPluginKey,
            createDismissedSlashState(this.editorView.state.selection)
          )
        );
        break;
    }
  };

  private handleHoverItem = (index: number, pointer: { clientX: number; clientY: number }) => {
    const state = slashPluginKey.getState(this.editorView.state);
    if (!state?.isOpen || state.selectedIndex === index) return;

    if (
      this.lastPointerHover &&
      this.lastPointerHover.clientX === pointer.clientX &&
      this.lastPointerHover.clientY === pointer.clientY
    ) {
      return;
    }

    this.lastPointerHover = pointer;
    this.skipNextSelectedScroll = true;
    this.editorView.dispatch(this.editorView.state.tr.setMeta(slashPluginKey, { selectedIndex: index }));
  };
}
