import { memo } from 'react'
import { Icon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import type { AIModel } from '@/lib/ai/types'
import {
  getModelFamily,
  getModelPresentationName,
} from '../modelFamilyRegistry'
import {
  getSidebarIdleRowSurfaceClass,
  getSidebarPreviewRowSurfaceClass,
  getSidebarSelectedRowSurfaceClass,
  type SidebarTone,
} from '@/components/layout/sidebar/sidebarLabelStyles'
import type {
  ModelSelectorAccessibility,
  ModelSelectorTheme,
  ModelSelectorThemeStyles,
} from '../modelSelectorTypes'

export const monochromeModelIconClass = 'dark:invert dark:brightness-[1.08] dark:contrast-[0.92] dark:opacity-[0.92]'

const customModelIconClass = 'flex-shrink-0 text-[var(--vlaina-sidebar-chat-icon)]'

export function FreeModelBadge({ label }: { label: string }) {
  return (
    <span
      className="ml-2 inline-flex h-[var(--vlaina-size-16px)] flex-shrink-0 items-center whitespace-nowrap rounded-[var(--vlaina-radius-4px)] bg-[var(--vlaina-color-status-success-bg)] px-1.5 text-[var(--vlaina-font-10)] font-medium leading-none tracking-normal text-[var(--vlaina-color-status-success-fg)]"
      data-model-free-badge="true"
    >
      {label}
    </span>
  )
}

export function CustomModelIcon({
  size,
  className,
}: {
  size: number | string
  className?: string
}) {
  return (
    <Icon
      name="misc.box"
      size={size}
      className={cn(customModelIconClass, className)}
      data-model-selector-custom-icon="true"
    />
  )
}

export const ModelOption = memo(({
    model,
    isSelected,
    isFocused,
    onSelect,
    onTogglePinned,
    onHover,
    theme,
    styles,
    showFamilyIcon,
    accessibility,
}: {
    model: AIModel;
    isSelected: boolean;
    isFocused: boolean;
    onSelect: (id: string) => void;
    onTogglePinned: (id: string, pinned: boolean) => void;
    onHover: (id: string) => void;
    theme: ModelSelectorTheme;
    styles: ModelSelectorThemeStyles;
    showFamilyIcon: boolean;
    accessibility: ModelSelectorAccessibility;
}) => {
    const sidebarTone: SidebarTone = theme
    const displayName = getModelPresentationName(model)
    const family = getModelFamily(model)

    return (
        <div
            id={accessibility.enabled ? `${accessibility.optionIdPrefix}${encodeURIComponent(model.id)}` : undefined}
            role={accessibility.enabled ? 'option' : 'button'}
            aria-selected={accessibility.enabled ? isSelected : undefined}
            tabIndex={-1}
            data-model-id={model.id}
            onClick={() => onSelect(model.id)}
            onMouseEnter={() => onHover(model.id)}
            className={cn(
                "flex w-max min-w-full cursor-pointer items-center justify-between px-3 py-2 text-left transition-colors duration-[var(--vlaina-duration-75)]",
                "group/model-option",
                isSelected
                  ? getSidebarSelectedRowSurfaceClass(sidebarTone)
                  : isFocused
                    ? getSidebarPreviewRowSurfaceClass(sidebarTone)
                    : getSidebarIdleRowSurfaceClass(sidebarTone)
            )}
        >
            <span className="flex min-w-0 items-center text-left">
                {showFamilyIcon && family && (
                    <img
                        src={family.icon}
                        alt=""
                        className={cn(
                          "mr-2 h-4 w-4 flex-shrink-0 rounded-[var(--vlaina-radius-3px)] object-contain",
                          family.monochromeIcon && monochromeModelIconClass
                        )}
                        draggable={false}
                    />
                )}
                <span className={cn(
                    "whitespace-nowrap text-[var(--vlaina-font-15)] font-semibold tracking-tight",
                    isSelected || isFocused
                      ? styles.optionTextActive
                      : styles.optionText
                )}>
                    {displayName}
                </span>
                {model.isFree ? (
                    <FreeModelBadge label={accessibility.freeModelLabel} />
                ) : model.priceTier ? (
                    <span
                        className={cn(
                            "ml-2 inline-flex items-center rounded-md border px-1 py-[var(--vlaina-space-1px)] text-[var(--vlaina-font-7)] font-medium leading-none tracking-normal",
                            isSelected || isFocused
                              ? "border-[var(--vlaina-color-sidebar-focus-ring)] text-[var(--vlaina-sidebar-row-selected-text)] opacity-[var(--vlaina-opacity-80)]"
                              : "border-[var(--vlaina-color-subtle-border)] text-[var(--vlaina-sidebar-chat-text-soft)] opacity-[var(--vlaina-opacity-60)]"
                        )}
                        aria-label={accessibility.priceTierLabel(model.priceTier)}
                    >
                        {model.priceTier}
                    </span>
                ) : null}
            </span>

            <span className="ml-3 flex flex-shrink-0 items-center gap-1">
                <button
                    type="button"
                    tabIndex={accessibility.enabled ? 0 : -1}
                    aria-label={model.pinned
                      ? accessibility.removeFavoriteLabel
                      : accessibility.addFavoriteLabel}
                    data-model-selector-secondary-action={accessibility.enabled ? 'true' : undefined}
                    onClick={(event) => {
                        event.stopPropagation()
                        onTogglePinned(model.id, !model.pinned)
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') {
                            return
                        }
                        event.preventDefault()
                        event.stopPropagation()
                        onTogglePinned(model.id, !model.pinned)
                    }}
                    className={cn(
                        "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--vlaina-color-favorite-fg)] transition-opacity",
                        model.pinned
                          ? "pointer-events-auto opacity-[var(--vlaina-opacity-100)]"
                          : "pointer-events-none opacity-[var(--vlaina-opacity-0)] text-[var(--vlaina-color-favorite-fg-muted)] hover:text-[var(--vlaina-color-favorite-fg)] focus:pointer-events-auto focus:opacity-[var(--vlaina-opacity-100)] group-hover/model-option:pointer-events-auto group-hover/model-option:opacity-[var(--vlaina-opacity-100)] group-focus-within/model-option:pointer-events-auto group-focus-within/model-option:opacity-[var(--vlaina-opacity-100)]"
                    )}
                >
                    <Icon
                        name="misc.star"
                        size="sm"
                        className={model.pinned ? "fill-current" : undefined}
                    />
                </button>
            </span>
        </div>
    )
})
