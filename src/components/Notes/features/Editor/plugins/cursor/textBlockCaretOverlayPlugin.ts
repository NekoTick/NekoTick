import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  createCaretOverlayRect,
  createCaretOverlayStyle,
  holdCaretBlink,
  isCaretNavigationKey,
  releaseCaretBlink,
} from '@/lib/ui/caretOverlayStyles';
import { isTagTokenBoundary } from './textBlockCaretTagBoundary';
import { resolveTextBlockCaretLineHeight } from './textBlockCaretGeometry';
import { isBlockSelectionInteractionPending } from './blockSelectionInteractionState';

export { isTagTokenBoundaryAtTextblock } from './textBlockCaretTagBoundary';

const TEXTBLOCK_CARET_CLASS = 'editor-textblock-caret-overlay-active';
const TEXTBLOCK_CARET_STYLE_ID = 'editor-textblock-caret-overlay-style';
const TEXTBLOCK_CARET_ELEMENT_CLASS = 'editor-textblock-caret-overlay';
const FORCED_LINE_END_CARET_CLASS = 'editor-forced-line-end-caret-active';
const KEY_EVENT_LISTENER_OPTIONS = { capture: true };
export const TEXTBLOCK_CARET_OVERLAY_REFRESH_EVENT = 'editor:textblock-caret-overlay-refresh';

export const textBlockCaretOverlayPluginKey = new PluginKey('textBlockCaretOverlay');

function ensureTextBlockCaretStyle(doc: Document): void {
  if (doc.getElementById(TEXTBLOCK_CARET_STYLE_ID)) return;

  const style = doc.createElement('style');
  style.id = TEXTBLOCK_CARET_STYLE_ID;
  style.textContent = createCaretOverlayStyle({
    activeSelector: `.ProseMirror.${TEXTBLOCK_CARET_CLASS}`,
    caretClass: TEXTBLOCK_CARET_ELEMENT_CLASS,
    keyframesName: 'editor-textblock-caret-blink',
  });
  doc.head.appendChild(style);
}

export function shouldShowTextBlockCaretOverlay(view: EditorView): boolean {
  if (isBlockSelectionInteractionPending(view.dom)) return false;
  if (!view.hasFocus()) return false;
  if (view.composing) return false;
  if (view.dom.classList.contains(FORCED_LINE_END_CARET_CLASS)) return false;

  const { selection } = view.state;
  if (!selection.empty) return false;

  return selection.$from.parent.isTextblock;
}

function isVerticalCaretNavigationKey(event: Pick<KeyboardEvent, 'key'>): boolean {
  return event.key === 'ArrowDown' || event.key === 'ArrowUp';
}

function resolveRangeRect(node: Node, fromOffset: number, toOffset: number): DOMRect | null {
  if (node.nodeType !== Node.TEXT_NODE) {
    return null;
  }

  const textLength = node.textContent?.length ?? 0;
  if (fromOffset < 0 || toOffset > textLength || fromOffset >= toOffset) {
    return null;
  }

  const ownerDocument = node.ownerDocument;
  if (!ownerDocument) {
    return null;
  }

  const range = ownerDocument.createRange();
  range.setStart(node, fromOffset);
  range.setEnd(node, toOffset);
  const rect = range.getBoundingClientRect();
  range.detach();

  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.right) || rect.width <= 0) {
    return null;
  }

  return rect;
}

function resolvePreviousCharacterRight(view: EditorView): number | null {
  const { selection } = view.state;
  const previousPos = selection.head > 0 ? selection.head - 1 : null;
  if (previousPos === null) {
    return null;
  }

  const previousDom = view.domAtPos(previousPos);
  const rect = resolveRangeRect(previousDom.node, previousDom.offset, previousDom.offset + 1);

  return rect?.right ?? null;
}

export class TextBlockCaretOverlayView {
  private caret: HTMLElement | null = null;
  private frameId: number | null = null;
  private keyboardCaretNavigationActive = false;
  private pendingVerticalNavigationHead: number | null = null;
  private readonly resizeObserver: ResizeObserver | null = null;

  constructor(private view: EditorView) {
    ensureTextBlockCaretStyle(view.dom.ownerDocument);
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(this.scheduleUpdate);
    view.dom.addEventListener('focus', this.scheduleUpdate);
    view.dom.addEventListener('blur', this.hide);
    view.dom.addEventListener('keydown', this.handleKeyDown, KEY_EVENT_LISTENER_OPTIONS);
    view.dom.addEventListener('keyup', this.handleKeyUp, KEY_EVENT_LISTENER_OPTIONS);
    view.dom.addEventListener('compositionstart', this.hide);
    view.dom.addEventListener('compositionend', this.scheduleUpdate);
    view.dom.addEventListener(TEXTBLOCK_CARET_OVERLAY_REFRESH_EVENT, this.refreshNow);
    view.dom.ownerDocument.addEventListener('selectionchange', this.scheduleUpdate);
    view.dom.ownerDocument.defaultView?.addEventListener('resize', this.scheduleUpdate);
    view.dom.closest('[data-note-scroll-root="true"]')?.addEventListener('scroll', this.scheduleUpdate, { passive: true });
    this.resizeObserver?.observe(view.dom);
    const scrollRoot = view.dom.closest('[data-note-scroll-root="true"]');
    if (scrollRoot) {
      this.resizeObserver?.observe(scrollRoot);
    }
    this.scheduleUpdate();
  }

