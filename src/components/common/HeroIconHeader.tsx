import { useRef, lazy, Suspense } from 'react';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { type CustomIcon } from '@/lib/storage/unifiedStorage';
import { type ItemColor } from '@/lib/colors';
import { IconSize } from '@/components/ui/icons/sizes';
import { useI18n } from '@/lib/i18n';
import { themeDomStyleTokens } from '@/styles/themeTokens';
import { HeaderIcon, resolvePixelSize } from './HeroIconHeaderIcon';
import { useHeroIconHeaderPicker } from './useHeroIconHeaderPicker';

const IconPicker = lazy(async () => {
  const mod = await import('@/components/common/UniversalIconPicker/index');
  return { default: mod.UniversalIconPicker };
});

interface HeroIconHeaderProps {
  id: string;
  icon: string | null;
  onIconChange: (icon: string | null) => void;
  onColorChange?: (color: ItemColor) => void;
  initialColor?: ItemColor;

  title?: string;
  renderTitle?: () => React.ReactNode;

  iconSize?: number | IconSize;
  minIconSize?: number;
  maxIconSize?: number;
  sliderValue?: number;
  onSizeChange?: (size: number) => void;
  onSizeConfirm?: (size: number) => void;

  customIcons?: CustomIcon[];
  onUploadFile?: (file: File) => Promise<{ success: boolean; url?: string; error?: string }>;
  onDeleteCustomIcon?: (id: string) => void | Promise<void>;
  onIconPickerOpen?: () => void | Promise<void>;
  imageLoader?: (src: string) => Promise<string>;
  allowLegacyImageScheme?: boolean;
  onRequestRandomIcon?: () => string | null;

  className?: string;
  titleClassName?: string;
  coverUrl?: string | null;
  coverLayoutActive?: boolean;
  children?: React.ReactNode;
  compact?: boolean;
  readOnly?: boolean;
}

