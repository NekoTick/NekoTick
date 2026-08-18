import type { EditorView } from '@milkdown/prose/view'

export type VirtualizedBlockTextMetrics = {
  availableWidth: number
  editor: HTMLElement
  font: string
  letterSpacing: number
  lineHeight: number
  whiteSpace: string
  wordBreak: string
}

export type ObservedBlock = {
  element: HTMLElement
  getPos: () => number | undefined
  refresh: (metrics: VirtualizedBlockTextMetrics | null) => void
}

type VirtualizedViewController = {
  destroy: () => void
  observe: (block: ObservedBlock) => () => void
  requestRefresh: (element: Element) => void
}

type ShowBlocks = (view: EditorView, positions: readonly number[]) => void

const MAX_BLOCKS_MATERIALIZED_PER_FRAME = 8
const controllers = new WeakMap<EditorView, VirtualizedViewController>()

function parsePixelValue(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readTextMetrics(
  view: EditorView,
  ownerWindow: Window | null | undefined
): VirtualizedBlockTextMetrics | null {
  if (!ownerWindow) return null
  const styles = ownerWindow.getComputedStyle(view.dom)
  const rectWidth = view.dom.getBoundingClientRect().width
  const width = rectWidth > 0 ? rectWidth : view.dom.clientWidth
  const paddingInline = (parsePixelValue(styles.paddingLeft) ?? 0)
    + (parsePixelValue(styles.paddingRight) ?? 0)
  const availableWidth = Math.floor(width - paddingInline)
  const fontSize = parsePixelValue(styles.fontSize)
  const lineHeight = parsePixelValue(styles.lineHeight)
  if (availableWidth <= 0 || fontSize === null || lineHeight === null) return null

  const font = styles.font || [
    styles.fontStyle || 'normal',
    styles.fontWeight || '400',
    `${fontSize}px`,
    styles.fontFamily || 'sans-serif',
  ].join(' ')
  return {
    availableWidth,
    editor: view.dom,
    font,
    letterSpacing: parsePixelValue(styles.letterSpacing) ?? 0,
    lineHeight,
    whiteSpace: styles.whiteSpace,
    wordBreak: styles.wordBreak,
  }
}

function createController(
  view: EditorView,
  placementRoot: Node | null,
  showBlocks: ShowBlocks
): VirtualizedViewController {
  const blocks = new Map<Element, ObservedBlock>()
  const pending = new Set<Element>()
  const pendingRefresh = new Set<Element>()
  const pendingShow = new Set<number>()
  let flushScheduled = false
  let refreshFrame: number | null = null
  let showFrame: number | null = null
  const ownerWindow = view.dom.ownerDocument.defaultView
  const Observer = ownerWindow?.IntersectionObserver
  const ResizeObserverConstructor = ownerWindow?.ResizeObserver
  const scrollRoot = placementRoot instanceof Element
    ? placementRoot.closest('[data-note-scroll-root="true"]')
    : null

  const flushShows = () => {
    showFrame = null
    if (view.isDestroyed || pendingShow.size === 0) return
    const positions = Array.from(pendingShow).slice(0, MAX_BLOCKS_MATERIALIZED_PER_FRAME)
    for (const pos of positions) pendingShow.delete(pos)
    showBlocks(view, positions)
    if (pendingShow.size > 0) scheduleShowFlush()
  }

  const scheduleShowFlush = () => {
    if (showFrame !== null) return
    if (ownerWindow?.requestAnimationFrame) {
      showFrame = ownerWindow.requestAnimationFrame(flushShows)
    } else {
      showFrame = globalThis.setTimeout(flushShows, 16) as unknown as number
    }
  }

  const flushRefreshes = () => {
    refreshFrame = null
    if (view.isDestroyed || pendingRefresh.size === 0) return
    const metrics = readTextMetrics(view, ownerWindow)
    for (const element of pendingRefresh) {
      pendingRefresh.delete(element)
      blocks.get(element)?.refresh(metrics)
    }
  }

  const scheduleRefreshFlush = () => {
    if (refreshFrame !== null) return
    if (ownerWindow?.requestAnimationFrame) {
      refreshFrame = ownerWindow.requestAnimationFrame(flushRefreshes)
    } else {
      refreshFrame = globalThis.setTimeout(flushRefreshes, 16) as unknown as number
    }
  }

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

  const resizeObserver = ResizeObserverConstructor
    ? new ResizeObserverConstructor(() => {
        for (const element of blocks.keys()) pendingRefresh.add(element)
        scheduleRefreshFlush()
      })
    : null
  resizeObserver?.observe(view.dom)

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
      resizeObserver?.disconnect()
      blocks.clear()
      pending.clear()
      pendingRefresh.clear()
      pendingShow.clear()
      if (refreshFrame !== null) {
        if (ownerWindow?.cancelAnimationFrame) ownerWindow.cancelAnimationFrame(refreshFrame)
        else globalThis.clearTimeout(refreshFrame)
        refreshFrame = null
      }
      if (showFrame !== null) {
        if (ownerWindow?.cancelAnimationFrame) ownerWindow.cancelAnimationFrame(showFrame)
        else globalThis.clearTimeout(showFrame)
        showFrame = null
      }
    },
    observe: (block) => {
      blocks.set(block.element, block)
      pendingRefresh.add(block.element)
      scheduleRefreshFlush()
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
        pendingRefresh.delete(block.element)
      }
    },
    requestRefresh: (element) => {
      if (!blocks.has(element)) return
      pendingRefresh.add(element)
      scheduleRefreshFlush()
    },
  }
}

export function getVirtualizedViewController(
  view: EditorView,
  placementRoot: Node | null,
  showBlocks: ShowBlocks
): VirtualizedViewController {
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
