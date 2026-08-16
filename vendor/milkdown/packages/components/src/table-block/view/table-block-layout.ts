import type { Ref } from 'vue'

import { onBeforeUnmount, onMounted } from 'vue'

import {
  forgetTableScroll,
  peekTableScroll,
  type TableScrollSnapshot,
} from './table-scroll-memory'
import { createTableLayoutSyncScheduler } from './table-block-layout-scheduler'

const TABLE_BLOCK_SELECTION_BLEED_X_START = 24
const TABLE_BLOCK_SELECTION_BLEED_X_END = 10

export function resolveTableWideLayoutMetrics({
  baseWidth,
  leftReach,
  rightReach,
  naturalWidth,
}: {
  baseWidth: number
  leftReach: number
  rightReach: number
  naturalWidth: number
}) {
  const isWideLayout = naturalWidth > baseWidth + 1
  const scrollStart = isWideLayout
    ? leftReach
    : TABLE_BLOCK_SELECTION_BLEED_X_START
  const scrollEnd = isWideLayout
    ? rightReach
    : TABLE_BLOCK_SELECTION_BLEED_X_END

  return {
    maxWidth: baseWidth + scrollStart + scrollEnd,
    bleedLeft: scrollStart,
    scrollStart,
    scrollEnd,
    tableMinWidth: isWideLayout ? '0px' : '100%',
  }
}

export function resolveTableScrollRestorePosition({
  clientWidth,
  clientHeight,
  scrollWidth,
  scrollHeight,
  snapshot,
}: {
  clientWidth: number
  clientHeight: number
  scrollWidth: number
  scrollHeight: number
  snapshot: TableScrollSnapshot
}) {
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight)

  return {
    left: snapshot.stickToRight
      ? maxScrollLeft
      : Math.max(0, Math.min(snapshot.scrollLeft, maxScrollLeft)),
    top: Math.max(0, Math.min(snapshot.scrollTop, maxScrollTop)),
  }
}

export function resolveTableEdgeZoneLayout({
  wrapperRect,
  contentRect,
  rowEdgeZoneSize,
  colEdgeZoneSize,
  cornerEdgeZoneSize,
  cornerEdgeZoneInset,
  hasHorizontalScrollbar = false,
}: {
  wrapperRect: Pick<DOMRect, 'left' | 'top'>
  contentRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
  rowEdgeZoneSize: number
  colEdgeZoneSize: number
  cornerEdgeZoneSize: number
  cornerEdgeZoneInset: number
  hasHorizontalScrollbar?: boolean
}) {
  const left = contentRect.left - wrapperRect.left
  const top = contentRect.top - wrapperRect.top
  const width = contentRect.width
  const height = contentRect.height
  const bottomTop = hasHorizontalScrollbar
    ? top + height - rowEdgeZoneSize
    : top + height - rowEdgeZoneSize / 2
  const cornerTop = hasHorizontalScrollbar
    ? top + height - cornerEdgeZoneSize
    : top + height - cornerEdgeZoneInset

  return {
    bottom: {
      left,
      top: bottomTop,
      width,
    },
    right: {
      top,
      left: left + width - colEdgeZoneSize / 2,
      height,
    },
    corner: {
      top: cornerTop,
      left: left + width - cornerEdgeZoneInset,
    },
  }
}

type UseTableBlockLayoutOptions = {
  rowEdgeZoneSize: number
  colEdgeZoneSize: number
  cornerEdgeZoneSize: number
  cornerEdgeZoneInset: number
  rootRef: Ref<HTMLDivElement | undefined>
  tableWrapperRef: Ref<HTMLDivElement | undefined>
  tableScrollRef: Ref<HTMLDivElement | undefined>
  contentWrapperRef: Ref<HTMLElement | undefined>
  bottomEdgeZoneRef: Ref<HTMLDivElement | undefined>
  rightEdgeZoneRef: Ref<HTMLDivElement | undefined>
  cornerEdgeZoneRef: Ref<HTMLDivElement | undefined>
  ensureContentHost: () => boolean
  getTableKey: () => number | undefined
  syncColumnHeaderControls: () => void
}

