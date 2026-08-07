import type { PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { abortAllAiSelectionReviews } from './ai/reviewAbort';
import { createToolbarRenderer } from './renderToolbar';
import { TOOLBAR_ACTIONS, type FloatingToolbarState } from './types';
import { createToolbarElement, getScrollRoot, getToolbarRoot, hideToolbar } from './floatingToolbarDom';
import { clearFormatPreview } from './previewStyles';
import { notifyNotesOverlayOpen, onNotesOverlayOpen } from '@/components/Notes/features/overlays/notesOverlayEvents';
import { hasUsableTextSelection } from './selectionValidity';
import { installFloatingToolbarPluginViewCore } from './floatingToolbarPluginViewCore';
import { installFloatingToolbarPluginViewEventMethods } from './floatingToolbarPluginViewEventMethods';
import { installFloatingToolbarPluginViewLayoutMethods } from './floatingToolbarPluginViewLayoutMethods';
import { installFloatingToolbarPluginViewRenderMethods } from './floatingToolbarPluginViewRenderMethods';
import type { FloatingToolbarPluginViewContext } from './floatingToolbarPluginViewTypes';
import { isLargeEditorTextSelection } from '../selection/textSelectionOverlayState';

export type { FloatingToolbarInteractionState } from './floatingToolbarPluginViewUtils';
export { shouldLockPreviewToolbarPosition } from './floatingToolbarPluginViewUtils';

export function createFloatingToolbarPluginView(
  editorView: EditorView,
  toolbarKey: PluginKey<FloatingToolbarState>,
  interactionState: import('./floatingToolbarPluginViewUtils').FloatingToolbarInteractionState
) {
  const toolbarElement = createToolbarElement();
  let ctx: FloatingToolbarPluginViewContext;
  const toolbarRenderer = createToolbarRenderer(toolbarElement);
  const selectionToolbarElement = createToolbarElement();
  const selectionToolbarRenderer = createToolbarRenderer(selectionToolbarElement, {
    onToggleSubMenu: (_view, currentState, nextSubMenu) => {
      ctx.selectionToolbarSubMenu = currentState?.subMenu === nextSubMenu ? null : nextSubMenu;
      ctx.lastSelectionToolbarRenderState = '';
      ctx.scheduleToolbarUpdate();
      return false;
    },
    onCloseToolbar: () => {
      ctx.selectionToolbarSubMenu = null;
      ctx.lastSelectionToolbarRenderState = '';
      hideToolbar(selectionToolbarElement);
      ctx.scheduleToolbarUpdate();
      return true;
    },
  });
  const scrollRoot = getScrollRoot(editorView);
  const toolbarRoot = getToolbarRoot(editorView);
  const positionRoot = toolbarRoot ?? scrollRoot ?? document.body;

  ctx = {
    editorView,
    toolbarKey,
    interactionState,
    pendingRaf: null,
    layoutRaf: null,
    lastRenderState: '',
    lastSelectionSignature: '',
    lastToolbarX: null,
    lastToolbarY: null,
    lastToolbarPlacement: null,
    lastContainerWidth: null,
    lastScrollLeft: null,
    lastScrollTop: null,
    lastTextSelection: null,
    lastSelectionToolbarRenderState: '',
    selectionToolbarSubMenu: null,
    lastExclusiveToolbarSignature: '',
    hasAiReviewWidthStyle: false,
    lastMeasuredToolbarWidth: null,
    toolbarElement,
    toolbarRenderer,
    selectionToolbarElement,
    selectionToolbarRenderer,
    scrollRoot,
    toolbarRoot,
    positionRoot,
    reviewToolbars: new Map(),
  };

  positionRoot.appendChild(toolbarElement);
  positionRoot.appendChild(selectionToolbarElement);
  installFloatingToolbarPluginViewCore(ctx);
  installFloatingToolbarPluginViewLayoutMethods(ctx);
  installFloatingToolbarPluginViewRenderMethods(ctx);
  installFloatingToolbarPluginViewEventMethods(ctx);

  const unlistenOverlayOpen = onNotesOverlayOpen(({ source }) => {
    if (source === 'selection-toolbar') return;
    const pluginState = toolbarKey.getState(editorView.state);
    if (!pluginState?.isVisible) return;
    if (pluginState.subMenu === 'aiReview' && pluginState.aiReview) return;
    editorView.dispatch(editorView.state.tr.setMeta(toolbarKey, { type: TOOLBAR_ACTIONS.HIDE }));
  });
  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
        ctx.scheduleToolbarUpdate();
      })
    : null;

  ctx.bindGlobalListeners(resizeObserver);

  return {
    update(view: EditorView) {
      const { selection } = view.state;
      const pluginState = toolbarKey.getState(view.state);
      const hasReviewPanels = Boolean(pluginState && (
        pluginState.aiReviews.length > 0 || pluginState.aiReview
      ));
      if (
        (!isLargeEditorTextSelection(view.state) || hasReviewPanels)
        && hasUsableTextSelection(selection, view.state.doc)
      ) {
        ctx.rememberTextSelection(selection);
        if (pluginState?.isVisible) {
          const signature = `${selection.from}:${selection.to}`;
          if (signature !== ctx.lastExclusiveToolbarSignature) {
            ctx.lastExclusiveToolbarSignature = signature;
            notifyNotesOverlayOpen('selection-toolbar');
          }
        }
      }
      ctx.updateToolbar();
    },
    destroy() {
      clearFormatPreview(editorView);
      abortAllAiSelectionReviews(editorView);
      if (ctx.pendingRaf !== null) {
        cancelAnimationFrame(ctx.pendingRaf);
      }
      if (ctx.layoutRaf !== null) {
        cancelAnimationFrame(ctx.layoutRaf);
      }
      ctx.unbindGlobalListeners(resizeObserver);
      unlistenOverlayOpen();
      toolbarRenderer.destroy();
      selectionToolbarRenderer.destroy();
      ctx.reviewToolbars.forEach(({ renderer, element }: any) => {
        renderer.destroy();
        element.remove();
      });
      ctx.reviewToolbars.clear();
      toolbarElement.remove();
      selectionToolbarElement.remove();
      ctx.resetToolbarTracking();
      interactionState.isPointerInsideToolbar = false;
      interactionState.isMouseDown = false;
      interactionState.pendingShow = false;
    },
  };
}
