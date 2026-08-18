import { getCurrentInstance, onMounted, onUnmounted } from 'vue'

import type { Refs } from './types'
import {
  bindDragSessionDocumentListeners,
  canHandleDragSessionEvent,
  captureDragSessionPointer,
  type DragSessionEvent,
  getDragRuntimeKey,
  releaseDragSessionPointer,
  type DragSessionSource,
  type DragSessionState,
  unbindDragSessionDocumentListeners,
} from './drag-session'
import {
  acquireTableDragCursor,
  releaseTableDragCursor,
  suppressTableDragSelection,
} from './drag-cursor'
import {
  readEdgeCreateWheelDelta,
  readEdgeCreateAbsoluteCoord,
  readEdgeCreateClientCoord,
  resolveEdgeCreateAutoScrollDelta,
  resolveEdgeCreateScrollSource,
  scrollEdgeCreateSourceBy,
  type EdgeCreateScrollSource,
} from './edge-create-scroll'
import {
  createEdgeCreateAnchors,
  resolveEdgeCreateAction,
  type EdgeCreateAnchors,
  type EdgeCreateAxis,
} from './edge-create-state'
import {
  getTableDomColCount,
  getTableDomRowCount,
} from './table-dom-metrics'
import {
  createTableSizeTooltip,
  destroyTableSizeTooltip,
  type TableSizeTooltip,
  updateTableSizeTooltip,
} from './table-size-tooltip'

const EDGE_CREATE_THRESHOLD = 18
const EDGE_CREATE_ACTIVATION_THRESHOLD = 6

interface EdgeCreateSession extends DragSessionState {
  axis: EdgeCreateAxis
  pointerClientX: number
  pointerClientY: number
  startCoord: number
  lastClientCoord: number
  lastCoord: number
  lastCommitCoord: number
  edgeCoord: number
  anchors: EdgeCreateAnchors
  pendingAnchorSync: boolean
  isActive: boolean
  scrollSource: EdgeCreateScrollSource | null
  autoScrollFrame: number
  manualScrollHoldUntil: number
  sizeTooltip: TableSizeTooltip | null
}

interface EdgeCreateRuntime {
  refs: Refs
  getKey: () => number | undefined
  isEditable: () => boolean
  onAddRow: () => void
  onAddCol: () => void
  onShrinkRow: () => void
  onShrinkCol: () => void
  canShrinkRow: () => boolean
  canShrinkCol: () => boolean
}

let activeSession: EdgeCreateSession | null = null
let activeRuntime: EdgeCreateRuntime | null = null

function readCurrentTime() {
  if (typeof performance !== 'undefined') {
    return performance.now()
  }

  return Date.now()
}

function getRowCount(refs: Refs) {
  return getTableDomRowCount(refs.contentWrapperRef.value)
}

function getColCount(refs: Refs) {
  return getTableDomColCount(refs.contentWrapperRef.value)
}

function syncBottomEdgeIndex(refs: Refs): boolean {
  const rowCount = getRowCount(refs)
  if (rowCount == null || rowCount === 0) return false
  refs.lineHoverIndex.value = [rowCount, 0]
  return true
}

function syncRightEdgeIndex(refs: Refs): boolean {
  const colCount = getColCount(refs)
  if (colCount == null || colCount === 0) return false
  refs.lineHoverIndex.value = [0, colCount]
  return true
}

function getCurrentEdgeCoord(
  runtime: EdgeCreateRuntime,
  axis: EdgeCreateAxis,
  scrollSource: EdgeCreateScrollSource | null
): number | null {
  const content = runtime.refs.contentWrapperRef.value
  if (!content) return null

  const rect = content.getBoundingClientRect()
  return readEdgeCreateAbsoluteCoord({
    axis,
    clientCoord: axis === 'row' ? rect.bottom : rect.right,
    scrollSource,
  })
}

function bindSessionScrollListener(source: EdgeCreateScrollSource | null) {
  source?.addEventListener('scroll', handleScroll, { passive: true })
}

function unbindSessionScrollListener(source: EdgeCreateScrollSource | null) {
  source?.removeEventListener('scroll', handleScroll)
}

