import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { SettingsTextInput } from '@/components/Settings/components/SettingsFields';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { MAX_AI_MODEL_FIELD_CHARS } from '@/lib/storage/unifiedStorage';
import { providerInputClassName, providerInputShellClassName } from './providerInputStyles';
import {
  getApiKeyEditableSelectionRange,
  getApiKeyInputStyle,
  isDefaultChannelName,
  maskApiKey,
} from './ProviderConnectionFieldUtils';

export {
  getApiKeyEditableSelectionRange,
  getApiKeyInputStyle,
  isDefaultChannelName,
  maskApiKey,
} from './ProviderConnectionFieldUtils';

export function ProviderConnectionFields({
  providerId,
  name,
  apiHost,
  apiKey,
  showApiKey,
  apiKeyCopied,
  onNameChange,
  onApiHostChange,
  onApiKeyChange,
  onToggleApiKey,
  onCopyApiKey,
  autoFocusBaseUrl = false,
  onBaseUrlAutoFocusComplete,
  onCompositionChange,
}: {
  providerId: string;
  name: string;
  apiHost: string;
  apiKey: string;
  showApiKey: boolean;
  apiKeyCopied: boolean;
  onNameChange: (value: string) => void;
  onApiHostChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onToggleApiKey: () => void;
  onCopyApiKey: () => void;
  autoFocusBaseUrl?: boolean;
  onBaseUrlAutoFocusComplete?: () => void;
  onCompositionChange?: (isComposing: boolean) => void;
}) {
  const { t } = useI18n();
  const [apiKeyRevealedForEditing, setApiKeyRevealedForEditing] = useState(false);
  const [apiKeyTextWidthPx, setApiKeyTextWidthPx] = useState(410);
  const apiHostInputRef = useRef<HTMLInputElement>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const shouldSelectApiKeyBodyRef = useRef(false);
  const apiKeyVisible = Boolean(apiKey) && (showApiKey || apiKeyRevealedForEditing);
  const shouldShowRawApiKey = apiKeyVisible || !apiKey;
  const apiKeyDisplayValue = shouldShowRawApiKey ? apiKey : maskApiKey(apiKey);

  useEffect(() => {
    setApiKeyRevealedForEditing(false);
    shouldSelectApiKeyBodyRef.current = false;
  }, [providerId]);

  useEffect(() => {
    if (!autoFocusBaseUrl) {
      return;
    }

    const timer = window.setTimeout(() => {
      const input = apiHostInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      const caretPosition = input.value.length;
      input.setSelectionRange(caretPosition, caretPosition);
      onBaseUrlAutoFocusComplete?.();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [autoFocusBaseUrl, onBaseUrlAutoFocusComplete, providerId]);

  useEffect(() => {
    const input = apiKeyInputRef.current;
    if (!input) {
      return;
    }

    const updateInputTextWidth = () => {
      const style = window.getComputedStyle(input);
      const horizontalPadding =
        Number.parseFloat(style.paddingLeft || '0') + Number.parseFloat(style.paddingRight || '0');
      setApiKeyTextWidthPx(Math.max(140, input.clientWidth - horizontalPadding));
    };

    updateInputTextWidth();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateInputTextWidth);
      return () => window.removeEventListener('resize', updateInputTextWidth);
    }

    const observer = new ResizeObserver(updateInputTextWidth);
    observer.observe(input);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!apiKeyRevealedForEditing || !shouldSelectApiKeyBodyRef.current || !apiKey) {
      return;
    }

    shouldSelectApiKeyBodyRef.current = false;
    const input = apiKeyInputRef.current;
    if (!input) {
      return;
    }

    const range = getApiKeyEditableSelectionRange(apiKey);
    input.setSelectionRange(range.start, range.end);
  }, [apiKey, apiKeyRevealedForEditing]);

  const handleApiKeyVisibilityToggle = () => {
    if (showApiKey) {
      setApiKeyRevealedForEditing(false);
      onToggleApiKey();
      return;
    }

    if (apiKeyRevealedForEditing) {
      setApiKeyRevealedForEditing(false);
      return;
    }

    onToggleApiKey();
  };

  const handleApiKeyDoubleClick = () => {
    if (!apiKey) {
      return;
    }

    shouldSelectApiKeyBodyRef.current = true;
    setApiKeyRevealedForEditing(true);

    window.setTimeout(() => {
      const input = apiKeyInputRef.current;
      if (!input) {
        return;
      }

      shouldSelectApiKeyBodyRef.current = false;
      const range = getApiKeyEditableSelectionRange(apiKey);
      input.setSelectionRange(range.start, range.end);
    }, 0);
  };

  const selectDefaultChannelName = (input: HTMLInputElement) => {
    if (!isDefaultChannelName(name)) {
      return;
    }

    window.setTimeout(() => {
      input.select();
    }, 0);
  };

  return (
    <section className={cn("mb-2 min-w-0 overflow-hidden rounded-[var(--vlaina-ui-radius-group)] p-1", raisedPillSurfaceClass)}>
      <div className="flex flex-col">
        {/* Channel Label */}
        <div className="flex min-w-0 flex-wrap items-center gap-4 border-b border-transparent px-7 py-5 max-[640px]:px-4">
          <div className="w-32 shrink-0 max-[640px]:w-full">
            <div className="text-[var(--vlaina-font-sm)] font-semibold text-[var(--vlaina-sidebar-notes-text)]">
              {t('settings.ai.channelName')}
            </div>
          </div>
          <div className="min-w-[var(--vlaina-width-provider-field-min)] flex-1">
            <SettingsTextInput
              type="text"
              data-settings-provider-field="name"
              value={name}
              maxLength={MAX_AI_MODEL_FIELD_CHARS}
              aria-label={t('settings.ai.channelName')}
              onChange={(e) => onNameChange(e.target.value)}
              onCompositionStart={() => onCompositionChange?.(true)}
              onCompositionEnd={() => onCompositionChange?.(false)}
              onFocus={(event) => selectDefaultChannelName(event.currentTarget)}
              onClick={(event) => selectDefaultChannelName(event.currentTarget)}
              placeholder={t('settings.ai.newChannel')}
              className="w-full max-w-[var(--vlaina-size-520px)] max-[640px]:max-w-full"
              inputClassName={providerInputClassName}
              shellClassName={providerInputShellClassName}
            />
          </div>
        </div>

        {/* Base URL */}
        <div className="flex min-w-0 flex-wrap items-center gap-4 border-b border-transparent px-7 py-5 max-[640px]:px-4">
          <div className="w-32 shrink-0 max-[640px]:w-full">
            <div className="text-[var(--vlaina-font-sm)] font-semibold text-[var(--vlaina-sidebar-notes-text)]">
              {t('settings.ai.baseUrl', { url: '' }).replace(/[:：]\s*$/, '')}
            </div>
          </div>
          <div className="min-w-[var(--vlaina-width-provider-field-min)] flex-1">
            <SettingsTextInput
              ref={apiHostInputRef}
              type="text"
              data-settings-provider-field="api-host"
              value={apiHost}
              maxLength={MAX_AI_MODEL_FIELD_CHARS}
              aria-label={t('settings.ai.baseUrl', { url: '' }).replace(/[:：]\s*$/, '')}
              onChange={(e) => onApiHostChange(e.target.value)}
              onCompositionStart={() => onCompositionChange?.(true)}
              onCompositionEnd={() => onCompositionChange?.(false)}
              placeholder="https://api.openai.com"
              name={`provider-api-host-${providerId}`}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              className="w-full max-w-[var(--vlaina-size-520px)] max-[640px]:max-w-full"
              inputClassName={providerInputClassName}
              shellClassName={providerInputShellClassName}
            />
          </div>
        </div>

        {/* API Key */}
        <div className="flex min-w-0 flex-wrap items-center gap-4 px-7 py-5 max-[640px]:px-4">
          <div className="w-32 shrink-0 max-[640px]:w-full">
            <div className="text-[var(--vlaina-font-sm)] font-semibold text-[var(--vlaina-sidebar-notes-text)]">
              {t('settings.ai.apiKey')}
            </div>
          </div>
          <div className="min-w-[var(--vlaina-width-provider-field-min)] flex-1">
            <SettingsTextInput
              ref={apiKeyInputRef}
              type="text"
              data-settings-provider-field="api-key"
              value={apiKeyDisplayValue}
              maxLength={MAX_AI_MODEL_FIELD_CHARS}
              aria-label={t('settings.ai.apiKey')}
              onChange={(e) => onApiKeyChange(e.target.value)}
              onCompositionStart={() => onCompositionChange?.(true)}
              onCompositionEnd={() => onCompositionChange?.(false)}
              onFocus={() => {
                setApiKeyRevealedForEditing(true);
              }}
              onDoubleClick={handleApiKeyDoubleClick}
              placeholder="sk-..."
              name={`provider-api-key-${providerId}`}
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              style={getApiKeyInputStyle(apiKeyDisplayValue, apiKeyTextWidthPx)}
              className="w-full max-w-[var(--vlaina-size-520px)] max-[640px]:max-w-full"
              inputClassName={cn(providerInputClassName, 'pr-[var(--vlaina-space-575rem)] font-mono')}
              shellClassName={providerInputShellClassName}
              trailing={
                <div className="flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    data-settings-provider-action="toggle-api-key"
                    onClick={handleApiKeyVisibilityToggle}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--vlaina-sidebar-notes-text-soft)] transition-colors hover:bg-[var(--vlaina-hover)] hover:text-[var(--vlaina-sidebar-notes-text)]"
                    aria-label={apiKeyVisible ? t('settings.ai.hideApiKey') : t('settings.ai.showApiKey')}
                  >
                    <Icon name={apiKeyVisible ? 'common.eyeOff' : 'common.eye'} size="sm" />
                  </button>
                  <button
                    type="button"
                    data-settings-provider-action="copy-api-key"
                    onClick={onCopyApiKey}
                    disabled={!apiKey}
                    data-action="copy"
                    data-copied={apiKeyCopied ? 'true' : undefined}
                    className="settings-api-key-copy-button flex h-8 w-8 items-center justify-center rounded-lg text-[var(--vlaina-sidebar-notes-text-soft)] transition-colors hover:bg-[var(--vlaina-hover)] hover:text-[var(--vlaina-sidebar-notes-text)] disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-40)]"
                    aria-label={apiKeyCopied ? t('common.copied') : t('common.copy')}
                  >
                    <Icon name={apiKeyCopied ? 'common.check' : 'common.copy'} size="sm" />
                  </button>
                </div>
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}
