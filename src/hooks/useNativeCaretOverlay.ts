import { useEffect } from 'react';
import {
  createCaretOverlayRect,
  createCaretOverlayStyle,
  holdCaretBlink,
  isCaretNavigationKey,
  releaseCaretBlink,
  resolveElementLineHeight,
} from '@/lib/ui/caretOverlayStyles';
import { useUIStore } from '@/stores/uiSlice';
import {
  getControlCaretRect,
  isCaretOverlayVisuallyVisible,
  isTextControl,
  type TextControl,
} from './nativeCaretOverlayGeometry';
import { createNativeCaretOverlayMotionTracker } from './nativeCaretOverlayMotion';
import { hasUnsupportedCaretOverlayTransform } from './nativeCaretOverlayTransforms';

const STYLE_ID = 'native-caret-overlay-style';
const CARET_CLASS = 'native-caret-overlay';
const ACTIVE_ATTR = 'data-native-caret-overlay-active';
const LAYOUT_PANEL_DRAGGING_ATTR = 'data-layout-panel-dragging';
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
    let layoutPanelDragging = useUIStore.getState().layoutPanelDragging;
    const motionTracker = createNativeCaretOverlayMotionTracker();

    const hide = () => {
      keyboardCaretNavigationActive = false;
      releaseCaretBlink(caret);
      caret?.remove();
      caret = null;
      doc.querySelectorAll(`[${ACTIVE_ATTR}='true']`).forEach((element) => {
        element.removeAttribute(ACTIVE_ATTR);
      });
    };

    const canRenderOverlayFor = (element: Element | null): element is TextControl => (
      isTextControl(element) &&
      !element.matches('[readonly], [disabled], [data-native-caret-overlay-disabled="true"]') &&
      !motionTracker.contains(element) &&
      !hasUnsupportedCaretOverlayTransform(element)
    );

    const render = () => {
      frameId = null;

      if (layoutPanelDragging) {
        hide();
        return;
      }

      const activeElement = doc.activeElement;
      if (!canRenderOverlayFor(activeElement)) {
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
      if (layoutPanelDragging) {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
          frameId = null;
        }
        hide();
        return;
      }

      const activeElement = doc.activeElement;
      if (!canRenderOverlayFor(activeElement)) {
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
    const handleScroll = (event: Event) => {
      const activeElement = doc.activeElement;
      if (!isTextControl(activeElement)) {
        return;
      }

      const target = event.target;
      if (
        target === doc ||
        target === activeElement ||
        (target instanceof Element && target.contains(activeElement))
      ) {
        schedule();
      }
    };
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
    const handleMotionStart = (event: Event) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Element) || eventTarget.classList.contains(CARET_CLASS)) {
        return;
      }
      const activeElement = doc.activeElement;
      const affectsFocusedControl = isTextControl(activeElement) && (
        eventTarget === activeElement || eventTarget.contains(activeElement)
      );
      const containsTextControl = eventTarget.matches('input, textarea') ||
        eventTarget.querySelector('input, textarea') !== null;
      if (!affectsFocusedControl && !containsTextControl) {
        return;
      }

      const target = motionTracker.start(event);
      if (!target) return;
      if (isTextControl(activeElement) && (target === activeElement || target.contains(activeElement))) {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
          frameId = null;
        }
        hide();
      }
    };
    const handleMotionEnd = (event: Event) => {
      const tracked = motionTracker.end(event);
      if (!tracked) {
        const activeElement = doc.activeElement;
        const target = event.target;
        if (
          !isTextControl(activeElement) ||
          !(target instanceof Element) ||
          (target !== activeElement && !target.contains(activeElement))
        ) {
          return;
        }
      }
      schedule();
    };
    const syncLayoutPanelDragging = (dragging: boolean) => {
      layoutPanelDragging = dragging;
      if (dragging) {
        doc.documentElement.setAttribute(LAYOUT_PANEL_DRAGGING_ATTR, 'true');
        schedule();
        return;
      }

      doc.documentElement.removeAttribute(LAYOUT_PANEL_DRAGGING_ATTR);
      schedule();
    };

    const unsubscribeLayoutPanelDragging = useUIStore.subscribe((state, previousState) => {
      if (state.layoutPanelDragging !== previousState.layoutPanelDragging) {
        syncLayoutPanelDragging(state.layoutPanelDragging);
      }
    });

    syncLayoutPanelDragging(layoutPanelDragging);

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
    doc.addEventListener('animationstart', handleMotionStart, true);
    doc.addEventListener('animationcancel', handleMotionEnd, true);
    doc.addEventListener('transitionrun', handleMotionStart, true);
    doc.addEventListener('transitioncancel', handleMotionEnd, true);
    doc.addEventListener('animationend', handleMotionEnd, true);
    doc.addEventListener('transitionend', handleMotionEnd, true);
    doc.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      hide();
      motionTracker.clear();
      unsubscribeLayoutPanelDragging();
      doc.documentElement.removeAttribute(LAYOUT_PANEL_DRAGGING_ATTR);
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
      doc.removeEventListener('animationstart', handleMotionStart, true);
      doc.removeEventListener('animationcancel', handleMotionEnd, true);
      doc.removeEventListener('transitionrun', handleMotionStart, true);
      doc.removeEventListener('transitioncancel', handleMotionEnd, true);
      doc.removeEventListener('animationend', handleMotionEnd, true);
      doc.removeEventListener('transitionend', handleMotionEnd, true);
      doc.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, []);
}
