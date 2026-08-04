import { canApplyBlockMove, getDraggableBlockRanges, resolveDropTarget, type HandleBlockTarget } from './blockControlsInteractions';
import { BLOCK_SELECTION_PENDING_CLASS, canInsertCrossNoteDraggedMarkdown, getElementsFromPoint, HANDLE_VERTICAL_GAP_PX, isOverNotesBlockDropTarget } from './blockControlsViewSessionHelpers';
import { isBlockSelectionInteractionPending } from './blockSelectionInteractionState';
import { getBlockSelectionPluginState } from './blockSelectionPluginState';
import { getBlockRangesKey, normalizeBlockRanges, type BlockRange } from './blockSelectionUtils';

class BlockControlsViewSessionPointer {
  getDraggableSelection(this: any): { ranges: BlockRange[]; key: string; selectedRanges: BlockRange[] } {
    const selectedBlocks = getBlockSelectionPluginState(this.view.state).selectedBlocks;
    if (this.cachedSelectedBlocks === selectedBlocks) {
      return {
        ranges: this.cachedDraggableRanges,
        key: this.cachedDraggableSelectionKey,
        selectedRanges: this.cachedNormalizedSelectedRanges,
      };
    }

    const selectedRanges = normalizeBlockRanges(selectedBlocks);
    const ranges = getDraggableBlockRanges(this.view, selectedRanges);
    const key = ranges.length > 0 ? getBlockRangesKey(ranges) : '';
    this.cachedSelectedBlocks = selectedBlocks;
    this.cachedNormalizedSelectedRanges = selectedRanges;
    this.cachedDraggableRanges = ranges;
    this.cachedDraggableSelectionKey = key;
    return { ranges, key, selectedRanges };
  }

  isPointerInEditorScrollRoot(this: any): boolean {
    if (this.pointerX === null || this.pointerY === null) return false;
    if (typeof this.doc.elementFromPoint === 'function') {
      const hoveredElement = this.doc.elementFromPoint(this.pointerX, this.pointerY);
      if (hoveredElement instanceof Node && this.controls.contains(hoveredElement)) {
        return true;
      }
    }
    if (!this.scrollRoot) return true;

    const rect = this.scrollRoot.getBoundingClientRect();
    return this.pointerX >= rect.left
      && this.pointerX <= rect.right
      && this.pointerY >= rect.top
      && this.pointerY <= rect.bottom;
  }

  isBlockSelectionPending(this: any): boolean {
    return this.view.dom.classList.contains(BLOCK_SELECTION_PENDING_CLASS)
      || isBlockSelectionInteractionPending(this.view.dom);
  }

  isPointerNearTarget(this: any, target: HandleBlockTarget): boolean {
    if (this.pointerY === null) return false;
    if (this.pointerY >= target.rect.top && this.pointerY <= target.rect.bottom) return true;

    const distance = this.pointerY < target.rect.top
      ? target.rect.top - this.pointerY
      : this.pointerY - target.rect.bottom;
    return distance <= HANDLE_VERTICAL_GAP_PX;
  }

  hideControls(this: any): void {
    this.controls.classList.remove('visible');
  }

  clearPointer(this: any): void {
    this.pointerX = null;
    this.pointerY = null;
  }

  setPointer(this: any, clientX: number, clientY: number): void {
    this.pointerX = clientX;
    this.pointerY = clientY;
  }

  hideDropIndicator(this: any): void {
    this.pendingDrop = null;
    this.dropIndicator.classList.remove('visible');
  }

  updateDropTargetByPointer(this: any, clientX: number, clientY: number): boolean {
    const target = resolveDropTarget(this.view, clientX, clientY);
    if (!target) {
      this.hideDropIndicator();
      return false;
    }
    if (!this.draggedRanges) {
      this.hideDropIndicator();
      return false;
    }
    let canDrop = true;
    if (this.isCrossNoteDrag()) {
      if (
        this.dragSourceMarkdownAfterDelete === null
        || !canInsertCrossNoteDraggedMarkdown(this.view, this.draggedMarkdown, target.insertPos)
      ) {
        canDrop = false;
      }
    } else if (!canApplyBlockMove(this.view, this.draggedRanges, target.insertPos)) {
      canDrop = false;
    }
    this.pendingDrop = canDrop ? target : null;
    this.dropIndicator.style.left = `${Math.round(target.lineLeft)}px`;
    this.dropIndicator.style.top = `${Math.round(target.lineY - 1)}px`;
    this.dropIndicator.style.width = `${Math.round(target.lineWidth)}px`;
    this.dropIndicator.classList.add('visible');
    return canDrop;
  }

  applyDragPointerUpdate(this: any, clientX: number, clientY: number): void {
    const elements = getElementsFromPoint(this.doc, clientX, clientY);
    this.updateBlockDragTabHover(elements);
    if (isOverNotesBlockDropTarget(elements)) {
      this.hideDropIndicator();
    } else {
      this.updateDropTargetByPointer(clientX, clientY);
    }
    if (this.dragPreview) {
      this.dragPreview.element.style.left = `${Math.round(clientX - this.dragPreview.offsetX)}px`;
      this.dragPreview.element.style.top = `${Math.round(clientY - this.dragPreview.offsetY)}px`;
    }
  }

  scheduleDragPointerUpdate(this: any, clientX: number, clientY: number): void {
    this.pendingDragClientX = clientX;
    this.pendingDragClientY = clientY;
    if (this.dragPointerRafId !== 0) return;

    this.dragPointerRafId = window.requestAnimationFrame(() => {
      this.dragPointerRafId = 0;
      const nextX = this.pendingDragClientX;
      const nextY = this.pendingDragClientY;
      this.pendingDragClientX = null;
      this.pendingDragClientY = null;
      if (nextX === null || nextY === null || !this.draggedRanges) return;
      this.applyDragPointerUpdate(nextX, nextY);
    });
  }

  flushDragPointerUpdate(this: any): void {
    if (this.dragPointerRafId !== 0) {
      window.cancelAnimationFrame(this.dragPointerRafId);
      this.dragPointerRafId = 0;
    }
    const nextX = this.pendingDragClientX;
    const nextY = this.pendingDragClientY;
    this.pendingDragClientX = null;
    this.pendingDragClientY = null;
    if (nextX === null || nextY === null || !this.draggedRanges) return;
    this.applyDragPointerUpdate(nextX, nextY);
  }

}

function installMixinMethods(prototype: object, mixinPrototype: object): void {
  for (const key of Object.getOwnPropertyNames(mixinPrototype)) {
    if (key !== 'constructor') {
      Object.defineProperty(prototype, key, Object.getOwnPropertyDescriptor(mixinPrototype, key)!);
    }
  }
}

export function installBlockControlsViewSessionPointer(prototype: object): void {
  installMixinMethods(prototype, BlockControlsViewSessionPointer.prototype);
}
