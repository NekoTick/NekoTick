import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(modal: HTMLElement): HTMLElement[] {
  return Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    const style = window.getComputedStyle(element);
    return (
      !element.hidden &&
      element.getAttribute('aria-hidden') !== 'true' &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  });
}

export function useChatModalFocus({
  modalRef,
  onClose,
  open,
  restoreFocus = true,
}: {
  modalRef: RefObject<HTMLElement | null>;
  onClose?: () => void;
  open: boolean;
  restoreFocus?: boolean;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const modal = modalRef.current;
    if (!modal) {
      return;
    }
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => {
      const firstFocusable = getFocusableElements(modal)[0];
      (firstFocusable ?? modal).focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }
      const owningDialog = event.target instanceof Element
        ? event.target.closest('[role="dialog"], [aria-modal="true"]')
        : null;
      if (owningDialog && owningDialog !== modal) {
        return;
      }

      if (event.key === 'Escape' && onClose) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }

      const focusable = getFocusableElements(modal);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        modal.focus({ preventScroll: true });
        return;
      }

      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !modal.contains(activeElement))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (activeElement === last || !modal.contains(activeElement))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);
      if (restoreFocus && previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [modalRef, onClose, open, restoreFocus]);
}