function bindSessionWheelListener() {
  document.addEventListener('wheel', handleWheel, {
    capture: true,
    passive: false,
  })
}

function unbindSessionWheelListener() {
  document.removeEventListener('wheel', handleWheel, true)
}

function bindSessionAbortListeners() {
  if (typeof window === 'undefined') return
  window.addEventListener('blur', handleAbort)
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

function unbindSessionAbortListeners() {
  if (typeof window === 'undefined') return
  window.removeEventListener('blur', handleAbort)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
}

function stopAutoScrollLoop(session: EdgeCreateSession) {
  if (session.autoScrollFrame === 0 || typeof window === 'undefined') return
  window.cancelAnimationFrame(session.autoScrollFrame)
  session.autoScrollFrame = 0
}

function startAutoScrollLoop(session: EdgeCreateSession) {
  if (session.autoScrollFrame !== 0 || typeof window === 'undefined') return

  const tick = () => {
    const currentSession = activeSession
    const runtime = activeRuntime
    if (currentSession !== session || !runtime) {
      session.autoScrollFrame = 0
      return
    }

    if (readCurrentTime() < session.manualScrollHoldUntil) {
      session.autoScrollFrame = window.requestAnimationFrame(tick)
      return
    }

    const delta = resolveEdgeCreateAutoScrollDelta({
      axis: session.axis,
      clientCoord: session.lastClientCoord,
      scrollSource: session.scrollSource,
    })

    if (
      delta !== 0 &&
      scrollEdgeCreateSourceBy({
        axis: session.axis,
        delta,
        scrollSource: session.scrollSource,
      })
    ) {
      suppressTableDragSelection()
      updateSession(runtime, session, session.lastClientCoord)
    }

    session.autoScrollFrame = window.requestAnimationFrame(tick)
  }

  session.autoScrollFrame = window.requestAnimationFrame(tick)
}

function refreshSizeTooltip(runtime: EdgeCreateRuntime, session: EdgeCreateSession) {
  updateTableSizeTooltip(
    session.sizeTooltip,
    runtime.refs,
    session.pointerClientX,
    session.pointerClientY
  )
}

function updateSession(
  runtime: EdgeCreateRuntime,
  session: EdgeCreateSession,
  currentClientCoord: number
) {
  const currentAbsoluteCoord = readEdgeCreateAbsoluteCoord({
    axis: session.axis,
    clientCoord: currentClientCoord,
    scrollSource: session.scrollSource,
  })

  if (!session.isActive) {
    session.lastClientCoord = currentClientCoord
    session.lastCoord = currentAbsoluteCoord

    if (
      Math.abs(currentAbsoluteCoord - session.startCoord) <
      EDGE_CREATE_ACTIVATION_THRESHOLD
    ) {
      return false
    }

    const edgeCoord = getCurrentEdgeCoord(
      runtime,
      session.axis,
      session.scrollSource
    )
    if (edgeCoord == null) return false

    session.isActive = true
    session.edgeCoord = edgeCoord
    const currentOffset = currentAbsoluteCoord - edgeCoord
    session.lastCoord = currentOffset
    session.lastCommitCoord = currentOffset
    session.anchors = createEdgeCreateAnchors(
      currentOffset,
      0,
      EDGE_CREATE_THRESHOLD
    )
    session.pendingAnchorSync = false
    return true
  }

  let activeEdgeCoord = session.edgeCoord
  if (session.pendingAnchorSync) {
    const edgeCoord = getCurrentEdgeCoord(
      runtime,
      session.axis,
      session.scrollSource
    )
    if (edgeCoord == null) return false
    if (edgeCoord === session.edgeCoord) {
      session.lastClientCoord = currentClientCoord
      session.lastCoord = currentAbsoluteCoord - edgeCoord
      return false
    }
    session.edgeCoord = edgeCoord
    activeEdgeCoord = edgeCoord
    session.anchors = createEdgeCreateAnchors(
      session.lastCommitCoord,
      0,
      EDGE_CREATE_THRESHOLD
    )
    session.pendingAnchorSync = false
  }

  const currentOffset = currentAbsoluteCoord - activeEdgeCoord
  const action = resolveEdgeCreateAction({
    currentCoord: currentOffset,
    previousCoord: session.lastCoord,
    anchors: session.anchors,
  })

  session.lastClientCoord = currentClientCoord
  session.lastCoord = currentOffset

  if (action === 'expand') {
    if (session.axis === 'row') {
      if (!syncBottomEdgeIndex(runtime.refs)) return false
      runtime.onAddRow()
    } else {
      if (!syncRightEdgeIndex(runtime.refs)) return false
      runtime.onAddCol()
    }

    session.lastCommitCoord = currentOffset
    session.pendingAnchorSync = true
    return true
  }

  if (action !== 'shrink') return false

  if (session.axis === 'row') {
    if (!runtime.canShrinkRow()) return false
    syncBottomEdgeIndex(runtime.refs)
    runtime.onShrinkRow()
  } else {
    if (!runtime.canShrinkCol()) return false
    syncRightEdgeIndex(runtime.refs)
    runtime.onShrinkCol()
  }

  session.lastCommitCoord = currentOffset
  session.pendingAnchorSync = true
  return true
}

function clearSession(current: EdgeCreateSession | null = activeSession) {
  if (!current) return

  unbindDragSessionDocumentListeners(current.source, handleMove, handleEnd)
  unbindSessionScrollListener(current.scrollSource)
  unbindSessionWheelListener()
  unbindSessionAbortListeners()
  stopAutoScrollLoop(current)
  destroyTableSizeTooltip(current.sizeTooltip)
  current.sizeTooltip = null
  releaseTableDragCursor()
  releaseDragSessionPointer(current)

  if (activeSession === current) {
    activeSession = null
  }
}

function handleMove(e: DragSessionEvent) {
  const session = activeSession
  const runtime = activeRuntime
  if (!session || !runtime) return
  if (!canHandleDragSessionEvent(session, e)) return
  if (
    e.buttons === 0 &&
    (session.source === 'mouse' || ('pointerType' in e && e.pointerType === 'mouse'))
  ) {
    clearSession(session)
    return
  }

  session.manualScrollHoldUntil = 0
  session.pointerClientX = e.clientX
  session.pointerClientY = e.clientY
  suppressTableDragSelection()

  const currentClientCoord = readEdgeCreateClientCoord(e, session.axis)
  const handled = updateSession(runtime, session, currentClientCoord)
  refreshSizeTooltip(runtime, session)
  if (!handled) return

  e.preventDefault()
  e.stopPropagation()
}

function handleEnd(e: DragSessionEvent) {
  const session = activeSession
  if (!session) return
  if (!canHandleDragSessionEvent(session, e)) return

  clearSession(session)
  e.preventDefault()
  e.stopPropagation()
}

function handleScroll() {
  const session = activeSession
  const runtime = activeRuntime
  if (!session || !runtime) return

  suppressTableDragSelection()
  updateSession(runtime, session, session.lastClientCoord)
  refreshSizeTooltip(runtime, session)
}

function handleAbort() {
  clearSession()
}

function handleVisibilityChange() {
  if (document.hidden) {
    clearSession()
  }
}

function resolveWheelClientCoord(
  event: WheelEvent,
  axis: EdgeCreateAxis,
  fallback: number
) {
  const clientCoord = axis === 'row' ? event.clientY : event.clientX
  return Number.isFinite(clientCoord) ? clientCoord : fallback
}

function handleWheel(event: WheelEvent) {
  const session = activeSession
  const runtime = activeRuntime
  if (!session || !runtime) return

  const currentClientCoord = resolveWheelClientCoord(
    event,
    session.axis,
    session.lastClientCoord
  )
  const delta = readEdgeCreateWheelDelta(
    event,
    session.axis,
    session.scrollSource
  )
  if (delta === 0) return

  const scrolled = scrollEdgeCreateSourceBy({
    axis: session.axis,
    delta,
    scrollSource: session.scrollSource,
  })
  if (!scrolled) return

  session.manualScrollHoldUntil = readCurrentTime() + 140
  if (Number.isFinite(event.clientX)) {
    session.pointerClientX = event.clientX
  }
  if (Number.isFinite(event.clientY)) {
    session.pointerClientY = event.clientY
  }
  suppressTableDragSelection()
  updateSession(runtime, session, currentClientCoord)
  refreshSizeTooltip(runtime, session)
  event.preventDefault()
}

export function useEdgeCreateHandlers(
  refs: Refs,
  isEditable: () => boolean,
  onAddRow: () => void,
  onAddCol: () => void,
  onShrinkRow: () => void,
  onShrinkCol: () => void,
  canShrinkRow: () => boolean,
  canShrinkCol: () => boolean,
  getKey: () => number | undefined
) {
  const runtime: EdgeCreateRuntime = {
    refs,
    getKey,
    isEditable,
    onAddRow,
    onAddCol,
    onShrinkRow,
    onShrinkCol,
    canShrinkRow,
    canShrinkCol,
  }

  const destroyEdgeCreateSession = () => {
    if (activeRuntime === runtime) {
      clearSession(activeSession)
      activeRuntime = null
    }
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      if (!activeSession) return
      if (activeSession.key !== getDragRuntimeKey(runtime.getKey)) return
      activeRuntime = runtime
    })

    onUnmounted(destroyEdgeCreateSession)
  }

  const startSession =
    (axis: EdgeCreateAxis, source: DragSessionSource) => (e: DragSessionEvent) => {
      if (activeSession) return
      if (!runtime.isEditable()) return
      if (e.button !== 0) return
      if (!(e.currentTarget instanceof HTMLElement)) return

      const canStart =
        axis === 'row'
          ? syncBottomEdgeIndex(runtime.refs)
          : syncRightEdgeIndex(runtime.refs)
      if (!canStart) return

      const scrollSource = resolveEdgeCreateScrollSource(runtime.refs, axis)
      const startClientCoord = readEdgeCreateClientCoord(e, axis)
      const startCoord = readEdgeCreateAbsoluteCoord({
        axis,
        clientCoord: startClientCoord,
        scrollSource,
      })
      const edgeCoord = getCurrentEdgeCoord(runtime, axis, scrollSource)
      if (edgeCoord == null) return

      activeRuntime = runtime
      activeSession = {
        axis,
        source,
        pointerId: 'pointerId' in e ? e.pointerId : null,
        pointerClientX: e.clientX,
        pointerClientY: e.clientY,
        startCoord,
        lastClientCoord: startClientCoord,
        lastCoord: startCoord,
        lastCommitCoord: startCoord,
        edgeCoord,
        anchors: createEdgeCreateAnchors(
          startCoord,
          edgeCoord,
          EDGE_CREATE_THRESHOLD
        ),
        pendingAnchorSync: false,
        isActive: false,
        scrollSource,
        autoScrollFrame: 0,
        manualScrollHoldUntil: 0,
        sizeTooltip: createTableSizeTooltip(runtime.refs, e.clientX, e.clientY),
        target: e.currentTarget,
        key: getDragRuntimeKey(runtime.getKey),
      }
      captureDragSessionPointer(source, e, e.currentTarget)

      acquireTableDragCursor(axis === 'row' ? 'row-resize' : 'col-resize')
      bindDragSessionDocumentListeners(source, handleMove, handleEnd)
      bindSessionScrollListener(scrollSource)
      bindSessionWheelListener()
      bindSessionAbortListeners()
      if (activeSession) {
        startAutoScrollLoop(activeSession)
      }
      e.preventDefault()
      e.stopPropagation()
    }

  return {
    startRowEdgeCreate: startSession('row', 'pointer'),
    startColEdgeCreate: startSession('col', 'pointer'),
    startRowEdgeCreateMouse: startSession('row', 'mouse'),
    startColEdgeCreateMouse: startSession('col', 'mouse'),
    prepareRowEdgeCreate: () =>
      runtime.isEditable() && syncBottomEdgeIndex(runtime.refs),
    prepareColEdgeCreate: () =>
      runtime.isEditable() && syncRightEdgeIndex(runtime.refs),
    destroyEdgeCreateSession,
  }
}
