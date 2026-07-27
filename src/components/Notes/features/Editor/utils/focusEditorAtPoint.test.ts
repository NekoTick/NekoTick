import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBlockRectResolver: vi.fn(),
  getCurrentEditorView: vi.fn(),
  resolveInsideBlockTrailingPlainClickAction: vi.fn(),
  resolveTextblockLineEndAtPoint: vi.fn(),
  textSelectionCreate: vi.fn(),
}));

vi.mock('@milkdown/kit/prose/state', () => ({
  Selection: { near: vi.fn() },
  TextSelection: { create: mocks.textSelectionCreate },
}));

vi.mock('../plugins/cursor/blankAreaPlainClick', () => ({
  applyBlankAreaPlainClickSelection: vi.fn(),
  resolveInsideBlockTrailingPlainClickAction: mocks.resolveInsideBlockTrailingPlainClickAction,
}));

vi.mock('../plugins/cursor/blockRectResolver', () => ({
  createBlockRectResolver: mocks.createBlockRectResolver,
}));

vi.mock('../plugins/cursor/listParagraphEndPlainClick', () => ({
  resolveTextblockLineEndAtPoint: mocks.resolveTextblockLineEndAtPoint,
}));

vi.mock('./editorViewRegistry', () => ({
  getCurrentEditorView: mocks.getCurrentEditorView,
}));

import { focusCurrentEditorAtViewportPoint } from './focusEditorAtPoint';

function createEditorView() {
  const selection = { from: 7, to: 7 };
  const transaction: any = {};
  transaction.setSelection = vi.fn(() => transaction);
  transaction.scrollIntoView = vi.fn(() => transaction);
  const dom = document.createElement('div');
  vi.spyOn(dom, 'getBoundingClientRect').mockReturnValue({
    bottom: 600,
    height: 400,
    left: 100,
    right: 700,
    top: 200,
    width: 600,
    x: 100,
    y: 200,
    toJSON: () => ({}),
  });
  const view = {
    dispatch: vi.fn(),
    dom,
    focus: vi.fn(),
    posAtCoords: vi.fn(() => ({ inside: 0, pos: 7 })),
    state: {
      doc: {
        content: { size: 20 },
        resolve: vi.fn(() => ({ parent: { inlineContent: true } })),
      },
      tr: transaction,
    },
  };

  mocks.textSelectionCreate.mockReturnValue(selection);
  mocks.getCurrentEditorView.mockReturnValue(view);
  return { selection, transaction, view };
}

describe('focusCurrentEditorAtViewportPoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    mocks.resolveTextblockLineEndAtPoint.mockReturnValue(null);
    mocks.resolveInsideBlockTrailingPlainClickAction.mockReturnValue(null);
    mocks.createBlockRectResolver.mockReturnValue({
      getTopLevelBlockRects: () => [],
      invalidate: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps preview content offsets onto the mounted editor root', () => {
    const { selection, transaction, view } = createEditorView();

    expect(focusCurrentEditorAtViewportPoint({
      clientX: 460,
      clientY: 491,
      contentOffset: { left: 30, top: 40 },
    })).toBe(true);

    expect(view.posAtCoords).toHaveBeenCalledWith({ left: 130, top: 240 });
    expect(transaction.setSelection).toHaveBeenCalledWith(selection);
    expect(view.dispatch).toHaveBeenCalledWith(transaction);
  });

  it('keeps direct editor viewport coordinates unchanged', () => {
    const { view } = createEditorView();

    expect(focusCurrentEditorAtViewportPoint({ clientX: 460, clientY: 491 })).toBe(true);

    expect(view.posAtCoords).toHaveBeenCalledWith({ left: 460, top: 491 });
  });
});
