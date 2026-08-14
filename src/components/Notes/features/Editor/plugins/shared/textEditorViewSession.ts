import { themeDomStyleTokens, themeUiFeedbackTokens } from '@/styles/themeTokens';
import { getScrollRoot } from '../floating-toolbar/floatingToolbarDom';
import { createTextEditorAnchorPositionRefreshScheduler } from './textEditorAnchorPositionRefresh';
import { createTextEditorOutsideMouseDownSuppression } from './textEditorOutsideMouseDownSuppression';
import { createTextEditorPopupAnchorResizeTracker } from './textEditorPopupAnchorResize';
import { mountTextEditorPopup } from './textEditorPopupDom';
import { resolveTextEditorPopupPlacement } from './textEditorPopupPlacement';
import { createTextEditorPopupVisibilityScrollScheduler } from './textEditorPopupVisibilityScroll';
import { createTextEditorPreviewScheduler } from './textEditorPreviewScheduler';
import { createTextEditorTextareaFocusController } from './textEditorTextareaFocus';
import { createTextEditorTextareaResizeController } from './textEditorTextareaResize';
import type {
  CreateTextEditorViewSessionArgs,
  TextEditorSessionActionArgs,
  TextEditorSessionRefs,
  TextEditorSessionState,
} from './textEditorViewSessionTypes';
import { markEditorUserInput } from './userInputEvents';

export type {
  CreateTextEditorViewSessionArgs,
  TextEditorPreviewArgs,
  TextEditorSessionActionArgs,
  TextEditorSessionRefs,
  TextEditorSessionState
} from './textEditorViewSessionTypes';

export function createTextEditorViewSession<
  TState extends TextEditorSessionState,
  TRefs extends TextEditorSessionRefs,
