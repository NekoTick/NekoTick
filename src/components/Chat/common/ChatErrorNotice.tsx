import { Icon } from '@/components/ui/icons';

interface ChatErrorNoticeProps {
  closeLabel: string;
  message: string;
  onDismiss: () => void;
}

export function ChatErrorNotice({ closeLabel, message, onDismiss }: ChatErrorNoticeProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-[var(--vlaina-ui-radius-group)] border border-[var(--vlaina-color-status-danger-border)] bg-[var(--vlaina-color-status-danger-bg)] px-3 py-2 text-sm text-[var(--vlaina-color-status-danger-fg)]"
    >
      <Icon name="common.error" size="sm" className="mt-0.5" />
      <p className="min-w-0 flex-1 break-words leading-5">{message}</p>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onDismiss}
        className="inline-flex size-[var(--vlaina-size-24px)] shrink-0 items-center justify-center rounded-[var(--vlaina-ui-radius-compact)] outline-none hover:bg-[var(--vlaina-bg-hover)] focus-visible:ring-[var(--vlaina-ring-width-2)] focus-visible:ring-[var(--ring)]"
      >
        <Icon name="common.close" size="xs" />
      </button>
    </div>
  );
}
