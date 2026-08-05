import { useCallback, useLayoutEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { OauthAccountProvider } from '@/lib/account/provider';
import { AccountOauthButtons } from './AccountOauthButtons';
import { AccountEmailCodeCard } from './AccountEmailCodeCard';
import { useI18n } from '@/lib/i18n';
import { openExternalHref } from '@/lib/navigation/externalLinks';
import { isNativeCapacitorRuntime } from '@/lib/account/capacitorRuntime';
import { requestNativeCaretOverlayRefresh } from '@/hooks/useNativeCaretOverlay';

interface AccountSignInOptionsProps {
  isConnecting: boolean;
  error: string | null;
  onOauthSignIn: (provider: OauthAccountProvider) => void | Promise<unknown>;
  onEmailCodeRequest: (email: string) => Promise<boolean>;
  onEmailCodeVerify: (email: string, code: string) => Promise<boolean>;
  variant?: 'compact' | 'panel';
  className?: string;
}

const privacyPolicyUrl = 'https://github.com/vladelaina/vlaina/blob/main/PRIVACY.md';
const termsOfServiceUrl = 'https://github.com/vladelaina/vlaina/blob/main/TERMS.md';

export function AccountSignInOptions({
  isConnecting,
  error,
  onOauthSignIn,
  onEmailCodeRequest,
  onEmailCodeVerify,
  variant = 'panel',
  className,
}: AccountSignInOptionsProps) {
  const { t } = useI18n();
  const isCompact = variant === 'compact';
  const disabled = isConnecting;
  const showOauth = !isNativeCapacitorRuntime();
  const [emailCodeCardKey, setEmailCodeCardKey] = useState(0);

  const handleOauthSignIn = useCallback(
    (provider: OauthAccountProvider) => {
      setEmailCodeCardKey((key) => key + 1);
      return onOauthSignIn(provider);
    },
    [onOauthSignIn]
  );

  useLayoutEffect(() => {
    requestNativeCaretOverlayRefresh();
  }, [error]);

  return (
    <div className={cn('flex flex-col gap-6 px-4', className)}>
      {showOauth ? (
        <>
          <AccountOauthButtons isCompact={isCompact} disabled={disabled} onOauthSignIn={handleOauthSignIn} />

          <div className="flex items-center gap-4 px-4">
            <div className="h-px flex-1 bg-[var(--vlaina-divider)]" />
            <span className="text-[var(--vlaina-font-10)] font-black uppercase tracking-[var(--vlaina-tracking-label-3xl)] text-[var(--vlaina-text-disabled)]">{t('account.or')}</span>
            <div className="h-px flex-1 bg-[var(--vlaina-divider)]" />
          </div>
        </>
      ) : null}

      <div className="space-y-6">
        <AccountEmailCodeCard
          key={emailCodeCardKey}
          isCompact={isCompact}
          disabled={disabled}
          onEmailCodeRequest={onEmailCodeRequest}
          onEmailCodeVerify={onEmailCodeVerify}
        />

        {error ? (
          <div
            className={cn(
              'rounded-[var(--vlaina-ui-radius-group)] px-6 py-4 text-[var(--vlaina-font-13)] font-medium animate-in slide-in-from-top-2 duration-[var(--vlaina-duration-100)]',
              'bg-[var(--vlaina-color-brand-pink-soft)] text-[var(--vlaina-color-brand-pink)]'
            )}
          >
            {error}
          </div>
        ) : null}

        <p className="px-8 text-[var(--vlaina-font-10)] text-center leading-snug text-[var(--vlaina-text-tertiary)] font-medium opacity-[var(--vlaina-opacity-80)]">
          {t('account.privacyAgreement')}{' '}
          <button
            type="button"
            onClick={() => void openExternalHref(privacyPolicyUrl)}
            className="inline p-0 underline cursor-pointer opacity-[var(--vlaina-opacity-80)] transition-opacity hover:opacity-[var(--vlaina-opacity-100)]"
          >
            {t('account.privacyPolicy')}
          </button>
          {' '}
          {t('account.termsConnector')}{' '}
          <button
            type="button"
            onClick={() => void openExternalHref(termsOfServiceUrl)}
            className="inline p-0 underline cursor-pointer opacity-[var(--vlaina-opacity-80)] transition-opacity hover:opacity-[var(--vlaina-opacity-100)]"
          >
            {t('account.termsOfService')}
          </button>
          .
        </p>
      </div>
    </div>
  );
}
