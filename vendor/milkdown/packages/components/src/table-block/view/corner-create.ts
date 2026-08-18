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
const CORNER_CREATE_ACTIVATION_THRESHOLD = 6

interface CornerAxisChannel {
  startCoord: number
  lastClientCoord: number
  lastCoord: number
  lastCommitCoord: number
  edgeCoord: number
  anchors: EdgeCreateAnchors
  pendingAnchorSync: boolean
  scrollSource: EdgeCreateScrollSource | null
}

interface CornerCreateSession extends DragSessionState {
  row: CornerAxisChannel
  col: CornerAxisChannel
  isActive: boolean
  autoScrollFrame: number
  manualScrollHoldUntil: number
  sizeTooltip: TableSizeTooltip | null
}

interface CornerCreateRuntime {
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

let activeSession: CornerCreateSession | null = null
let activeRuntime: CornerCreateRuntime | null = null

function readCurrentTime() {
  if (typeof performance !== 'undefined') {
    return performance.now()
  }

  return Date.now()
}

function getCurrentEdgeCoord(
  runtime: CornerCreateRuntime,
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

function bindCornerScrollListeners(session: CornerCreateSession) {
  bindSessionScrollListener(session.row.scrollSource)
  if (session.col.scrollSource !== session.row.scrollSource) {
    bindSessionScrollListener(session.col.scrollSource)
  }
}

function unbindCornerScrollListeners(session: CornerCreateSession) {
  unbindSessionScrollListener(session.row.scrollSource)
  if (session.col.scrollSource !== session.row.scrollSource) {
    unbindSessionScrollListener(session.col.scrollSource)
  }
}

function stopAutoScrollLoop(session: CornerCreateSession) {
  if (session.autoScrollFrame === 0 || typeof window === 'undefined') return
  window.cancelAnimationFrame(session.autoScrollFrame)
  session.autoScrollFrame = 0
}

function startAutoScrollLoop(session: CornerCreateSession) {
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

    let scrolled = false
    const rowDelta = resolveEdgeCreateAutoScrollDelta({
      axis: 'row',
      clientCoord: session.row.lastClientCoord,
      scrollSource: session.row.scrollSource,
    })
    if (
      rowDelta !== 0 &&
      scrollEdgeCreateSourceBy({
        axis: 'row',
        delta: rowDelta,
        scrollSource: session.row.scrollSource,
      })
    ) {
      scrolled = true
    }

    const colDelta = resolveEdgeCreateAutoScrollDelta({
      axis: 'col',
      clientCoord: session.col.lastClientCoord,
      scrollSource: session.col.scrollSource,
    })
    if (
      colDelta !== 0 &&
      scrollEdgeCreateSourceBy({
        axis: 'col',
        delta: colDelta,
        scrollSource: session.col.scrollSource,
      })
    ) {
      scrolled = true
    }

    if (scrolled) {
      suppressTableDragSelection()
      if (!session.isActive) {
        maybeActivateSession(
          runtime,
          session,
          session.row.lastClientCoord,
          session.col.lastClientCoord
        )
      } else {
        updateAxis(runtime, session, 'row', session.row.lastClientCoord)
        updateAxis(runtime, session, 'col', session.col.lastClientCoord)
      }
      refreshSizeTooltip(runtime, session)
    }

    session.autoScrollFrame = window.requestAnimationFrame(tick)
  }

  session.autoScrollFrame = window.requestAnimationFrame(tick)
}

function getChannel(
  session: CornerCreateSession,
  axis: EdgeCreateAxis
): CornerAxisChannel {
  return axis === 'row' ? session.row : session.col
}

function refreshSizeTooltip(runtime: CornerCreateRuntime, session: CornerCreateSession) {
  updateTableSizeTooltip(
    session.sizeTooltip,
    runtime.refs,
    session.col.lastClientCoord,
    session.row.lastClientCoord
  )
}

function clearSession(current: CornerCreateSession | null = activeSession) {
  if (!current) return

  unbindDragSessionDocumentListeners(current.source, handleMove, handleEnd)
  unbindCornerScrollListeners(current)
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

function syncAxisIndex(refs: Refs, axis: EdgeCreateAxis): boolean {
  if (axis === 'row') {
    const rowCount = getTableDomRowCount(refs.contentWrapperRef.value)
    if (rowCount == null || rowCount === 0) return false
    refs.lineHoverIndex.value = [rowCount, 0]
    return true
  }

  const colCount = getTableDomColCount(refs.contentWrapperRef.value)
  if (colCount == null || colCount === 0) return false
  refs.lineHoverIndex.value = [0, colCount]
  return true
}

function triggerAxis(
  runtime: CornerCreateRuntime,
  axis: EdgeCreateAxis,
  action: 'expand' | 'shrink'
) {
  if (action === 'expand') {
    if (!syncAxisIndex(runtime.refs, axis)) return false
    if (axis === 'row') runtime.onAddRow()
    else runtime.onAddCol()
    return true
  }

  if (axis === 'row') {
    if (!runtime.canShrinkRow()) return false
    syncAxisIndex(runtime.refs, axis)
    runtime.onShrinkRow()
    return true
  }

  if (!runtime.canShrinkCol()) return false
  syncAxisIndex(runtime.refs, axis)
  runtime.onShrinkCol()
  return true
}

function updateAxis(
  runtime: CornerCreateRuntime,
  session: CornerCreateSession,
  axis: EdgeCreateAxis,
  currentClientCoord: number
): boolean {
  const channel = getChannel(session, axis)
  const currentCoord = readEdgeCreateAbsoluteCoord({
    axis,
    clientCoord: currentClientCoord,
    scrollSource: channel.scrollSource,
  })

  if (channel.pendingAnchorSync) {
    const edgeCoord = getCurrentEdgeCoord(runtime, axis, channel.scrollSource)
    if (edgeCoord == null) return false
    if (edgeCoord === channel.edgeCoord) {
      channel.lastClientCoord = currentClientCoord
      channel.lastCoord = currentCoord
      return false
    }
    channel.edgeCoord = edgeCoord
    channel.anchors = createEdgeCreateAnchors(
      channel.lastCommitCoord,
      edgeCoord,
      EDGE_CREATE_THRESHOLD
    )
    channel.pendingAnchorSync = false
  }

  const action = resolveEdgeCreateAction({
    currentCoord,
    previousCoord: channel.lastCoord,
    anchors: channel.anchors,
  })

  channel.lastClientCoord = currentClientCoord
  channel.lastCoord = currentCoord
  if (!action) return false

  const triggered = triggerAxis(runtime, axis, action)
  if (!triggered) return false

  channel.lastCommitCoord = currentCoord
  channel.pendingAnchorSync = true
  return true
}

function maybeActivateSession(
  runtime: CornerCreateRuntime,
  session: CornerCreateSession,
  rowClientCoord: number,
  colClientCoord: number
) {
  const rowCoord = readEdgeCreateAbsoluteCoord({
    axis: 'row',
    clientCoord: rowClientCoord,
    scrollSource: session.row.scrollSource,
  })
  const colCoord = readEdgeCreateAbsoluteCoord({
    axis: 'col',
    clientCoord: colClientCoord,
    scrollSource: session.col.scrollSource,
  })

  session.row.lastClientCoord = rowClientCoord
  session.row.lastCoord = rowCoord
  session.col.lastClientCoord = colClientCoord
  session.col.lastCoord = colCoord

  const rowDelta = rowCoord - session.row.startCoord
  const colDelta = colCoord - session.col.startCoord
  if (
    Math.max(Math.abs(rowDelta), Math.abs(colDelta)) <
    CORNER_CREATE_ACTIVATION_THRESHOLD
  ) {
    return false
  }

  const rowEdgeCoord = getCurrentEdgeCoord(
    runtime,
    'row',
    session.row.scrollSource
  )
  const colEdgeCoord = getCurrentEdgeCoord(
    runtime,
    'col',
    session.col.scrollSource
  )
  if (rowEdgeCoord == null || colEdgeCoord == null) return false

  session.isActive = true
  session.row.edgeCoord = rowEdgeCoord
  session.row.lastCommitCoord = rowCoord
  session.row.anchors = createEdgeCreateAnchors(
    rowCoord,
    rowEdgeCoord,
    EDGE_CREATE_THRESHOLD
  )
  session.row.pendingAnchorSync = false
  session.col.edgeCoord = colEdgeCoord
  session.col.lastCommitCoord = colCoord
  session.col.anchors = createEdgeCreateAnchors(
    colCoord,
    colEdgeCoord,
    EDGE_CREATE_THRESHOLD
  )
  session.col.pendingAnchorSync = false
  return true
}

function handleMove(event: DragSessionEvent) {
  const session = activeSession
  const runtime = activeRuntime
  if (!session || !runtime) return
  if (!canHandleDragSessionEvent(session, event)) return
  if (
    event.buttons === 0 &&
    (session.source === 'mouse' || ('pointerType' in event && event.pointerType === 'mouse'))
  ) {
    clearSession(session)
    return
  }

  session.manualScrollHoldUntil = 0
  const rowClientCoord = readEdgeCreateClientCoord(event, 'row')
  const colClientCoord = readEdgeCreateClientCoord(event, 'col')

  if (!session.isActive) {
    const activated = maybeActivateSession(
      runtime,
      session,
      rowClientCoord,
      colClientCoord
    )
    if (!activated) {
      refreshSizeTooltip(runtime, session)
      return
    }
    refreshSizeTooltip(runtime, session)
    event.preventDefault()
    event.stopPropagation()
    return
  }

  suppressTableDragSelection()

  const rowTriggered = updateAxis(runtime, session, 'row', rowClientCoord)
  const colTriggered = updateAxis(runtime, session, 'col', colClientCoord)
  void rowTriggered
  void colTriggered
  refreshSizeTooltip(runtime, session)

  event.preventDefault()
  event.stopPropagation()
}

function handleEnd(event: DragSessionEvent) {
  const session = activeSession
  if (!session) return
  if (!canHandleDragSessionEvent(session, event)) return

  clearSession(session)
  event.preventDefault()
  event.stopPropagation()
}

function handleScroll() {
  const session = activeSession
  const runtime = activeRuntime
  if (!session || !runtime) return

  suppressTableDragSelection()

  if (!session.isActive) {
    maybeActivateSession(
      runtime,
      session,
      session.row.lastClientCoord,
      session.col.lastClientCoord
    )
    refreshSizeTooltip(runtime, session)
    return
  }

  updateAxis(runtime, session, 'row', session.row.lastClientCoord)
  updateAxis(runtime, session, 'col', session.col.lastClientCoord)
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
  value: number,
  fallback: number
) {
  return Number.isFinite(value) ? value : fallback
}

function handleWheel(event: WheelEvent) {
  const session = activeSession
  const runtime = activeRuntime
  if (!session || !runtime) return

  const rowClientCoord = resolveWheelClientCoord(
    event.clientY,
    session.row.lastClientCoord
  )
  const colClientCoord = resolveWheelClientCoord(
    event.clientX,
    session.col.lastClientCoord
  )
  let scrolled = false
  const rowDelta = readEdgeCreateWheelDelta(
    event,
    'row',
    session.row.scrollSource
  )
  if (
    rowDelta !== 0 &&
    scrollEdgeCreateSourceBy({
      axis: 'row',
      delta: rowDelta,
      scrollSource: session.row.scrollSource,
    })
  ) {
    scrolled = true
  }

  const colDelta = readEdgeCreateWheelDelta(
    event,
    'col',
    session.col.scrollSource
  )
  if (
    colDelta !== 0 &&
    scrollEdgeCreateSourceBy({
      axis: 'col',
      delta: colDelta,
      scrollSource: session.col.scrollSource,
    })
  ) {
    scrolled = true
  }

  if (!scrolled) return

  session.manualScrollHoldUntil = readCurrentTime() + 140
  suppressTableDragSelection()
  if (!session.isActive) {
    maybeActivateSession(runtime, session, rowClientCoord, colClientCoord)
  } else {
    updateAxis(runtime, session, 'row', rowClientCoord)
    updateAxis(runtime, session, 'col', colClientCoord)
  }
  refreshSizeTooltip(runtime, session)
  event.preventDefault()
}

export function useCornerCreateHandlers(
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
  const runtime: CornerCreateRuntime = {
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

  const destroyCornerCreateSession = () => {
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

    onUnmounted(destroyCornerCreateSession)
  }

  const prepareCornerCreate = () => {
    return (
      runtime.isEditable() &&
      syncAxisIndex(runtime.refs, 'row') &&
      syncAxisIndex(runtime.refs, 'col')
    )
  }

  const startSession =
    (source: DragSessionSource) => (event: DragSessionEvent) => {
      if (activeSession) return
      if (!runtime.isEditable()) return
      if (event.button !== 0) return
      if (!(event.currentTarget instanceof HTMLElement)) return

      const canStart = prepareCornerCreate()
      if (!canStart) return

      const rowScrollSource = resolveEdgeCreateScrollSource(runtime.refs, 'row')
      const colScrollSource = resolveEdgeCreateScrollSource(runtime.refs, 'col')
      const rowClientCoord = readEdgeCreateClientCoord(event, 'row')
      const colClientCoord = readEdgeCreateClientCoord(event, 'col')
      const rowCoord = readEdgeCreateAbsoluteCoord({
        axis: 'row',
        clientCoord: rowClientCoord,
        scrollSource: rowScrollSource,
      })
      const colCoord = readEdgeCreateAbsoluteCoord({
        axis: 'col',
        clientCoord: colClientCoord,
        scrollSource: colScrollSource,
      })
      const rowEdgeCoord = getCurrentEdgeCoord(
        runtime,
        'row',
        rowScrollSource
      )
      const colEdgeCoord = getCurrentEdgeCoord(
        runtime,
        'col',
        colScrollSource
      )
      if (rowEdgeCoord == null || colEdgeCoord == null) return

      activeRuntime = runtime
      activeSession = {
        source,
        pointerId: 'pointerId' in event ? event.pointerId : null,
        target: event.currentTarget,
        key: getDragRuntimeKey(runtime.getKey),
        isActive: false,
        autoScrollFrame: 0,
        manualScrollHoldUntil: 0,
        sizeTooltip: createTableSizeTooltip(runtime.refs, colClientCoord, rowClientCoord),
        row: {
          startCoord: rowCoord,
          lastClientCoord: rowClientCoord,
          lastCoord: rowCoord,
          lastCommitCoord: rowCoord,
          edgeCoord: rowEdgeCoord,
          anchors: createEdgeCreateAnchors(
            rowCoord,
            rowEdgeCoord,
            EDGE_CREATE_THRESHOLD
          ),
          pendingAnchorSync: false,
          scrollSource: rowScrollSource,
        },
        col: {
          startCoord: colCoord,
          lastClientCoord: colClientCoord,
          lastCoord: colCoord,
          lastCommitCoord: colCoord,
          edgeCoord: colEdgeCoord,
          anchors: createEdgeCreateAnchors(
            colCoord,
            colEdgeCoord,
            EDGE_CREATE_THRESHOLD
          ),
          pendingAnchorSync: false,
          scrollSource: colScrollSource,
        },
      }
      captureDragSessionPointer(source, event, event.currentTarget)

      acquireTableDragCursor('nwse-resize')
      bindDragSessionDocumentListeners(source, handleMove, handleEnd)
      bindCornerScrollListeners(activeSession)
      bindSessionWheelListener()
      bindSessionAbortListeners()
      if (activeSession) {
        startAutoScrollLoop(activeSession)
      }
      event.preventDefault()
      event.stopPropagation()
    }

  return {
    prepareCornerCreate,
    startCornerCreate: startSession('pointer'),
    startCornerCreateMouse: startSession('mouse'),
    destroyCornerCreateSession,
  }
}
