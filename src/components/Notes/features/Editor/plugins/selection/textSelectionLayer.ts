import type { EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { textSelectionOverlayPluginKey } from './textSelectionOverlayState';
import {
  measureTextSelectionLayerRects,
  type TextSelectionLayerRect,
} from './textSelectionLayerRects';

export { mergeTextSelectionLayerRects } from './textSelectionLayerRects';

export const TEXT_SELECTION_LAYER_CLASS = 'editor-text-selection-layer';
export const TEXT_SELECTION_LAYER_RECT_CLASS = 'editor-text-selection-layer-rect';

const RECT_STYLE_TOLERANCE_PX = 0.01;

interface RenderedState {
  doc: EditorState['doc'];
  pluginState: ReturnType<typeof textSelectionOverlayPluginKey.getState>;
  selection: EditorState['selection'];
}

function getRenderedState(view: EditorView): RenderedState {
  return {
    doc: view.state.doc,
    pluginState: textSelectionOverlayPluginKey.getState(view.state),
    selection: view.state.selection,
  };
}

function hasRenderedStateChanged(previous: RenderedState, next: RenderedState): boolean {
  return previous.doc !== next.doc
    || previous.pluginState !== next.pluginState
    || !previous.selection.eq(next.selection);
}

function areSelectionRectsEqual(previous: TextSelectionLayerRect, next: TextSelectionLayerRect): boolean {
  return Math.abs(previous.height - next.height) <= RECT_STYLE_TOLERANCE_PX
    && Math.abs(previous.left - next.left) <= RECT_STYLE_TOLERANCE_PX
    && Math.abs(previous.top - next.top) <= RECT_STYLE_TOLERANCE_PX
    && Math.abs(previous.width - next.width) <= RECT_STYLE_TOLERANCE_PX;
}

export function installTextSelectionLayer(view: EditorView) {
  const parent = view.dom.parentElement;
  const ownerWindow = view.dom.ownerDocument.defaultView;
  if (!parent || !ownerWindow) return { destroy() {}, refresh() {}, update() {} };

  const layer = view.dom.ownerDocument.createElement('div');
  layer.className = TEXT_SELECTION_LAYER_CLASS;
  layer.setAttribute('aria-hidden', 'true');
  parent.insertBefore(layer, view.dom.nextSibling);
  const elements: HTMLElement[] = [];
  let renderedRects: TextSelectionLayerRect[] = [];
  let requestedState = getRenderedState(view);
  let frame: number | null = null;

  const render = () => {
    frame = null;
    const rects = measureTextSelectionLayerRects(view, layer);
    rects.forEach((rect, index) => {
      const element = elements[index] ?? layer.appendChild(
        Object.assign(view.dom.ownerDocument.createElement('div'), {
          className: TEXT_SELECTION_LAYER_RECT_CLASS,
        }),
      );
      elements[index] = element;
      const previous = renderedRects[index];
      if (!previous || !areSelectionRectsEqual(previous, rect)) {
        element.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
        element.style.width = `${rect.width}px`;
        element.style.height = `${rect.height}px`;
      }
      if (element.hidden) element.hidden = false;
    });
    for (let index = rects.length; index < elements.length; index += 1) {
      if (!elements[index].hidden) elements[index].hidden = true;
    }
    const nextCount = String(rects.length);
    if (layer.dataset.editorSelectionRectCount !== nextCount) {
      layer.dataset.editorSelectionRectCount = nextCount;
    }
    const nextHidden = rects.length === 0;
    if (layer.hidden !== nextHidden) layer.hidden = nextHidden;
    renderedRects = rects;
  };
  const schedule = () => {
    if (frame !== null) return;
    frame = ownerWindow.requestAnimationFrame(render);
  };
  const update = (immediate = false) => {
    const nextState = getRenderedState(view);
    if (!hasRenderedStateChanged(requestedState, nextState)) return;
    requestedState = nextState;
    if (!immediate) {
      schedule();
      return;
    }
    if (frame !== null) ownerWindow.cancelAnimationFrame(frame);
    render();
  };
  const scrollRoot = view.dom.closest<HTMLElement>('[data-note-scroll-root="true"]');
  const ResizeObserverCtor = ownerWindow.ResizeObserver;
  const resizeObserver = ResizeObserverCtor ? new ResizeObserverCtor(schedule) : null;
  resizeObserver?.observe(view.dom);
  scrollRoot?.addEventListener('scroll', schedule, { passive: true });
  ownerWindow.addEventListener('resize', schedule);
  schedule();

  return {
    destroy() {
      if (frame !== null) ownerWindow.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      scrollRoot?.removeEventListener('scroll', schedule);
      ownerWindow.removeEventListener('resize', schedule);
      layer.remove();
    },
    refresh: schedule,
    update,
  };
}
