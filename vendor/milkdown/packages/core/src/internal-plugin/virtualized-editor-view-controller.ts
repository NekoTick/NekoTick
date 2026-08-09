import type { EditorView } from '@milkdown/prose/view'

export type ObservedBlock = {
  element: HTMLElement
  getPos: () => number | undefined
}

type VirtualizedViewController = {
  destroy: () => void
  observe: (block: ObservedBlock) => () => void
}

type ShowBlocks = (view: EditorView, positions: readonly number[]) => void

const MAX_BLOCKS_MATERIALIZED_PER_FRAME = 8
const SCROLL_QUIET_PERIOD_MS = 100
const controllers = new WeakMap<EditorView, VirtualizedViewController>()

function createController(view: EditorView, placementRoot: Node | null, showBlocks: ShowBlocks): VirtualizedViewController {
  const blocks = new Map<Element, ObservedBlock>()
  const pending = new Set<Element>()
  const pendingShow = new Set<number>()
  let flushScheduled = false
  let showFrame: number | null = null
  let scrollQuietTimer: number | null = null
  let scrolling = false
  const ownerWindow = view.dom.ownerDocument.defaultView
  const Observer = ownerWindow?.IntersectionObserver
  const scrollRoot = placementRoot instanceof Element
    ? placementRoot.closest('[data-note-scroll-root="true"]')
    : null

  const flushShows = () => {
    showFrame = null
    if (scrolling) return
    if (view.isDestroyed || pendingShow.size === 0) return
    const positions = Array.from(pendingShow).slice(0, MAX_BLOCKS_MATERIALIZED_PER_FRAME)
    for (const pos of positions) pendingShow.delete(pos)
    showBlocks(view, positions)
    if (pendingShow.size > 0) scheduleShowFlush()
  }

  const scheduleShowFlush = () => {
    if (showFrame !== null) return
    if (scrolling) return
    if (ownerWindow?.requestAnimationFrame) {
      showFrame = ownerWindow.requestAnimationFrame(flushShows)
    } else {
      showFrame = globalThis.setTimeout(flushShows, 16) as unknown as number
    }
  }

  const handleScroll = () => {
    scrolling = true
    if (scrollQuietTimer !== null) ownerWindow?.clearTimeout(scrollQuietTimer)
    const clearScrolling = () => {
      scrollQuietTimer = null
      scrolling = false
      scheduleShowFlush()
    }
    scrollQuietTimer = ownerWindow?.setTimeout(clearScrolling, SCROLL_QUIET_PERIOD_MS)
      ?? globalThis.setTimeout(clearScrolling, SCROLL_QUIET_PERIOD_MS)
  }

  scrollRoot?.addEventListener('scroll', handleScroll, { passive: true })

  const observer = Observer
    ? new Observer((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const pos = blocks.get(entry.target)?.getPos()
          if (pos !== undefined) pendingShow.add(pos)
        }
        scheduleShowFlush()
      }, { root: scrollRoot, rootMargin: '100% 0px' })
    : null

  const scheduleObserve = () => {
    if (!observer || flushScheduled) return
    flushScheduled = true
    queueMicrotask(() => {
      flushScheduled = false
      for (const element of pending) {
        pending.delete(element)
        if (blocks.has(element) && element.isConnected) observer.observe(element)
      }
    })
  }

  return {
    destroy: () => {
      observer?.disconnect()
      blocks.clear()
      pending.clear()
      pendingShow.clear()
      scrollRoot?.removeEventListener('scroll', handleScroll)
      if (scrollQuietTimer !== null) {
        ownerWindow?.clearTimeout(scrollQuietTimer)
        globalThis.clearTimeout(scrollQuietTimer)
        scrollQuietTimer = null
      }
      if (showFrame !== null) {
        if (ownerWindow?.cancelAnimationFrame) ownerWindow.cancelAnimationFrame(showFrame)
        else globalThis.clearTimeout(showFrame)
        showFrame = null
      }
    },
    observe: (block) => {
      blocks.set(block.element, block)
      if (observer) {
        pending.add(block.element)
        scheduleObserve()
      } else queueMicrotask(() => {
        const pos = block.getPos()
        if (pos !== undefined) showBlocks(view, [pos])
      })
      return () => {
        observer?.unobserve(block.element)
        blocks.delete(block.element)
        pending.delete(block.element)
      }
    },
  }
}

export function getVirtualizedViewController(view: EditorView, placementRoot: Node | null, showBlocks: ShowBlocks): VirtualizedViewController {
  let controller = controllers.get(view)
  if (!controller) {
    controller = createController(view, placementRoot, showBlocks)
    controllers.set(view, controller)
  }
  return controller
}

export function destroyVirtualizedViewController(view: EditorView): void {
  controllers.get(view)?.destroy()
  controllers.delete(view)
}
