import React from 'react';
import { AccountSignInOptions } from '@/components/account/AccountSignInOptions';
import { DialogCloseIconButton } from '@/components/common/DialogCloseIconButton';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAccountSessionStore } from '@/stores/accountSession';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { themeBackdropTokens } from '@/styles/themeTokens';
import { focusComposerInput } from '@/lib/ui/composerFocusRegistry';
import { useNativeTitleBarOverlayHidden } from '@/hooks/useNativeTitleBarOverlayHidden';

interface AccountLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountLoginDialog({ open, onOpenChange }: AccountLoginDialogProps) {
  const isConnecting = useAccountSessionStore((state) => state.isConnecting);
  const error = useAccountSessionStore((state) => state.error);
  const signIn = useAccountSessionStore((state) => state.signIn);
  const requestEmailCode = useAccountSessionStore((state) => state.requestEmailCode);
  const verifyEmailCode = useAccountSessionStore((state) => state.verifyEmailCode);
  const cancelConnect = useAccountSessionStore((state) => state.cancelConnect);
  const clearError = useAccountSessionStore((state) => state.clearError);
  const { t } = useI18n();
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const openFocusTimeoutRef = React.useRef<number | null>(null);
  const closeFocusTimeoutRef = React.useRef<number | null>(null);
  const closeFocusRequestedRef = React.useRef(false);
  const wasOpenRef = React.useRef(open);
  useNativeTitleBarOverlayHidden(open);

  const focusEmailInputAfterOpen = React.useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (openFocusTimeoutRef.current !== null) {
      window.clearTimeout(openFocusTimeoutRef.current);
    }
    openFocusTimeoutRef.current = window.setTimeout(() => {
      openFocusTimeoutRef.current = null;
      const dialogElement = closeButtonRef.current?.closest('[role="dialog"]');
      const emailInput = dialogElement?.querySelector<HTMLInputElement>('input[autocomplete="email"]:not(:disabled)');
      emailInput?.focus();
    }, 0);
  }, []);

  const focusComposerAfterClose = React.useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (closeFocusRequestedRef.current) {
      return;
    }
    closeFocusRequestedRef.current = true;
    closeFocusTimeoutRef.current = window.setTimeout(() => {
      closeFocusTimeoutRef.current = null;
      focusComposerInput();
    }, 0);
  }, []);

  React.useEffect(() => {
    return () => {
      if (openFocusTimeoutRef.current !== null) {
        window.clearTimeout(openFocusTimeoutRef.current);
      }
      if (closeFocusTimeoutRef.current !== null) {
        window.clearTimeout(closeFocusTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!open) {
      if (openFocusTimeoutRef.current !== null) {
        window.clearTimeout(openFocusTimeoutRef.current);
        openFocusTimeoutRef.current = null;
      }
      return;
    }
    closeFocusRequestedRef.current = false;
    if (closeFocusTimeoutRef.current !== null) {
      window.clearTimeout(closeFocusTimeoutRef.current);
      closeFocusTimeoutRef.current = null;
    }
  }, [open]);

  React.useEffect(() => {
    if (wasOpenRef.current && !open) {
      focusComposerAfterClose();
    }
    wasOpenRef.current = open;
  }, [focusComposerAfterClose, open]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        clearError();
        focusComposerAfterClose();
      }
      onOpenChange(nextOpen);
    },
    [clearError, focusComposerAfterClose, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-account-login-dialog="true"
        showCloseButton={false}
        useBlurBackdrop
        containerClassName="z-[var(--vlaina-z-1001)]"
        blurBackdropProps={{
          overlayClassName: 'bg-[var(--vlaina-color-backdrop-soft)] backdrop-blur-[var(--vlaina-backdrop-blur-sm)]',
          zIndex: themeBackdropTokens.accountDialogZIndex,
          blurPx: themeBackdropTokens.accountDialogBlurPx,
          duration: themeBackdropTokens.accountDialogDurationSeconds,
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusEmailInputAfterOpen();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusComposerAfterClose();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        className={cn(
          "w-full max-w-[var(--vlaina-width-account-dialog-max)] border-none p-0 overflow-visible bg-transparent shadow-[var(--vlaina-shadow-none)] select-none",
          "transition-all duration-[var(--vlaina-duration-75)] ease-in-out"
        )}
      >
        <DialogTitle className="sr-only">{t('account.signInTitle')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('account.signInDescription')}
        </DialogDescription>
        <div className={cn(
          "relative w-full rounded-[var(--vlaina-radius-36px)] px-5 py-6 sm:rounded-[var(--vlaina-radius-48px)] sm:px-8 sm:py-9 md:rounded-[var(--vlaina-radius-56px)] md:p-12",
          raisedPillSurfaceClass
        )} data-account-login-panel="true">
          <DialogClose asChild>
            <DialogCloseIconButton
              ref={closeButtonRef}
              label={t('common.close')}
              className="absolute right-4 top-4 sm:right-5 sm:top-5"
            />
          </DialogClose>

          <div data-account-login-scroll="true">
            <div className="mb-7 flex items-center justify-center text-center sm:mb-10 md:mb-12">
              <h2 className="text-[var(--vlaina-font-24)] font-black leading-none tracking-tight text-[var(--vlaina-color-text-strong)] sm:text-[var(--vlaina-font-26)] md:text-[var(--vlaina-font-28)]">
                {t('account.signIn')}
              </h2>
            </div>

            <div className="w-full">
              <AccountSignInOptions
                variant="panel"
                isConnecting={isConnecting}
                error={error}
                onOauthSignIn={signIn}
                onEmailCodeRequest={requestEmailCode}
                onEmailCodeVerify={verifyEmailCode}
              />
            </div>

            {isConnecting && (
              <div className="mt-8 text-center animate-in fade-in duration-[var(--vlaina-duration-100)]">
                <button
                  type="button"
                  onClick={() => cancelConnect()}
                  className="text-[var(--vlaina-font-11)] font-black uppercase tracking-widest text-[var(--vlaina-sidebar-notes-text-soft)] hover:text-[var(--vlaina-color-text-strong)] transition-colors"
                >
                  {t('account.cancelAuthentication')}
                </button>
              </div>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
