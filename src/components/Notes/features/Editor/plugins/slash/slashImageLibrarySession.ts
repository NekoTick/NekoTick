import React from 'react';
import { flushSync } from 'react-dom';
import type { Root } from 'react-dom/client';
import type { EditorView } from '@milkdown/kit/prose/view';
import { OpenedFolderImageLibraryPanel } from './OpenedFolderImageLibraryPanel';
import { getImagePathRelativeToNote } from './slashImageLibraryPaths';
import { insertImageNodeAtSelection } from '../image-upload/imageNodeInsertion';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { notifyNotesOverlayOpen, onNotesOverlayOpen } from '@/components/Notes/features/overlays/notesOverlayEvents';
import { getScrollRoot, getToolbarRoot } from '../floating-toolbar/floatingToolbarDom';
import { applySlashMenuPosition } from './slashMenuPositioning';
import { createSlashMenuElement, destroySlashMenuElement } from './slashMenuDom';
import { isEditorInsertionContextCurrent } from './slashInsertUtils';

let activeSession: SlashImageLibrarySession | null = null;
type SelectionBookmark = ReturnType<EditorView['state']['selection']['getBookmark']>;

class SlashImageLibrarySession {
  private menuElement: HTMLElement | null = null;
  private root: Root | null = null;
  private disposed = false;
  private readonly unlistenOverlay: () => void;
  private readonly scrollRoot: HTMLElement | null;
  private readonly positionRoot: HTMLElement | null;
  private readonly sourceDoc: EditorView['state']['doc'];
  private readonly sourceSelection: EditorView['state']['selection'];
  private readonly sourceNotePath: string | undefined;
  private positionFrameId = 0;
  private positionFrameScheduled = false;

  constructor(
    private readonly view: EditorView,
    private readonly bookmark: SelectionBookmark,
    private readonly chooseComputer: () => void,
  ) {
    this.scrollRoot = getScrollRoot(view);
    this.positionRoot = getToolbarRoot(view) ?? this.scrollRoot;
    this.sourceDoc = view.state.doc;
    this.sourceSelection = view.state.selection;
    this.sourceNotePath = useNotesStore.getState().currentNote?.path;
    this.unlistenOverlay = onNotesOverlayOpen(({ source }) => {
      if (source !== 'slash-image-library') this.destroy();
    });
  }

  open() {
    notifyNotesOverlayOpen('slash-image-library');
    const { menuElement, root } = createSlashMenuElement(this.positionRoot);
    this.menuElement = menuElement;
    this.menuElement.classList.add('slash-image-library');
    this.root = root;
    flushSync(() => root.render(React.createElement(OpenedFolderImageLibraryPanel, {
      onChooseComputer: () => {
        this.destroy();
        this.chooseComputer();
      },
      onSelect: (path: string) => this.insert(path),
    })));
    applySlashMenuPosition(this.view, menuElement, this.positionRoot);
    window.addEventListener('resize', this.schedulePositionSync);
    this.scrollRoot?.addEventListener('scroll', this.schedulePositionSync, { passive: true });
    window.addEventListener('mousedown', this.handleWindowMouseDown, true);
    document.addEventListener('keydown', this.handleDocumentKeyDown, true);
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.unlistenOverlay();
    window.removeEventListener('resize', this.schedulePositionSync);
    this.scrollRoot?.removeEventListener('scroll', this.schedulePositionSync);
    if (this.positionFrameId !== 0) {
      cancelAnimationFrame(this.positionFrameId);
    }
    this.positionFrameId = 0;
    this.positionFrameScheduled = false;
    window.removeEventListener('mousedown', this.handleWindowMouseDown, true);
    document.removeEventListener('keydown', this.handleDocumentKeyDown, true);
    const root = this.root;
    this.root = null;
    destroySlashMenuElement(this.menuElement, root);
    this.menuElement = null;
    if (activeSession === this) activeSession = null;
  }

  private insert(path: string) {
    const notePath = useNotesStore.getState().currentNote?.path;
    try {
      if (
        notePath !== this.sourceNotePath
        || !isEditorInsertionContextCurrent(this.view, this.sourceDoc, this.sourceSelection)
      ) {
        return;
      }
      const selection = this.bookmark.resolve(this.view.state.doc);
      insertImageNodeAtSelection(
        this.view,
        getImagePathRelativeToNote(path, notePath),
        selection,
      );
    } finally {
      this.closeAndFocus();
    }
  }

  private closeAndFocus() {
    this.destroy();
    this.view.focus();
  }

  private syncPosition = () => {
    if (this.menuElement) {
      applySlashMenuPosition(this.view, this.menuElement, this.positionRoot);
    }
  };

  private schedulePositionSync = () => {
    if (this.positionFrameScheduled) return;

    this.positionFrameScheduled = true;
    const frameId = requestAnimationFrame(() => {
      this.positionFrameId = 0;
      this.positionFrameScheduled = false;
      this.syncPosition();
    });
    if (this.positionFrameScheduled) {
      this.positionFrameId = frameId;
    }
  };

  private handleWindowMouseDown = (event: MouseEvent) => {
    const target = event.target;
    if (target instanceof Node && !this.menuElement?.contains(target)) {
      this.closeAndFocus();
    }
  };

  private handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || this.view.composing) return;
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.closeAndFocus();
  };
}

export function openSlashImageLibrary(view: EditorView, chooseComputer: () => void) {
  activeSession?.destroy();
  activeSession = new SlashImageLibrarySession(
    view,
    view.state.selection.getBookmark(),
    chooseComputer,
  );
  activeSession.open();
}
