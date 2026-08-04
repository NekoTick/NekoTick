import { useCallback } from 'react';
import { useI18n } from '@/lib/i18n/useI18n';
import { openExternalHref } from '@/lib/navigation/externalLinks';
import { cn } from '@/lib/utils';

export const managedQuotaNoticeFrameClass =
  'overflow-hidden rounded-[var(--vlaina-radius-26px)] bg-[var(--vlaina-color-accent-soft)] shadow-[0_10px_26px_color-mix(in_srgb,var(--vlaina-accent)_12%,transparent)]';
export const managedQuotaNoticeSurfaceClass =
  'flex min-h-[var(--vlaina-size-32px)] flex-wrap items-center justify-center gap-x-1.5 gap-y-1 px-6 pb-2.5 pt-1.5 text-center text-[var(--vlaina-font-12)] font-semibold leading-4 text-[var(--vlaina-text-primary)]';

interface ManagedQuotaNoticeProps {
  className?: string;
}

export function ManagedQuotaNotice({ className }: ManagedQuotaNoticeProps) {
  const { t } = useI18n();

  const handleUpgradeClick = useCallback(() => {
    void openExternalHref('https://vlaina.com/r/spark_continue');
  }, []);

  return (
    <div
      data-managed-quota-banner="true"
      className={cn(managedQuotaNoticeSurfaceClass, className)}
    >
      <span>{t('chat.freeRepliesExhausted')}</span>
      <button
        type="button"
        onClick={handleUpgradeClick}
        data-no-focus-input="true"
        className="cursor-pointer font-bold text-[var(--vlaina-accent)] underline decoration-[var(--vlaina-accent)]/45 underline-offset-4 transition-colors hover:text-[var(--vlaina-accent-hover)]"
      >
        {t('chat.upgradeVlaina')}
      </button>
    </div>
  );
}

export function ManagedQuotaNoticeFrame({ className }: ManagedQuotaNoticeProps) {
  return (
    <div className={cn(managedQuotaNoticeFrameClass, className)}>
      <ManagedQuotaNotice />
    </div>
  );
}
