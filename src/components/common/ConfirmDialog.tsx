import { useId, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Dialog,
  DialogDescription,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';
import { BlurBackdrop } from '@/components/common/BlurBackdrop';
import { cn } from '@/lib/utils';
import { themeBackdropTokens } from '@/styles/themeTokens';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  onCancelAction?: () => void | Promise<void>;
  onAuxAction?: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmText?: string;
  auxActionText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
  auxActionVariant?: 'success' | 'default';
  initialFocus?: 'confirm' | 'cancel';
  onCloseAutoFocus?: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>['onCloseAutoFocus'];
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  onCancelAction,
  onAuxAction,
  title,
  description,
  confirmText = 'Confirm',
  auxActionText,
  cancelText = 'Cancel',
  variant = 'default',
  auxActionVariant = 'default',
  initialFocus = 'confirm',
  onCloseAutoFocus,
}: ConfirmDialogProps) {
  const descriptionId = useId();
  const auxActionRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [showKeyboardSelection, setShowKeyboardSelection] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) {
      return;
    }

    const isBackward = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    const isForward = e.key === 'ArrowRight' || e.key === 'ArrowDown';

    if (!isBackward && !isForward) {
      return;
    }

    setShowKeyboardSelection(true);

    const focusableButtons = [
      auxActionRef.current,
      confirmRef.current,
      cancelRef.current,
    ].filter((button): button is HTMLButtonElement => button !== null);

    if (focusableButtons.length < 2) {
      return;
    }

    e.preventDefault();
    const activeIndex = focusableButtons.findIndex((button) => button === document.activeElement);
    const currentIndex = activeIndex === -1 ? 0 : activeIndex;
    const delta = isBackward ? -1 : 1;
    const nextIndex = (currentIndex + delta + focusableButtons.length) % focusableButtons.length;
    focusableButtons[nextIndex]?.focus();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogPrimitive.Overlay asChild>
          <BlurBackdrop
            className="z-[var(--vlaina-z-120)]"
            overlayClassName="bg-[var(--vlaina-color-drop-overlay)]"
            zIndex={120}
            blurPx={6}
            duration={themeBackdropTokens.durationSeconds}
          />
        </DialogPrimitive.Overlay>
        <div className="fixed inset-0 z-[var(--vlaina-z-121)] flex items-center justify-center p-4">
          <DialogPrimitive.Content
            aria-describedby={description ? descriptionId : undefined}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              setShowKeyboardSelection(false);
              if (initialFocus === 'cancel') {
                cancelRef.current?.focus();
                return;
              }
              confirmRef.current?.focus();
            }}
            onCloseAutoFocus={onCloseAutoFocus}
            onKeyDown={handleKeyDown}
            className="w-full max-w-[var(--vlaina-size-360px)] rounded-[var(--vlaina-ui-radius-panel)] border border-transparent bg-[var(--vlaina-color-setting-field)] shadow-[var(--vlaina-shadow-raised-soft)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-[var(--vlaina-duration-75)]"
          >
            <div className="px-7 py-7">
              <DialogTitle className="select-none text-[var(--vlaina-font-24)] leading-8 font-semibold tracking-[var(--vlaina-tracking-tight-display)] text-[var(--vlaina-color-text-strong)]">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription id={descriptionId} className="mt-3 text-[var(--vlaina-font-sm)] leading-6 text-[var(--vlaina-sidebar-notes-text-soft)]">
                  {description}
                </DialogDescription>
              )}

              <div className="mt-7 flex flex-col gap-2.5">
                {onAuxAction && auxActionText ? (
                  <button
                    ref={auxActionRef}
                    type="button"
                    data-dialog-action="aux"
                    onClick={async () => {
                      await onAuxAction();
                    }}
                    className={cn(
                      "inline-flex h-12 items-center justify-center rounded-[var(--vlaina-ui-radius-group)] border border-transparent px-5 text-[var(--vlaina-font-sm)] font-semibold shadow-[var(--vlaina-shadow-raised-soft)] transition-[color,background-color,box-shadow,border-color,transform] outline-none app-ring-offset-2 ring-offset-[var(--vlaina-color-setting-field)] active:scale-[var(--vlaina-scale-985)]",
                      showKeyboardSelection && 'focus:ring-2',
                      auxActionVariant === 'success'
                        ? "bg-[var(--vlaina-color-status-success-fg)] text-[var(--vlaina-color-white)] hover:bg-[var(--vlaina-color-success)] focus:ring-[var(--vlaina-color-focus-ring-success)]"
                        : "bg-[var(--vlaina-color-inverse-surface)] text-[var(--vlaina-color-inverse-text)] hover:bg-[var(--vlaina-color-inverse-surface-hover)] focus:ring-[var(--vlaina-color-focus-ring-inverse)]"
                    )}
                  >
                    {auxActionText}
                  </button>
                ) : null}
                <button
                  ref={confirmRef}
                  type="button"
                  data-dialog-action="confirm"
                  onClick={async () => {
                    await onConfirm();
                    onClose();
                  }}
                  className={cn(
                    "inline-flex h-12 items-center justify-center rounded-[var(--vlaina-ui-radius-group)] border border-transparent px-5 text-[var(--vlaina-font-sm)] font-semibold transition-[color,background-color,box-shadow,border-color,transform] outline-none app-ring-offset-2 ring-offset-[var(--vlaina-color-setting-field)] active:scale-[var(--vlaina-scale-985)]",
                    showKeyboardSelection && 'focus:ring-2',
                    variant === 'danger'
                      ? "bg-[var(--vlaina-color-danger)] text-[var(--vlaina-color-white)] shadow-[var(--vlaina-shadow-none)] hover:bg-[var(--vlaina-color-danger-hover)] focus:ring-[var(--vlaina-color-focus-ring-danger)]"
                      : "bg-[var(--vlaina-color-inverse-surface)] text-[var(--vlaina-color-inverse-text)] shadow-[var(--vlaina-shadow-raised-soft)] hover:bg-[var(--vlaina-color-inverse-surface-hover)] focus:ring-[var(--vlaina-color-focus-ring-inverse)]"
                  )}
                >
                  {confirmText}
                </button>
                <button
                  ref={cancelRef}
                  type="button"
                  data-dialog-action="cancel"
                  onClick={async () => {
                    if (onCancelAction) {
                      await onCancelAction();
                      return;
                    }
                    onClose();
                  }}
                  className={cn(
                    "inline-flex h-12 items-center justify-center rounded-[var(--vlaina-ui-radius-group)] border border-transparent bg-[var(--vlaina-color-setting-field)] px-5 text-[var(--vlaina-font-sm)] font-medium text-[var(--vlaina-sidebar-notes-text)] shadow-[var(--vlaina-shadow-raised-soft)] transition-[color,background-color,box-shadow,border-color,transform] outline-none app-ring-offset-2 ring-offset-[var(--vlaina-color-setting-field)] hover:bg-[var(--vlaina-hover-filled)] active:scale-[var(--vlaina-scale-985)]",
                    showKeyboardSelection && 'focus:ring-2 focus:ring-[var(--vlaina-color-focus-ring-inverse)]',
                  )}
                >
                  {cancelText}
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
