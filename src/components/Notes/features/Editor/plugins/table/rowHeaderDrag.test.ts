import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cleanupCallbacks, editorViewCtx } = vi.hoisted(() => ({
  cleanupCallbacks: [] as Array<() => void>,
  editorViewCtx: Symbol('editorViewCtx'),
}));

vi.mock('vue', async () => {
  return {
    ref: <T,>(value?: T) => ({ value }),
    onBeforeUnmount: (cleanup: () => void) => {
      cleanupCallbacks.push(cleanup);
    },
  };
});

vi.mock('@milkdown/core', () => ({
  editorViewCtx,
}));

const {
  acquireTableDragCursorMock,
  releaseTableDragCursorMock,
  suppressTableDragSelectionMock,
} = vi.hoisted(() => ({
  acquireTableDragCursorMock: vi.fn(),
  releaseTableDragCursorMock: vi.fn(),
  suppressTableDragSelectionMock: vi.fn(),
}));

vi.mock('../../../../../../../vendor/milkdown/packages/components/src/table-block/view/drag-cursor', () => ({
  acquireTableDragCursor: acquireTableDragCursorMock,
  releaseTableDragCursor: releaseTableDragCursorMock,
  suppressTableDragSelection: suppressTableDragSelectionMock,
}));

import { useRowHeaderDrag } from '../../../../../../../vendor/milkdown/packages/components/src/table-block/view/row-header-drag';

let warnSpy: ReturnType<typeof vi.spyOn> | null = null;

function setRect(
  element: Element,
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  },
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
  });
}

function createControlPointerEvent(init: {
  pointerId: number;
  clientX: number;
  clientY: number;
  button?: number;
}) {
  return {
    button: init.button ?? 0,
    pointerId: init.pointerId,
    clientX: init.clientX,
    clientY: init.clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent;
}

function createMouseEvent() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent;
}

function createKeyboardEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

function dispatchWindowPointerEvent(
  type: 'pointermove' | 'pointerup' | 'pointerdown' | 'pointercancel',
  init: {
    buttons?: number;
    pointerId?: number;
    pointerType?: string;
    clientX: number;
    clientY: number;
  },
) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  });

  Object.defineProperties(event, {
    buttons: {
      configurable: true,
      value: init.buttons ?? (type === 'pointermove' ? 1 : 0),
    },
    pointerId: {
      configurable: true,
      value: init.pointerId ?? 1,
    },
    pointerType: {
      configurable: true,
      value: init.pointerType ?? 'mouse',
    },
    clientX: {
      configurable: true,
      value: init.clientX,
    },
    clientY: {
      configurable: true,
      value: init.clientY,
    },
  });

  window.dispatchEvent(event);
}

function createHarness() {
  const wrapper = document.createElement('div');
  const table = document.createElement('table');
  const rows = Array.from({ length: 3 }, () => document.createElement('tr'));
  const cells = rows.map((row) => {
    const rowCells = Array.from({ length: 2 }, () => document.createElement('td'));
    for (const cell of rowCells) {
      row.appendChild(cell);
    }
    table.appendChild(row);
    return rowCells;
  });
  wrapper.appendChild(table);
  document.body.appendChild(wrapper);

  setRect(wrapper, {
    left: 60,
    top: 80,
    width: 360,
    height: 180,
  });
  setRect(table, {
    left: 80,
    top: 100,
    width: 300,
    height: 120,
  });

  rows.forEach((row, rowIndex) => {
    const rowTop = 100 + rowIndex * 40;
    setRect(row, {
      left: 80,
      top: rowTop,
      width: 300,
      height: 40,
    });
    cells[rowIndex].forEach((cell, colIndex) => {
      setRect(cell, {
        left: 80 + colIndex * 150,
        top: rowTop,
        width: 150,
        height: 40,
      });
    });
  });

  const view = {
    editable: true,
    focus: vi.fn(),
  };

  const moveRow = vi.fn();
  const insertRowAbove = vi.fn();
  const insertRowBelow = vi.fn();
  const clearRowContent = vi.fn();
  const deleteRow = vi.fn();

  const ctx = {
    get: (key: unknown) => {
      if (key === editorViewCtx) return view;
      throw new Error(`Unexpected context key: ${String(key)}`);
    },
  };

  const api = useRowHeaderDrag({
    ctx: ctx as never,
    tableWrapperRef: { value: wrapper } as never,
    contentWrapperRef: { value: table } as never,
    moveRow,
    insertRowAbove,
    insertRowBelow,
    clearRowContent,
    deleteRow,
  });

  api.syncControls();

  return {
    api,
    view,
    moveRow,
    insertRowAbove,
    insertRowBelow,
    clearRowContent,
    deleteRow,
  };
}

