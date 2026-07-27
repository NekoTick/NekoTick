import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { actions as aiActions } from '@/stores/useAIStore'
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore'
import type { AIModel, Provider } from '@/lib/ai/types'
import { useI18n } from '@/lib/i18n'
import { getModelCategoryId, getModelFamily, type ModelCategoryId } from './modelFamilyRegistry'
import { ModelSelectorDropdown } from './components/ModelSelectorDropdown'
import { ModelSelectorTrigger } from './components/ModelSelectorTrigger'
import { useModelSelectorEmbeddedPosition } from './hooks/useModelSelectorEmbeddedPosition'
import { useModelSelectorFocus } from './hooks/useModelSelectorFocus'
import { useModelSelectorKeyboard } from './hooks/useModelSelectorKeyboard'
import { useModelSelectorOptions } from './hooks/useModelSelectorOptions'
import { useModelSelectorScroll } from './hooks/useModelSelectorScroll'
import { MODEL_SELECTOR_LABEL_HEIGHT, MODEL_SELECTOR_ROW_HEIGHT } from './modelSelectorLayout'
import { MODEL_SELECTOR_THEME_STYLES } from './modelSelectorTheme'
import type { ModelSelectorAccessibility, ModelSelectorTheme } from './modelSelectorTypes'

export { compareModelSelectorProviderIds, createModelSelectorProviderOrder } from './modelSelectorProviders'

const EMPTY_MODELS: AIModel[] = []
const EMPTY_PROVIDERS: Provider[] = []

interface ModelSelectorProps {
  composerInputRef?: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  dropdownPlacement?: 'top' | 'bottom'
  dropdownAlign?: 'left' | 'right'
  onSelectModel?: (modelId: string) => void
  theme?: ModelSelectorTheme
  isEmbedded?: boolean
  dropdownLayerClassName?: string
  focusSearchOnOpen?: boolean
  restoreComposerFocusOnClose?: boolean
}