>(args: CreateTextEditorViewSessionArgs<TState, TRefs>) {
  const {
    editorView,
    onOutsideCloseIntent,
    refs,
    popupClassName,
    popupLayout = 'anchored',
    placeholder,
    getEditorState,
    getStateRenderKey,
    getValue,
    setInitialValue,
    setDraftValue,
    getInitialValue,
    resetRefs,
    resolveAnchorElement,
    getAnchorViewportPosition,
    preferStatePositionOnInitialRender,
    scrollPopupIntoViewOnInitialRender,
    constrainTextareaHeightToViewport = true,
    resizeTextareaToContent = true,
    configurePopup,
    previewInput,
    previewInputDebounceMs = themeUiFeedbackTokens.editorTextEditorLivePreviewDebounceMs,
    previewCancel,
    cancelSession,
    saveSession,
  } = args;
  const isViewportCentered = popupLayout === 'viewport-centered';
  let editorElement: HTMLElement | null = null;
  let popupCleanup: (() => void) | null = null;
  let renderedKey: string | null = null;
  let isComposing = false;
  const scrollRoot = getScrollRoot(editorView);
  const contentRoot = editorView.dom.closest('[data-note-content-root="true"]') as HTMLElement | null;
  const positionRoot = isViewportCentered ? null : contentRoot ?? scrollRoot;
  const outsideMouseDownSuppression = createTextEditorOutsideMouseDownSuppression();
  const previewScheduler = createTextEditorPreviewScheduler(previewInput, previewInputDebounceMs);
  const textareaResizeController = createTextEditorTextareaResizeController({
    getEditorElement: () => editorElement,
    getTextarea: () => refs.textareaElement,
    constrainToViewport: constrainTextareaHeightToViewport,
    idleDelayMs: editorView.dom.closest('[data-note-lazy-block-visibility="true"]')
      ? themeUiFeedbackTokens.editorTextEditorLivePreviewDebounceMs
      : 0,
  });
  const textareaFocusController = createTextEditorTextareaFocusController(() => refs.textareaElement);
  const popupVisibilityScrollScheduler = createTextEditorPopupVisibilityScrollScheduler({
    shouldScroll: Boolean(scrollPopupIntoViewOnInitialRender),
    scrollIntoView: () => editorElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
  });

  const resolveCurrentAnchorElement = (state: TState | undefined) => {
    if (!state?.isOpen) {
      return null;
    }

    const nodeDom = typeof editorView.nodeDOM === 'function' ? editorView.nodeDOM(state.nodePos) : null;
    return resolveAnchorElement(state, nodeDom);
  };

  const clearEditorElements = () => {
    popupCleanup?.();
    popupCleanup = null;
    if (editorElement) {
      editorElement.remove();
    }
    editorElement = null;
    refs.textareaElement = null;
  };

  const resetSessionDom = () => {
    previewScheduler.clear();
    textareaResizeController.clear();
    popupVisibilityScrollScheduler.clear();
    clearEditorElements();
    resetRefs(refs);
    renderedKey = null;
    isComposing = false;
  };

  const getSessionActionArgs = (): TextEditorSessionActionArgs<TState, TRefs> => ({
    editorView,
    refs,
    getEditorState,
    resetSessionDom,
  });

  const handleClickOutside = (event: MouseEvent) => {
    if (outsideMouseDownSuppression.isSuppressed()) {
      return;
    }

    const target = event.target as Node;
    const isOutside = editorElement && (
      !editorElement.contains(target) || (isViewportCentered && target === editorElement)
    );
    if (isOutside) {
      if (isComposing) {
        return;
      }
      onOutsideCloseIntent();
      previewScheduler.clear();
      saveSession(getSessionActionArgs());
    }
  };

  const resolveViewportPosition = (state: TState) => {
    const anchor = resolveCurrentAnchorElement(state);
    return anchor ? getAnchorViewportPosition(anchor) : state.position;
  };

  const updateEditorPosition = (state: TState, options?: {
    deferAnchorUpdate?: boolean;
    deferResize?: boolean;
    useStatePosition?: boolean;
  }) => {
    if (!editorElement) {
      return;
    }

    if (isViewportCentered) {
      textareaResizeController.clear();
      anchorResizeTracker.update();
      return;
    }

    const nextPosition = resolveTextEditorPopupPlacement({
      editorView,
      positionRoot,
      viewportPosition: options?.useStatePosition ? state.position : resolveViewportPosition(state),
    });
    const popupWidth = `${Math.round(nextPosition.width)}px`;
    editorElement.style.setProperty('--vlaina-text-editor-popup-width', popupWidth);
    editorElement.style.setProperty('--vlaina-math-editor-width', popupWidth);
    editorElement.style.setProperty('--vlaina-width-math-editor', popupWidth);
    editorElement.style.setProperty('--vlaina-width-math-editor-mobile', popupWidth);
    editorElement.style.left = `${nextPosition.x}px`;
    editorElement.style.top = `${nextPosition.y}px`;
    const popupViewportTop = Math.max(0, editorElement.getBoundingClientRect().top);
    editorElement.style.setProperty(
      '--vlaina-height-text-editor-popup-available',
      `calc(100vh - ${popupViewportTop}px - var(--vlaina-space-12px))`,
    );

    if (options?.deferResize) {
      textareaResizeController.schedule();
    } else {
      textareaResizeController.clear();
      textareaResizeController.resizeToContent();
    }

    if (!options?.deferAnchorUpdate) {
      anchorResizeTracker.update();
    }
  };

  const anchorResizeTracker = createTextEditorPopupAnchorResizeTracker({
    resolveAnchor: () => resolveCurrentAnchorElement(getEditorState()),
    onAnchorResize() {
      const state = getEditorState();
      if (state?.isOpen) {
        updateEditorPosition(state);
      }
    },
  });
  const anchorPositionRefreshScheduler = createTextEditorAnchorPositionRefreshScheduler({
    getEditorState,
    updateEditorPosition,
  });

  const ensureEditorElement = () => {
    if (editorElement) {
      return editorElement;
    }

    editorElement = document.createElement('div');
    editorElement.className = popupClassName;
    editorElement.style.position = isViewportCentered || !positionRoot ? 'fixed' : 'absolute';
    editorElement.style.zIndex = themeDomStyleTokens.zIndexTextEditorPopup;
    (positionRoot ?? document.body).appendChild(editorElement);
    return editorElement;
  };

  const renderEditor = (state: TState) => {
    const container = ensureEditorElement();
    popupCleanup?.();
    popupCleanup = null;
    const value = getValue(state);
    setInitialValue(refs, value);
    setDraftValue(refs, value);

    const { textarea, cleanup } = mountTextEditorPopup({
      container,
      value,
      placeholder,
      onResizeRequest: resizeTextareaToContent
        ? textareaResizeController.schedule
        : () => undefined,
      onInput(nextValue) {
        markEditorUserInput(editorView);
        setDraftValue(refs, nextValue);
        previewScheduler.schedule({
          state,
          refs,
          value: nextValue,
          resolveAnchor: () => resolveCurrentAnchorElement(getEditorState()),
          scheduleResize: anchorResizeTracker.scheduleResize,
        });
      },
      onCancel() {
        previewScheduler.clear();
        previewCancel({
          state,
          refs,
          value: getInitialValue(refs),
          resolveAnchor: () => resolveCurrentAnchorElement(getEditorState()),
          scheduleResize: anchorResizeTracker.scheduleResize,
        });
        cancelSession(getSessionActionArgs());
      },
      onSave() {
        if (isComposing) {
          return;
        }
        previewScheduler.clear();
        saveSession(getSessionActionArgs());
      },
      onCompositionStart() {
        isComposing = true;
      },
      onCompositionEnd() {
        isComposing = false;
      },
      configurePopup,
    });

    popupCleanup = cleanup ?? null;
    refs.textareaElement = textarea;
    renderedKey = getStateRenderKey(state);
    outsideMouseDownSuppression.schedule();
    textareaFocusController.focusAtEnd();
  };

  window.addEventListener('mousedown', handleClickOutside, true);

  return {
    update() {
      const state = getEditorState();

      if (!state?.isOpen) {
        anchorResizeTracker.update();
        resetSessionDom();
        return;
      }

      const nextRenderedKey = getStateRenderKey(state);
      let didRenderEditor = false;
      if (renderedKey !== nextRenderedKey || !refs.textareaElement) {
        renderEditor(state);
        didRenderEditor = true;
      }

      const useInitialStatePosition = didRenderEditor && Boolean(preferStatePositionOnInitialRender?.(state));
      updateEditorPosition(state, {
        deferAnchorUpdate: useInitialStatePosition,
        deferResize: didRenderEditor,
        useStatePosition: useInitialStatePosition,
      });
      if (useInitialStatePosition) {
        anchorPositionRefreshScheduler.schedule();
      }
      if (didRenderEditor) {
        popupVisibilityScrollScheduler.schedule();
      }
    },
    destroy() {
      window.removeEventListener('mousedown', handleClickOutside, true);
      outsideMouseDownSuppression.clear();
      anchorPositionRefreshScheduler.clear();
      popupVisibilityScrollScheduler.clear();
      textareaResizeController.clear();
      previewScheduler.clear();
      textareaFocusController.clear();
      anchorResizeTracker.destroy();
      resetSessionDom();
      isComposing = false;
    },
  };
}
