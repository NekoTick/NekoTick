import { useState, useCallback, useEffect, useRef } from 'react';
import { useNotesStore } from '@/stores/notes/useNotesStore';
import { cn } from '@/lib/utils';
import { CoverPickerProps, CoverPickerTab } from './types';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { useI18n } from '@/lib/i18n';
import { themeLazyLoadTokens } from '@/styles/themeTokens';
import { extractImageFilesFromClipboardData } from '@/lib/assets/imageClipboardFiles';
import { normalizeUserFacingErrorMessage } from '@/lib/i18n/userFacingErrors';
import { CoverPickerBody } from './CoverPickerBody';
import { CoverPickerHeader } from './CoverPickerHeader';
import { CoverPickerStatus } from './CoverPickerStatus';

export function CoverPicker({
  isOpen,
  onClose,
  onSelect,
  onRemove,
  onPreview,
  notesRootPath,
  currentNotePath,
  anchorPlacement = 'cover',
}: CoverPickerProps) {
  const { t } = useI18n();
  const assetList = useNotesStore((state) => state.assetList);
  const isLoadingAssets = useNotesStore((state) => state.isLoadingAssets);
  const assetLoadError = useNotesStore((state) => state.assetLoadError);
  const loadAssets = useNotesStore((state) => state.loadAssets);
  const uploadAsset = useNotesStore((state) => state.uploadAsset);
  const hasAssets = assetList.length > 0;
  const [activeTab, setActiveTab] = useState<CoverPickerTab>('library');
  const [isUploading, setIsUploading] = useState(false);
  const [pasteUploadError, setPasteUploadError] = useState<string | null>(null);
  const [isPickerAssetRefreshPending, setIsPickerAssetRefreshPending] = useState(
    () => isOpen && Boolean(notesRootPath)
  );
  const assetRefreshScope = `${notesRootPath}\0${currentNotePath ?? ''}`;

  const uploadingRef = useRef(false);
  const mountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const requestedAssetScopeRef = useRef<string | null>(null);
  const removeTriggeredRef = useRef(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPreviewAssetRef = useRef<string | null>(null);
  const showHeaderControls = hasAssets || Boolean(onRemove);
  const anchorClassName = cn(
    'absolute w-1 h-1 pointer-events-none',
    anchorPlacement === 'empty-cover-option'
      ? 'top-[var(--vlaina-size-80px)] right-[var(--vlaina-width-cover-picker-inset)]'
      : 'bottom-4 right-4'
  );
  const isUnrefreshedAssetScope =
    isOpen && Boolean(notesRootPath) && requestedAssetScopeRef.current !== assetRefreshScope;
  const shouldShowLibraryLoading = activeTab === 'library' && (
    isPickerAssetRefreshPending ||
    isUnrefreshedAssetScope ||
    (isLoadingAssets && !hasAssets)
  );
  const assetLoadErrorMessage = assetLoadError
    ? normalizeUserFacingErrorMessage(assetLoadError, 'asset.loadFailed') || t('asset.loadFailed')
    : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      uploadingRef.current = false;
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      uploadingRef.current = false;
      removeTriggeredRef.current = false;
      latestPreviewAssetRef.current = null;
      setPasteUploadError(null);
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    }
  }, [isOpen]);

  const requestAssetRefresh = useCallback(async () => {
    if (!notesRootPath) return;

    requestedAssetScopeRef.current = assetRefreshScope;
    setIsPickerAssetRefreshPending(true);
    try {
      await loadAssets(notesRootPath);
    } catch {
      // The store retains the previous library and exposes the scoped error.
    } finally {
      if (
        mountedRef.current &&
        isOpenRef.current &&
        requestedAssetScopeRef.current === assetRefreshScope
      ) {
        setIsPickerAssetRefreshPending(false);
      }
    }
  }, [assetRefreshScope, loadAssets, notesRootPath]);

  useEffect(() => {
    if (isOpen && notesRootPath) {
      void requestAssetRefresh();
      return;
    }

    requestedAssetScopeRef.current = null;
    setIsPickerAssetRefreshPending(false);

    if (!isOpen) {
      const timer = setTimeout(() => {
        setActiveTab('library');
        setIsUploading(false);
      }, themeLazyLoadTokens.coverPickerResetAfterCloseDelayMs);
      return () => clearTimeout(timer);
    }
  }, [isOpen, notesRootPath, requestAssetRefresh]);

  useEffect(() => {
    setPasteUploadError(null);
  }, [assetRefreshScope]);

  const handleAssetSelect = useCallback((assetPath: string) => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    latestPreviewAssetRef.current = null;
    onSelect(assetPath);
  }, [onSelect]);

  const handleAssetHover = useCallback((assetPath: string | null) => {
    latestPreviewAssetRef.current = assetPath;
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    if (!assetPath) {
      onPreview?.(null);
      return;
    }

    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      if (latestPreviewAssetRef.current === assetPath) {
        onPreview?.(assetPath);
      }
    }, themeLazyLoadTokens.coverPreviewDelayMs);
  }, [onPreview]);

  const handleUploadComplete = useCallback((assetPath: string) => {
    onSelect(assetPath);
  }, [onSelect]);

  const handleRemoveCover = useCallback((event: React.SyntheticEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (removeTriggeredRef.current) return;
    removeTriggeredRef.current = true;
    onPreview?.(null);
    onRemove?.();
    onClose();
  }, [onClose, onPreview, onRemove]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideMouseDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('[data-slot="popover-content"], [data-no-editor-drag-box="true"], [data-note-cover-region="true"]')) {
        return;
      }

      onPreview?.(null);
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) {
        return;
      }
      if (e.key === 'Escape') {
        onPreview?.(null);
        onClose();
      }
    };

    const handlePaste = async (e: ClipboardEvent) => {
      if (e.defaultPrevented || uploadingRef.current) return;

      const file = extractImageFilesFromClipboardData(e.clipboardData)[0];
      if (!file) return;

      e.preventDefault();
      uploadingRef.current = true;
      setIsUploading(true);
      setPasteUploadError(null);

      try {
        const result = await uploadAsset(file, currentNotePath);

        if (mountedRef.current && isOpenRef.current) {
          if (result.success && result.path) {
            onSelect(result.path);
          } else {
            setPasteUploadError(
              normalizeUserFacingErrorMessage(result.error, 'asset.uploadFailed') || t('asset.uploadFailed'),
            );
          }
        }
      } catch (error) {
        if (mountedRef.current && isOpenRef.current) {
          setPasteUploadError(
            normalizeUserFacingErrorMessage(error, 'asset.uploadFailed') || t('asset.uploadFailed'),
          );
        }
      } finally {
        uploadingRef.current = false;
        if (mountedRef.current && isOpenRef.current) {
          setIsUploading(false);
        }
      }
    };

    document.addEventListener('mousedown', handleOutsideMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('mousedown', handleOutsideMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('paste', handlePaste);
    };
  }, [currentNotePath, isOpen, onClose, uploadAsset, onSelect, onPreview, t]);

  return (
    <Popover open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor className={anchorClassName} />

      <PopoverContent
        data-no-editor-drag-box="true"
        className={cn(
          "w-[var(--vlaina-size-340px)] !rounded-[var(--vlaina-notes-ui-radius-panel)] p-0 flex flex-col overflow-hidden z-[var(--vlaina-z-50)] pointer-events-auto select-none backdrop-blur-[var(--vlaina-backdrop-blur-lg)]",
          raisedPillSurfaceClass,
        )}
        align="end"
        side="bottom"
        sideOffset={8}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {showHeaderControls ? (
          <CoverPickerHeader
            activeTab={activeTab}
            onSelectLibrary={() => setActiveTab('library')}
            onSelectUpload={() => {
              handleAssetHover(null);
              setActiveTab('upload');
            }}
            onRemoveCover={onRemove ? handleRemoveCover : undefined}
          />
        ) : null}

        <CoverPickerStatus
          assetLoadError={activeTab === 'library' ? assetLoadErrorMessage : null}
          pasteUploadError={pasteUploadError}
          onRetry={() => void requestAssetRefresh()}
        />

        <div className="flex-1 overflow-hidden">
          <CoverPickerBody
            activeTab={activeTab}
            currentNotePath={currentNotePath}
            hasAssets={hasAssets}
            isLoading={shouldShowLibraryLoading}
            isUploading={isUploading}
            notesRootPath={notesRootPath}
            onHover={handleAssetHover}
            onSelect={handleAssetSelect}
            onUploadComplete={handleUploadComplete}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
