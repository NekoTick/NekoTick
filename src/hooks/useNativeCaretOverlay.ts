import { useEffect } from 'react';
import {
  createCaretOverlayRect,
  createCaretOverlayStyle,
  holdCaretBlink,
  isCaretNavigationKey,
  releaseCaretBlink,
  resolveElementLineHeight,
} from '@/lib/ui/caretOverlayStyles';
import {
  getControlCaretRect,
  isCaretOverlayVisuallyVisible,
  isTextControl,
} from './nativeCaretOverlayGeometry';

const STYLE_ID = 'native-caret-overlay-style';
const CARET_CLASS = 'native-caret-overlay';
const ACTIVE_ATTR = 'data-native-caret-overlay-active';
export const NATIVE_CARET_OVERLAY_REFRESH_EVENT = 'vlaina:native-caret-overlay-refresh';

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;

  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = createCaretOverlayStyle({
    activeSelector: `[${ACTIVE_ATTR}='true']`,
    caretClass: CARET_CLASS,
    keyframesName: 'native-caret-blink',
  });
  doc.head.appendChild(style);
}

export function requestNativeCaretOverlayRefresh(): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.dispatchEvent(new Event(NATIVE_CARET_OVERLAY_REFRESH_EVENT));
}

export function useNativeCaretOverlay(): void {
  useEffect(() => {
    const doc = document;
    ensureStyle(doc);

    let caret: HTMLElement | null = null;
    let frameId: number | null = null;
    let keyboardCaretNavigationActive = false;

    const hide = () => {
      keyboardCaretNavigationActive = false;
      releaseCaretBlink(caret);
      caret?.remove();
      caret = null;
      doc.querySelectorAll(`[${ACTIVE_ATTR}='true']`).forEach((element) => {
        element.removeAttribute(ACTIVE_ATTR);
      });
    };

    const render = () => {
      frameId = null;

      const activeElement = doc.activeElement;
      if (
        !isTextControl(activeElement) ||
        activeElement.matches('[readonly], [disabled], [data-native-caret-overlay-disabled="true"]')
      ) {
        hide();
        return;
      }

      const rect = getControlCaretRect(activeElement);
      if (!rect) {
        hide();
        return;
      }

      const overlayRect = createCaretOverlayRect(
        rect,
        activeElement instanceof HTMLTextAreaElement
          ? resolveElementLineHeight(activeElement)
          : null,
      );
      if (!isCaretOverlayVisuallyVisible(activeElement, overlayRect, caret)) {
        hide();
        return;
      }

      if (!caret) {
        caret = doc.createElement('div');
        caret.className = CARET_CLASS;
        doc.body.appendChild(caret);
      }

      caret.style.left = `${overlayRect.left}px`;
      caret.style.top = `${overlayRect.top}px`;
      caret.style.height = `${overlayRect.height}px`;
      holdCaretBlink(caret, keyboardCaretNavigationActive ? null : undefined);
      activeElement.setAttribute(ACTIVE_ATTR, 'true');
    };

    const schedule = () => {
      const activeElement = doc.activeElement;
      if (
        isTextControl(activeElement) &&
        activeElement.matches('[data-native-caret-overlay-disabled="true"]')
      ) {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
          frameId = null;
        }
        if (caret) hide();
        return;
      }
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(render);
    };

    const flush = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      render();
    };

    const handleFocusIn = () => schedule();
    const handleFocusOut = () => hide();
    const handleUpdate = () => schedule();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;

      if (isCaretNavigationKey(event)) {
        keyboardCaretNavigationActive = true;
        holdCaretBlink(caret, null);
      }
      schedule();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.isComposing) return;

      if (isCaretNavigationKey(event)) {
        keyboardCaretNavigationActive = false;
        holdCaretBlink(caret);
      }
      schedule();
    };
    const handleExplicitRefresh = () => flush();
    const handleCompositionStart = () => hide();
    const handleCompositionEnd = () => schedule();

    doc.addEventListener('focusin', handleFocusIn);
    doc.addEventListener('focusout', handleFocusOut);
    doc.addEventListener('input', handleUpdate);
    doc.addEventListener('keydown', handleKeyDown);
    doc.addEventListener('keyup', handleKeyUp);
    doc.addEventListener('mouseup', handleUpdate);
    doc.addEventListener('selectionchange', handleUpdate);
    doc.addEventListener('compositionstart', handleCompositionStart);
    doc.addEventListener('compositionend', handleCompositionEnd);
    doc.addEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleExplicitRefresh);
    doc.addEventListener('animationend', handleUpdate, true);
    doc.addEventListener('transitionend', handleUpdate, true);
    doc.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      hide();
      doc.removeEventListener('focusin', handleFocusIn);
      doc.removeEventListener('focusout', handleFocusOut);
      doc.removeEventListener('input', handleUpdate);
      doc.removeEventListener('keydown', handleKeyDown);
      doc.removeEventListener('keyup', handleKeyUp);
      doc.removeEventListener('mouseup', handleUpdate);
      doc.removeEventListener('selectionchange', handleUpdate);
      doc.removeEventListener('compositionstart', handleCompositionStart);
      doc.removeEventListener('compositionend', handleCompositionEnd);
      doc.removeEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleExplicitRefresh);
      doc.removeEventListener('animationend', handleUpdate, true);
      doc.removeEventListener('transitionend', handleUpdate, true);
      doc.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, []);
}
