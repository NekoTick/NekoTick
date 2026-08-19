import { lazy, Suspense, useCallback, useState } from 'react';
import { AppIcon } from '@/components/common/AppIcon';
import { useI18n } from '@/lib/i18n';
import type { IconData } from './types';
import { DEFAULT_CALLOUT_ICON } from './types';
import { getCalloutIconValue } from './calloutIconUtils';
import { themeIconTokens } from '@/styles/themeTokens';

const UniversalIconPicker = lazy(async () => {
  const mod = await import('@/components/common/UniversalIconPicker/index');
  return { default: mod.UniversalIconPicker };
});

interface CalloutIconControlProps {
  icon: IconData;
  onChange: (value: string) => void;
}

interface CalloutIconPickerProps {
  currentIcon: string;
  onClose: () => void;
  onPreview: (value: string | null) => void;
  onRemove: () => void;
  onSelect: (value: string) => void;
}

function CalloutIconPicker({
  currentIcon,
  onClose,
  onPreview,
  onRemove,
  onSelect,
}: CalloutIconPickerProps) {
  return (
    <UniversalIconPicker
      onSelect={onSelect}
      onPreview={onPreview}
      onRemove={onRemove}
      onClose={onClose}
      hasIcon
      currentIcon={currentIcon}
      allowLegacyImageScheme
      showUploadTab={false}
      fixedPanelHeight
    />
  );
}

export function CalloutIconControl({ icon, onChange }: CalloutIconControlProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [previewIcon, setPreviewIcon] = useState<string | null>(null);
  const iconValue = getCalloutIconValue(icon);
  const displayedIcon = previewIcon || iconValue;

  const handleSelect = useCallback((value: string) => {
    onChange(value);
    setPreviewIcon(null);
    setIsOpen(false);
  }, [onChange]);

  const handleRemove = useCallback(() => {
    onChange(DEFAULT_CALLOUT_ICON.value);
    setPreviewIcon(null);
    setIsOpen(false);
  }, [onChange]);

  return (
    <span
      className="callout-icon-control"
      data-prevent-picker-close="true"
      data-no-editor-drag-box="true"
    >
      <button
        type="button"
        className="callout-icon-button"
        aria-label={t('editor.changeCalloutIcon')}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(true);
        }}
      >
        <AppIcon icon={displayedIcon} size={themeIconTokens.sizeRow} />
      </button>

      {isOpen && (
        <span className="callout-icon-picker" data-prevent-picker-close="true">
          <Suspense fallback={null}>
            <CalloutIconPicker
              currentIcon={iconValue}
              onClose={() => {
                setPreviewIcon(null);
                setIsOpen(false);
              }}
              onPreview={setPreviewIcon}
              onRemove={handleRemove}
              onSelect={handleSelect}
            />
          </Suspense>
        </span>
      )}
    </span>
  );
}
