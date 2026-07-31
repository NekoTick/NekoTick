import { useEffect, type RefObject } from 'react';
import { themeTextAreaTokens } from '@/styles/themeTokens';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface UseModalBehaviorOptions {
  open: boolean;
  onClose: () => void;
  isEditing?: boolean;
  onCancelEdit?: () => void;
  modalRef?: RefObject<HTMLElement | null>;
}

export function useModalBehavior({
  open,
  onClose,
  isEditing = false,
  onCancelEdit,
  modalRef,
}: UseModalBehaviorOptions) {
  useEffect(() => {
    if (!open) return;

    const modal = modalRef?.current ?? null;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => {
      modal?.focus({ preventScroll: true });
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) {
        return;
      }
      if (e.defaultPrevented) {
        return;
      }

      const targetDialog = e.target instanceof Element
        ? e.target.closest('[role="dialog"]')
        : null;
      if (targetDialog && targetDialog.getAttribute('data-settings-modal') !== 'true') {
        return;
      }

      if (e.key === 'Tab' && modal) {
        const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
          .filter((element) => {
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden';
          });
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const activeElement = document.activeElement;

        if (!first || !last) {
          e.preventDefault();
          modal.focus({ preventScroll: true });
          return;
        }
        if (e.shiftKey && (activeElement === modal || activeElement === first || !modal.contains(activeElement))) {
          e.preventDefault();
          last.focus({ preventScroll: true });
          return;
        }
        if (!e.shiftKey && (activeElement === modal || activeElement === last || !modal.contains(activeElement))) {
          e.preventDefault();
          first.focus({ preventScroll: true });
          return;
        }
      }

      if (e.key === 'Escape') {
        if (isEditing && onCancelEdit) {
          onCancelEdit();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open, onClose, isEditing, onCancelEdit, modalRef]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = themeTextAreaTokens.overflowHidden;
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
}