  update(updatedView: EditorView): void {
    this.view = updatedView;
    this.scheduleUpdate();
  }

  destroy(): void {
    this.cancelFrame();
    this.view.dom.removeEventListener('focus', this.scheduleUpdate);
    this.view.dom.removeEventListener('blur', this.hide);
    this.view.dom.removeEventListener('keydown', this.handleKeyDown, KEY_EVENT_LISTENER_OPTIONS);
    this.view.dom.removeEventListener('keyup', this.handleKeyUp, KEY_EVENT_LISTENER_OPTIONS);
    this.view.dom.removeEventListener('compositionstart', this.hide);
    this.view.dom.removeEventListener('compositionend', this.scheduleUpdate);
    this.view.dom.removeEventListener(TEXTBLOCK_CARET_OVERLAY_REFRESH_EVENT, this.refreshNow);
    this.view.dom.ownerDocument.removeEventListener('selectionchange', this.scheduleUpdate);
    this.view.dom.ownerDocument.defaultView?.removeEventListener('resize', this.scheduleUpdate);
    this.view.dom.closest('[data-note-scroll-root="true"]')?.removeEventListener('scroll', this.scheduleUpdate);
    this.resizeObserver?.disconnect();
    this.hide();
  }

  private scheduleUpdate = (): void => {
    if (this.frameId !== null) return;

    const ownerWindow = this.view.dom.ownerDocument.defaultView;
    if (!ownerWindow) return;

    this.frameId = ownerWindow.requestAnimationFrame(() => {
      this.frameId = null;
      this.render();
    });
  };

  private cancelFrame(): void {
    if (this.frameId === null) return;
    this.view.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private refreshNow = (): void => {
    this.cancelFrame();
    this.render();
  };

  private removeCaretOverlay(): void {
    releaseCaretBlink(this.caret);
    this.caret?.remove();
    this.caret = null;
    this.view.dom.classList.remove(TEXTBLOCK_CARET_CLASS);
  }

  private hide = (): void => {
    this.keyboardCaretNavigationActive = false;
    this.pendingVerticalNavigationHead = null;
    this.removeCaretOverlay();
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;

    if (isCaretNavigationKey(event)) {
      this.keyboardCaretNavigationActive = true;
      if (isVerticalCaretNavigationKey(event)) {
        const { selection } = this.view.state;
        this.pendingVerticalNavigationHead = selection.empty ? selection.head : null;
        this.removeCaretOverlay();
      } else {
        holdCaretBlink(this.caret, null);
      }
    }
    this.scheduleUpdate();
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    if (event.isComposing) return;

    if (isCaretNavigationKey(event)) {
      this.keyboardCaretNavigationActive = false;
      if (isVerticalCaretNavigationKey(event)) {
        this.pendingVerticalNavigationHead = null;
      }
      holdCaretBlink(this.caret);
    }
    this.scheduleUpdate();
  };

  private keepLastCaretVisibleDuringKeyboardNavigation(): boolean {
    if (!this.keyboardCaretNavigationActive || !this.caret) {
      return false;
    }

    holdCaretBlink(this.caret, null);
    this.view.dom.classList.add(TEXTBLOCK_CARET_CLASS);
    return true;
  }

  private render(): void {
    if (this.view.dom.classList.contains(FORCED_LINE_END_CARET_CLASS)) {
      this.hide();
      return;
    }

    if (!shouldShowTextBlockCaretOverlay(this.view)) {
      if (this.keepLastCaretVisibleDuringKeyboardNavigation()) {
        return;
      }
      this.hide();
      return;
    }

    if (
      this.pendingVerticalNavigationHead !== null &&
      this.view.state.selection.empty &&
      this.view.state.selection.head === this.pendingVerticalNavigationHead
    ) {
      this.removeCaretOverlay();
      return;
    }
    this.pendingVerticalNavigationHead = null;

    let rect: { left: number; top: number; bottom: number };
    try {
      rect = this.view.coordsAtPos(this.view.state.selection.head);
    } catch {
      if (this.keepLastCaretVisibleDuringKeyboardNavigation()) {
        return;
      }
      this.hide();
      return;
    }

    const doc = this.view.dom.ownerDocument;
    if (!this.caret) {
      this.caret = doc.createElement('div');
      this.caret.className = TEXTBLOCK_CARET_ELEMENT_CLASS;
      doc.body.appendChild(this.caret);
    }

    let overlayRect = createCaretOverlayRect(
      rect,
      resolveTextBlockCaretLineHeight(this.view, this.view.state.selection.head),
    );
    const previousCharacterRight = isTagTokenBoundary(this.view)
      ? resolvePreviousCharacterRight(this.view)
      : null;
    if (previousCharacterRight !== null) {
      overlayRect = {
        ...overlayRect,
        left: previousCharacterRight,
      };
    }
    this.caret.style.left = `${overlayRect.left}px`;
    this.caret.style.top = `${overlayRect.top}px`;
    this.caret.style.height = `${overlayRect.height}px`;
    holdCaretBlink(this.caret, this.keyboardCaretNavigationActive ? null : undefined);
    this.view.dom.classList.add(TEXTBLOCK_CARET_CLASS);
  }
}

export const textBlockCaretOverlayPlugin = $prose(() => {
  return new Plugin({
    key: textBlockCaretOverlayPluginKey,
    view: (view) => new TextBlockCaretOverlayView(view),
  });
});
