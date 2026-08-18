import type { EditorView } from '@milkdown/kit/prose/view';
import { selectMarkdownTypewriterModeEnabled } from '@/stores/unified/settings/markdownSettings';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { TEXTBLOCK_CARET_OVERLAY_REFRESH_EVENT } from '../cursor/textBlockCaretOverlayPlugin';
import {
  isTypewriterInputEvent,
  isTypewriterKeyEvent,
  resolveTypewriterScrollTop,
  shouldCenterTypewriterSelection,
  shouldUpdateTypewriterScrollTop,
} from './typewriterModeRules';

const SCROLL_ROOT_SELECTOR = '[data-note-scroll-root="true"]';
const INPUT_EVENT_LISTENER_OPTIONS = { capture: true };

interface RectLike {
  top: number;
  bottom: number;
}

export class TypewriterModeView {
  private enabled = selectMarkdownTypewriterModeEnabled(useUnifiedStore.getState());
  private frameId: number | null = null;
  private scrollRoot: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private pointerDown = false;
  private pendingInputCenter = false;

  constructor(private readonly view: EditorView) {
    this.unsubscribe = useUnifiedStore.subscribe((state, previousState) => {
      const nextEnabled = selectMarkdownTypewriterModeEnabled(state);
      if (nextEnabled === selectMarkdownTypewriterModeEnabled(previousState)) return;
      this.enabled = nextEnabled;
      if (!nextEnabled) {
        this.pendingInputCenter = false;
        this.cancelPendingFrame();
      }
    });
    this.view.dom.addEventListener('pointerdown', this.handlePointerDown);
    this.view.dom.addEventListener('beforeinput', this.handleBeforeInput, INPUT_EVENT_LISTENER_OPTIONS);
    this.view.dom.addEventListener('keydown', this.handleKeyDown, INPUT_EVENT_LISTENER_OPTIONS);
  }

  update(view: EditorView, prevState: EditorView['state']): void {
    if (!this.pendingInputCenter) return;

    this.pendingInputCenter = false;
    if (!this.enabled) return;
    if (!view.hasFocus()) return;
    if (this.pointerDown) return;
    if (!shouldCenterTypewriterSelection(view.state.selection)) return;
    if (view.state.doc !== prevState.doc) {
      this.scheduleCenter();
    }
  }

  destroy(): void {
    this.cancelPendingFrame();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.view.dom.removeEventListener('pointerdown', this.handlePointerDown);
    this.view.dom.removeEventListener('beforeinput', this.handleBeforeInput, INPUT_EVENT_LISTENER_OPTIONS);
    this.view.dom.removeEventListener('keydown', this.handleKeyDown, INPUT_EVENT_LISTENER_OPTIONS);
    this.view.dom.ownerDocument.defaultView?.removeEventListener('pointerup', this.handlePointerUp);
    this.view.dom.ownerDocument.defaultView?.removeEventListener('pointercancel', this.handlePointerUp);
    this.view.dom.ownerDocument.defaultView?.removeEventListener('blur', this.handlePointerUp);
  }

  private handleBeforeInput = (event: Event): void => {
    if (!this.enabled) return;
    if (!(event instanceof InputEvent)) return;
    if (!isTypewriterInputEvent(event)) return;
    this.pendingInputCenter = true;
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    if (!isTypewriterKeyEvent(event)) return;
    this.pendingInputCenter = true;
  };

  private handlePointerDown = (): void => {
    this.pointerDown = true;
    this.pendingInputCenter = false;
    this.cancelPendingFrame();

    const ownerWindow = this.view.dom.ownerDocument.defaultView;
    ownerWindow?.addEventListener('pointerup', this.handlePointerUp, { once: true });
    ownerWindow?.addEventListener('pointercancel', this.handlePointerUp, { once: true });
    ownerWindow?.addEventListener('blur', this.handlePointerUp, { once: true });
  };

  private handlePointerUp = (): void => {
    this.pointerDown = false;
    const ownerWindow = this.view.dom.ownerDocument.defaultView;
    ownerWindow?.removeEventListener('pointerup', this.handlePointerUp);
    ownerWindow?.removeEventListener('pointercancel', this.handlePointerUp);
    ownerWindow?.removeEventListener('blur', this.handlePointerUp);
  };

  private scheduleCenter(): void {
    if (this.frameId !== null) return;

    const ownerWindow = this.view.dom.ownerDocument.defaultView;
    if (!ownerWindow) return;

    this.frameId = ownerWindow.requestAnimationFrame(() => {
      this.frameId = null;
      this.centerCursor();
    });
  }

  private cancelPendingFrame(): void {
    if (this.frameId === null) return;
    this.view.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private getScrollRoot(): HTMLElement | null {
    if (
      this.scrollRoot?.isConnected &&
      this.scrollRoot.matches(SCROLL_ROOT_SELECTOR) &&
      this.scrollRoot.contains(this.view.dom)
    ) {
      return this.scrollRoot;
    }

    this.scrollRoot = this.view.dom.closest<HTMLElement>(SCROLL_ROOT_SELECTOR);
    return this.scrollRoot;
  }

  private centerCursor(): void {
    if (!this.enabled) return;
    if (this.pointerDown) return;
    if (!shouldCenterTypewriterSelection(this.view.state.selection)) return;

    const scrollRoot = this.getScrollRoot();
    if (!scrollRoot) return;

    let cursorRect: RectLike;
    try {
      cursorRect = this.view.coordsAtPos(this.view.state.selection.head);
    } catch {
      return;
    }

    const nextScrollTop = resolveTypewriterScrollTop({
      scrollTop: scrollRoot.scrollTop,
      scrollHeight: scrollRoot.scrollHeight,
      clientHeight: scrollRoot.clientHeight,
      rootRect: scrollRoot.getBoundingClientRect(),
      cursorRect,
    });
    if (!shouldUpdateTypewriterScrollTop(scrollRoot.scrollTop, nextScrollTop)) return;

    scrollRoot.scrollTop = nextScrollTop;
    this.view.dom.dispatchEvent(new Event(TEXTBLOCK_CARET_OVERLAY_REFRESH_EVENT));
  }
}
