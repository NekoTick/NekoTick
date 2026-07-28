import { useI18n } from '@/lib/i18n';
import { AssetGrid } from './AssetGrid';
import { AssetLibraryLoadingState } from './AssetLibraryLoadingState';
import type { CoverPickerTab } from './types';
import { UploadZone } from './UploadZone';

interface CoverPickerBodyProps {
  activeTab: CoverPickerTab;
  currentNotePath?: string;
  hasAssets: boolean;
  isLoading: boolean;
  isUploading: boolean;
  notesRootPath: string;
  onHover: (assetPath: string | null) => void;
  onSelect: (assetPath: string) => void;
  onUploadComplete: (assetPath: string) => void;
}

export function CoverPickerBody({
  activeTab,
  currentNotePath,
  hasAssets,
  isLoading,
  isUploading,
  notesRootPath,
  onHover,
  onSelect,
  onUploadComplete,
}: CoverPickerBodyProps) {
  const { t } = useI18n();

  if (isLoading) {
    return <AssetLibraryLoadingState />;
  }

  if (activeTab === 'library' && hasAssets) {
    return (
      <AssetGrid
        onSelect={onSelect}
        onHover={onHover}
        notesRootPath={notesRootPath}
        currentNotePath={currentNotePath}
        compact
      />
    );
  }

  return (
    <div className="p-3">
      <UploadZone onUploadComplete={onUploadComplete} compact currentNotePath={currentNotePath} />
      {isUploading ? (
        <p className="mt-1 text-xs text-center text-[var(--vlaina-accent)]">
          {t('asset.uploading')}
        </p>
      ) : null}
    </div>
  );
}
