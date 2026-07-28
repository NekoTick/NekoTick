import type { EditorView } from '@milkdown/kit/prose/view';
import { subscribeCurrentEditorBlockPositionSnapshot } from '../../utils/editorBlockPositionCache';
import { createBlockControlsDom } from './blockControlsDom';
import type { DropTarget, HandleBlockTarget } from './blockControlsInteractions';
import { installBlockControlsViewSessionDragHandlers } from './blockControlsViewSessionDragHandlers';
import { SCROLL_ROOT_SELECTOR, saveCrossNoteBlockDropAfterTargetSave } from './blockControlsViewSessionHelpers';
import { installBlockControlsViewSessionLifecycle } from './blockControlsViewSessionLifecycle';
import { installBlockControlsViewSessionPointer } from './blockControlsViewSessionPointer';
import { installBlockControlsViewSessionTargets } from './blockControlsViewSessionTargets';
import { installBlockControlsViewSessionViewportHandlers } from './blockControlsViewSessionViewportHandlers';
import type { BlockDragPreviewHandle, BlockDragSourceMarkerHandle } from './blockDragPreview';
import type { BlockRange } from './blockSelectionUtils';
import type { VerticalEdgeAutoScrollHandle } from './edgeAutoScroll';
import { createVerticalEdgeAutoScroll } from './edgeAutoScroll';

export class BlockControlsViewSession {
  readonly view: EditorView;
  readonly doc: Document;
  readonly scrollRoot: HTMLElement | null;
  readonly controls: HTMLDivElement;
  readonly handleButton: HTMLButtonElement;
  readonly dropIndicator: HTMLDivElement;
  readonly dragAutoScroll: VerticalEdgeAutoScrollHandle;

  draggedRanges: BlockRange[] | null = null;
  dragPreview: BlockDragPreviewHandle | null = null;
  dragSourceMarker: BlockDragSourceMarkerHandle | null = null;
  pendingDrop: DropTarget | null = null;
  dragStartClientX: number | null = null;
  dragStartClientY: number | null = null;
  lastDragClientX: number | null = null;
  lastDragClientY: number | null = null;
  pendingDragClientX: number | null = null;
  pendingDragClientY: number | null = null;
  pointerX: number | null = null;
  pointerY: number | null = null;
  dragSourceDoc: EditorView['state']['doc'] | null = null;
  dragSourceNotePath: string | null = null;
  draggedMarkdown: string | null = null;
  dragSourceMarkdownBeforeDelete: string | null = null;
  dragSourceMarkdownAfterDelete: string | null = null;
  blockDragTabOpenPath: string | null = null;
  blockDragTabOpenTimerId: number | null = null;
  refreshRafId = 0;
  dragPointerRafId = 0;

  cachedTargets: HandleBlockTarget[] = [];
  cachedSelectionKey = '';
  cachedDoc;
  cachedScrollLeft = Number.NaN;
  cachedScrollTop = Number.NaN;
  cachedSnapshotVersion = Number.NaN;
  cachedSelectedBlocks: readonly BlockRange[] | null = null;
  cachedNormalizedSelectedRanges: BlockRange[] = [];
  cachedDraggableRanges: BlockRange[] = [];
  cachedDraggableSelectionKey = '';
  dragWheelListenerAttached = false;
  readonly unsubscribeBlockPositionSnapshot: () => void;
  declare update: () => void;
  declare destroy: () => void;
  declare refreshDragDropAfterScroll: () => void;
  declare handleHandleMouseDown: (event: MouseEvent) => void;
  declare handleDocumentMouseMove: (event: MouseEvent) => void;
  declare handleDocumentPointerMove: (event: PointerEvent) => void;
  declare handleDocumentMouseUp: (event: MouseEvent) => void;
  declare handleDocumentKeyDown: (event: KeyboardEvent) => void;
  declare handleScrollOrResize: () => void;
  declare handleWindowBlur: () => void;
  declare handleBlockPositionSnapshot: () => void;
  declare adoptPendingCrossNoteBlockDrag: () => void;

  constructor(view: EditorView) {
    this.view = view;
    this.doc = view.dom.ownerDocument;
    this.scrollRoot = view.dom.closest(SCROLL_ROOT_SELECTOR) as HTMLElement | null;
    this.cachedDoc = view.state.doc;
    installBlockControlsViewSessionDragHandlers(this);
    installBlockControlsViewSessionViewportHandlers(this);
    this.dragAutoScroll = createVerticalEdgeAutoScroll({
      scrollRoot: this.scrollRoot,
      getPointerY: () => this.draggedRanges ? this.lastDragClientY : null,
      onScroll: this.refreshDragDropAfterScroll,
    });

    const { controls, handleButton, dropIndicator } = createBlockControlsDom(this.doc);
    this.controls = controls;
    this.handleButton = handleButton;
    this.dropIndicator = dropIndicator;

    this.handleButton.addEventListener('mousedown', this.handleHandleMouseDown);
    this.doc.addEventListener('mousemove', this.handleDocumentMouseMove, true);
    this.doc.addEventListener('pointermove', this.handleDocumentPointerMove, true);
    this.doc.addEventListener('mouseup', this.handleDocumentMouseUp, true);
    this.doc.addEventListener('keydown', this.handleDocumentKeyDown, true);
    this.scrollRoot?.addEventListener('scroll', this.handleScrollOrResize, { passive: true });
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('resize', this.handleScrollOrResize);
    this.unsubscribeBlockPositionSnapshot = subscribeCurrentEditorBlockPositionSnapshot(
      this.handleBlockPositionSnapshot,
    );
    this.adoptPendingCrossNoteBlockDrag();
  }
}

installBlockControlsViewSessionLifecycle(BlockControlsViewSession.prototype);
installBlockControlsViewSessionPointer(BlockControlsViewSession.prototype);
installBlockControlsViewSessionTargets(BlockControlsViewSession.prototype);

export const __testing__ = {
  saveCrossNoteBlockDropAfterTargetSave,
};
