import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../../../../vendor/milkdown/packages/components/src/table-block/view/drag-cursor', () => ({
  acquireTableDragCursor: vi.fn(),
  releaseTableDragCursor: vi.fn(),
  suppressTableDragSelection: vi.fn(),
}))

import { useEdgeCreateHandlers } from '../../../../../../../vendor/milkdown/packages/components/src/table-block/view/edge-create'

function setRect(
  element: Element,
  rect: {
    left: number
    top: number
    width: number
    height: number
  }
) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        x: rect.left,
        y: rect.top,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        toJSON: () => rect,
      }) as DOMRect,
  })
}

function createStartPointerEvent(args: {
  currentTarget: HTMLElement
  pointerId: number
  clientX: number
  clientY: number
}) {
  return {
    button: 0,
    currentTarget: args.currentTarget,
    pointerId: args.pointerId,
    clientX: args.clientX,
    clientY: args.clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent
}

function dispatchDocumentPointerEvent(args: {
  type: 'pointermove' | 'pointerup'
  buttons?: number
  pointerId: number
  pointerType?: string
  clientX: number
  clientY: number
}) {
  const event = new Event(args.type, {
    bubbles: true,
    cancelable: true,
  })

  Object.defineProperties(event, {
    buttons: {
      configurable: true,
      value: args.buttons,
    },
    pointerId: {
      configurable: true,
      value: args.pointerId,
    },
    pointerType: {
      configurable: true,
      value: args.pointerType,
    },
    clientX: {
      configurable: true,
      value: args.clientX,
    },
    clientY: {
      configurable: true,
      value: args.clientY,
    },
  })

  document.dispatchEvent(event)
}

function dispatchDocumentWheelEvent(args: {
  deltaX?: number
  deltaY?: number
  deltaMode?: number
  shiftKey?: boolean
}) {
  const event = new Event('wheel', {
    bubbles: true,
    cancelable: true,
  })

  Object.defineProperties(event, {
    deltaX: {
      configurable: true,
      value: args.deltaX ?? 0,
    },
    deltaY: {
      configurable: true,
      value: args.deltaY ?? 0,
    },
    deltaMode: {
      configurable: true,
      value: args.deltaMode ?? 0,
    },
    shiftKey: {
      configurable: true,
      value: args.shiftKey ?? false,
    },
  })

  document.dispatchEvent(event)
}

function createHarness(options?: {
  canShrinkRow?: boolean
  canShrinkCol?: boolean
}) {
  const scrollRoot = document.createElement('div')
  scrollRoot.setAttribute('data-note-scroll-root', 'true')
  const root = document.createElement('div')
  const tableScroll = document.createElement('div')
  const content = document.createElement('table')
  const firstRow = document.createElement('tr')
  const secondRow = document.createElement('tr')
  firstRow.appendChild(document.createElement('td'))
  firstRow.appendChild(document.createElement('td'))
  secondRow.appendChild(document.createElement('td'))
  secondRow.appendChild(document.createElement('td'))
  content.append(firstRow, secondRow)
  root.appendChild(content)
  scrollRoot.appendChild(root)
  document.body.appendChild(scrollRoot)

  let width = 240
  let height = 80
  let scrollTop = 0
  let scrollLeft = 0

  const updateRect = () => {
    setRect(scrollRoot, {
      left: 0,
      top: 0,
      width: 800,
      height: 240,
    })
    setRect(tableScroll, {
      left: 100,
      top: 120 - scrollTop,
      width: 320,
      height: height,
    })
    setRect(content, {
      left: 100 - scrollLeft,
      top: 120 - scrollTop,
      width,
      height,
    })
  }

  updateRect()
  Object.defineProperty(scrollRoot, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value
      updateRect()
      scrollRoot.dispatchEvent(new Event('scroll'))
    },
  })
  Object.defineProperty(tableScroll, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = value
      updateRect()
      tableScroll.dispatchEvent(new Event('scroll'))
    },
  })
  Object.defineProperty(scrollRoot, 'clientHeight', {
    configurable: true,
    value: 240,
  })
  Object.defineProperty(scrollRoot, 'scrollHeight', {
    configurable: true,
    value: 2400,
  })
  Object.defineProperty(tableScroll, 'clientWidth', {
    configurable: true,
    value: 320,
  })
  Object.defineProperty(tableScroll, 'scrollWidth', {
    configurable: true,
    value: 1600,
  })

  const refs = {
    rootRef: { value: root },
    tableWrapperRef: { value: undefined },
    tableScrollRef: { value: tableScroll },
    contentWrapperRef: { value: content },
    yLineHandleRef: { value: undefined },
    xLineHandleRef: { value: undefined },
    lineHoverIndex: { value: [-1, -1] as [number, number] },
  } as never

  const onAddRow = vi.fn(() => {
    const row = document.createElement('tr')
    row.appendChild(document.createElement('td'))
    row.appendChild(document.createElement('td'))
    content.appendChild(row)
    height += 40
    updateRect()
  })

  const onAddCol = vi.fn(() => {
    Array.from(content.querySelectorAll('tr')).forEach((row) => {
      row.appendChild(document.createElement('td'))
    })
    width += 80
    updateRect()
  })

  const onShrinkRow = vi.fn(() => {
    const lastRow = content.querySelector('tr:last-child')
    if (!lastRow) return
    lastRow.remove()
    height = Math.max(40, height - 40)
    updateRect()
  })
  const onShrinkCol = vi.fn(() => {
    Array.from(content.querySelectorAll('tr')).forEach((row) => {
      row.lastElementChild?.remove()
    })
    width = Math.max(80, width - 80)
    updateRect()
  })

  const handlers = useEdgeCreateHandlers(
    refs,
    () => true,
    onAddRow,
    onAddCol,
    onShrinkRow,
    onShrinkCol,
    () => options?.canShrinkRow ?? false,
    () => options?.canShrinkCol ?? false,
    () => 1
  )

  const handle = document.createElement('div')
  handle.setPointerCapture = vi.fn()
  handle.releasePointerCapture = vi.fn()

  const setVerticalScroll = (nextScrollTop: number) => {
    scrollRoot.scrollTop = nextScrollTop
  }

  return {
    handlers,
    onAddRow,
    onAddCol,
    onShrinkRow,
    onShrinkCol,
    handle,
    setVerticalScroll,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('edge create handlers', () => {
  it('shows the current table size beside the pointer while dragging the right edge', () => {
    const { handlers, handle } = createHarness()

    handlers.startColEdgeCreate(
      createStartPointerEvent({
        currentTarget: handle,
        pointerId: 10,
        clientX: 340,
        clientY: 140,
      })
    )

    const tooltip = document.querySelector<HTMLElement>('[data-role="table-size-drag-tooltip"]')
    expect(tooltip).toBeInstanceOf(HTMLElement)
    expect(tooltip?.textContent).toBe('2x2')
    expect(tooltip?.style.left).toBe('352px')
    expect(tooltip?.style.top).toBe('154px')

    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 10,
      clientX: 347,
      clientY: 141,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 10,
      clientX: 365,
      clientY: 142,
    })

    expect(tooltip?.textContent).toBe('2x3')
    expect(tooltip?.style.left).toBe('377px')
    expect(tooltip?.style.top).toBe('156px')

    dispatchDocumentPointerEvent({
      type: 'pointerup',
      pointerId: 10,
      clientX: 365,
      clientY: 142,
    })

    expect(document.querySelector('[data-role="table-size-drag-tooltip"]')).toBeNull()
  })

  it('clears an active bottom-edge drag when the window blurs so a new drag can start', () => {
    const { handlers, onAddRow, handle } = createHarness()

    handlers.startRowEdgeCreate(
      createStartPointerEvent({
        currentTarget: handle,
        pointerId: 7,
        clientX: 120,
        clientY: 200,
      })
    )

    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 7,
      clientX: 120,
      clientY: 207,
    })

    window.dispatchEvent(new Event('blur'))

    handlers.startRowEdgeCreate(
      createStartPointerEvent({
        currentTarget: handle,
        pointerId: 8,
        clientX: 120,
        clientY: 200,
      })
    )

    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 8,
      clientX: 120,
      clientY: 207,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 8,
      clientX: 120,
      clientY: 225,
    })
    dispatchDocumentPointerEvent({
      type: 'pointerup',
      pointerId: 8,
      clientX: 120,
      clientY: 225,
    })

    expect(onAddRow).toHaveBeenCalledTimes(1)
  })

  it('clears an active bottom-edge drag when the table component unmounts', () => {
    const first = createHarness()

    first.handlers.startRowEdgeCreate(
      createStartPointerEvent({
        currentTarget: first.handle,
        pointerId: 17,
        clientX: 120,
        clientY: 200,
      })
    )

    expect(
      document.querySelector('[data-role="table-size-drag-tooltip"]')
    ).toBeInstanceOf(HTMLElement)

    first.handlers.destroyEdgeCreateSession()

    expect(
      document.querySelector('[data-role="table-size-drag-tooltip"]')
    ).toBeNull()

    const next = createHarness()
    next.handlers.startRowEdgeCreate(
      createStartPointerEvent({
        currentTarget: next.handle,
        pointerId: 18,
        clientX: 120,
        clientY: 200,
      })
    )

    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 18,
      clientX: 120,
      clientY: 207,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 18,
      clientX: 120,
      clientY: 225,
    })
    dispatchDocumentPointerEvent({
      type: 'pointerup',
      pointerId: 18,
      clientX: 120,
      clientY: 225,
    })

    expect(next.onAddRow).toHaveBeenCalledTimes(1)
  })

  it('cancels an edge create session on released-button mouse movement', () => {
    const { handlers, onAddRow, handle } = createHarness()

    handlers.startRowEdgeCreate(
      createStartPointerEvent({
        currentTarget: handle,
        pointerId: 19,
        clientX: 120,
        clientY: 200,
      })
    )
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      buttons: 0,
      pointerId: 19,
      pointerType: 'mouse',
      clientX: 120,
      clientY: 230,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      buttons: 1,
      pointerId: 19,
      pointerType: 'mouse',
      clientX: 120,
      clientY: 250,
    })

    expect(onAddRow).not.toHaveBeenCalled()
    expect(
      document.querySelector('[data-role="table-size-drag-tooltip"]')
    ).toBeNull()
  })

  it('keeps adding rows while the same bottom-edge drag continues past each new threshold', () => {
    const { handlers, onAddRow, handle } = createHarness()

    handlers.startRowEdgeCreate(
      createStartPointerEvent({
        currentTarget: handle,
        pointerId: 1,
        clientX: 120,
        clientY: 200,
      })
    )

    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 1,
      clientX: 120,
      clientY: 207,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 1,
      clientX: 120,
      clientY: 225,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 1,
      clientX: 120,
      clientY: 257,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 1,
      clientX: 120,
      clientY: 285,
    })
    dispatchDocumentPointerEvent({
      type: 'pointerup',
      pointerId: 1,
      clientX: 120,
      clientY: 285,
    })

    expect(onAddRow).toHaveBeenCalledTimes(2)
  })

  it('keeps adding columns while the same right-edge drag continues past each new threshold', () => {
    const { handlers, onAddCol, handle } = createHarness()

    handlers.startColEdgeCreate(
      createStartPointerEvent({
        currentTarget: handle,
        pointerId: 2,
        clientX: 340,
        clientY: 140,
      })
    )

    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 2,
      clientX: 347,
      clientY: 140,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 2,
      clientX: 365,
      clientY: 140,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 2,
      clientX: 437,
      clientY: 140,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 2,
      clientX: 465,
      clientY: 140,
    })
    dispatchDocumentPointerEvent({
      type: 'pointerup',
      pointerId: 2,
      clientX: 465,
      clientY: 140,
    })

    expect(onAddCol).toHaveBeenCalledTimes(2)
  })

  it('keeps adding rows when the drag continues through scroll-root scrolling', () => {
    const { handlers, onAddRow, handle, setVerticalScroll } = createHarness()

    handlers.startRowEdgeCreate(
      createStartPointerEvent({
        currentTarget: handle,
        pointerId: 4,
        clientX: 120,
        clientY: 200,
      })
    )

    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 4,
      clientX: 120,
      clientY: 207,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 4,
      clientX: 120,
      clientY: 225,
    })

    setVerticalScroll(60)

    dispatchDocumentPointerEvent({
      type: 'pointerup',
      pointerId: 4,
      clientX: 120,
      clientY: 225,
    })

    expect(onAddRow).toHaveBeenCalledTimes(2)
  })

  it('keeps adding rows when the drag continues through wheel scrolling', () => {
    const { handlers, onAddRow, handle } = createHarness()

    handlers.startRowEdgeCreate(
      createStartPointerEvent({
        currentTarget: handle,
        pointerId: 5,
        clientX: 120,
        clientY: 200,
      })
    )

    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 5,
      clientX: 120,
      clientY: 207,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 5,
      clientX: 120,
      clientY: 225,
    })
    dispatchDocumentWheelEvent({
      deltaY: 60,
    })
    dispatchDocumentPointerEvent({
      type: 'pointerup',
      pointerId: 5,
      clientX: 120,
      clientY: 225,
    })

    expect(onAddRow).toHaveBeenCalledTimes(2)
  })

  it('does not shrink rows when an active bottom-edge create drag moves back upward', () => {
    const { handlers, onAddRow, onShrinkRow, handle } = createHarness()

    handlers.startRowEdgeCreate(
      createStartPointerEvent({
        currentTarget: handle,
        pointerId: 6,
        clientX: 120,
        clientY: 200,
      })
    )

    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 6,
      clientX: 120,
      clientY: 207,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 6,
      clientX: 120,
      clientY: 225,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 6,
      clientX: 120,
      clientY: 140,
    })
    dispatchDocumentPointerEvent({
      type: 'pointerup',
      pointerId: 6,
      clientX: 120,
      clientY: 140,
    })

    expect(onAddRow).toHaveBeenCalledTimes(1)
    expect(onShrinkRow).not.toHaveBeenCalled()
  })

  it('shrinks rows when dragging upward from the bottom edge of an existing table', () => {
    const { handlers, onShrinkRow, handle } = createHarness({
      canShrinkRow: true,
    })

    handlers.startRowEdgeCreate(
      createStartPointerEvent({
        currentTarget: handle,
        pointerId: 9,
        clientX: 120,
        clientY: 200,
      })
    )

    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 9,
      clientX: 120,
      clientY: 193,
    })
    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 9,
      clientX: 120,
      clientY: 165,
    })
    dispatchDocumentPointerEvent({
      type: 'pointerup',
      pointerId: 9,
      clientX: 120,
      clientY: 165,
    })

    expect(onShrinkRow).toHaveBeenCalledTimes(1)
  })

  it('does not start an edge-create drag while the editor is readonly', () => {
    const content = document.createElement('table')
    const row = document.createElement('tr')
    row.appendChild(document.createElement('td'))
    content.appendChild(row)
    document.body.appendChild(content)
    setRect(content, {
      left: 100,
      top: 120,
      width: 120,
      height: 40,
    })

    const onAddRow = vi.fn()
    const handlers = useEdgeCreateHandlers(
      {
        tableWrapperRef: { value: undefined },
        contentWrapperRef: { value: content },
        yLineHandleRef: { value: undefined },
        xLineHandleRef: { value: undefined },
        lineHoverIndex: { value: [-1, -1] as [number, number] },
      } as never,
      () => false,
      onAddRow,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      () => false,
      () => false,
      () => 1
    )

    const handle = document.createElement('div')
    handle.setPointerCapture = vi.fn()
    handle.releasePointerCapture = vi.fn()

    handlers.startRowEdgeCreate(
      createStartPointerEvent({
        currentTarget: handle,
        pointerId: 3,
        clientX: 120,
        clientY: 160,
      })
    )

    dispatchDocumentPointerEvent({
      type: 'pointermove',
      pointerId: 3,
      clientX: 120,
      clientY: 220,
    })
    dispatchDocumentPointerEvent({
      type: 'pointerup',
      pointerId: 3,
      clientX: 120,
      clientY: 220,
    })

    expect(onAddRow).not.toHaveBeenCalled()
  })
})
