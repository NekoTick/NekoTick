import { afterEach, describe, expect, it, vi } from 'vitest'

import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents'

import {
  resolveTableEdgeZoneLayout,
  resolveTableScrollRestorePosition,
  resolveTableWideLayoutMetrics,
} from '../../../../../../../vendor/milkdown/packages/components/src/table-block/view/table-block-layout'
import { createTableLayoutSyncScheduler } from '../../../../../../../vendor/milkdown/packages/components/src/table-block/view/table-block-layout-scheduler'

function setupTableLayoutScheduler() {
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 1
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const frame = nextFrame
    nextFrame += 1
    frames.set(frame, callback)
    return frame
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frame) => {
    frames.delete(frame)
  })

  const scrollRoot = document.createElement('div')
  scrollRoot.dataset.noteScrollRoot = 'true'
  const syncLayout = vi.fn()
  const scheduler = createTableLayoutSyncScheduler({
    isScrollInteractionActive: () =>
      scrollRoot.dataset.overlayScrollbarInteracting === 'true',
    syncLayout,
  })

  const flushNextFrame = () => {
    const entry = frames.entries().next().value as [number, FrameRequestCallback] | undefined
    if (!entry) return
    frames.delete(entry[0])
    entry[1](performance.now())
  }

  return {
    flushNextFrame,
    frames,
    scheduler,
    scrollRoot,
    syncLayout,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('table block layout', () => {
  it('expands into the surrounding scroll root and keeps selection bleed room for narrow tables', () => {
    expect(
      resolveTableWideLayoutMetrics({
        baseWidth: 420,
        leftReach: 36,
        rightReach: 52,
        naturalWidth: 560,
      })
    ).toEqual({
      maxWidth: 508,
      bleedLeft: 36,
      scrollStart: 36,
      scrollEnd: 52,
      tableMinWidth: '0px',
    })

    expect(
      resolveTableWideLayoutMetrics({
        baseWidth: 420,
        leftReach: 36,
        rightReach: 52,
        naturalWidth: 420,
      })
    ).toEqual({
      maxWidth: 454,
      bleedLeft: 24,
      scrollStart: 24,
      scrollEnd: 10,
      tableMinWidth: '100%',
    })
  })

  it('restores remembered scroll positions with right-stick and bounds clamping', () => {
    expect(
      resolveTableScrollRestorePosition({
        clientWidth: 320,
        clientHeight: 180,
        scrollWidth: 920,
        scrollHeight: 560,
        snapshot: {
          scrollLeft: 120,
          scrollTop: 900,
          stickToRight: true,
        },
      })
    ).toEqual({
      left: 600,
      top: 380,
    })

    expect(
      resolveTableScrollRestorePosition({
        clientWidth: 320,
        clientHeight: 180,
        scrollWidth: 920,
        scrollHeight: 560,
        snapshot: {
          scrollLeft: 999,
          scrollTop: 240,
          stickToRight: false,
        },
      })
    ).toEqual({
      left: 600,
      top: 240,
    })
  })

  it('positions edge-create zones from wrapper-relative table geometry', () => {
    expect(
      resolveTableEdgeZoneLayout({
        wrapperRect: {
          left: 60,
          top: 80,
        } as DOMRect,
        contentRect: {
          left: 104,
          top: 132,
          width: 360,
          height: 144,
        } as DOMRect,
        rowEdgeZoneSize: 18,
        colEdgeZoneSize: 18,
        cornerEdgeZoneSize: 30,
        cornerEdgeZoneInset: 10,
      })
    ).toEqual({
      bottom: {
        left: 44,
        top: 187,
        width: 360,
      },
      right: {
        top: 52,
        left: 395,
        height: 144,
      },
      corner: {
        top: 186,
        left: 394,
      },
    })
  })

  it('keeps bottom drag zones out of the horizontal scrollbar hit area', () => {
    expect(
      resolveTableEdgeZoneLayout({
        wrapperRect: {
          left: 60,
          top: 80,
        } as DOMRect,
        contentRect: {
          left: 104,
          top: 132,
          width: 360,
          height: 144,
        } as DOMRect,
        rowEdgeZoneSize: 18,
        colEdgeZoneSize: 18,
        cornerEdgeZoneSize: 30,
        cornerEdgeZoneInset: 10,
        hasHorizontalScrollbar: true,
      })
    ).toEqual({
      bottom: {
        left: 44,
        top: 178,
        width: 360,
      },
      right: {
        top: 52,
        left: 395,
        height: 144,
      },
      corner: {
        top: 166,
        left: 394,
      },
    })
  })

  it('defers layout reads while the notes viewport is scrolling and flushes once at idle', () => {
    const layout = setupTableLayoutScheduler()
    layout.scrollRoot.dataset.overlayScrollbarInteracting = 'true'

    layout.scheduler.queueLayoutSync()

    expect(layout.frames.size).toBe(0)
    expect(layout.syncLayout).not.toHaveBeenCalled()

    delete layout.scrollRoot.dataset.overlayScrollbarInteracting
    window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT))

    expect(layout.frames.size).toBe(1)
    layout.flushNextFrame()
    expect(layout.syncLayout).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT))
    expect(layout.frames.size).toBe(0)
  })

  it('defers an already queued layout when scrolling starts before its frame runs', () => {
    const layout = setupTableLayoutScheduler()
    layout.scheduler.queueLayoutSync()
    expect(layout.frames.size).toBe(1)

    layout.scrollRoot.dataset.overlayScrollbarInteracting = 'true'
    layout.flushNextFrame()

    expect(layout.syncLayout).not.toHaveBeenCalled()
    expect(layout.frames.size).toBe(0)

    delete layout.scrollRoot.dataset.overlayScrollbarInteracting
    window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT))
    layout.flushNextFrame()

    expect(layout.syncLayout).toHaveBeenCalledTimes(1)
  })

  it('drops deferred layout work when the table unmounts', () => {
    const layout = setupTableLayoutScheduler()
    layout.scrollRoot.dataset.overlayScrollbarInteracting = 'true'
    layout.scheduler.queueLayoutSync()

    layout.scheduler.destroy()
    delete layout.scrollRoot.dataset.overlayScrollbarInteracting
    window.dispatchEvent(new Event(OVERLAY_SCROLL_IDLE_EVENT))

    expect(layout.frames.size).toBe(0)
    expect(layout.syncLayout).not.toHaveBeenCalled()
  })
})
