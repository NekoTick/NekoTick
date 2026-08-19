import { describe, expect, it, vi } from 'vitest';
import { defaultValueCtx, Editor, editorViewCtx } from '@milkdown/kit/core';
import { AllSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import { blankAreaDragBoxPlugin } from '../cursor/blankAreaDragBoxPlugin';
import { dispatchBlockSelectionAction } from '../cursor/blockSelectionPluginState';
import {
  handleTextSelectionOverlayMouseDown,
  handleTextSelectionOverlayMouseMove,
} from './textSelectionOverlayPointerHandlers';
import {
  setTextSelectionInlineDecorationsForTransaction,
  TEXT_SELECTION_OVERLAY_CLASS,
  textSelectionOverlayPlugin,
} from './textSelectionOverlayPlugin';
import {
  POINTER_SELECTION_ACTIVE_ATTRIBUTE,
  textSelectionOverlayPluginKey,
} from './textSelectionOverlayState';

const OVERLAY_ACTIVE_CLASS = 'editor-text-selection-overlay-active';
const POINTER_NATIVE_SELECTION_CLASS = 'editor-pointer-native-selection';
const LARGE_SELECTION_CLASS = 'editor-large-all-selection';

async function createEditor(
  defaultValue: string,
  plugins: MilkdownPlugin[] = [],
): Promise<EditorView> {
  let editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, defaultValue);
    })
    .use(commonmark)
    .use(textSelectionOverlayPlugin);

  for (const plugin of plugins) editor = editor.use(plugin);
  await editor.create();
  return editor.ctx.get(editorViewCtx);
}

describe('textSelectionOverlayPlugin', () => {
  it('leaves callout content pointer selection to the callout node view', async () => {
    const view = await createEditor('hello world');
    const calloutContent = document.createElement('div');
    calloutContent.className = 'callout-content';
    view.dom.appendChild(calloutContent);
    const pointerDown = new MouseEvent('mousedown', { button: 0 });
    Object.defineProperty(pointerDown, 'target', { value: calloutContent });

    handleTextSelectionOverlayMouseDown({ view } as never, pointerDown);

    expect(view.dom).not.toHaveAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
  });

  it('keeps pointer movement on the native selection path without dispatching', async () => {
    const view = await createEditor('hello world');
    const dispatch = vi.spyOn(view, 'dispatch');
    const context = {
      view,
      session: {
        isPointerSelectionActive: true,
        lastPointerSelectionY: 0,
        pendingPointerClickCollapseTarget: null,
        pointerClickCollapseFrame: null,
        pointerClickCollapseTarget: null,
        pointerClickCollapseTimeout: null,
        pointerDownPoint: { x: 0, y: 0 },
        pointerMovedSinceDown: false,
        pointerSelectionAutoScroll: { start: vi.fn(), stop: vi.fn() },
        setPointerNativeSelection: vi.fn(),
        syncActiveClass: vi.fn(),
      },
    } as never;
    const move = new MouseEvent('mousemove', {
      buttons: 1,
      cancelable: true,
      clientX: 40,
      clientY: 10,
    });

    handleTextSelectionOverlayMouseMove(context, move);

    expect(move.defaultPrevented).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(context.session.setPointerNativeSelection).toHaveBeenCalledWith(true);
    expect(context.session.pointerSelectionAutoScroll.start).toHaveBeenCalledOnce();
  });

  it('ignores pointer movement after the primary mouse button is released', () => {
    const context = {
      session: {
        isPointerSelectionActive: true,
        lastPointerSelectionY: 10,
        pointerDownPoint: { x: 0, y: 0 },
        pointerMovedSinceDown: false,
        pointerSelectionAutoScroll: { start: vi.fn(), stop: vi.fn() },
        setPointerNativeSelection: vi.fn(),
        syncActiveClass: vi.fn(),
      },
    } as never;

    handleTextSelectionOverlayMouseMove(context, new MouseEvent('mousemove', {
      buttons: 0,
      clientX: 40,
      clientY: 80,
    }));

    expect(context.session.lastPointerSelectionY).toBe(10);
    expect(context.session.pointerMovedSinceDown).toBe(false);
    expect(context.session.pointerSelectionAutoScroll.start).not.toHaveBeenCalled();
    expect(context.session.pointerSelectionAutoScroll.stop).toHaveBeenCalledOnce();
  });

  it('switches from native drag paint to the independent layer on release', async () => {
    const view = await createEditor('hello');
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)));
      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));

      expect(view.dom).toHaveAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE, 'true');
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
      expect(textSelectionOverlayPluginKey.getState(view.state)?.decorationCount).toBe(0);

      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));

      expect(view.dom).not.toHaveAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);
      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
      expect(textSelectionOverlayPluginKey.getState(view.state)?.decorationCount).toBe(0);
    } finally {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('only creates inline decorations when a toolbar preview requests them', async () => {
    const view = await createEditor('hello world');
    const selection = TextSelection.create(view.state.doc, 1, 6);

    view.dispatch(view.state.tr.setSelection(selection));
    expect(textSelectionOverlayPluginKey.getState(view.state)?.decorationCount).toBe(0);

    view.dispatch(setTextSelectionInlineDecorationsForTransaction(
      view.state.tr,
      true,
    ));
    expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(1);
  });

  it('clears text selection paint when block selection starts', async () => {
    const view = await createEditor('linked text', [blankAreaDragBoxPlugin]);
    view.dispatch(setTextSelectionInlineDecorationsForTransaction(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 7)),
      true,
    ));

    dispatchBlockSelectionAction(view, {
      type: 'set-blocks',
      blocks: [{ from: 0, to: view.state.doc.content.size }],
    });

    expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(false);
    expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
    expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(0);
  });

  it('does not materialize text decorations for large selections', async () => {
    const view = await createEditor('x'.repeat(100_001));

    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(view.dom.classList.contains(LARGE_SELECTION_CLASS)).toBe(true);
    expect(textSelectionOverlayPluginKey.getState(view.state)?.decorationCount).toBe(0);
    expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(0);
  });
});
