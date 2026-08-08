import { useEffect, useRef, useState } from 'react';
import { Braces, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  appendFrontmatterListValue,
  removeFrontmatterListValue,
  setFrontmatterPropertyList,
  setFrontmatterPropertyValue,
  type FrontmatterProperty,
} from './frontmatterPropertiesModel';
import { isFrontmatterInputComposing } from './frontmatterInputEvents';

type FrontmatterPropertyValueProps = {
  editable: boolean;
  autoFocus?: boolean;
  property: FrontmatterProperty;
  rawText: string;
  onChange: (rawText: string) => void;
  onSourceModeChange: (sourceMode: boolean) => void;
};

function commitTextInput(
  event: React.FocusEvent<HTMLInputElement>,
  property: FrontmatterProperty,
  rawText: string,
  onChange: (rawText: string) => void,
) {
  const value = event.currentTarget.value;
  const nextValue = property.kind === 'number' ? Number(value) : value;
  if (property.kind === 'number' && (!value.trim() || !Number.isFinite(nextValue))) {
    event.currentTarget.value = String(property.value);
    return;
  }
  if (nextValue === property.value) return;
  const nextRawText = setFrontmatterPropertyValue(rawText, property.key, nextValue);
  if (nextRawText !== null && nextRawText !== rawText) onChange(nextRawText);
}

export function FrontmatterPropertyValue({
  editable,
  autoFocus = false,
  property,
  rawText,
  onChange,
  onSourceModeChange,
}: FrontmatterPropertyValueProps) {
  const { t } = useI18n();
  const [focusListInput, setFocusListInput] = useState(false);
  const listInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusListInput || property.kind !== 'list') return;
    listInputRef.current?.focus();
    setFocusListInput(false);
  }, [focusListInput, property.kind]);

  if (property.kind === 'boolean') {
    return (
      <label className="frontmatter-property-toggle">
        <input
          aria-label={property.key}
          autoFocus={autoFocus}
          checked={property.value}
          disabled={!editable}
          type="checkbox"
          onChange={(event) => {
            const next = setFrontmatterPropertyValue(rawText, property.key, event.currentTarget.checked);
            if (next !== null) onChange(next);
          }}
        />
        <span aria-hidden="true" />
      </label>
    );
  }

  if (property.kind === 'list') {
    return (
      <div className="frontmatter-property-list-value">
        {property.value.map((value, index) => (
          <span className="frontmatter-property-chip" key={`${String(value)}-${index}`}>
            <span>{String(value)}</span>
            {editable && (
              <button
                aria-label={`${t('common.remove')} ${String(value)}`}
                type="button"
                onClick={() => {
                  const next = removeFrontmatterListValue(rawText, property.key, index);
                  if (next !== null) onChange(next);
                }}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        {editable && (
          <input
            ref={listInputRef}
            aria-label={property.key}
            autoFocus={autoFocus}
            onKeyDown={(event) => {
              if (isFrontmatterInputComposing(event)) return;
              if (
                event.key !== 'Enter'
                || (!event.ctrlKey && !event.metaKey)
              ) return;
              event.preventDefault();
              const next = appendFrontmatterListValue(rawText, property.key, event.currentTarget.value);
              if (next !== null) {
                event.currentTarget.value = '';
                onChange(next);
              }
            }}
          />
        )}
      </div>
    );
  }

  if (property.kind === 'complex') {
    return (
      <button
        className="frontmatter-property-complex-value"
        type="button"
        onClick={() => onSourceModeChange(true)}
      >
        <code>{property.value}</code>
        <Braces aria-hidden="true" />
      </button>
    );
  }

  return (
    <input
      key={`${property.key}-${String(property.value)}`}
      aria-label={property.key}
      className="frontmatter-property-value-input"
      autoFocus={autoFocus}
      defaultValue={String(property.value)}
      readOnly={!editable}
      type={property.kind === 'number' ? 'number' : 'text'}
      onBlur={(event) => commitTextInput(event, property, rawText, onChange)}
      onKeyDown={(event) => {
        if (isFrontmatterInputComposing(event)) return;
        if (
          event.key === 'Enter'
          && (event.ctrlKey || event.metaKey)
          && property.kind === 'text'
        ) {
          event.preventDefault();
          const next = setFrontmatterPropertyList(rawText, property.key, event.currentTarget.value);
          if (next !== null) {
            setFocusListInput(true);
            onChange(next);
          }
          return;
        }
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          event.currentTarget.value = String(property.value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