export function useTableBlockLayout({
  rowEdgeZoneSize,
  colEdgeZoneSize,
  cornerEdgeZoneSize,
  cornerEdgeZoneInset,
  rootRef,
  tableWrapperRef,
  tableScrollRef,
  contentWrapperRef,
  bottomEdgeZoneRef,
  rightEdgeZoneRef,
  cornerEdgeZoneRef,
  ensureContentHost,
  getTableKey,
  syncColumnHeaderControls,
}: UseTableBlockLayoutOptions) {
  let resizeObserver: ResizeObserver | undefined
  let observedScrollRoot: HTMLElement | undefined
  let observedContent: HTMLElement | undefined

  const resolveScrollRoot = () => {
    const root = rootRef.value
    const closestScrollRoot = root?.closest('[data-note-scroll-root="true"]')
    return closestScrollRoot instanceof HTMLElement ? closestScrollRoot : undefined
  }

  const syncObservedTargets = () => {
    if (!resizeObserver) return resolveScrollRoot()

    const scrollRoot = resolveScrollRoot()
    if (observedScrollRoot !== scrollRoot) {
      if (observedScrollRoot) resizeObserver.unobserve(observedScrollRoot)
      if (scrollRoot) resizeObserver.observe(scrollRoot)
      observedScrollRoot = scrollRoot
    }

    const content = contentWrapperRef.value
    if (observedContent !== content) {
      if (observedContent) resizeObserver.unobserve(observedContent)
      if (content) resizeObserver.observe(content)
      observedContent = content
    }

    return scrollRoot
  }

  const syncWideLayout = () => {
    const root = rootRef.value
    const wrapper = tableWrapperRef.value
    const scroll = tableScrollRef.value
    if (!root || !wrapper || !scroll) return

    ensureContentHost()

    const content = contentWrapperRef.value
    if (!content) return

    const scrollRoot = syncObservedTargets()
    const rootRect = root.getBoundingClientRect()
    const scrollRootRect = scrollRoot?.getBoundingClientRect()
    const metrics = resolveTableWideLayoutMetrics({
      baseWidth: rootRect.width,
      leftReach: scrollRootRect
        ? Math.max(0, rootRect.left - scrollRootRect.left)
        : 0,
      rightReach: scrollRootRect
        ? Math.max(0, scrollRootRect.right - rootRect.right)
        : 0,
      naturalWidth: Math.ceil(content.scrollWidth),
    })

    wrapper.style.setProperty('--table-block-max-width', `${metrics.maxWidth}px`)
    wrapper.style.setProperty(
      '--table-block-bleed-left',
      `${metrics.bleedLeft}px`
    )
    wrapper.style.setProperty(
      '--table-block-scroll-start',
      `${metrics.scrollStart}px`
    )
    wrapper.style.setProperty(
      '--table-block-scroll-end',
      `${metrics.scrollEnd}px`
    )
    wrapper.style.setProperty(
      '--table-block-table-min-width',
      metrics.tableMinWidth
    )
    const contentRect = content.getBoundingClientRect()
    const scrollbarReserve = Math.max(
      0,
      Math.round(root.getBoundingClientRect().bottom - contentRect.bottom)
    )
    root.style.setProperty(
      '--table-block-scrollbar-reserve',
      metrics.tableMinWidth === '0px' ? `${scrollbarReserve}px` : '0px'
    )

    if (scroll.clientWidth === 0 || scroll.scrollWidth === 0) return

    const tableKey = getTableKey()
    const pendingScroll = peekTableScroll(tableKey)
    if (!pendingScroll) return

    const restoredScroll = resolveTableScrollRestorePosition({
      clientWidth: scroll.clientWidth,
      clientHeight: scroll.clientHeight,
      scrollWidth: scroll.scrollWidth,
      scrollHeight: scroll.scrollHeight,
      snapshot: pendingScroll,
    })

    if (
      Math.abs(scroll.scrollLeft - restoredScroll.left) > 1 ||
      Math.abs(scroll.scrollTop - restoredScroll.top) > 1
    ) {
      scroll.scrollLeft = restoredScroll.left
      scroll.scrollTop = restoredScroll.top
    }
    forgetTableScroll(tableKey)
  }

  const syncEdgeCreateZones = () => {
    syncWideLayout()
    syncColumnHeaderControls()

    const wrapper = tableWrapperRef.value
    const scroll = tableScrollRef.value
    const bottomZone = bottomEdgeZoneRef.value
    const rightZone = rightEdgeZoneRef.value
    const cornerZone = cornerEdgeZoneRef.value
    if (!wrapper || !scroll) return

    ensureContentHost()

    const content = contentWrapperRef.value
    if (!content) return

    const zoneLayout = resolveTableEdgeZoneLayout({
      wrapperRect: wrapper.getBoundingClientRect(),
      contentRect: content.getBoundingClientRect(),
      rowEdgeZoneSize,
      colEdgeZoneSize,
      cornerEdgeZoneSize,
      cornerEdgeZoneInset,
      hasHorizontalScrollbar: scroll.offsetHeight > scroll.clientHeight + 1,
    })

    if (bottomZone) {
      Object.assign(bottomZone.style, {
        left: `${zoneLayout.bottom.left}px`,
        top: `${zoneLayout.bottom.top}px`,
        width: `${zoneLayout.bottom.width}px`,
      })
    }

    if (rightZone) {
      Object.assign(rightZone.style, {
        top: `${zoneLayout.right.top}px`,
        left: `${zoneLayout.right.left}px`,
        height: `${zoneLayout.right.height}px`,
      })
    }

    if (cornerZone) {
      Object.assign(cornerZone.style, {
        top: `${zoneLayout.corner.top}px`,
        left: `${zoneLayout.corner.left}px`,
      })
    }

  }

  const layoutScheduler = createTableLayoutSyncScheduler({
    isScrollInteractionActive: () =>
      resolveScrollRoot()?.dataset.overlayScrollbarInteracting === 'true',
    syncLayout: syncEdgeCreateZones,
  })

  onMounted(() => {
    window.addEventListener('resize', layoutScheduler.queueLayoutSync)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        layoutScheduler.queueLayoutSync()
      })

      if (tableWrapperRef.value) resizeObserver.observe(tableWrapperRef.value)
      if (tableScrollRef.value) resizeObserver.observe(tableScrollRef.value)
      syncObservedTargets()
    }

    layoutScheduler.queueLayoutSync()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', layoutScheduler.queueLayoutSync)
    layoutScheduler.destroy()
    if (observedScrollRoot) resizeObserver?.unobserve(observedScrollRoot)
    if (observedContent) resizeObserver?.unobserve(observedContent)
    resizeObserver?.disconnect()
  })

  return {
    queueLayoutSync: layoutScheduler.queueLayoutSync,
    syncEdgeCreateZones,
  }
}