export function HeroIconHeader({
  id,
  icon,
  onIconChange,
  iconSize = 60,
  minIconSize,
  maxIconSize,
  sliderValue,
  onSizeChange,
  onSizeConfirm,
  title,
  renderTitle,
  customIcons,
  onUploadFile,
  onDeleteCustomIcon,
  onIconPickerOpen,
  imageLoader,
  allowLegacyImageScheme = false,
  onRequestRandomIcon,
  className,
  titleClassName,
  coverUrl,
  coverLayoutActive = Boolean(coverUrl),
  children,
  compact = false,
  readOnly = false,
}: HeroIconHeaderProps) {
  const { t } = useI18n();
  const iconButtonRef = useRef<HTMLButtonElement>(null);
  const resolvedIconSize = resolvePixelSize(iconSize);
  const {
    headerRef,
    showIconPicker,
    isHoveringHeader,
    setIsHoveringHeader,
    committedIcon,
    currentSliderValue,
    handleIconSelect,
    handlePreview,
    handlePreviewTone,
    handleRemoveIcon,
    handlePickerClose,
    handleLocalSizeChange,
    handleLocalSizeConfirm,
    handleOpenIconPicker,
    handleAddRandomIcon,
  } = useHeroIconHeaderPicker({
    id,
    icon,
    compact,
    readOnly,
    resolvedIconSize,
    sliderValue,
    onIconChange,
    onIconPickerOpen,
    onRequestRandomIcon,
    onSizeChange,
    onSizeConfirm,
  });
  return (
    <div
      ref={headerRef}
      data-hero-icon-header="true"
      data-no-editor-drag-box="true"
      className={cn(
        "relative transition-[margin-top] duration-[var(--vlaina-duration-200)] ease-out w-full",
        !compact && "max-w-3xl mx-auto px-10",
        !compact && coverLayoutActive && "pointer-events-none",
        className
      )}
      style={{
        '--vlaina-hero-icon-header-size': `${resolvedIconSize}px`,
        marginTop: coverLayoutActive ? `calc(var(--vlaina-hero-icon-header-size) * -0.618)` : undefined,
      } as React.CSSProperties}
    >
      {children}

      <div className={cn(compact ? "flex items-center gap-3 py-2" : "pointer-events-none")}>
        <div
          className={cn(
              "duration-[var(--vlaina-duration-200)] relative",
              "transition-[padding,opacity]",
              !compact && "w-fit",
              !compact && "z-[var(--vlaina-z-30)]",
              !compact && "pointer-events-auto",
              !compact && "pb-2",
              !compact && (coverLayoutActive ? "pt-0" : "pt-10")
          )}
          onMouseEnter={() => setIsHoveringHeader(true)}
          onMouseLeave={() => setIsHoveringHeader(false)}
        >
          {committedIcon || showIconPicker ? (
              <div
                  className="relative flex items-center"
                  style={{ height: themeDomStyleTokens.heroIconHeaderSize }}
              >
                  {readOnly ? (
                    <div
                      className="flex items-center"
                      style={{
                          marginLeft: !compact ? `calc(var(--vlaina-hero-icon-header-size) * -0.1)` : 0
                      }}
                    >
                      <HeaderIcon
                          key={committedIcon || 'empty'}
                          itemId={id}
                          originalIcon={committedIcon}
                          sizeVar="var(--vlaina-hero-icon-header-size)"
                          imageLoader={imageLoader}
                          allowLegacyImageScheme={allowLegacyImageScheme}
                      />
                    </div>
                  ) : (
                    <button
                        ref={iconButtonRef}
                        onClick={() => {
                          handleOpenIconPicker();
                        }}
                        className="hover:scale-[var(--vlaina-scale-105)] transition-transform cursor-pointer flex items-center group"
                        style={{
                            marginLeft: !compact ? `calc(var(--vlaina-hero-icon-header-size) * -0.1)` : 0
                        }}
                    >
                        <HeaderIcon
                            key={committedIcon || 'empty'}
                            itemId={id}
                            originalIcon={committedIcon}
                            sizeVar="var(--vlaina-hero-icon-header-size)"
                            imageLoader={imageLoader}
                            allowLegacyImageScheme={allowLegacyImageScheme}
                        />
                    </button>
                  )}
              </div>
          ) : readOnly ? (
              <div
                aria-hidden="true"
                className={compact ? "h-8" : "h-14"}
              />
          ) : (
              <div className={cn(
                  "hero-icon-empty",
                  "flex items-center gap-2 transition-all duration-[var(--vlaina-duration-150)]",
                  compact ? "h-8" : "h-14",
                  isHoveringHeader ? "opacity-[var(--vlaina-opacity-100)]" : (compact ? "opacity-[var(--vlaina-opacity-50)]" : "opacity-[var(--vlaina-opacity-0)]")
              )}>
                  <button
                      ref={iconButtonRef}
                      data-hero-icon-add="true"
                      onClick={handleAddRandomIcon}
                      className={cn("flex items-center gap-1.5 py-1 rounded-md text-sm text-[var(--vlaina-soft-placeholder)] hover:text-[var(--vlaina-sidebar-row-selected-text)] transition-colors")}
                  >
                      <Icon size="md" name="misc.heart" />
                      {!compact && <span>{t('icon.addIcon')}</span>}
                  </button>
              </div>
          )}

          {!readOnly && showIconPicker && (
              <div
                className="absolute z-[var(--vlaina-z-max)] top-full mt-2"
                style={{ left: !compact ? `calc(var(--vlaina-hero-icon-header-size) * -0.1)` : 0 }}
                data-no-auto-close="true"
              >
                  <Suspense fallback={null}>
                    <IconPicker
                        onSelect={handleIconSelect}
                        onPreview={handlePreview}
                        onPreviewSkinTone={handlePreviewTone}
                        onRemove={handleRemoveIcon}
                        onClose={handlePickerClose}

                        hasIcon={!!committedIcon}
                        currentIcon={committedIcon || undefined}

                        currentSize={!compact ? currentSliderValue : undefined}
                        minSize={!compact ? minIconSize : undefined}
                        maxSize={!compact ? maxIconSize : undefined}
                        onSizeChange={!compact ? handleLocalSizeChange : undefined}
                        onSizeConfirm={!compact ? handleLocalSizeConfirm : undefined}

                        customIcons={customIcons}
                        onUploadFile={onUploadFile}
                        onDeleteCustomIcon={onDeleteCustomIcon}
                        imageLoader={imageLoader}
                        allowLegacyImageScheme={allowLegacyImageScheme}
                    />
                  </Suspense>
              </div>
          )}
        </div>

        {compact && (
          <div
            className="flex-1 min-w-0"
            data-vlaina-markdown-font-size-surface="true"
            style={{ fontSize: 'var(--vlaina-markdown-font-body-size)' }}
          >
             {renderTitle ? renderTitle() : (
                <div
                  className="font-bold text-[var(--vlaina-text-primary)] break-words"
                  style={{ fontSize: 'var(--vlaina-note-title-compact-font-size)' }}
                >
                    {title}
                </div>
             )}
          </div>
        )}

      </div>

      {!compact && (
        <>
          {renderTitle && (
              <div
                className="pointer-events-auto"
                data-vlaina-markdown-font-size-surface="true"
                style={{
                  fontSize: 'var(--vlaina-markdown-font-body-size)',
                  marginBottom: 'var(--vlaina-note-title-margin-bottom)',
                }}
              >
                  {renderTitle()}
              </div>
          )}
          {title !== undefined && !renderTitle && (
              <div
                className="pointer-events-auto"
                data-vlaina-markdown-font-size-surface="true"
                style={{
                  fontSize: 'var(--vlaina-markdown-font-body-size)',
                  marginBottom: 'var(--vlaina-note-title-margin-bottom)',
                }}
              >
                <div
                  className={cn(
                    "font-bold text-[var(--vlaina-text-primary)] break-words outline-none placeholder:text-[var(--vlaina-text-tertiary)]",
                    titleClassName
                  )}
                  data-hero-icon-title="true"
                  style={{ fontSize: 'var(--vlaina-note-title-font-size)' }}
                >
                  {title}
                </div>
              </div>
          )}
        </>
      )}
    </div>
  );
}
