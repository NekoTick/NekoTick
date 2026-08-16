const OVERLAY_SCROLL_IDLE_EVENT = 'vlaina:overlay-scroll-idle'

export function createTableLayoutSyncScheduler({
  isScrollInteractionActive,
  syncLayout,
}: {
  isScrollInteractionActive: () => boolean
  syncLayout: () => void
}) {
  let syncFrame = 0
  let syncPending = false
  let waitingForScrollIdle = false
  let destroyed = false

  function stopWaitingForScrollIdle() {
    if (!waitingForScrollIdle) return
    waitingForScrollIdle = false
    window.removeEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleScrollIdle)
  }

  function handleScrollIdle() {
    if (isScrollInteractionActive()) return
    stopWaitingForScrollIdle()
    if (syncPending) queueLayoutSync()
  }

  function waitForScrollIdle() {
    if (waitingForScrollIdle) return
    waitingForScrollIdle = true
    window.addEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleScrollIdle)
  }

  function queueLayoutSync() {
    if (destroyed || typeof window === 'undefined') return
    syncPending = true
    if (syncFrame !== 0) return
    if (isScrollInteractionActive()) {
      waitForScrollIdle()
      return
    }

    syncFrame = window.requestAnimationFrame(() => {
      syncFrame = 0
      if (destroyed) return
      if (isScrollInteractionActive()) {
        waitForScrollIdle()
        return
      }
      syncPending = false
      syncLayout()
    })
  }

  function destroy() {
    destroyed = true
    if (syncFrame !== 0) {
      window.cancelAnimationFrame(syncFrame)
      syncFrame = 0
    }
    syncPending = false
    stopWaitingForScrollIdle()
  }

  return { destroy, queueLayoutSync }
}
