import { useEffect, type Dispatch, type SetStateAction } from 'react'

interface UseModelSelectorKeyboardParams {
  isOpen: boolean
  visibleModelIds: string[]
  focusedModelId: string | null
  setFocusedModelId: Dispatch<SetStateAction<string | null>>
  setKeyboardNavigating: (value: boolean) => void
  onShortcutToggle: () => void
  onClose: () => void
  onSelectModel: (modelId: string) => void
  requestNearestScroll: () => void
  clearScrollMode: () => void
  shouldHandleOpenEvent?: (target: EventTarget | null) => boolean
}

export function useModelSelectorKeyboard({
  isOpen,
  visibleModelIds,
  focusedModelId,
  setFocusedModelId,
  setKeyboardNavigating,
  onShortcutToggle,
  onClose,
  onSelectModel,
  requestNearestScroll,
  clearScrollMode,
  shouldHandleOpenEvent,
}: UseModelSelectorKeyboardParams) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) {
        return
      }

      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.key.toLowerCase() === 'm') {
        if (e.target instanceof Element && e.target.closest('[role="dialog"], [aria-modal="true"]')) {
          return
        }
        e.preventDefault()
        onShortcutToggle()
        return
      }

      if (!isOpen) return
      if (shouldHandleOpenEvent && !shouldHandleOpenEvent(e.target)) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (
        e.target instanceof Element &&
        e.target.closest('[data-model-selector-secondary-action="true"]')
      ) {
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (visibleModelIds.length === 0) {
          clearScrollMode()
          setFocusedModelId(null)
          return
        }
        setKeyboardNavigating(true)
        requestNearestScroll()
        setFocusedModelId((current) => {
          const currentIndex = visibleModelIds.findIndex((modelId) => modelId === current)
          const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % visibleModelIds.length
          return visibleModelIds[nextIndex] ?? current
        })
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (visibleModelIds.length === 0) {
          clearScrollMode()
          setFocusedModelId(null)
          return
        }
        setKeyboardNavigating(true)
        requestNearestScroll()
        setFocusedModelId((current) => {
          const currentIndex = visibleModelIds.findIndex((modelId) => modelId === current)
          const prevIndex = currentIndex === -1
            ? visibleModelIds.length - 1
            : (currentIndex - 1 + visibleModelIds.length) % visibleModelIds.length
          return visibleModelIds[prevIndex] ?? current
        })
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        const hasVisibleFocusedModel = !!focusedModelId && visibleModelIds.includes(focusedModelId)
        if (hasVisibleFocusedModel && focusedModelId) {
          onSelectModel(focusedModelId)
        } else if (visibleModelIds.length > 0) {
          onSelectModel(visibleModelIds[0])
        }
        return
      }

    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    clearScrollMode,
    focusedModelId,
    isOpen,
    onClose,
    onSelectModel,
    onShortcutToggle,
    requestNearestScroll,
    shouldHandleOpenEvent,
    setFocusedModelId,
    setKeyboardNavigating,
    visibleModelIds,
  ])
}
