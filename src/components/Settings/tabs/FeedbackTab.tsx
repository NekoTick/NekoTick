import { useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { getElectronBridge } from '@/lib/electron/bridge';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/stores/useToastStore';
import { SettingsSectionHeader } from '../components/SettingsControls';
import { settingsSelectedActionButtonClassName } from '../styles';
import { themeIconTokens, themeUiFeedbackTokens } from '@/styles/themeTokens';
import { readSettingsApiJson } from './settingsApiJson';

const API_BASE = 'https://api.vlaina.com';
const MAX_FEEDBACK_LENGTH = 2000;

function isFeedbackResponsePayload(value: unknown): value is { success?: boolean; error?: string } {
  return typeof value === 'object' && value !== null;
}

async function submitWebFeedback(message: string) {
  const response = await fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  const parsedPayload = await readSettingsApiJson<{ success?: boolean; error?: string }>(response).catch(() => ({}));
  const payload = isFeedbackResponsePayload(parsedPayload) ? parsedPayload : {};
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
}

async function submitFeedback(message: string) {
  const bridge = getElectronBridge();
  if (bridge?.account?.submitFeedback) {
    const payload = await bridge.account.submitFeedback(message);
    if (payload?.success === false) {
      throw new Error(payload.error || 'Failed to submit feedback');
    }
    return;
  }

  await submitWebFeedback(message);
}

function normalizeFeedbackError(error: unknown, t: ReturnType<typeof useI18n>['t']): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/missing session token|invalid session token|unauthorized|http 401|http 403/i.test(message)) {
    return t('settings.feedback.error.signInRequired');
  }
  if (/too large|invalid feedback message/i.test(message)) {
    return t('settings.feedback.error.generic');
  }
  if (/failed to fetch|network|load failed/i.test(message)) {
    return t('settings.feedback.error.network');
  }
  return t('settings.feedback.error.generic');
}

export function FeedbackTab({ compact = false }: { compact?: boolean }) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isComposingRef = useRef(false);
  const addToast = useToastStore((state) => state.addToast);
  const { t } = useI18n();

  const trimmedMessage = message.trim();
  const canSubmit = trimmedMessage.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (isComposingRef.current) return;
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      await submitFeedback(trimmedMessage);
      setMessage('');
      addToast(t('settings.feedback.success'), 'success');
    } catch (error) {
      addToast(normalizeFeedbackError(error, t), 'error', themeUiFeedbackTokens.errorToastDurationMs);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <SettingsSectionHeader>{t('settings.feedback.title')}</SettingsSectionHeader>
        <div className="min-w-0 rounded-[var(--vlaina-ui-radius-panel)] border border-[var(--vlaina-color-panel-border)] bg-[var(--vlaina-color-panel-glass)] p-5 shadow-[var(--vlaina-shadow-panel-soft)] max-[640px]:p-4">
          <div className="space-y-4">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, MAX_FEEDBACK_LENGTH))}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
              placeholder={t('settings.feedback.placeholder')}
              aria-label={t('settings.feedback.title')}
              maxLength={MAX_FEEDBACK_LENGTH}
              className={cn(
                compact ? 'min-h-[var(--vlaina-size-150px)]' : 'min-h-[var(--vlaina-size-220px)]',
                'w-full resize-y rounded-[var(--vlaina-ui-radius-group)] border border-[var(--vlaina-border)] bg-[var(--vlaina-color-input-surface)] px-4 py-3 text-[var(--vlaina-font-sm)] leading-6 text-[var(--vlaina-sidebar-notes-text)] outline-none transition-colors placeholder:text-[var(--vlaina-sidebar-notes-text-soft)] focus:border-[var(--vlaina-accent)]'
              )}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={settingsSelectedActionButtonClassName}
              >
                <Send size={themeIconTokens.sizeSidebar} />
                {submitting ? t('settings.feedback.submitting') : t('settings.feedback.submit')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
