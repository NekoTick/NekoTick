import type { SyntheticEvent } from 'react';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { CoverPickerTab } from './types';

interface CoverPickerHeaderProps {
  activeTab: CoverPickerTab;
  onSelectLibrary: () => void;
  onSelectUpload: () => void;
  onRemoveCover?: (event: SyntheticEvent<HTMLButtonElement>) => void;
}

export function CoverPickerHeader({
  activeTab,
  onSelectLibrary,
  onSelectUpload,
  onRemoveCover,
}: CoverPickerHeaderProps) {
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vlaina-border)]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSelectLibrary}
          className={cn(
            'text-xs font-medium px-2 py-1 rounded transition-colors',
            activeTab === 'library'
              ? 'bg-[var(--vlaina-color-accent-soft-bg)] text-[var(--vlaina-accent)]'
              : 'text-[var(--vlaina-text-secondary)] hover:text-[var(--vlaina-text-primary)]',
          )}
        >
          <Icon size="md" name="file.image" className="inline mr-1" />
          {t('asset.library')}
        </button>
        <button
          type="button"
          onClick={onSelectUpload}
          className={cn(
            'text-xs font-medium px-2 py-1 rounded transition-colors',
            activeTab === 'upload'
              ? 'bg-[var(--vlaina-color-accent-soft-bg)] text-[var(--vlaina-accent)]'
              : 'text-[var(--vlaina-text-secondary)] hover:text-[var(--vlaina-text-primary)]',
          )}
        >
          <Icon size="md" name="common.upload" className="inline mr-1" />
          {t('common.upload')}
        </button>
      </div>
      {onRemoveCover ? (
        <button
          type="button"
          onPointerDown={onRemoveCover}
          onMouseDown={onRemoveCover}
          onClick={onRemoveCover}
          className="text-xs text-[var(--vlaina-text-tertiary)] hover:text-[var(--vlaina-text-primary)] transition-colors"
        >
          {t('common.remove')}
        </button>
      ) : null}
    </div>
  );
}