afterEach(() => {
  warnSpy?.mockRestore();
  warnSpy = null;
  acquireTableDragCursorMock.mockReset();
  releaseTableDragCursorMock.mockReset();
  suppressTableDragSelectionMock.mockReset();

  for (const cleanup of cleanupCallbacks.splice(0)) {
    cleanup();
  }

  vi.clearAllTimers();
  vi.useRealTimers();

  document.body.innerHTML = '';
  document.body.style.removeProperty('user-select');
  document.body.style.removeProperty('cursor');
});

beforeEach(() => {
  vi.useFakeTimers();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('row header drag', () => {
  it('binds global listeners only while a drag or menu interaction is active', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    try {
      const { api } = createHarness();

      expect(addSpy).not.toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(addSpy).not.toHaveBeenCalledWith('pointerdown', expect.any(Function), true);

      api.onControlPointerDown(
        1,
        createControlPointerEvent({
          pointerId: 11,
          clientX: 72,
          clientY: 160,
        }),
      );

      expect(addSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('blur', expect.any(Function));

      dispatchWindowPointerEvent('pointerup', {
        pointerId: 11,
        clientX: 72,
        clientY: 160,
      });

      expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('blur', expect.any(Function));

      api.onControlClick(1, createMouseEvent());

      expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      dispatchWindowPointerEvent('pointerdown', {
        clientX: 12,
        clientY: 12,
      });

      expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });

  it('opens the row menu on click without moving the row and closes it on outside pointerdown', () => {
    const { api, moveRow, view } = createHarness();

    api.onControlPointerDown(
      1,
      createControlPointerEvent({
        pointerId: 7,
        clientX: 72,
        clientY: 160,
      }),
    );
    dispatchWindowPointerEvent('pointerup', {
      pointerId: 7,
      clientX: 72,
      clientY: 160,
    });
    api.onControlClick(1, createMouseEvent());

    expect(moveRow).not.toHaveBeenCalled();
    expect(view.focus).not.toHaveBeenCalled();
    expect(api.menuState.value?.index).toBe(1);

    dispatchWindowPointerEvent('pointerdown', {
      clientX: 12,
      clientY: 12,
    });

    expect(api.menuState.value).toBeNull();
  });

  it('keeps the row highlighted while opening the menu by click', () => {
    const { api } = createHarness();
    const expectedHighlight = {
      left: 20,
      top: 60,
      width: 300,
      height: 40,
    };

    api.onControlPointerDown(
      1,
      createControlPointerEvent({
        pointerId: 9,
        clientX: 72,
        clientY: 160,
      }),
    );

    expect(api.dragSourceHighlight.value).toMatchObject(expectedHighlight);

    dispatchWindowPointerEvent('pointerup', {
      pointerId: 9,
      clientX: 72,
      clientY: 160,
    });

    expect(api.dragSourceHighlight.value).toMatchObject(expectedHighlight);

    api.onControlClick(1, createMouseEvent());

    expect(api.menuState.value?.index).toBe(1);
    expect(api.dragSourceHighlight.value).toMatchObject(expectedHighlight);

    dispatchWindowPointerEvent('pointerdown', {
      clientX: 12,
      clientY: 12,
    });

    expect(api.dragSourceHighlight.value).toBeNull();
  });

  it('centers the row handle on the first-cell left border', () => {
    const { api } = createHarness();

    api.syncHoveredControl({
      clientX: 110,
      clientY: 120,
    } as PointerEvent);

    expect(api.controls.value.every((control) => !control.visible)).toBe(true);

    api.syncHoveredControl({
      clientX: 78,
      clientY: 120,
    } as PointerEvent);

    expect(api.controls.value[0]).toMatchObject({
      handleLeft: 11,
      visible: true,
    });

    api.syncHoveredControl({
      clientX: 88,
      clientY: 120,
    } as PointerEvent);

    expect(api.controls.value[0].visible).toBe(true);
  });

  it('moves the row after dragging past the threshold and suppresses the follow-up click', () => {
    const { api, moveRow } = createHarness();

    api.onControlPointerDown(
      0,
      createControlPointerEvent({
        pointerId: 3,
        clientX: 72,
        clientY: 120,
      }),
    );

    dispatchWindowPointerEvent('pointermove', {
      pointerId: 3,
      clientX: 72,
      clientY: 205,
    });

    dispatchWindowPointerEvent('pointermove', {
      pointerId: 3,
      clientX: 72,
      clientY: 206,
    });

    expect(acquireTableDragCursorMock).toHaveBeenCalledWith('row-resize');
    expect(suppressTableDragSelectionMock).toHaveBeenCalled();

    expect(api.dragIndicator.value).not.toBeNull();
    expect(api.dragSourceHighlight.value).not.toBeNull();

    dispatchWindowPointerEvent('pointerup', {
      pointerId: 3,
      clientX: 72,
      clientY: 205,
    });

    expect(moveRow).toHaveBeenCalledTimes(1);
    expect(moveRow).toHaveBeenCalledWith(0, 2);
    expect(releaseTableDragCursorMock).toHaveBeenCalledTimes(1);

    api.onControlClick(0, createMouseEvent());

    expect(api.menuState.value).toBeNull();
  });

  it('cancels an active row drag when mouse movement reports no pressed button', () => {
    const { api, moveRow } = createHarness();

    api.onControlPointerDown(0, createControlPointerEvent({
      pointerId: 13,
      clientX: 72,
      clientY: 120,
    }));
    dispatchWindowPointerEvent('pointermove', {
      pointerId: 13,
      clientX: 72,
      clientY: 205,
    });
    dispatchWindowPointerEvent('pointermove', {
      buttons: 0,
      pointerId: 13,
      clientX: 72,
      clientY: 240,
    });
    dispatchWindowPointerEvent('pointerup', {
      pointerId: 13,
      clientX: 72,
      clientY: 240,
    });

    expect(moveRow).not.toHaveBeenCalled();
    expect(releaseTableDragCursorMock).toHaveBeenCalledTimes(1);
    expect(api.dragIndicator.value).toBeNull();
  });

  it('cancels an active row drag when the window loses focus', () => {
    const { api, moveRow } = createHarness();

    api.onControlPointerDown(0, createControlPointerEvent({
      pointerId: 14,
      clientX: 72,
      clientY: 120,
    }));
    dispatchWindowPointerEvent('pointermove', {
      pointerId: 14,
      clientX: 72,
      clientY: 205,
    });
    window.dispatchEvent(new Event('blur'));

    expect(moveRow).not.toHaveBeenCalled();
    expect(releaseTableDragCursorMock).toHaveBeenCalledTimes(1);
    expect(api.dragIndicator.value).toBeNull();
  });

  it('opens the menu from keyboard and routes menu actions to the selected row', () => {
    const { api, insertRowAbove } = createHarness();

    api.onControlFocus(2);
    api.onControlKeyDown(2, createKeyboardEvent('Enter'));

    expect(api.menuState.value?.index).toBe(2);

    api.onMenuAction('insert-row-above');

    expect(insertRowAbove).toHaveBeenCalledTimes(1);
    expect(insertRowAbove).toHaveBeenCalledWith(2);
    expect(api.menuState.value).toBeNull();
  });
});
