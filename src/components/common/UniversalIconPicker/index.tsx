import { lazy, Suspense } from 'react';
import { Icon } from '@/components/ui/icons';
import { cn, iconButtonStyles } from '@/lib/utils';
import { PremiumSlider } from '@/components/ui/premium-slider';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { EmojiTab } from './EmojiTab';
import { useI18n } from '@/lib/i18n';
import type { CustomIcon } from './UploadTab';
import {
  isIconPickerDebugEnabled,
} from './debugLog';
import { useUniversalIconPickerController } from './useUniversalIconPickerController';

const LazyUploadTab = lazy(async () => {
  const mod = await import('./UploadTab');
  return { default: mod.UploadTab };
});

export interface UniversalIconPickerProps {
  onSelect: (emoji: string) => void;
  onPreview?: (emoji: string | null) => void;
  onRemove?: () => void;
  onClose: () => void;
  hasIcon?: boolean;
  currentIcon?: string;
  currentSize?: number;
  minSize?: number;
  maxSize?: number;
  onSizeChange?: (size: number) => void;
  onSizeConfirm?: (size: number) => void;
  customIcons?: CustomIcon[];
  customIconsLoading?: boolean;
  onUploadFile?: (file: File) => Promise<{ success: boolean; url?: string; error?: string }>;
  onDeleteCustomIcon?: (id: string) => void | Promise<void>;
  onSkinToneChange?: (tone: number) => void;
  onPreviewSkinTone?: (tone: number | null) => void;
  embedded?: boolean;
  imageLoader?: (src: string) => Promise<string>;
  emojiOnly?: boolean;
  emojiSearchQuery?: string;
  alwaysShowEmojiCategories?: boolean;
  surface?: boolean;
  allowLegacyImageScheme?: boolean;
  showUploadTab?: boolean;
  fixedPanelHeight?: boolean;
}

