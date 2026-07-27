import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { SettingsTextInput } from '@/components/Settings/components/SettingsFields';
import { cn } from '@/lib/utils';
import {
  parseQuickAddModelIds,
  replaceTrailingQuickAddSegment,
} from './ProviderModelListParts';
import { useI18n } from '@/lib/i18n';
import { rankByFuzzySearch } from './fuzzyModelSearch';
import { providerInputClassName, providerInputShellClassName } from './providerInputStyles';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { handleScrollableWheel } from '@/lib/scroll/wheelScroll';
import { MAX_AI_MODEL_FIELD_CHARS } from '@/lib/storage/unifiedStorage';

interface ProviderQuickAddProps {
  value: string;
  error: string;
  sortedFetchedModels: string[];
  providerModelIdSet: Set<string>;
  onValueChange: (value: string) => void;
  onAddAllVisible: (modelIds: string[]) => void;
  onSetError: (message: string) => void;
}

export function ProviderQuickAdd({
  value,
  error,
  sortedFetchedModels,
  providerModelIdSet,
  onValueChange,
  onAddAllVisible,
  onSetError,
}: ProviderQuickAddProps) {
  const { t } = useI18n();
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const suggestionListId = useId();
  const isComposingRef = useRef(false);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const quickAddIds = useMemo(() => parseQuickAddModelIds(value), [value]);
  const quickAddQuery = useMemo(() => {
    const quickAddSegments = value.split(/[,\uFF0C]/);
    return quickAddSegments[quickAddSegments.length - 1]?.trim() ?? '';
  }, [value]);
  const queuedQuickAddIds = useMemo(
    () => new Set(quickAddIds.slice(0, -1).map((id) => id.toLowerCase())),
    [quickAddIds]
  );
  const suggestions = useMemo(
    () =>
      quickAddQuery
        ? rankByFuzzySearch(
            sortedFetchedModels.filter((modelId) => {
              const normalizedModelId = modelId.toLowerCase();
              return (
                !providerModelIdSet.has(normalizedModelId) &&
                !queuedQuickAddIds.has(normalizedModelId)
              );
            }),
            quickAddQuery,
            (modelId) => modelId
          )
        : [],
    [providerModelIdSet, queuedQuickAddIds, quickAddQuery, sortedFetchedModels]
  );
  const showSuggestions = isFocused && suggestions.length > 0;

  useEffect(() => {
    if (suggestions.length === 0) {
      if (highlightedIndex !== 0) {
        setHighlightedIndex(0);
      }
      return;
    }

    const maxHighlightedIndex = suggestions.length - 1;
    if (highlightedIndex > maxHighlightedIndex) {
      setHighlightedIndex(maxHighlightedIndex);
    }
  }, [highlightedIndex, suggestions.length]);

  useEffect(() => {
    if (!showSuggestions) return;
    const highlightedItem = itemRefs.current[highlightedIndex];
    if (typeof highlightedItem?.scrollIntoView === 'function') {
      highlightedItem.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, showSuggestions]);

  const submit = (modelId?: string) => {
    if (isComposingRef.current) return;
    const nextValue = modelId ? replaceTrailingQuickAddSegment(value, modelId) : value;
    const nextModelIds = parseQuickAddModelIds(nextValue);
    const dedupedModelIds = nextModelIds.filter((id, index) => {
      const normalizedId = id.toLowerCase();
      return nextModelIds.findIndex((item) => item.toLowerCase() === normalizedId) === index;
    });

    if (dedupedModelIds.length === 0) return;

    const addableModelIds = dedupedModelIds.filter((id) => !providerModelIdSet.has(id.toLowerCase()));
    if (addableModelIds.length > 0) {
      onAddAllVisible(addableModelIds);
    }

    onSetError('');
    onValueChange('');
    setHighlightedIndex(0);
    setIsFocused(false);
  };

  return (
    <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="relative">
        <SettingsTextInput
          type="text"
          data-settings-provider-action="quick-add-model"
          value={value}
          maxLength={MAX_AI_MODEL_FIELD_CHARS}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? suggestionListId : undefined}
          aria-activedescendant={showSuggestions ? `${suggestionListId}-option-${highlightedIndex}` : undefined}
          aria-label={t('settings.ai.addModelId')}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={(e) => {
            setIsFocused(true);
            onValueChange(e.target.value);
            setHighlightedIndex(0);
            if (error) onSetError('');
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onKeyDown={(e) => {
            const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number };
            if (native.isComposing || native.keyCode === 229 || isComposingRef.current) {
              return;
            }

            if (showSuggestions && e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlightedIndex((current) => Math.min(current + 1, suggestions.length - 1));
              return;
            }

            if (showSuggestions && e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlightedIndex((current) => Math.max(current - 1, 0));
              return;
            }

            if (showSuggestions && e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setIsFocused(false);
              return;
            }

            if (e.key === 'Enter') {
              e.preventDefault();
              if (showSuggestions) {
                submit(suggestions[highlightedIndex]);
                return;
              }
              submit();
            }
          }}
          placeholder={t('settings.ai.addModelId')}
          inputClassName={providerInputClassName}
          shellClassName={providerInputShellClassName}
        />
        {showSuggestions ? (
          <div className="absolute left-0 right-0 top-[var(--vlaina-offset-dropdown-below-input)] z-[var(--vlaina-z-20)] overflow-hidden rounded-[var(--vlaina-ui-radius-panel)] border border-[var(--vlaina-border)] bg-[var(--vlaina-color-setting-field)] shadow-[var(--vlaina-shadow-floating-panel)]">
            <div
              id={suggestionListId}
              role="listbox"
              className="max-h-64 overflow-y-auto p-1.5"
              data-settings-scroll-root="ai-model-suggestions"
              onWheel={handleScrollableWheel}
            >
              {suggestions.map((modelId, index) => (
                <button
                  key={modelId}
                  id={`${suggestionListId}-option-${index}`}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  tabIndex={-1}
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => submit(modelId)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    'flex w-full items-center rounded-[var(--vlaina-ui-radius-compact)] px-3.5 py-2.5 text-left text-[var(--vlaina-font-13)] font-medium transition-colors',
                    index === highlightedIndex
                      ? 'bg-[var(--vlaina-hover-filled)] text-[var(--vlaina-sidebar-notes-text)]'
                      : 'text-[var(--vlaina-sidebar-notes-text-soft)] hover:bg-[var(--vlaina-hover)] hover:text-[var(--vlaina-sidebar-notes-text)]'
                  )}
                >
                  <span className="truncate">{modelId}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        aria-label={t('settings.ai.addModels')}
        onClick={() => submit()}
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent text-[var(--vlaina-sidebar-notes-text-soft)] transition-colors hover:bg-transparent hover:text-[var(--vlaina-sidebar-row-selected-text)]',
          raisedPillSurfaceClass
        )}
      >
        <Icon name="common.add" size="md" />
      </button>
    </div>
  );
}
