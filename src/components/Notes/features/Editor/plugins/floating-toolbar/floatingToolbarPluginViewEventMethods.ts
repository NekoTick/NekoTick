import { TextSelection } from '@milkdown/kit/prose/state';
import { redo, undo } from '@milkdown/kit/prose/history';
import { TOOLBAR_ACTIONS } from './types';
import { getLinkUrl } from './selectionHelpers';
import { hideToolbar, isFloatingToolbarSuppressed } from './floatingToolbarDom';
import { clearFormatPreview, hasActiveAppliedPreview } from './previewStyles';
import { hasUsableTextSelection } from './selectionValidity';
import { toggleMark, setLink } from './commands';
import { openLinkTooltipFromSelection } from './linkTooltipActions';
import { abortActiveAiSelectionReview } from './ai/reviewAbort';
import type { FloatingToolbarPluginViewContext } from './floatingToolbarPluginViewTypes';
import {
  hasVisibleNativeRange,
  isDocumentFormatShortcut,
  isEditableShortcutTarget,
  resolveDocumentHistoryShortcut,
} from './floatingToolbarPluginViewUtils';

export function installFloatingToolbarPluginViewEventMethods(ctx: FloatingToolbarPluginViewContext): void {
  ctx.handleDocumentHistoryShortcut = (event: KeyboardEvent) => {
    const action = resolveDocumentHistoryShortcut(event);
    if (
      !action ||
      isEditableShortcutTarget(event.target) ||
      !hasActiveAppliedPreview(ctx.editorView)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    clearFormatPreview(ctx.editorView);
    const command = action === 'undo' ? undo : redo;
    const didRun = command(ctx.editorView.state, ctx.editorView.dispatch);
    clearFormatPreview(ctx.editorView);
    if (didRun) {
      ctx.editorView.dispatch(
        ctx.editorView.state.tr
          .setMeta(ctx.toolbarKey, { type: TOOLBAR_ACTIONS.HIDE })
          .setMeta('addToHistory', false)
      );
    }
    ctx.editorView.focus();
  };

  ctx.handleDocumentFormatShortcut = (event: KeyboardEvent) => {
    if (!isDocumentFormatShortcut(event) || isEditableShortcutTarget(event.target)) {
      return;
    }

    const pluginState = ctx.toolbarKey.getState(ctx.editorView.state);
    if (!pluginState?.isVisible || pluginState.subMenu === 'aiReview') {
      return;
    }
    if (!hasUsableTextSelection(ctx.editorView.state.selection, ctx.editorView.state.doc)) {
      return;
    }

    const commitShortcut = (run: () => void) => {
      event.preventDefault();
      clearFormatPreview(ctx.editorView);
      run();
      clearFormatPreview(ctx.editorView);
      hideToolbar(ctx.toolbarElement);
      hideToolbar(ctx.selectionToolbarElement);
      ctx.editorView.dispatch(
        ctx.editorView.state.tr.setMeta(ctx.toolbarKey, {
          type: TOOLBAR_ACTIONS.HIDE,
        })
      );
    };

    switch (event.key.toLowerCase()) {
      case 'b':
        commitShortcut(() => toggleMark(ctx.editorView, 'strong'));
        return;
      case 'i':
        commitShortcut(() => toggleMark(ctx.editorView, 'emphasis'));
        return;
      case 'u':
        commitShortcut(() => toggleMark(ctx.editorView, 'underline'));
        return;
      case 'h':
        commitShortcut(() => toggleMark(ctx.editorView, 'highlight'));
        return;
      case 'k': {
        const linkUrl = getLinkUrl(ctx.editorView);
        commitShortcut(() => {
          if (linkUrl !== null && linkUrl !== '') {
            setLink(ctx.editorView, null);
            return;
          }
          openLinkTooltipFromSelection(ctx.editorView, { autoFocus: true });
        });
        return;
      }
      default:
        return;
    }
  };

  ctx.handleDocumentToolbarPointerMove = (event: Event) => {
    if (!ctx.isToolbarEventTarget(event.target)) {
      return;
    }

    ctx.interactionState.isPointerInsideToolbar = true;
    ctx.restoreLastSelection();
  };

  ctx.handleEditorKeyboardInteraction = (event: KeyboardEvent) => {
    const target = event.target;
    if (!(target instanceof Node) || !ctx.editorView.dom.contains(target)) {
      return;
    }
    if (
      target instanceof Element &&
      target.closest('button, a[href], input, textarea, select, .cm-editor, [contenteditable="false"]')
    ) {
      return;
    }
    const toolbarState = ctx.toolbarKey.getState(ctx.editorView.state);
    if (
      !toolbarState?.isVisible &&
      !hasActiveAppliedPreview(ctx.editorView) &&
      resolveDocumentHistoryShortcut(event) === null
    ) {
      return;
    }
    const clearKeyboardTriggeredPreview = () => {
      const connected = ctx.editorView.dom.isConnected;
      const activePreview = hasActiveAppliedPreview(ctx.editorView);
      const domHidden = ctx.editorView.dom.hasAttribute('data-toolbar-preview-hidden');
      if (
        !connected ||
        (
          !activePreview &&
          !domHidden
        )
      ) {
        return;
      }
      clearFormatPreview(ctx.editorView);
      ctx.editorView.dispatch(
        ctx.editorView.state.tr
          .setMeta(ctx.toolbarKey, { type: TOOLBAR_ACTIONS.HIDE })
          .setMeta('addToHistory', false)
      );
      ctx.editorView.focus();
    };

    clearKeyboardTriggeredPreview();
    requestAnimationFrame(() => {
      clearKeyboardTriggeredPreview();
      requestAnimationFrame(clearKeyboardTriggeredPreview);
    });
  };

  ctx.bindGlobalListeners = (resizeObserver: ResizeObserver | null) => {
    document.addEventListener('mousedown', ctx.handleMouseDown);
    document.addEventListener('mouseup', ctx.handleMouseUp, true);
    document.addEventListener('mousedown', ctx.handleClickOutside);
    document.addEventListener('keydown', ctx.handleEscape);
    document.addEventListener('keydown', ctx.handleDocumentHistoryShortcut);
    document.addEventListener('keydown', ctx.handleDocumentFormatShortcut);
    document.addEventListener('keydown', ctx.handleEditorKeyboardInteraction);
    document.addEventListener('mousemove', ctx.handleDocumentToolbarPointerMove, true);
    document.addEventListener('mouseover', ctx.handleDocumentToolbarPointerMove, true);
    ctx.toolbarElement.addEventListener('pointerover', ctx.handleToolbarPointerEnter, true);
    ctx.toolbarElement.addEventListener('mouseover', ctx.handleToolbarPointerEnter, true);
    ctx.toolbarElement.addEventListener('mouseenter', ctx.handleToolbarPointerEnter);
    ctx.toolbarElement.addEventListener('mouseleave', ctx.handleToolbarPointerLeave);
    window.addEventListener('resize', ctx.scheduleToolbarUpdate);
    ctx.scrollRoot?.addEventListener('scroll', ctx.scheduleToolbarUpdate, { passive: true });
    resizeObserver?.observe(ctx.editorView.dom);
    resizeObserver?.observe(ctx.toolbarElement);
    if (ctx.scrollRoot) {
      resizeObserver?.observe(ctx.scrollRoot);
    }
    if (ctx.toolbarRoot && ctx.toolbarRoot !== ctx.scrollRoot) {
      resizeObserver?.observe(ctx.toolbarRoot);
    }
  };

  ctx.unbindGlobalListeners = (resizeObserver: ResizeObserver | null) => {
    document.removeEventListener('mousedown', ctx.handleMouseDown);
    document.removeEventListener('mouseup', ctx.handleMouseUp, true);
    document.removeEventListener('mousedown', ctx.handleClickOutside);
    document.removeEventListener('keydown', ctx.handleEscape);
    document.removeEventListener('keydown', ctx.handleDocumentHistoryShortcut);
    document.removeEventListener('keydown', ctx.handleDocumentFormatShortcut);
    document.removeEventListener('keydown', ctx.handleEditorKeyboardInteraction);
    document.removeEventListener('mousemove', ctx.handleDocumentToolbarPointerMove, true);
    document.removeEventListener('mouseover', ctx.handleDocumentToolbarPointerMove, true);
    ctx.toolbarElement.removeEventListener('pointerover', ctx.handleToolbarPointerEnter, true);
    ctx.toolbarElement.removeEventListener('mouseover', ctx.handleToolbarPointerEnter, true);
    ctx.toolbarElement.removeEventListener('mouseenter', ctx.handleToolbarPointerEnter);
    ctx.toolbarElement.removeEventListener('mouseleave', ctx.handleToolbarPointerLeave);
    window.removeEventListener('resize', ctx.scheduleToolbarUpdate);
    ctx.scrollRoot?.removeEventListener('scroll', ctx.scheduleToolbarUpdate);
    resizeObserver?.disconnect();
  };

  ctx.handleMouseDown = (event: MouseEvent) => {
    if (hasActiveAppliedPreview(ctx.editorView) && !ctx.isToolbarEventTarget(event.target)) {
      clearFormatPreview(ctx.editorView);
    }
    ctx.interactionState.isMouseDown = true;
    ctx.interactionState.pendingShow = false;
  };

  ctx.handleMouseUp = () => {
    ctx.interactionState.isMouseDown = false;
    if (isFloatingToolbarSuppressed()) {
      ctx.interactionState.pendingShow = false;
      const pluginState = ctx.toolbarKey.getState(ctx.editorView.state);
      if (pluginState?.subMenu === 'aiReview' && pluginState.aiReview) {
        return;
      }
      hideToolbar(ctx.toolbarElement);
      return;
    }

    if (!ctx.interactionState.pendingShow) {
      return;
    }

    ctx.interactionState.pendingShow = false;
    if (ctx.pendingRaf !== null) {
      cancelAnimationFrame(ctx.pendingRaf);
      ctx.pendingRaf = null;
    }

    ctx.pendingRaf = requestAnimationFrame(() => {
      ctx.pendingRaf = null;
      if (ctx.interactionState.isMouseDown) {
        return;
      }
      if (isFloatingToolbarSuppressed()) {
        return;
      }

      let { selection } = ctx.editorView.state;
      if (selection.empty && ctx.lastTextSelection && hasVisibleNativeRange()) {
        ctx.restoreLastSelection();
        selection = ctx.editorView.state.selection;
      }

      if (hasUsableTextSelection(selection, ctx.editorView.state.doc)) {
        ctx.editorView.dispatch(
          ctx.editorView.state.tr.setMeta(ctx.toolbarKey, {
            type: TOOLBAR_ACTIONS.SHOW,
            payload: {
              selectionRange: {
                from: selection.from,
                to: selection.to,
              },
            },
          })
        );
      }
    });
  };

  ctx.handleToolbarPointerEnter = () => {
    ctx.interactionState.isPointerInsideToolbar = true;
    ctx.restoreLastSelection();
  };

  ctx.handleToolbarPointerLeave = () => {
    ctx.interactionState.isPointerInsideToolbar = false;
    const pluginState = ctx.toolbarKey.getState(ctx.editorView.state);
    if (pluginState?.subMenu === 'aiReview' && pluginState.aiReview) {
      return;
    }

    if (!ctx.editorView.state.selection.empty) {
      ctx.scheduleToolbarUpdate();
      return;
    }

    ctx.editorView.dispatch(
      ctx.editorView.state.tr.setMeta(ctx.toolbarKey, {
        type: TOOLBAR_ACTIONS.HIDE,
      })
    );
  };

  ctx.handleClickOutside = (event: MouseEvent) => {
    if (
      !ctx.toolbarElement ||
      ctx.toolbarElement.contains(event.target as Node) ||
      ctx.selectionToolbarElement.contains(event.target as Node) ||
      ctx.editorView.dom.contains(event.target as Node) ||
      isEditableShortcutTarget(event.target)
    ) {
      return;
    }

    const pluginState = ctx.toolbarKey.getState(ctx.editorView.state);
    if (pluginState?.subMenu === 'aiReview') {
      return;
    }

    const { selection } = ctx.editorView.state;
    if (hasUsableTextSelection(selection, ctx.editorView.state.doc)) {
      const cursorPos = Math.max(0, Math.min(selection.to, ctx.editorView.state.doc.content.size));
      window.getSelection()?.removeAllRanges();
      ctx.editorView.dispatch(
        ctx.editorView.state.tr
          .setSelection(TextSelection.create(ctx.editorView.state.doc, cursorPos))
          .setMeta(ctx.toolbarKey, {
            type: TOOLBAR_ACTIONS.HIDE,
          })
          .setMeta('addToHistory', false)
      );
      return;
    }

    if (!pluginState?.subMenu) {
      return;
    }

    ctx.editorView.dispatch(
      ctx.editorView.state.tr.setMeta(ctx.toolbarKey, {
        type: TOOLBAR_ACTIONS.SET_SUB_MENU,
        payload: { subMenu: null },
      })
    );
  };

  ctx.handleEscape = (event: KeyboardEvent) => {
    if (event.isComposing || event.key !== 'Escape') {
      return;
    }

    const pluginState = ctx.toolbarKey.getState(ctx.editorView.state);
    if (!pluginState?.isVisible) {
      return;
    }

    if (pluginState.subMenu === 'aiReview' && pluginState.aiReview) {
      return;
    }

    abortActiveAiSelectionReview(ctx.editorView);
    clearFormatPreview(ctx.editorView);
    ctx.editorView.dispatch(
      ctx.editorView.state.tr.setMeta(ctx.toolbarKey, {
        type: TOOLBAR_ACTIONS.HIDE,
      })
    );
  };

}
