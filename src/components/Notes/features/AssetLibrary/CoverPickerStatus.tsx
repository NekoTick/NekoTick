import { useI18n } from '@/lib/i18n';

interface CoverPickerStatusProps {
  assetLoadError: string | null;
  pasteUploadError: string | null;
  onRetry: () => void;
}

export function CoverPickerStatus({
  assetLoadError,
  pasteUploadError,
  onRetry,
}: CoverPickerStatusProps) {
  const { t } = useI18n();

  return (
    <>
      {assetLoadError ? (
        <div
          role="alert"
          className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-[var(--vlaina-ui-radius-group)] border border-[var(--vlaina-color-status-danger-border)] bg-[var(--vlaina-color-status-danger-bg)] px-3 py-2 text-xs text-[var(--vlaina-color-status-danger-fg)]"
        >
          <span>{assetLoadError}</span>
          <button type="button" className="shrink-0 font-medium" onClick={onRetry}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {pasteUploadError ? (
        <p
          role="alert"
          className="mx-3 mt-3 rounded-[var(--vlaina-ui-radius-group)] border border-[var(--vlaina-color-status-danger-border)] bg-[var(--vlaina-color-status-danger-bg)] px-3 py-2 text-xs text-[var(--vlaina-color-status-danger-fg)]"
        >
          {pasteUploadError}
        </p>
      ) : null}
    </>
  );
}
