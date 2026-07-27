import { useCallback, useEffect, useRef, useState } from 'react';
import { useAIStore } from '@/stores/useAIStore';
import { SettingsTextarea } from '@/components/Settings/components/SettingsFields';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { SETTINGS_BEFORE_CLOSE_EVENT } from '../../settingsEvents';

const SYSTEM_PROMPT_MAX_LENGTH = 4000;

export function AIBehaviorSettings() {
  const { t } = useI18n();
  const {
    customSystemPrompt,
    setCustomSystemPrompt,
  } = useAIStore();
  const [draftSystemPrompt, setDraftSystemPrompt] = useState(customSystemPrompt);
  const isEditingPromptRef = useRef(false);
  const isComposingPromptRef = useRef(false);
  const latestDraftRef = useRef(draftSystemPrompt);
  const latestPersistedPromptRef = useRef(customSystemPrompt);

  useEffect(() => {
    latestDraftRef.current = draftSystemPrompt;
  }, [draftSystemPrompt]);

  useEffect(() => {
    latestPersistedPromptRef.current = customSystemPrompt;
    if (!isEditingPromptRef.current) {
      setDraftSystemPrompt(customSystemPrompt);
    }
  }, [customSystemPrompt]);

  const flushLatestPromptDraft = useCallback(() => {
    if (!isEditingPromptRef.current || isComposingPromptRef.current) return;
    const latestDraft = latestDraftRef.current;
    const latestPersistedPrompt = latestPersistedPromptRef.current;
    if (latestDraft !== latestPersistedPrompt) {
      setCustomSystemPrompt(latestDraft);
    }
    isEditingPromptRef.current = false;
  }, [setCustomSystemPrompt]);

  useEffect(() => {
    window.addEventListener(SETTINGS_BEFORE_CLOSE_EVENT, flushLatestPromptDraft);
    return () => {
      window.removeEventListener(SETTINGS_BEFORE_CLOSE_EVENT, flushLatestPromptDraft);
      flushLatestPromptDraft();
    };
  }, [flushLatestPromptDraft]);

  const commitPromptDraft = () => {
    if (isComposingPromptRef.current) {
      return;
    }
    if (draftSystemPrompt !== customSystemPrompt) {
      setCustomSystemPrompt(draftSystemPrompt);
    }
    isEditingPromptRef.current = false;
  };

  return (
    <section className="mx-auto mb-10 max-w-5xl">
      <div className="mb-4 px-2">
        <h3 className="text-[var(--vlaina-font-13)] font-medium text-[var(--vlaina-sidebar-notes-text-soft)]">{t('settings.ai.systemPrompt')}</h3>
      </div>

      <div className={cn("min-w-0 overflow-hidden rounded-[var(--vlaina-ui-radius-group)] p-2", raisedPillSurfaceClass)}>
        <SettingsTextarea
          data-settings-control="ai-system-prompt"
          autoGrow={true}
          value={draftSystemPrompt}
          aria-label={t('settings.ai.systemPrompt')}
          onChange={(event) => {
            isEditingPromptRef.current = true;
            setDraftSystemPrompt(event.target.value);
          }}
          onBlur={commitPromptDraft}
          onCompositionStart={() => {
            isComposingPromptRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingPromptRef.current = false;
          }}
          maxLength={SYSTEM_PROMPT_MAX_LENGTH}
          rows={1}
          placeholder={t('settings.ai.systemPromptPlaceholder')}
          textareaClassName="max-h-[var(--vlaina-size-320px)] bg-transparent border-0 ring-0 focus:ring-0 text-[var(--vlaina-font-sm)] px-4 py-3 text-[var(--vlaina-sidebar-notes-text)]"
          shellClassName="border-0 shadow-[var(--vlaina-shadow-none)] bg-transparent"
        />
      </div>
    </section>
  );
}
