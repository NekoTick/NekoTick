import React, { useCallback } from 'react';
import { useAccountSessionStore } from '@/stores/accountSession';
import { actions as aiActions } from '@/stores/useAIStore';
import { useAIUIStore } from '@/stores/ai/chatState';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useI18n } from '@/lib/i18n';
import { ACCOUNT_LOGIN_REQUESTED_EVENT } from '@/lib/account/sessionEvent';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Icon } from '@/components/ui/icons';
import { LoginPrompt } from './LoginPrompt';
import { AccountLoginDialog } from './AccountLoginDialog';
import { UserIdentityCard } from './UserIdentityCard';
import { AppMenu } from './AppMenu';
import { AccountAvatarImage } from './AccountAvatarImage';

const fallbackAvatarUrl = `${import.meta.env.BASE_URL}logo.png?v=20260327`;

interface WorkspaceSwitcherProps {
  onOpenSettings?: () => void;
  className?: string;
}

const WorkspaceSwitcherBase = ({ onOpenSettings, className }: WorkspaceSwitcherProps) => {
  const isConnected = useAccountSessionStore((state) => state.isConnected);
  const username = useAccountSessionStore((state) => state.username);
  const primaryEmail = useAccountSessionStore((state) => state.primaryEmail);
  const signOut = useAccountSessionStore((state) => state.signOut);
  const authPromptSessionId = useAIUIStore((state) => state.authPromptSessionId);
  const currentSessionId = useAIUIStore((state) => state.currentSessionId);
  const temporaryChatEnabled = useAIUIStore((state) => state.temporaryChatEnabled);
  const { t } = useI18n();

  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoginDialogOpen, setIsLoginDialogOpen] = React.useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = React.useState(false);
  const skipPopoverCloseAutoFocusRef = React.useRef(false);

  const handleLogout = useCallback(async () => {
    setIsLogoutConfirmOpen(true);
  }, []);

  const handleConfirmLogout = useCallback(async () => {
    await signOut();
    setIsOpen(false);
    setIsLogoutConfirmOpen(false);
  }, [signOut]);

  const handleSwitchAccount = useCallback(() => {
    if (isOpen) {
      skipPopoverCloseAutoFocusRef.current = true;
    }
    setIsOpen(false);
    setIsLoginDialogOpen(true);
  }, [isOpen]);

  const handleOpenSettings = useCallback(() => {
    if (isOpen) {
      skipPopoverCloseAutoFocusRef.current = true;
    }
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      window.dispatchEvent(new Event('open-settings'));
    }
    setIsOpen(false);
  }, [isOpen, onOpenSettings]);

  const userAvatar = useUserAvatar();
  const displayName = isConnected ? username || primaryEmail || 'vlaina' : 'vlaina';
  const displayAvatar = isConnected ? userAvatar : null;

  const handleOpenLoginDialog = useCallback(() => {
    if (isOpen) {
      skipPopoverCloseAutoFocusRef.current = true;
    }
    setIsOpen(false);
    setIsLoginDialogOpen(true);
  }, [isOpen]);

  React.useEffect(() => {
    window.addEventListener(ACCOUNT_LOGIN_REQUESTED_EVENT, handleOpenLoginDialog);
    return () => {
      window.removeEventListener(ACCOUNT_LOGIN_REQUESTED_EVENT, handleOpenLoginDialog);
    };
  }, [handleOpenLoginDialog]);

  React.useEffect(() => {
    if (isConnected) {
      setIsLoginDialogOpen(false);
    }
  }, [isConnected, username, primaryEmail]);

  React.useEffect(() => {
    if (!isConnected || !authPromptSessionId) {
      return;
    }

    if (temporaryChatEnabled && currentSessionId === authPromptSessionId) {
      void aiActions.promoteTemporarySession();
    }
    useAIUIStore.getState().setAuthPromptSessionId(null);
  }, [authPromptSessionId, currentSessionId, isConnected, temporaryChatEnabled]);

  return (
    <div
      className={cn('app-no-drag flex min-w-0 items-center', className)}
    >
      <Popover
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="group relative flex h-full min-w-0 flex-1 cursor-pointer items-center justify-start overflow-visible rounded-[var(--vlaina-radius-10px)] bg-transparent text-[var(--vlaina-color-brand-wordmark)] outline-none transition-colors hover:text-[var(--vlaina-color-brand-wordmark-hover)] select-none"
          >
            <span className="relative flex size-[var(--vlaina-size-26px)] shrink-0 overflow-hidden rounded-[var(--vlaina-radius-8px)]">
              <AccountAvatarImage
                src={displayAvatar}
                fallbackSrc={fallbackAvatarUrl}
                alt={displayName}
                className="h-full w-full object-cover shadow-[var(--vlaina-shadow-sm)]"
              />
            </span>
            <span className="ml-2 shrink-0 whitespace-nowrap text-[length:var(--vlaina-font-15)] font-semibold leading-none">
              vlaina
            </span>
            <Icon
              name="nav.chevronDown"
              size="sm"
              className="ml-1 shrink-0 opacity-[var(--vlaina-opacity-0)] transition-opacity duration-[var(--vlaina-duration-150)] group-hover:opacity-[var(--vlaina-opacity-100)] motion-reduce:transition-none"
            />
            <img
              src={displayAvatar || fallbackAvatarUrl}
              alt=""
              aria-hidden="true"
              loading="eager"
              decoding="sync"
              className="pointer-events-none absolute left-0 top-0 h-12 w-12 opacity-[var(--vlaina-opacity-0)]"
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          className={cn(
            'z-[var(--vlaina-z-50)] w-[var(--vlaina-width-workspace-switcher)] rounded-[var(--vlaina-ui-radius-panel)] p-2 text-[var(--vlaina-sidebar-chat-text)] select-none animate-in fade-in-0 zoom-in-95 duration-[var(--vlaina-duration-75)] data-[side=bottom]:slide-in-from-top-2',
            'user-menu-popover border !border-transparent bg-[var(--vlaina-color-floating-surface)]'
          )}
          sideOffset={8}
          align="start"
          onCloseAutoFocus={(event) => {
            if (!skipPopoverCloseAutoFocusRef.current) {
              return;
            }
            skipPopoverCloseAutoFocusRef.current = false;
            event.preventDefault();
          }}
        >
          <div className="flex flex-col">
            {!isConnected ? (
              <LoginPrompt onOpenDialog={handleOpenLoginDialog} />
            ) : (
              <UserIdentityCard onLogout={handleLogout} onSwitchAccount={handleSwitchAccount} />
            )}

            {isConnected && <div className="mx-3 my-1 h-[var(--vlaina-size-1px)] bg-[var(--vlaina-border)] opacity-[var(--vlaina-opacity-50)]" />}

            <AppMenu onOpenSettings={handleOpenSettings} onCloseMenu={() => setIsOpen(false)} />
          </div>
        </PopoverContent>
      </Popover>

      <AccountLoginDialog open={isLoginDialogOpen} onOpenChange={setIsLoginDialogOpen} />
      <ConfirmDialog
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        onConfirm={() => {
          void handleConfirmLogout().catch(() => undefined);
        }}
        title={t('account.logOutTitle')}
        description={t('account.logOutDescription')}
        confirmText={t('account.logOut')}
        cancelText={t('account.logOutCancel')}
        variant="danger"
      />
    </div>
  );
};

export const WorkspaceSwitcher = React.memo(WorkspaceSwitcherBase);
WorkspaceSwitcher.displayName = 'WorkspaceSwitcher';