export function ModelSelector({
  composerInputRef,
  dropdownPlacement = 'top',
  dropdownAlign = 'right',
  onSelectModel,
  theme = 'chat',
  isEmbedded = false,
  dropdownLayerClassName = "z-[var(--vlaina-z-50)]",
  focusSearchOnOpen = true,
  restoreComposerFocusOnClose = true,
}: ModelSelectorProps) {
  const { t } = useI18n()
  const models = useUnifiedStore((state) => state.data.ai?.models || EMPTY_MODELS)
  const providers = useUnifiedStore((state) => state.data.ai?.providers || EMPTY_PROVIDERS)
  const selectedModelId = useUnifiedStore((state) => state.data.ai?.selectedModelId || null)
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [focusedModelId, setFocusedModelId] = useState<string | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<ModelCategoryId | null>(null)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dropdownContentRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const isKeyboardNavigating = useRef(false)
  const selectorId = useId()
  const { inputRef, focusSearchInput, focusComposerInput } = useModelSelectorFocus(composerInputRef)
  const styles = MODEL_SELECTOR_THEME_STYLES[theme]
  const accessibility = useMemo<ModelSelectorAccessibility>(() => {
    const enabled = theme === 'chat'
    const listboxId = `${selectorId}-listbox`
    const optionIdPrefix = `${listboxId}-option-`
    return {
      activeOptionId: enabled && focusedModelId ? `${optionIdPrefix}${encodeURIComponent(focusedModelId)}` : undefined,
      addFavoriteLabel: t('chat.addToFavorites'),
      enabled,
      listboxId,
      optionIdPrefix,
      priceTierLabel: (tier) => t('chat.priceTier', { tier }),
      removeFavoriteLabel: t('chat.removeFromFavorites'),
      selectModelLabel: t('chat.selectModel'),
      settingsLabel: t('shortcut.action.openSettings'),
    }
  }, [focusedModelId, selectorId, t, theme])
  const {
    selectedModel,
    modelCategories,
    visibleActiveCategoryId,
    sortedFilteredModels,
    emptyStateText,
    listRows,
    visibleModelIds,
  } = useModelSelectorOptions({
    models,
    providers,
    selectedModelId,
    searchQuery: deferredSearchQuery,
    activeCategoryId,
    t,
  })
  const selectedModelFamily = selectedModel ? getModelFamily(selectedModel) : null
  const embeddedDropdownStyle = useModelSelectorEmbeddedPosition({
    isOpen,
    isEmbedded,
    dropdownPlacement,
    dropdownAlign,
    dropdownRef,
    dropdownContentRef,
  })
  const focusedRowIndex = useMemo(
      () => listRows.findIndex((row) => row.type === 'model' && row.model.id === focusedModelId),
      [focusedModelId, listRows],
  )
  const virtualizer = useVirtualizer({
      count: listRows.length,
      getScrollElement: () => listRef.current,
      estimateSize: (index) => listRows[index]?.type === 'label'
        ? MODEL_SELECTOR_LABEL_HEIGHT
        : MODEL_SELECTOR_ROW_HEIGHT,
      overscan: 10,
  })
  const { requestCenterScroll, requestNearestScroll, clearScrollMode } = useModelSelectorScroll({
      isOpen,
      focusedIndex: focusedRowIndex,
      scrollToIndex: (index, align) => {
          virtualizer.scrollToIndex(index, { align })
      },
  })

  const setKeyboardNavigating = useCallback((value: boolean) => { isKeyboardNavigating.current = value }, [])
  const shouldHandleOpenKeyboardEvent = useCallback((target: EventTarget | null) => (
    target instanceof Node && (
      !!dropdownRef.current?.contains(target) || !!dropdownContentRef.current?.contains(target)
    )
  ), [])

  const openSelector = useCallback(() => {
      aiActions.refreshManagedProviderInBackground({ force: true })
      const initialCategoryId = selectedModel
          ? getModelCategoryId(selectedModel)
          : modelCategories.find((category) => category.id !== 'favorites')?.id ?? modelCategories[0]?.id ?? null
      requestCenterScroll()
      setActiveCategoryId(initialCategoryId)
      setFocusedModelId(selectedModelId ?? null)
      setIsOpen(true)
      if (focusSearchOnOpen) {
          focusSearchInput()
      }
  }, [focusSearchOnOpen, focusSearchInput, modelCategories, requestCenterScroll, selectedModel, selectedModelId])

  const closeSelector = useCallback((restoreComposerFocus = false) => {
      clearScrollMode()
      setSearchQuery('')
      setIsOpen(false)
      if (restoreComposerFocus) {
          focusComposerInput()
      }
  }, [clearScrollMode, focusComposerInput])

  const toggleSelector = useCallback(() => {
      if (isOpen) {
          closeSelector(false)
          return
      }
      openSelector()
  }, [closeSelector, isOpen, openSelector])

  useEffect(() => {
      if (!isOpen) return
      const handleMouseMove = () => {
          isKeyboardNavigating.current = false
      }
      window.addEventListener('mousemove', handleMouseMove)
      return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [isOpen])

  const handleSelectModel = useCallback((modelId: string) => {
    aiActions.selectModel(modelId)
    onSelectModel?.(modelId)
    closeSelector(restoreComposerFocusOnClose)
  }, [closeSelector, onSelectModel, restoreComposerFocusOnClose])

  const handleTogglePinned = useCallback((modelId: string, pinned: boolean) => {
      aiActions.updateModel(modelId, { pinned })
  }, [])

  useModelSelectorKeyboard({
      isOpen,
      visibleModelIds,
      focusedModelId,
      setFocusedModelId,
      setKeyboardNavigating,
      onShortcutToggle: toggleSelector,
      onClose: () => closeSelector(restoreComposerFocusOnClose),
      onSelectModel: handleSelectModel,
      requestNearestScroll,
      clearScrollMode,
      shouldHandleOpenEvent: accessibility.enabled ? shouldHandleOpenKeyboardEvent : undefined,
  })

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (dropdownRef.current && !dropdownRef.current.contains(target) && !dropdownContentRef.current?.contains(target)) {
        closeSelector(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside, true)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside, true)
  }, [closeSelector, isOpen])

  const handleHover = useCallback((id: string) => {
      if (!isKeyboardNavigating.current) {
          clearScrollMode()
          setFocusedModelId(id)
      }
  }, [clearScrollMode])

  const handleSelectCategory = useCallback((categoryId: ModelCategoryId) => {
      const firstModelId = categoryId === 'favorites'
          ? sortedFilteredModels.find((model) => model.pinned)?.id ?? null
          : sortedFilteredModels.find((model) => getModelCategoryId(model) === categoryId)?.id ?? null
      clearScrollMode()
      setActiveCategoryId(categoryId)
      setFocusedModelId(firstModelId)
      requestAnimationFrame(() => {
          virtualizer.scrollToIndex(0, { align: 'start' })
      })
  }, [clearScrollMode, sortedFilteredModels, virtualizer])

  const handleListMouseLeave = useCallback(() => {
      if (isKeyboardNavigating.current) return
      clearScrollMode()
      setFocusedModelId(selectedModelId ?? null)
  }, [clearScrollMode, selectedModelId])

  useEffect(() => {
      virtualizer.measure()
  }, [listRows, virtualizer])

  useEffect(() => {
      if (!isOpen || (focusedModelId && visibleModelIds.includes(focusedModelId))) {
          return
      }
      const nextFocusedId = selectedModelId && visibleModelIds.includes(selectedModelId)
          ? selectedModelId
          : visibleModelIds[0] ?? null
      setFocusedModelId(nextFocusedId)
  }, [focusedModelId, isOpen, selectedModelId, visibleModelIds])

  const dropdownContent = isOpen ? (
    <ModelSelectorDropdown
      dropdownContentRef={dropdownContentRef}
      inputRef={inputRef}
      listRef={listRef}
      isEmbedded={isEmbedded}
      dropdownPlacement={dropdownPlacement}
      dropdownAlign={dropdownAlign}
      dropdownLayerClassName={dropdownLayerClassName}
      embeddedDropdownStyle={embeddedDropdownStyle}
      styles={styles}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      findModelLabel={t('chat.findModel')}
      modelCategories={modelCategories}
      visibleActiveCategoryId={visibleActiveCategoryId}
      handleSelectCategory={handleSelectCategory}
      handleListMouseLeave={handleListMouseLeave}
      listRows={listRows}
      emptyStateText={emptyStateText}
      virtualizer={virtualizer}
      selectedModelId={selectedModelId}
      focusedModelId={focusedModelId}
      handleSelectModel={handleSelectModel}
      handleTogglePinned={handleTogglePinned}
      handleHover={handleHover}
      theme={theme}
      showFamilyIcon={visibleActiveCategoryId === 'favorites'}
      closeSelector={closeSelector}
      accessibility={accessibility}
    />
  ) : null

  return (
    <div className="relative select-none w-fit" ref={dropdownRef}>
      <ModelSelectorTrigger
        selectedModel={selectedModel}
        selectedModelFamily={selectedModelFamily}
        styles={styles}
        isOpen={isOpen}
        selectModelLabel={t('chat.selectModel')}
        popupId={accessibility.enabled ? accessibility.listboxId : undefined}
        onToggle={toggleSelector}
      />

      {isEmbedded && typeof document !== 'undefined'
        ? createPortal(dropdownContent, document.body)
        : dropdownContent}
    </div>
  )
}