export function UniversalIconPicker({
  onSelect,
  onPreview,
  onRemove,
  onClose,
  hasIcon = false,
  currentIcon,
  currentSize,
  minSize = 20,
  maxSize = 150,
  onSizeChange,
  onSizeConfirm,
  
  customIcons = [],
  customIconsLoading = false,
  onUploadFile,
  onDeleteCustomIcon,
  
  onSkinToneChange,
  onPreviewSkinTone,

  embedded = false,
  imageLoader,
  emojiOnly = false,
  emojiSearchQuery,
  alwaysShowEmojiCategories = false,
  surface = !embedded,
  allowLegacyImageScheme = false,
  showUploadTab = true,
  fixedPanelHeight = false,
}: UniversalIconPickerProps) {
  const { t } = useI18n();
  const {
    containerRef,
    uploadTabEnabled,
    effectiveActiveTab,
    visibleRecentIcons,
    skinTone,
    debugCopied,
    activeEmojiCategory,
    setActiveEmojiCategory,
    handleTabChange,
    handleEmojiSelect,
    handleSkinToneChangeInternal,
    handleUploadSelect,
    handleRemoveEvent,
    handleRandom,
    handleCopyDebugLog,
  } = useUniversalIconPickerController({
    onSelect,
    onPreview,
    onRemove,
    onClose,
    customIcons,
    customIconsLoading,
    onSkinToneChange,
    onPreviewSkinTone,
    embedded,
    emojiOnly,
    allowLegacyImageScheme,
    showUploadTab,
  });

  return (
    <div
      ref={containerRef}
      data-no-editor-drag-box="true"
      className={cn(
        "flex flex-col gap-1 w-[var(--vlaina-size-352px)] select-none",
        !embedded && "absolute z-[var(--vlaina-z-50)]",
      )}
    >
      {isIconPickerDebugEnabled() && !embedded && (
        <button
          type="button"
          aria-label={t('icon.copyPickerLogs')}
          title={t('icon.copyPickerLogs')}
          data-prevent-picker-close="true"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void handleCopyDebugLog();
          }}
          className={cn(
            "fixed bottom-20 right-4 z-[var(--vlaina-z-max)] flex h-9 w-9 items-center justify-center rounded-[var(--vlaina-radius-10px)]",
            "text-[var(--vlaina-text-secondary)] transition-colors",
            raisedPillSurfaceClass,
            iconButtonStyles
          )}
        >
          <Icon name={debugCopied ? "common.check" : "common.copy"} size="md" />
        </button>
      )}

      {onSizeChange && currentSize !== undefined && (
        <div className="flex items-center px-4 py-1">
          <PremiumSlider
            min={minSize}
            max={maxSize}
            value={currentSize}
            onChange={(newVal: number) => {
              onSizeChange(newVal);
            }}
            onConfirm={onSizeConfirm}
          />
        </div>
      )}

      <div className={cn(
        "flex flex-col overflow-hidden",
        fixedPanelHeight && "min-h-[var(--vlaina-size-420px)]",
        surface && cn("!rounded-[var(--vlaina-ui-radius-panel)] backdrop-blur-[var(--vlaina-backdrop-blur-lg)]", raisedPillSurfaceClass)
      )}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[var(--vlaina-border)] overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleTabChange('emoji');
              }}
              className={cn(
                "text-sm font-medium pb-1 border-b-2 transition-all active:scale-[var(--vlaina-scale-95)] whitespace-nowrap",
                effectiveActiveTab === 'emoji'
                  ? "text-[var(--vlaina-text-primary)] border-[var(--vlaina-accent)]"
                  : "text-[var(--vlaina-text-tertiary)] border-transparent hover:text-[var(--vlaina-text-primary)]"
              )}
            >
              {t('icon.emoji')}
            </button>
            {uploadTabEnabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleTabChange('upload');
                }}
                className={cn(
                  "text-sm font-medium pb-1 border-b-2 transition-all active:scale-[var(--vlaina-scale-95)] whitespace-nowrap",
                  effectiveActiveTab === 'upload'
                    ? "text-[var(--vlaina-text-primary)] border-[var(--vlaina-accent)]"
                    : "text-[var(--vlaina-text-tertiary)] border-transparent hover:text-[var(--vlaina-text-primary)]"
                )}
              >
                {t('common.upload')}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRandom();
              }}
              className={cn("p-1 -ml-1 flex items-center justify-center transition-all active:scale-[var(--vlaina-scale-90)]", iconButtonStyles)}
            >
              <Icon name="misc.shuffle" size="md" />
            </button>
          </div>
          {hasIcon && onRemove && (
            <button
              type="button"
              onPointerDown={handleRemoveEvent}
              onMouseDown={handleRemoveEvent}
              onClick={handleRemoveEvent}
              className="text-xs font-medium transition-all active:scale-[var(--vlaina-scale-95)] text-[var(--vlaina-text-tertiary)] hover:text-[var(--vlaina-color-status-danger-fg)]"
            >
              {t('common.remove')}
            </button>
          )}
        </div>

        {effectiveActiveTab === 'emoji' ? (
          <EmojiTab
            skinTone={skinTone}
            setSkinTone={handleSkinToneChangeInternal}
            recentIcons={visibleRecentIcons}
            onSelect={handleEmojiSelect}
            onPreview={onPreview}
            currentIcon={currentIcon}
            activeCategory={activeEmojiCategory}
            onCategoryChange={setActiveEmojiCategory}
            onSkinToneChange={handleSkinToneChangeInternal}
            onPreviewSkinTone={onPreviewSkinTone}
            searchQuery={emojiSearchQuery}
            alwaysShowCategories={alwaysShowEmojiCategories}
            imageLoader={imageLoader}
            allowLegacyImageScheme={allowLegacyImageScheme}
          />
        ) : (
          <Suspense fallback={<div className="h-[var(--vlaina-size-320px)]" />}>
            <LazyUploadTab
              onSelect={handleUploadSelect}
              onPreview={onPreview}
              onClose={onClose}
              customIcons={customIcons}
              onUploadFile={onUploadFile}
              onDeleteCustomIcon={onDeleteCustomIcon}
              imageLoader={imageLoader}
              allowLegacyImageScheme={allowLegacyImageScheme}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
