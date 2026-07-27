import { Fragment, type CSSProperties, type RefObject } from 'react'
import { Icon } from '@/components/ui/icons'
import { OverlayScrollArea } from '@/components/ui/overlay-scroll-area'
import { cn } from '@/lib/utils'
import { themeDomStyleTokens } from '@/styles/themeTokens'
import { OPEN_SETTINGS_EVENT, type OpenSettingsDetail } from '@/components/Settings/settingsEvents'
import type { ModelCategory, ModelCategoryId } from '../modelFamilyRegistry'
import type {
  ModelSelectorAccessibility,
  ModelSelectorListRow,
  ModelSelectorTheme,
  ModelSelectorThemeStyles,
} from '../modelSelectorTypes'
import {
  MODEL_SELECTOR_DROPDOWN_MAX_HEIGHT,
  MODEL_SELECTOR_DROPDOWN_WIDTH,
  MODEL_SELECTOR_LIST_HEIGHT,
} from '../modelSelectorLayout'
import { ghostIconButtonClass, raisedPillSurfaceClass } from '@/components/ui/surfaceStyles'
import { CustomModelIcon, ModelOption, monochromeModelIconClass } from './ModelSelectorOption'

interface ModelSelectorVirtualizer {
  getTotalSize: () => number
  getVirtualItems: () => Array<{
    index: number
    size: number
    start: number
  }>
}

interface ModelSelectorDropdownProps {
  dropdownContentRef: RefObject<HTMLDivElement | null>
  inputRef: RefObject<HTMLInputElement | null>
  listRef: RefObject<HTMLDivElement | null>
  isEmbedded: boolean
  dropdownPlacement: 'top' | 'bottom'
  dropdownAlign: 'left' | 'right'
  dropdownLayerClassName: string
  embeddedDropdownStyle: CSSProperties | null
  styles: ModelSelectorThemeStyles
  searchQuery: string
  setSearchQuery: (value: string) => void
  findModelLabel: string
  modelCategories: ModelCategory[]
  visibleActiveCategoryId: ModelCategoryId | null
  handleSelectCategory: (categoryId: ModelCategoryId) => void
  handleListMouseLeave: () => void
  listRows: ModelSelectorListRow[]
  emptyStateText: string
  virtualizer: ModelSelectorVirtualizer
  selectedModelId: string | null
  focusedModelId: string | null
  handleSelectModel: (modelId: string) => void
  handleTogglePinned: (modelId: string, pinned: boolean) => void
  handleHover: (id: string) => void
  theme: ModelSelectorTheme
  showFamilyIcon: boolean
  closeSelector: (restoreComposerFocus?: boolean) => void
  accessibility: ModelSelectorAccessibility
}

