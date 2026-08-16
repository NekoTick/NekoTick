import { $prose } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import { createTextEditorHoverPrewarm } from '../shared/textEditorHoverPrewarm';
import { shouldSuppressPreviewEditorOpen } from '../shared/previewContextMenuSuppression';
import {
  findMermaidEditorTargetElement,
  isMermaidScrollbarPointerDown,
  isSelectedScrollableMermaidElement,
  resolveMermaidEditorPointerOpen,
} from './mermaidEditorOpenInteraction';
import { mermaidEditorPluginKey } from './mermaidEditorPluginKey';
import { prewarmMermaidEditor } from './mermaidEditorPrewarm';
import { createClosedMermaidEditorState } from './mermaidEditorState';
import { createMermaidEditorViewSession } from './mermaidEditorViewSession';
import type { MermaidEditorState } from './types';

function getSuppressDeadline() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

const SUPPRESS_CLICK_AFTER_POINTER_OPEN_MS = 250;

export const mermaidEditorPlugin = $prose(() => {
  let suppressOpenUntil = 0;
  let suppressClickUntil = 0;

  const shouldIgnoreOpen = (state: MermaidEditorState | null | undefined) => {
    if (state?.isOpen) {
      return true;
    }

    return getSuppressDeadline() < suppressOpenUntil;
  };

  return new Plugin({
    key: mermaidEditorPluginKey,
    state: {
      init: () => createClosedMermaidEditorState(),
      apply(tr, state) {
        const meta = tr.getMeta(mermaidEditorPluginKey);
        if (meta) {
          return { ...state, ...meta };
        }

        return state;
      },
    },
    props: {
      handleDOMEvents: {
        click(view, event) {
          const mermaidElement = findMermaidEditorTargetElement(view, event.target);
          if (
            mermaidElement &&
            event instanceof MouseEvent &&
            (
              isMermaidScrollbarPointerDown({ event, mermaidElement }) ||
              isSelectedScrollableMermaidElement(mermaidElement)
            )
          ) {
            event.preventDefault();
            suppressClickUntil = getSuppressDeadline() + SUPPRESS_CLICK_AFTER_POINTER_OPEN_MS;
            return true;
          }

          return false;
        },
        mousedown(view, event) {
          const mermaidElement = findMermaidEditorTargetElement(view, event.target);

          if (shouldSuppressPreviewEditorOpen() && mermaidElement) {
            event.preventDefault();
            suppressClickUntil = getSuppressDeadline() + SUPPRESS_CLICK_AFTER_POINTER_OPEN_MS;
            return true;
          }

          if (shouldIgnoreOpen(mermaidEditorPluginKey.getState(view.state) as MermaidEditorState | undefined)) {
            return false;
          }

          if (!(event instanceof MouseEvent) || event.button !== 0) {
            return false;
          }

          if (mermaidElement && isSelectedScrollableMermaidElement(mermaidElement)) {
            suppressClickUntil = getSuppressDeadline() + SUPPRESS_CLICK_AFTER_POINTER_OPEN_MS;
            return false;
          }

          const openRequest = resolveMermaidEditorPointerOpen({
            view: view as never,
            target: event.target,
          });
          if (!openRequest) {
            return false;
          }

          if (isMermaidScrollbarPointerDown({ event, mermaidElement: openRequest.mermaidElement })) {
            suppressClickUntil = getSuppressDeadline() + SUPPRESS_CLICK_AFTER_POINTER_OPEN_MS;
            return false;
          }

          event.preventDefault();
          suppressClickUntil = getSuppressDeadline() + SUPPRESS_CLICK_AFTER_POINTER_OPEN_MS;
          view.dispatch(view.state.tr.setMeta(mermaidEditorPluginKey, openRequest.meta));
          return true;
        },
        mouseup(view, event) {
          const mermaidElement = findMermaidEditorTargetElement(view, event.target);
          if (
            mermaidElement &&
            event instanceof MouseEvent &&
            (
              isMermaidScrollbarPointerDown({ event, mermaidElement }) ||
              isSelectedScrollableMermaidElement(mermaidElement)
            )
          ) {
            event.preventDefault();
            suppressClickUntil = getSuppressDeadline() + SUPPRESS_CLICK_AFTER_POINTER_OPEN_MS;
            return true;
          }

          return false;
        },
      },
      handleClick(view, _pos, event) {
        const mermaidElement = findMermaidEditorTargetElement(view, event.target);

        if (getSuppressDeadline() < suppressClickUntil) {
          event.preventDefault();
          return true;
        }

        if (!mermaidElement) {
          return false;
        }

        if (shouldSuppressPreviewEditorOpen()) {
          event.preventDefault();
          return true;
        }

        if (shouldIgnoreOpen(mermaidEditorPluginKey.getState(view.state) as MermaidEditorState | undefined)) {
          return false;
        }

        if (isSelectedScrollableMermaidElement(mermaidElement)) {
          event.preventDefault();
          return true;
        }

        if (isMermaidScrollbarPointerDown({ event, mermaidElement })) {
          return false;
        }

        const openRequest = resolveMermaidEditorPointerOpen({
          view: view as never,
          target: event.target,
        });
        if (!openRequest) {
          return false;
        }

        view.dispatch(view.state.tr.setMeta(mermaidEditorPluginKey, openRequest.meta));
        return true;
      },
    },
    view(editorView) {
      const documentRef = editorView.dom.ownerDocument;
      const hoverPrewarm = createTextEditorHoverPrewarm({
        editorDom: editorView.dom,
        findTarget: (target) => findMermaidEditorTargetElement(editorView, target),
        prewarm: () => {
          const state = mermaidEditorPluginKey.getState(editorView.state) as MermaidEditorState | undefined;
          return state?.isOpen ? undefined : prewarmMermaidEditor();
        },
      });
      const suppressSelectedScrollableMermaidOpen = (event: MouseEvent) => {
        const mermaidElement = findMermaidEditorTargetElement(editorView, event.target);
        if (!mermaidElement || !isSelectedScrollableMermaidElement(mermaidElement)) {
          return;
        }

        suppressClickUntil = getSuppressDeadline() + SUPPRESS_CLICK_AFTER_POINTER_OPEN_MS;
        if (event.type !== 'mousedown') {
          event.preventDefault();
        }
        event.stopPropagation();
      };
      documentRef.addEventListener('mousedown', suppressSelectedScrollableMermaidOpen, true);
      documentRef.addEventListener('mouseup', suppressSelectedScrollableMermaidOpen, true);
      documentRef.addEventListener('click', suppressSelectedScrollableMermaidOpen, true);

      const session = createMermaidEditorViewSession({
        editorView,
        onOutsideCloseIntent() {
          suppressOpenUntil = getSuppressDeadline() + 120;
        },
      });

      return {
        update: session.update,
        destroy() {
          hoverPrewarm.destroy();
          documentRef.removeEventListener('mousedown', suppressSelectedScrollableMermaidOpen, true);
          documentRef.removeEventListener('mouseup', suppressSelectedScrollableMermaidOpen, true);
          documentRef.removeEventListener('click', suppressSelectedScrollableMermaidOpen, true);
          session.destroy();
        },
      };
    },
  });
});
