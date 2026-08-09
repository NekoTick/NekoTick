import {
  hideToolbar,
  isFloatingToolbarSuppressed,
  showToolbar
} from './floatingToolbarDom';
import {
  getAiReviewPanelWidth,
  getContentLayoutContext,
  resolveToolbarContainerPosition,
  resolveToolbarViewportPosition,
} from './floatingToolbarLayout';
import type { FloatingToolbarPluginViewContext } from './floatingToolbarPluginViewTypes';
import {
  hasActiveAppliedPreview,
  hasActiveSelectionBlockPreview,
} from './previewStyles';
import {
  calculateBottomPositionForRange,
  calculatePositionForRange,
  getActiveMarks,
  getBgColor,
  getCurrentAlignment,
  getCurrentBlockType,
  getLinkUrl,
  getTextColor
} from './selectionHelpers';
import { hasUsableTextSelection } from './selectionValidity';
import type { FloatingToolbarState } from './types';


export function installFloatingToolbarPluginViewReviewRenderMethods(ctx: FloatingToolbarPluginViewContext): void {
  ctx.getReviewRenderState = (
    review: NonNullable<FloatingToolbarState['aiReview']>,
    reviewWidth: number | null
  ) => [
    'aiReview',
    review.requestKey,
    reviewWidth === null ? '' : reviewWidth,
    review.from,
    review.to,
    review.instruction || '',
    review.commandId || '',
    review.toneId || '',
    review.originalText || '',
    review.suggestedText || '',
    review.errorMessage || '',
    review.errorType || '',
    review.errorCode || '',
    review.isLoading ? 'loading' : '',
  ].join('|');

  ctx.renderReviewToolbars = (
    pluginState: FloatingToolbarState,
    toolbarState: {
      activeMarks: Set<string>;
      currentBlockType: ReturnType<typeof getCurrentBlockType>;
      currentAlignment: ReturnType<typeof getCurrentAlignment>;
      linkUrl: ReturnType<typeof getLinkUrl>;
      textColor: ReturnType<typeof getTextColor>;
      bgColor: ReturnType<typeof getBgColor>;
    }
  ) => {
    const reviews = pluginState.aiReviews.length > 0
      ? pluginState.aiReviews
      : pluginState.aiReview
        ? [pluginState.aiReview]
        : [];
    const liveKeys = new Set(reviews.map((review) => review.requestKey));
    Array.from(ctx.reviewToolbars.keys()).forEach((requestKey) => {
      if (!liveKeys.has(requestKey)) {
        ctx.destroyReviewToolbar(requestKey);
      }
    });

    reviews.forEach((review) => {
      const entry = ctx.getReviewToolbar(review.requestKey);
      const aiReviewWidth = getAiReviewPanelWidth(
        getContentLayoutContext(ctx.editorView, ctx.positionRoot instanceof HTMLElement ? ctx.positionRoot : null)
      );
      const reviewWidth = aiReviewWidth > 0 ? Math.round(aiReviewWidth) : null;
      if (reviewWidth !== null) {
        entry.element.style.setProperty(
          '--vlaina-toolbar-ai-review-width',
          `${reviewWidth}px`
        );
      } else {
        entry.element.style.removeProperty('--vlaina-toolbar-ai-review-width');
      }

      const reviewState: FloatingToolbarState = {
        ...pluginState,
        subMenu: 'aiReview',
        aiReview: review,
        isVisible: true,
      };
      const renderState = ctx.getReviewRenderState(review, reviewWidth);
      if (entry.lastRenderState !== renderState) {
        entry.lastRenderState = renderState;
        entry.renderer.render(ctx.editorView, {
          ...reviewState,
          ...toolbarState,
        });
      }

      const reviewRange = {
        from: review.from,
        to: review.to,
      };
      const aiPosition = calculateBottomPositionForRange(ctx.editorView, reviewRange.from, reviewRange.to);
      const selectionPosition = calculatePositionForRange(ctx.editorView, reviewRange.from, reviewRange.to);
      const layout = getContentLayoutContext(
        ctx.editorView,
        ctx.positionRoot instanceof HTMLElement ? ctx.positionRoot : null
      );
      const nextPosition = resolveToolbarViewportPosition({
        aiPosition,
        layout,
        pluginState: reviewState,
        selectionPosition,
      });
      const containerPosition = resolveToolbarContainerPosition(
        reviewState,
        nextPosition,
        ctx.positionRoot instanceof HTMLElement ? ctx.positionRoot : null
      );

      showToolbar(
        entry.element,
        { x: containerPosition.x, y: containerPosition.y },
        nextPosition.placement,
        true
      );
      ctx.correctSubmenusToContentBounds(entry.element);
    });
  };

  ctx.updateToolbar = () => {
    const pluginState = ctx.toolbarKey.getState(ctx.editorView.state);
    const hasReviewPanels = Boolean(pluginState && (pluginState.aiReviews.length > 0 || pluginState.aiReview));
    const isReviewModeActive = pluginState?.subMenu === 'aiReview' && Boolean(pluginState.aiReview);
    if (hasActiveSelectionBlockPreview(ctx.editorView)) {
      return;
    }
    ctx.ensureToolbarParent(isReviewModeActive);
    let { selection } = ctx.editorView.state;
    const shouldKeepToolbarDuringPreview = hasActiveAppliedPreview(ctx.editorView);

    if (isFloatingToolbarSuppressed()) {
      ctx.hideToolbarAndReset();
      return;
    }

    if (!pluginState?.isVisible && !hasReviewPanels) {
      if (shouldKeepToolbarDuringPreview) {
        return;
      }
      ctx.hideToolbarAndReset();
      return;
    }

    if (!pluginState) {
      ctx.hideToolbarAndReset();
      return;
    }

    if (
      !hasReviewPanels &&
      !isReviewModeActive &&
      selection.empty &&
      !hasUsableTextSelection(selection, ctx.editorView.state.doc)
    ) {
      if (ctx.restoreSelectionForToolbar() || ctx.restoreSelectionRangeForToolbar(pluginState.selectionRange)) {
        selection = ctx.editorView.state.selection;
      }
    }

    if (!hasReviewPanels && !isReviewModeActive && !hasUsableTextSelection(selection, ctx.editorView.state.doc)) {
      if (shouldKeepToolbarDuringPreview) {
        return;
      }
      ctx.hideToolbarAndReset();
      return;
    }
    ctx.rememberTextSelection(selection);

    ctx.syncAiReviewWidth(isReviewModeActive, pluginState);

    const activeMarks = getActiveMarks(ctx.editorView);
    const currentBlockType = getCurrentBlockType(ctx.editorView);
    const currentAlignment = getCurrentAlignment(ctx.editorView);
    const linkUrl = getLinkUrl(ctx.editorView);
    const textColor = getTextColor(ctx.editorView);
    const bgColor = getBgColor(ctx.editorView);
    const toolbarState = {
      activeMarks,
      currentBlockType,
      currentAlignment,
      linkUrl,
      textColor,
      bgColor,
    };

    if (hasReviewPanels) {
      ctx.renderReviewToolbars(pluginState, toolbarState);
      hideToolbar(ctx.toolbarElement);
      ctx.lastRenderState = '';
      ctx.updateSelectionToolbarForReview(pluginState, toolbarState, selection);
      return;
    }

    ctx.reviewToolbars.forEach((_, requestKey) => ctx.destroyReviewToolbar(requestKey));

    ctx.renderToolbarIfNeeded(pluginState, toolbarState);

    const {
      containerWidth,
      finalPlacement,
      finalX,
      finalY,
      layoutViewportBounds,
      currentScrollLeft,
      currentScrollTop,
      selectionSignature,
    } = ctx.resolveDisplayedToolbarPosition({
      pluginState,
      isReviewModeActive,
      selection,
    });

    showToolbar(
      ctx.toolbarElement,
      { x: finalX, y: finalY },
      finalPlacement,
      pluginState.subMenu === 'aiReview'
    );
    const correctedX = pluginState.subMenu === 'aiReview'
      ? finalX
      : ctx.correctToolbarToLayoutBounds(ctx.toolbarElement, finalX, layoutViewportBounds);
    const correctedY = ctx.correctToolbarToViewportYBounds(ctx.toolbarElement, finalY);
    const measuredToolbarWidth = ctx.measureToolbarWidth(ctx.toolbarElement);
    if (measuredToolbarWidth > 0) {
      ctx.lastMeasuredToolbarWidth = measuredToolbarWidth;
    }
    ctx.correctSubmenusToContentBounds(ctx.toolbarElement);
    ctx.updateSelectionToolbarForReview(pluginState, {
      activeMarks,
      currentBlockType,
      currentAlignment,
      linkUrl,
      textColor,
      bgColor,
    }, selection);

    ctx.lastSelectionSignature = selectionSignature;
    ctx.lastToolbarX = correctedX;
    ctx.lastToolbarY = correctedY;
    ctx.lastToolbarPlacement = finalPlacement;
    ctx.lastContainerWidth = containerWidth;
    ctx.lastScrollLeft = currentScrollLeft;
    ctx.lastScrollTop = currentScrollTop;
  };

}
