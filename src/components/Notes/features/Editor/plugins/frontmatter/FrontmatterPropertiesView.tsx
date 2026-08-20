import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Braces,
  List,
  Plus,
  X,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { focusNoteTitleInputAtEnd } from '../../utils/titleInputDom';
import {
  addFrontmatterProperty,
  deleteFrontmatterProperty,
  renameFrontmatterProperty,
  type FrontmatterPropertiesResult,
} from './frontmatterPropertiesModel';
import { isFrontmatterInputComposing } from './frontmatterInputEvents';
import { FrontmatterPropertyValue } from './FrontmatterPropertyValue';

type FrontmatterPropertiesViewProps = {
  editable: boolean;
  rawText: string;
  result: FrontmatterPropertiesResult;
  sourceMode: boolean;
  onChange: (rawText: string) => void;
  onSourceModeChange: (sourceMode: boolean) => void;
};

export function FrontmatterPropertiesView({
  editable,
  rawText,
  result,
  sourceMode,
  onChange,
  onSourceModeChange,
}: FrontmatterPropertiesViewProps) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [newKeyInvalid, setNewKeyInvalid] = useState(false);
  const [pendingValueFocusKey, setPendingValueFocusKey] = useState<string | null>(null);
  const newKeyRef = useRef<HTMLInputElement>(null);
  const composingInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCompositionBlurCommitRef = useRef<{
    input: HTMLInputElement;
    commit: () => void;
  } | null>(null);

  const handleInputCompositionStart = (event: React.CompositionEvent<HTMLInputElement>) => {
    composingInputRef.current = event.currentTarget;
  };
  const handleInputCompositionEnd = (event: React.CompositionEvent<HTMLInputElement>) => {
    if (composingInputRef.current !== event.currentTarget) return;
    composingInputRef.current = null;
    const pendingCommit = pendingCompositionBlurCommitRef.current;
    pendingCompositionBlurCommitRef.current = null;
    if (pendingCommit?.input === event.currentTarget) pendingCommit.commit();
  };
  const commitInputBlur = (input: HTMLInputElement, commit: () => void) => {
    if (composingInputRef.current === input) {
      pendingCompositionBlurCommitRef.current = { input, commit };
      return;
    }
    commit();
  };

  useLayoutEffect(() => {
    if (adding) newKeyRef.current?.focus();
  }, [adding]);

  useEffect(() => {
    if (
      pendingValueFocusKey
      && result.valid
      && result.properties.some((property) => property.key === pendingValueFocusKey)
    ) {
      setPendingValueFocusKey(null);
    }
  }, [pendingValueFocusKey, result]);

  const apply = (nextRawText: string | null) => {
    if (nextRawText !== null && nextRawText !== rawText) onChange(nextRawText);
  };
  const commitNewProperty = (focusValue = false) => {
    const input = newKeyRef.current;
    if (!input) return;
    const key = input.value.trim();
    if (!key) {
      setAdding(false);
      setNewKeyInvalid(false);
      return;
    }
    if (result.valid && result.properties.some((property) => property.key === key)) {
      setNewKeyInvalid(true);
      return;
    }
    const nextRawText = addFrontmatterProperty(rawText, key);
    if (nextRawText === null) {
      setNewKeyInvalid(true);
      return;
    }
    if (focusValue) setPendingValueFocusKey(key);
    apply(nextRawText);
    setAdding(false);
    setNewKeyInvalid(false);
  };

  return (
    <div
      className="frontmatter-properties-view"
      onMouseDown={(event) => {
        if (
          event.button !== 0
          || event.metaKey
          || event.ctrlKey
          || event.altKey
          || event.shiftKey
          || sourceMode
        ) return;
        const target = event.target;
        if (
          target instanceof Element
          && target.closest('button, input, label, .frontmatter-property-chip')
        ) return;
        event.preventDefault();
        event.stopPropagation();
        focusNoteTitleInputAtEnd(event.currentTarget.ownerDocument);
      }}
    >
      <div className="frontmatter-properties-toolbar">
        <button
          className="frontmatter-properties-mode"
          aria-label={t(sourceMode ? 'editor.frontmatterProperties' : 'editor.frontmatterSource')}
          disabled={sourceMode && !result.valid}
          type="button"
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            const focusButton = sourceMode ? event.currentTarget : null;
            onSourceModeChange(!sourceMode);
            focusButton?.focus({ preventScroll: true });
          }}
          onClick={(event) => {
            if (event.detail === 0) onSourceModeChange(!sourceMode);
          }}
        >
          {sourceMode ? <List aria-hidden="true" /> : <Braces aria-hidden="true" />}
        </button>
      </div>

      {!sourceMode && result.valid && (
        <div className="frontmatter-properties-list">
          {result.properties.map((property) => (
            <div className="frontmatter-property-row" key={property.key}>
              <input
                key={property.key}
                className="frontmatter-property-key-input"
                defaultValue={property.key}
                readOnly={!editable}
                onBlur={(event) => {
                  const input = event.currentTarget;
                  commitInputBlur(input, () => {
                    const next = renameFrontmatterProperty(rawText, property.key, input.value);
                    if (next === null || next === rawText) input.value = property.key;
                    else onChange(next);
                  });
                }}
                onCompositionStart={handleInputCompositionStart}
                onCompositionEnd={handleInputCompositionEnd}
                onKeyDown={(event) => {
                  if (
                    composingInputRef.current === event.currentTarget
                    || isFrontmatterInputComposing(event)
                  ) return;
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    event.currentTarget.value = property.key;
                    event.currentTarget.blur();
                  }
                }}
              />
              <FrontmatterPropertyValue
                editable={editable}
                autoFocus={pendingValueFocusKey === property.key}
                property={property}
                rawText={rawText}
                onChange={onChange}
                onSourceModeChange={onSourceModeChange}
              />
              {editable && (
                <button
                  className="frontmatter-property-delete"
                  aria-label={`${t('common.delete')} ${property.key}`}
                  type="button"
                  onClick={() => apply(deleteFrontmatterProperty(rawText, property.key))}
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
          ))}

          {adding ? (
            <div className="frontmatter-property-row frontmatter-property-row-new">
              <input
                ref={newKeyRef}
                aria-invalid={newKeyInvalid}
                className="frontmatter-property-key-input"
                placeholder={t('editor.frontmatterPropertyName')}
                onBlur={(event) => {
                  commitInputBlur(event.currentTarget, () => commitNewProperty());
                }}
                onChange={() => setNewKeyInvalid(false)}
                onCompositionStart={handleInputCompositionStart}
                onCompositionEnd={handleInputCompositionEnd}
                onKeyDown={(event) => {
                  if (
                    composingInputRef.current === event.currentTarget
                    || isFrontmatterInputComposing(event)
                  ) return;
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitNewProperty(true);
                  }
                  if (event.key === 'Escape') setAdding(false);
                  if (event.key === 'Tab' && !event.shiftKey) {
                    event.preventDefault();
                    commitNewProperty(true);
                  }
                }}
              />
            </div>
          ) : editable && (
            <button
              className="frontmatter-property-add"
              type="button"
              onMouseDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                setAdding(true);
              }}
              onClick={() => setAdding(true)}
            >
              <Plus aria-hidden="true" />
              <span>{t('common.add')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
