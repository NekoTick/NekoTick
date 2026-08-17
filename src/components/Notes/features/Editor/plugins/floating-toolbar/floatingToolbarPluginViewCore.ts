import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  createToolbarElement,
  hideToolbar
} from './floatingToolbarDom';
import type { FloatingToolbarPluginViewContext } from './floatingToolbarPluginViewTypes';
import { clearFormatPreview, hasActiveAppliedPreview } from './previewStyles';
import { createToolbarRenderer } from './renderToolbar';
import { hasUsableTextRange, hasUsableTextSelection } from './selectionValidity';
import type { FloatingToolbarState } from './types';

export function installFloatingToolbarPluginViewCore(ctx: FloatingToolbarPluginViewContext): void {
  ctx.ensureToolbarParent = (_isReviewMode: boolean) => {
    const targetParent = ctx.positionRoot;
    if (ctx.toolbarElement.parentElement !== targetParent) {
      targetParent.appendChild(ctx.toolbarElement);
    }
    if (ctx.selectionToolbarElement.parentElement !== targetParent) {
      targetParent.appendChild(ctx.selectionToolbarElement);
    }
    ctx.reviewToolbars.forEach(({ element }) => {
      if (element.parentElement !== targetParent) {
        targetParent.appendChild(element);
      }
    });
  };

  ctx.resetToolbarTracking = () => {
    ctx.lastRenderState = '';
    ctx.lastSelectionSignature = '';
    ctx.lastToolbarX = null;
    ctx.lastToolbarY = null;
    ctx.lastToolbarPlacement = null;
    ctx.lastContainerWidth = null;
    ctx.lastScrollLeft = null;
    ctx.lastScrollTop = null;
    ctx.lastTextSelection = null;
    ctx.lastSelectionToolbarRenderState = '';
    ctx.selectionToolbarSubMenu = null;
  };

  ctx.rememberTextSelection = (selection: EditorView['state']['selection']) => {
    if (!hasUsableTextSelection(selection, ctx.editorView.state.doc)) {
      return;
    }

    ctx.lastTextSelection = {
      from: selection.from,
      to: selection.to,
    };
  };

  ctx.hideToolbarAndReset = () => {
    clearFormatPreview(ctx.editorView);
    hideToolbar(ctx.toolbarElement);
    hideToolbar(ctx.selectionToolbarElement);
    ctx.reviewToolbars.forEach(({ element }) => hideToolbar(element));
    ctx.resetToolbarTracking();
  };

  ctx.measureToolbarWidth = (toolbar: HTMLElement) => {
    const toolbarBodyNode = toolbar.querySelector('.floating-toolbar-inner');
    const toolbarBody = toolbarBodyNode instanceof HTMLElement ? toolbarBodyNode : null;
    return toolbarBody?.offsetWidth || toolbar.offsetWidth || 0;
  };

  ctx.isToolbarEventTarget = (target: EventTarget | null) => {
    if (!(target instanceof Node)) {
      return false;
    }

    return (
      ctx.toolbarElement.contains(target) ||
      ctx.selectionToolbarElement.contains(target) ||
      Array.from(ctx.reviewToolbars.values()).some(({ element }) => element.contains(target))
    );
  };

  ctx.destroyReviewToolbar = (requestKey: string) => {
    const entry = ctx.reviewToolbars.get(requestKey);
    if (!entry) {
      return;
    }

    entry.renderer.destroy();
    entry.element.remove();
    ctx.reviewToolbars.delete(requestKey);
  };

  ctx.getReviewToolbar = (requestKey: string) => {
    const existing = ctx.reviewToolbars.get(requestKey);
    if (existing) {
      return existing;
    }

    const element = createToolbarElement();
    const renderer = createToolbarRenderer(element);
    ctx.positionRoot.appendChild(element);
    const entry = {
      element,
      renderer,
      lastRenderState: '',
    };
    ctx.reviewToolbars.set(requestKey, entry);
    return entry;
  };

  ctx.restoreLastSelection = () => {
    const selection = ctx.editorView.state.selection;
    if (!selection.empty || !ctx.lastTextSelection) {
      return;
    }

    const maxPos = ctx.editorView.state.doc.content.size;
    const from = Math.max(0, Math.min(ctx.lastTextSelection.from, maxPos));
    const to = Math.max(from, Math.min(ctx.lastTextSelection.to, maxPos));
    if (!hasUsableTextRange(ctx.editorView.state.doc, from, to)) {
      return;
    }

    ctx.editorView.dispatch(
      ctx.editorView.state.tr
        .setSelection(TextSelection.create(ctx.editorView.state.doc, from, to))
        .setMeta('addToHistory', false)
    );
  };

  ctx.restoreSelectionForToolbar = () => {
    if (!ctx.interactionState.isPointerInsideToolbar) {
      return false;
    }

    ctx.restoreLastSelection();
    return true;
  };

  ctx.restoreSelectionRangeForToolbar = (range: FloatingToolbarState['selectionRange']) => {
    if (!range) {
      return false;
    }

    const maxPos = ctx.editorView.state.doc.content.size;
    const from = Math.max(0, Math.min(range.from, maxPos));
    const to = Math.max(from, Math.min(range.to, maxPos));
    if (!hasUsableTextRange(ctx.editorView.state.doc, from, to)) {
      return false;
    }

    try {
      ctx.editorView.dispatch(
        ctx.editorView.state.tr
          .setSelection(TextSelection.create(ctx.editorView.state.doc, from, to))
          .setMeta('addToHistory', false)
      );
      return true;
    } catch {
      return false;
    }
  };

  ctx.scheduleToolbarUpdate = () => {
    const pluginState = ctx.toolbarKey.getState(ctx.editorView.state);
    const hasReviewPanels = Boolean(
      pluginState && (pluginState.aiReviews.length > 0 || pluginState.aiReview)
    );
    if (!pluginState?.isVisible && !hasReviewPanels && !hasActiveAppliedPreview(ctx.editorView)) {
      return;
    }
    if (ctx.layoutRaf !== null) {
      return;
    }

    ctx.layoutRaf = requestAnimationFrame(() => {
      ctx.layoutRaf = null;
      ctx.updateToolbar();
    });
  };

}