export function ModelSelectorDropdown({
  dropdownContentRef,
  inputRef,
  listRef,
  isEmbedded,
  dropdownPlacement,
  dropdownAlign,
  dropdownLayerClassName,
  embeddedDropdownStyle,
  styles,
  searchQuery,
  setSearchQuery,
  findModelLabel,
  modelCategories,
  visibleActiveCategoryId,
  handleSelectCategory,
  handleListMouseLeave,
  listRows,
  emptyStateText,
  virtualizer,
  selectedModelId,
  focusedModelId,
  handleSelectModel,
  handleTogglePinned,
  handleHover,
  theme,
  showFamilyIcon,
  closeSelector,
  accessibility,
}: ModelSelectorDropdownProps) {
  return (
        <div
          ref={dropdownContentRef}
          className={cn(
            isEmbedded
              ? "fixed"
              : dropdownPlacement === 'bottom'
                ? "absolute top-full mt-1"
                : "absolute bottom-full mb-1",
            !isEmbedded && (dropdownAlign === 'left' ? "left-0" : "right-0"),
            "w-[var(--vlaina-size-27rem)]",
            "max-w-[var(--vlaina-width-model-selector-max)]",
            "rounded-[var(--vlaina-ui-radius-panel)]",
            raisedPillSurfaceClass,
            "backdrop-blur-[var(--vlaina-backdrop-blur-lg)] overflow-hidden flex flex-col",
            dropdownLayerClassName,
            "animate-in fade-in duration-[var(--vlaina-duration-75)] zoom-in-95"
          )}
          data-model-selector-dropdown="true"
          style={isEmbedded
            ? embeddedDropdownStyle ?? {
                width: MODEL_SELECTOR_DROPDOWN_WIDTH,
                maxHeight: MODEL_SELECTOR_DROPDOWN_MAX_HEIGHT,
              }
            : { maxHeight: MODEL_SELECTOR_DROPDOWN_MAX_HEIGHT }}
        >
          <div className={cn("flex items-center gap-1 border-b px-2 py-2", styles.divider)}>
              <input
                ref={inputRef}
                type="text"
                role={accessibility.enabled ? 'combobox' : undefined}
                aria-activedescendant={accessibility.activeOptionId}
                aria-controls={accessibility.enabled ? accessibility.listboxId : undefined}
                aria-expanded={accessibility.enabled ? true : undefined}
                aria-autocomplete={accessibility.enabled ? 'list' : undefined}
                aria-label={accessibility.enabled ? findModelLabel : undefined}
                spellCheck={false}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={findModelLabel}
                autoCorrect="off"
                className={cn(
                  "h-8 min-w-0 flex-1 bg-transparent px-2 py-0 text-sm leading-5 outline-none border-none",
                  styles.inputText,
                  styles.inputPlaceholder
                )}
              />
              <button
                  type={accessibility.enabled ? 'button' : undefined}
                  aria-label={accessibility.enabled ? accessibility.settingsLabel : undefined}
                  data-model-selector-secondary-action={accessibility.enabled ? 'true' : undefined}
                  onClick={() => {
                      closeSelector(false)
                      const event = new CustomEvent<OpenSettingsDetail>(OPEN_SETTINGS_EVENT, { detail: { tab: 'ai' } })
                      window.dispatchEvent(event)
                  }}
                  className={cn(
                    "flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center",
                    ghostIconButtonClass,
                    styles.settingsButton
                  )}
              >
                  <Icon name="common.settings" size="md" />
              </button>
          </div>

          <div className="flex min-h-0 flex-1" style={{ height: MODEL_SELECTOR_LIST_HEIGHT }}>
            <OverlayScrollArea
              scrollbarVariant="compact"
              className={cn("w-16 flex-none border-r", styles.divider)}
              viewportClassName="p-1.5"
            >
              <div className="flex w-full flex-col items-center gap-1">
                {modelCategories.map((category, index) => {
                  const isActive = visibleActiveCategoryId === category.id
                  const previousKind = modelCategories[index - 1]?.kind
                  const showDividerBefore =
                    (category.kind === 'family' && previousKind === 'favorites') ||
                    (category.kind === 'custom' && previousKind === 'favorites')
                  const showDividerAfter = category.kind === 'family' && modelCategories[index + 1]?.kind === 'custom'

                  return (
                    <Fragment key={category.id}>
                      {showDividerBefore && <div className={cn("my-1 w-10 border-t", styles.divider)} />}
                      <div className="flex h-12 w-12 items-center justify-center">
                      <button
                        type="button"
                        aria-label={category.name}
                        data-model-selector-secondary-action={accessibility.enabled ? 'true' : undefined}
                        onClick={() => handleSelectCategory(category.id)}
                        className={cn(
                          "group/model-category relative flex h-12 w-12 cursor-pointer items-center justify-center transition-[background-color,color,box-shadow] duration-[var(--vlaina-duration-150)]",
                          isActive
                            ? "rounded-[var(--vlaina-ui-radius-group)] bg-[var(--vlaina-color-setting-field)] shadow-[var(--vlaina-shadow-md)]"
                            : cn("rounded-[var(--vlaina-ui-radius-group)] bg-transparent", styles.categoryHover)
                        )}
                      >
                        {category.kind === 'favorites' ? (
                          <Icon
                            name={category.count > 0 ? "misc.starSolid" : "misc.star"}
                            size={isActive ? 32 : "md"}
                            className="text-[var(--vlaina-color-favorite-fg)]"
                          />
                        ) : category.icon ? (
                          <img
                            src={category.icon}
                            alt=""
                            className={cn(
                              "rounded-[var(--vlaina-radius-4px)] object-contain",
                              isActive ? "h-8 w-8" : "h-5 w-5",
                              category.monochromeIcon && monochromeModelIconClass
                            )}
                            draggable={false}
                          />
                        ) : (
                          <CustomModelIcon
                            size={isActive ? 32 : "md"}
                            className={cn(
                              isActive ? styles.optionTextActive : styles.optionText,
                              !isActive && "group-hover/model-category:text-[var(--vlaina-sidebar-row-selected-text)]"
                            )}
                          />
                        )}
                      </button>
                      </div>
                      {showDividerAfter && <div className={cn("my-1 w-10 border-t", styles.divider)} />}
                    </Fragment>
                  )
                })}
              </div>
            </OverlayScrollArea>

            <OverlayScrollArea
              ref={listRef}
              id={accessibility.enabled ? accessibility.listboxId : undefined}
              role={accessibility.enabled ? 'listbox' : undefined}
              aria-label={accessibility.enabled ? accessibility.selectModelLabel : undefined}
              onMouseLeave={handleListMouseLeave}
              scrollbarVariant="compact"
              className="min-w-0 flex-1"
              viewportClassName="p-1"
            >
              {listRows.length === 0 ? (
                <div className={cn("py-8 text-center text-xs", styles.emptyText)}>
                  {emptyStateText}
                </div>
              ) : (
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    minWidth: themeDomStyleTokens.sizeFull,
                    position: themeDomStyleTokens.positionRelative,
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const row = listRows[virtualRow.index]
                    if (!row) {
                      return null
                    }

                    return (
                      <div
                        key={row.id}
                        style={{
                          height: `${virtualRow.size}px`,
                          left: themeDomStyleTokens.numericZero,
                          position: themeDomStyleTokens.positionAbsolute,
                          top: themeDomStyleTokens.numericZero,
                          transform: `translateY(${virtualRow.start}px)`,
                          minWidth: themeDomStyleTokens.sizeFull,
                        }}
                      >
                        {row.type === 'label' ? (
                          <div className="px-1">
                            <div
                              className={cn("px-2 pt-2 pb-1 text-[var(--vlaina-font-11)] font-medium", styles.sectionLabel)}
                              data-model-selector-provider-label={row.id.replace(/^label:/, '')}
                            >
                              {row.providerName}
                            </div>
                            <div className={cn("border-t", styles.divider)} />
                          </div>
                        ) : (
                          <ModelOption
                            model={row.model}
                            isSelected={selectedModelId === row.model.id}
                            isFocused={focusedModelId === row.model.id}
                            onSelect={handleSelectModel}
                            onTogglePinned={handleTogglePinned}
                            onHover={handleHover}
                            theme={theme}
                            styles={styles}
                            showFamilyIcon={showFamilyIcon}
                            accessibility={accessibility}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </OverlayScrollArea>
          </div>
        </div>
  )
}
