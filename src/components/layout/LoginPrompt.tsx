import React from 'react';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { useAccountSessionStore } from '@/stores/accountSession';
import { cn } from '@/lib/utils';
import { themeStyleResetTokens } from '@/styles/themeTokens';

interface LoginPromptProps {
  onOpenDialog: () => void;
}

export const LoginPrompt: React.FC<LoginPromptProps> = ({ onOpenDialog }) => {
  const isConnecting = useAccountSessionStore((state) => state.isConnecting);
  const { t } = useI18n();
  const signInLabel = isConnecting ? t('account.continueSignIn') : t('account.signIn');

  return (
    <div className="px-2 pb-1 pt-2">
      <button
        type="button"
        onClick={onOpenDialog}
        style={{ boxShadow: themeStyleResetTokens.boxShadowNone }}
        className={cn(
          'group inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-transparent px-3 py-2 text-[var(--vlaina-font-base)] font-medium !shadow-[var(--vlaina-shadow-none)] transition-colors hover:!bg-transparent hover:!text-[var(--vlaina-color-brand-pink)] hover:!shadow-[var(--vlaina-shadow-none)] active:scale-[var(--vlaina-scale-985)]',
          'text-[var(--vlaina-color-brand-pink)]'
        )}
      >
        <span className="min-w-0 truncate">{signInLabel}</span>
        <Icon
          name="nav.arrowRight"
          size="sm"
          className="shrink-0 text-[var(--vlaina-color-brand-pink)] transition-transform duration-[var(--vlaina-duration-200)] ease-out group-hover:translate-x-1"
        />
      </button>
      <div className="mx-2 mt-2.5 h-[var(--vlaina-size-1px)] bg-[var(--vlaina-border)] opacity-[var(--vlaina-opacity-40)]" />
    </div>
  );
};
