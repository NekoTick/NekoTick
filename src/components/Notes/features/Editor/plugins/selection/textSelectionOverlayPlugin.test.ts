import { describe, expect, it, vi } from 'vitest';
import { defaultValueCtx, Editor, editorViewCtx } from '@milkdown/kit/core';
import { AllSelection, NodeSelection, Plugin, TextSelection } from '@milkdown/kit/prose/state';
import type { Decoration, EditorView } from '@milkdown/kit/prose/view';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import { $prose } from '@milkdown/kit/utils';
import {
  addTextSelectionOverlayDecorations,
  createTextSelectionDecorationState,
  getNativeSelectionMetrics,
  showTextSelectionOverlayForTransaction,
  TEXT_SELECTION_OVERLAY_CLASS,
  textSelectionOverlayPlugin,
} from './textSelectionOverlayPlugin';
import { floatingToolbarKey } from '../floating-toolbar/floatingToolbarKey';
import { floatingToolbarPlugin } from '../floating-toolbar/floatingToolbarPlugin';
import { TOOLBAR_ACTIONS } from '../floating-toolbar/types';
import { blankAreaDragBoxPlugin } from '../cursor/blankAreaDragBoxPlugin';
import { dispatchBlockSelectionAction } from '../cursor/blockSelectionPluginState';
import { mathPlugin } from '../math';
import { tocPlugin } from '../toc';
import { videoPlugin } from '../video';
import { getCaretTargetFromPoint, getDomCaretTarget } from './textSelectionOverlayCaret';
import {
  cancelPointerClickCollapseReassertion,
  collapsePointerNativeSelectionAt,
  schedulePointerClickCollapseReassertion,
} from './textSelectionOverlayPointerClick';
import { POINTER_SELECTION_ACTIVE_ATTRIBUTE } from './textSelectionOverlayState';

const OVERLAY_ACTIVE_CLASS = 'editor-text-selection-overlay-active';
const POINTER_NATIVE_SELECTION_CLASS = 'editor-pointer-native-selection';
const LARGE_SELECTION_CLASS = 'editor-large-all-selection';
const KEYBOARD_SELECTION_PENDING_CLASS = 'editor-keyboard-selection-pending';

function getOverlayText(view: EditorView): string {
  return Array.from(
    view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)
  ).map((element) => element.textContent ?? '').join('');
}

async function createEditor(defaultValue: string, plugins: MilkdownPlugin[] = []): Promise<EditorView> {
  let editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, defaultValue);
    })
    .use(commonmark)
    .use(textSelectionOverlayPlugin);

  for (const plugin of plugins) {
    editor = editor.use(plugin);
  }

  await editor.create();

  return editor.ctx.get(editorViewCtx);
}

function findNodePos(view: EditorView, typeName: string): number {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === typeName) {
      found = pos;
      return false;
    }

    return true;
  });

  return found;
}

function mockCaretRangeFromPoint(view: EditorView, textOffset: number) {
  const documentWithCaretRange = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const originalCaretRangeFromPoint = documentWithCaretRange.caretRangeFromPoint;

  Object.defineProperty(document, 'caretRangeFromPoint', {
    configurable: true,
    value: () => {
      const walker = document.createTreeWalker(view.dom, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode() as Text | null;
      if (!textNode) {
        throw new Error('Expected editor text node');
      }
      const range = document.createRange();
      range.setStart(textNode, textOffset);
      range.collapse(true);
      return range;
    },
  });

  return () => {
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: originalCaretRangeFromPoint,
    });
  };
}

describe('textSelectionOverlayPlugin', () => {
  it('rejects structural browser caret positions as text-selection targets', async () => {
    const view = await createEditor('hello');
    const originalElementFromPoint = document.elementFromPoint;
    const documentWithCaretRange = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const originalCaretRangeFromPoint = documentWithCaretRange.caretRangeFromPoint;

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => {
        const range = document.createRange();
        range.setStart(view.dom, 0);
        range.collapse(true);
        return range;
      },
    });

    try {
      expect(getCaretTargetFromPoint(view, new MouseEvent('mousedown', {
        clientX: 10,
        clientY: 10,
      }))).toBeNull();
    } finally {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
      Object.defineProperty(document, 'caretRangeFromPoint', {
        configurable: true,
        value: originalCaretRangeFromPoint,
      });
    }
  });

  it('does not replay a stale pointer target after it becomes a structural position', async () => {
    const view = await createEditor('hello');
    const dispatch = vi.spyOn(view, 'dispatch');
    const syncActiveClass = vi.fn();

    collapsePointerNativeSelectionAt({
      view,
      session: { syncActiveClass } as never,
    }, { pos: 0 });

    expect(dispatch).not.toHaveBeenCalled();
    expect(syncActiveClass).not.toHaveBeenCalled();
  });

  it('re-resolves a cached DOM endpoint that no longer maps to its document position', async () => {
    const view = await createEditor('hello');
    const textNode = document.createTreeWalker(view.dom, NodeFilter.SHOW_TEXT).nextNode();
    expect(textNode).toBeInstanceOf(Text);

    const target = getDomCaretTarget(view, {
      node: textNode!,
      offset: 0,
      pos: 3,
    });

    expect(target).not.toBeNull();
    expect(view.posAtDOM(target!.node!, target!.offset!)).toBe(3);
  });

  it('does not replay a pointer target after the document changes', async () => {
    const view = await createEditor('hello');
    const dispatch = vi.spyOn(view, 'dispatch');
    const target = { pos: 3 };
    const context = {
      view,
      session: {
        pendingPointerClickCollapseTarget: target,
        pointerClickCollapseFrame: null,
        pointerClickCollapseTimeout: null,
        pointerMovedSinceDown: false,
        syncActiveClass: vi.fn(),
      },
    } as never;

    schedulePointerClickCollapseReassertion(context, target);
    view.dispatch(view.state.tr.insertText('x', 1));
    dispatch.mockClear();
    await Promise.resolve();

    expect(dispatch).not.toHaveBeenCalled();
    cancelPointerClickCollapseReassertion(context);
  });

  it('does not apply a caret target resolved against an older document', async () => {
    const view = await createEditor('hello');
    const dispatch = vi.spyOn(view, 'dispatch');
    const target = { doc: view.state.doc, pos: 3 };
    view.dispatch(view.state.tr.insertText('x', 1));
    dispatch.mockClear();

    collapsePointerNativeSelectionAt({
      view,
      session: { syncActiveClass: vi.fn() } as never,
    }, target);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('enables overlay styling for ordinary text selections', async () => {
    const view = await createEditor('hello');

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)));

    expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
  });

  it('renders large editor-wide selections with a collapsed native anchor and no text overlays', async () => {
    const view = await createEditor('x'.repeat(100_001));

    view.focus();
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(false);
    expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
    expect(view.dom.classList.contains(LARGE_SELECTION_CLASS)).toBe(true);
    expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(0);
    expect(window.getSelection()?.rangeCount).toBe(1);
    expect(window.getSelection()?.isCollapsed).toBe(true);

    const nativeSelection = window.getSelection();
    const anchorNode = nativeSelection?.anchorNode;
    const anchorOffset = nativeSelection?.anchorOffset;
    expect(anchorNode).not.toBeNull();
    expect(anchorOffset).toBeDefined();
    nativeSelection?.removeAllRanges();
    const restoredAnchor = document.createRange();
    restoredAnchor.setStart(anchorNode!, anchorOffset!);
    restoredAnchor.collapse(true);
    nativeSelection?.addRange(restoredAnchor);
    (view as unknown as {
      domObserver: { suppressingSelectionUpdates: boolean };
    }).domObserver.suppressingSelectionUpdates = false;
    document.dispatchEvent(new Event('selectionchange'));

    expect(view.state.selection).toBeInstanceOf(AllSelection);

    const arrowEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowRight',
    });
    view.dom.dispatchEvent(arrowEvent);

    expect(arrowEvent.defaultPrevented).toBe(true);
    expect(view.state.selection.empty).toBe(true);
    expect(view.dom.classList.contains(LARGE_SELECTION_CLASS)).toBe(false);
  });

  it('uses the large selection path for structurally dense documents only when the range is broad', async () => {
    const markdown = Array.from({ length: 260 }, (_, index) => `## Dense ${index}`).join('\n');
    const view = await createEditor(markdown);

    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(view.state.doc.content.size).toBeLessThan(100_000);
    expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(false);
    expect(view.dom.classList.contains(LARGE_SELECTION_CLASS)).toBe(false);
    expect(view.dom.querySelectorAll('.editor-large-selection-visible').length).toBeGreaterThan(0);
    expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(0);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5)));

    expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
    expect(view.dom.classList.contains(LARGE_SELECTION_CLASS)).toBe(false);
  });

  it('handles large keyboard boundary selections with a collapsed native anchor and no text overlays', async () => {
    const view = await createEditor('x'.repeat(100_001), [floatingToolbarPlugin]);
    view.focus();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'End',
      shiftKey: true,
    });

    view.dom.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.to - view.state.selection.from).toBeGreaterThanOrEqual(100_000);
    expect(view.dom.classList.contains(LARGE_SELECTION_CLASS)).toBe(true);
    expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(0);
    expect(window.getSelection()?.rangeCount).toBe(1);
    expect(window.getSelection()?.isCollapsed).toBe(true);
    expect(floatingToolbarKey.getState(view.state)?.isVisible).toBe(false);

    const arrowEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowLeft',
    });
    view.dom.dispatchEvent(arrowEvent);

    expect(arrowEvent.defaultPrevented).toBe(true);
    expect(view.state.selection.empty).toBe(true);
    expect(view.dom.classList.contains(LARGE_SELECTION_CLASS)).toBe(false);
  });

  it('replaces a large editor-wide selection when typing', async () => {
    const view = await createEditor('x'.repeat(100_001));
    view.focus();
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    const event = new KeyboardEvent('keypress', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'charCode', { value: 'z'.charCodeAt(0) });

    view.dom.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.textContent).toBe('z');
  });

  it('clears stale text selection overlays when block selection starts', async () => {
    const view = await createEditor('linked text', [blankAreaDragBoxPlugin]);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 7)));
    expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(1);
    expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);

    dispatchBlockSelectionAction(view, {
      type: 'set-blocks',
      blocks: [{ from: 0, to: view.state.doc.content.size }],
    });

    expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(0);
    expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(false);
    expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
  });

  it('keeps native pointer routing after pointer text selection completes', async () => {
    const view = await createEditor('hello');
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)));
      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);

      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));

      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
      expect(view.dom).toHaveAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE, 'true');

      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      expect(view.dom).not.toHaveAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE);

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
    } finally {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('clears an existing text selection immediately when pointer down starts from editor blank space', async () => {
    const view = await createEditor('hello world');
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));

      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);

      const event = new MouseEvent('mousedown', {
        button: 0,
        bubbles: true,
        cancelable: true,
        clientX: 240,
        clientY: 160,
      });
      view.dom.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(view.state.selection.empty).toBe(true);
      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(false);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
      expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(0);
    } finally {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('does not consume pointer down on an atomic block while a text selection exists', async () => {
    const view = await createEditor('hello world');
    const atomicBlock = document.createElement('div');
    atomicBlock.contentEditable = 'false';
    view.dom.append(atomicBlock);
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => atomicBlock,
    });

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));

      const event = new MouseEvent('mousedown', {
        button: 0,
        bubbles: true,
        cancelable: true,
        clientX: 240,
        clientY: 160,
      });
      atomicBlock.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(view.state.selection.from).toBe(1);
      expect(view.state.selection.to).toBe(6);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
    } finally {
      atomicBlock.remove();
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('skips overlay decorations while native pointer selection is active', async () => {
    const view = await createEditor('hello world');
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });

    try {
      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));

      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
      expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(0);

      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
      expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(0);
    } finally {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('does not measure native range geometry while pointer selection stays native', async () => {
    const view = await createEditor('hello world');
    const originalGetSelection = window.getSelection;
    const originalElementFromPoint = document.elementFromPoint;
    const getClientRects = vi.fn(() => []);

    Object.defineProperty(window, 'getSelection', {
      configurable: true,
      value: () => ({
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => ({ getClientRects }),
      }),
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });

    try {
      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));

      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
      expect(getClientRects).not.toHaveBeenCalled();
    } finally {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      Object.defineProperty(window, 'getSelection', {
        configurable: true,
        value: originalGetSelection,
      });
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('does not measure native range geometry while pointer selection rebuilds an overlay', async () => {
    const view = await createEditor('hello world');
    const originalGetSelection = window.getSelection;
    const originalElementFromPoint = document.elementFromPoint;
    const restoreCaretRangeFromPoint = mockCaretRangeFromPoint(view, 2);
    const textElement = view.dom.querySelector('p') ?? view.dom;
    const getClientRects = vi.fn(() => []);

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => textElement,
    });

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
      textElement.dispatchEvent(new MouseEvent('mousedown', {
        button: 0,
        bubbles: true,
        clientX: 12,
        clientY: 12,
      }));
      expect(view.dom).toHaveAttribute(POINTER_SELECTION_ACTIVE_ATTRIBUTE, 'true');

      Object.defineProperty(window, 'getSelection', {
        configurable: true,
        value: () => ({
          isCollapsed: false,
          rangeCount: 1,
          getRangeAt: () => ({ getClientRects }),
        }),
      });
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 8)));

      expect(getClientRects).not.toHaveBeenCalled();
    } finally {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      Object.defineProperty(window, 'getSelection', {
        configurable: true,
        value: originalGetSelection,
      });
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
      restoreCaretRangeFromPoint();
    }
  });

  it('can force a pointer-native selection back onto the overlay path for floating controls', async () => {
    const view = await createEditor('hello world');
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });

    try {
      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));

      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
      expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(0);

      view.dispatch(showTextSelectionOverlayForTransaction(view.state.tr));

      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
      expect(getOverlayText(view)).toBe('hello');
    } finally {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it.each([
    { key: 'ArrowRight', ctrlKey: true },
    { key: 'ArrowLeft', ctrlKey: true },
    { key: 'ArrowDown', ctrlKey: true },
    { key: 'ArrowUp', ctrlKey: true },
    { key: 'Home', ctrlKey: true },
    { key: 'End', ctrlKey: true },
    { key: 'PageUp', shiftKey: true },
    { key: 'PageDown', shiftKey: true },
    { key: 'ArrowRight', shiftKey: true },
    { key: 'ArrowRight', ctrlKey: true, shiftKey: true },
  ])('keeps native selection active for modified navigation keys: %o', async (eventInit) => {
    const view = await createEditor('hello world');
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));

      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);

      view.dom.dispatchEvent(
        new KeyboardEvent('keydown', {
          ...eventInit,
          bubbles: true,
          cancelable: true,
        })
      );

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
    } finally {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it.each([
    { key: 'ArrowRight', ctrlKey: true },
    { key: 'ArrowLeft', ctrlKey: true },
    { key: 'ArrowDown', ctrlKey: true },
    { key: 'ArrowUp', ctrlKey: true },
    { key: 'Home', ctrlKey: true },
    { key: 'End', ctrlKey: true },
    { key: 'PageUp', shiftKey: true },
    { key: 'PageDown', shiftKey: true },
    { key: 'ArrowRight', ctrlKey: true, shiftKey: true },
  ])('keeps keyboard modified navigation on the overlay path: %o', async (eventInit) => {
    const view = await createEditor('hello world');

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 2)));

    expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
    expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);

    view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        ...eventInit,
        bubbles: true,
        cancelable: true,
      })
    );

    expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
    expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
  });

  it('captures initial keyboard selection before earlier bubble handlers update selection', async () => {
    let sawPendingClassBeforeBubbleUpdate = false;
    const earlierBubbleSelectionPlugin = $prose(() => new Plugin({
      view(view) {
        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key !== 'ArrowRight' || !event.shiftKey) return;
          sawPendingClassBeforeBubbleUpdate = view.dom.classList.contains(KEYBOARD_SELECTION_PENDING_CLASS);
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 2)));
        };

        view.dom.addEventListener('keydown', handleKeyDown);
        return {
          destroy() {
            view.dom.removeEventListener('keydown', handleKeyDown);
          },
        };
      },
    }));
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, 'hello world');
      })
      .use(commonmark)
      .use(earlierBubbleSelectionPlugin)
      .use(textSelectionOverlayPlugin);

    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));

    view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );

    expect(view.state.selection.empty).toBe(false);
    expect(sawPendingClassBeforeBubbleUpdate).toBe(true);
  });

  it('hides the floating toolbar when plain navigation clears an overlay selection', async () => {
    const view = await createEditor('hello world', [floatingToolbarPlugin]);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
    view.dispatch(view.state.tr.setMeta(floatingToolbarKey, {
      type: TOOLBAR_ACTIONS.SHOW,
      payload: { selectionRange: { from: 1, to: 6 } },
    }));

    expect(floatingToolbarKey.getState(view.state)?.isVisible).toBe(true);

    view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      })
    );

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(floatingToolbarKey.getState(view.state)?.isVisible).toBe(false);
  });

  it('keeps the native browser range after pointer text selection completes', async () => {
    const view = await createEditor('hello');
    const originalGetSelection = window.getSelection;
    const originalElementFromPoint = document.elementFromPoint;
    let selectionCleared = false;
    const removeAllRanges = vi.fn(() => {
      selectionCleared = true;
    });
    const fakeRect = { height: 19, top: 120 } as DOMRect;

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });
    Object.defineProperty(window, 'getSelection', {
      configurable: true,
      value: () => ({
        anchorOffset: 0,
        focusOffset: 4,
        isCollapsed: selectionCleared,
        rangeCount: selectionCleared ? 0 : 1,
        removeAllRanges,
        getRangeAt: () => ({
          getClientRects: () => [fakeRect],
        }),
      }),
    });

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)));
      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));

      removeAllRanges.mockClear();
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
    } finally {
      Object.defineProperty(window, 'getSelection', {
        configurable: true,
        value: originalGetSelection,
      });
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('reads native selection rect count without materializing every rect', () => {
    const originalGetSelection = window.getSelection;
    const rectIterator = vi.fn(() => {
      throw new Error('rects should not be iterated');
    });

    Object.defineProperty(window, 'getSelection', {
      configurable: true,
      value: () => ({
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => ({
          getClientRects: () => ({
            length: 2048,
            [Symbol.iterator]: rectIterator,
          }),
        }),
      }),
    });

    try {
      expect(getNativeSelectionMetrics()).toEqual({
        isCollapsed: false,
        rectCount: 2048,
      });
      expect(rectIterator).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'getSelection', {
        configurable: true,
        value: originalGetSelection,
      });
    }
  });

  it('keeps pointer selection native after mouseup when a browser range exists', async () => {
    const view = await createEditor('hello');
    const originalGetSelection = window.getSelection;
    const originalElementFromPoint = document.elementFromPoint;
    let selectionCleared = false;
    const removeAllRanges = vi.fn(() => {
      selectionCleared = true;
    });
    const fakeRect = { height: 19, top: 120 } as DOMRect;

    Object.defineProperty(window, 'getSelection', {
      configurable: true,
      value: () => ({
        anchorOffset: 0,
        focusOffset: 4,
        isCollapsed: selectionCleared,
        rangeCount: selectionCleared ? 0 : 1,
        removeAllRanges,
        getRangeAt: () => ({
          getClientRects: () => [fakeRect],
        }),
      }),
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });

    try {
      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)));

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(removeAllRanges).not.toHaveBeenCalled();

      removeAllRanges.mockClear();
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
    } finally {
      Object.defineProperty(window, 'getSelection', {
        configurable: true,
        value: originalGetSelection,
      });
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('collapses a retained pointer text selection at the clicked position', async () => {
    const view = await createEditor('hello world');
    const originalElementFromPoint = document.elementFromPoint;
    const restoreCaretRangeFromPoint = mockCaretRangeFromPoint(view, 3);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });

    try {
      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
      expect(view.state.selection.empty).toBe(false);

      const collapseMouseDown = new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 32,
        clientY: 12,
      });
      const mouseDownDispatched = view.dom.dispatchEvent(collapseMouseDown);

      expect(mouseDownDispatched).toBe(true);
      expect(collapseMouseDown.defaultPrevented).toBe(false);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.from).toBe(4);

      const collapseMouseUp = new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 32,
        clientY: 12,
      });
      const mouseUpDispatched = document.dispatchEvent(collapseMouseUp);

      expect(mouseUpDispatched).toBe(false);
      expect(collapseMouseUp.defaultPrevented).toBe(true);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.from).toBe(4);

      view.dom.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 32,
        clientY: 12,
      }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.from).toBe(4);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(false);
    } finally {
      restoreCaretRangeFromPoint();
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('collapses an overlay text selection at the clicked position', async () => {
    const view = await createEditor('hello world');
    const originalElementFromPoint = document.elementFromPoint;
    const restoreCaretRangeFromPoint = mockCaretRangeFromPoint(view, 3);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));

      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);

      const collapseMouseDown = new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 32,
        clientY: 12,
      });
      const mouseDownDispatched = view.dom.dispatchEvent(collapseMouseDown);

      expect(mouseDownDispatched).toBe(true);
      expect(collapseMouseDown.defaultPrevented).toBe(false);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.from).toBe(4);

      const collapseMouseUp = new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 32,
        clientY: 12,
      });
      const mouseUpDispatched = document.dispatchEvent(collapseMouseUp);

      expect(mouseUpDispatched).toBe(false);
      expect(collapseMouseUp.defaultPrevented).toBe(true);

      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.from).toBe(4);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(false);
    } finally {
      restoreCaretRangeFromPoint();
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('leaves expanded wiki-link pointer gestures to the wiki-link plugin', async () => {
    const view = await createEditor('hello world');
    const originalElementFromPoint = document.elementFromPoint;
    const restoreCaretRangeFromPoint = mockCaretRangeFromPoint(view, 3);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
    const expanded = view.dom.querySelector('p');
    expect(expanded).not.toBeNull();
    expanded!.setAttribute('data-wiki-link-source', 'true');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => expanded,
    });

    try {
      expanded!.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 32,
        clientY: 12,
      }));
      const mouseUp = new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        cancelable: true,
      });
      const mouseUpDispatched = document.dispatchEvent(mouseUp);
      expanded!.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
      }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(mouseUpDispatched).toBe(true);
      expect(mouseUp.defaultPrevented).toBe(false);
      expect(view.state.selection.from).toBe(1);
      expect(view.state.selection.to).toBe(6);
    } finally {
      restoreCaretRangeFromPoint();
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('does not collapse a retained pointer text selection when the next gesture drags', async () => {
    const view = await createEditor('hello world');
    const originalElementFromPoint = document.elementFromPoint;
    const restoreCaretRangeFromPoint = mockCaretRangeFromPoint(view, 3);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });

    try {
      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const dragMouseDown = new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 32,
        clientY: 12,
      });
      view.dom.dispatchEvent(dragMouseDown);
      expect(dragMouseDown.defaultPrevented).toBe(false);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4, 9)));
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        button: 0,
        clientX: 48,
        clientY: 12,
      }));
      document.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        clientX: 48,
        clientY: 12,
      }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(view.state.selection.empty).toBe(false);
      expect(view.state.selection.from).toBe(4);
      expect(view.state.selection.to).toBe(9);
    } finally {
      restoreCaretRangeFromPoint();
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('uses the shared edge auto-scroll loop while pointer-selecting text', async () => {
    const scrollRoot = document.createElement('div');
    scrollRoot.scrollTop = 100;
    Object.defineProperty(scrollRoot, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 100,
        bottom: 500,
      }),
    });
    const originalClosest = HTMLElement.prototype.closest;
    const closestSpy = vi.spyOn(HTMLElement.prototype, 'closest').mockImplementation(function (
      this: HTMLElement,
      selector: string,
    ) {
      if (selector === '[data-note-scroll-root="true"]') {
        return scrollRoot;
      }
      return originalClosest.call(this, selector);
    });
    const view = await createEditor('hello world');
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });
    const animationFrames: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());

    try {
      view.dom.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: 32,
        clientY: 450,
      }));
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        buttons: 1,
        clientX: 32,
        clientY: 520,
      }));

      animationFrames.shift()?.(0);

      expect(scrollRoot.scrollTop).toBeGreaterThan(100);
    } finally {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
      closestSpy.mockRestore();
    }
  });

  it('releases native pointer routing after pointer selection collapses', async () => {
    const view = await createEditor('hello');
    const originalGetSelection = window.getSelection;
    const originalElementFromPoint = document.elementFromPoint;
    let nativeSelectionCollapsed = false;
    const removeAllRanges = vi.fn(() => {
      nativeSelectionCollapsed = true;
    });
    const fakeRect = { height: 19, top: 120 } as DOMRect;

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });
    Object.defineProperty(window, 'getSelection', {
      configurable: true,
      value: () => ({
        anchorOffset: 0,
        focusOffset: 4,
        isCollapsed: nativeSelectionCollapsed,
        rangeCount: 1,
        removeAllRanges,
        getRangeAt: () => ({
          getClientRects: () => [fakeRect],
        }),
      }),
    });

    try {
      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)));

      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);

      removeAllRanges.mockClear();
      view.dom.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);

      nativeSelectionCollapsed = true;
      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 1)));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(false);
    } finally {
      Object.defineProperty(window, 'getSelection', {
        configurable: true,
        value: originalGetSelection,
      });
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('does not switch selection rendering modes on window blur', async () => {
    const view = await createEditor('hello');
    const originalGetSelection = window.getSelection;
    const originalElementFromPoint = document.elementFromPoint;
    const removeAllRanges = vi.fn();
    const fakeRect = { height: 19, top: 120 } as DOMRect;

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => view.dom,
    });
    Object.defineProperty(window, 'getSelection', {
      configurable: true,
      value: () => ({
        anchorOffset: 0,
        focusOffset: 4,
        isCollapsed: false,
        rangeCount: 1,
        removeAllRanges,
        getRangeAt: () => ({
          getClientRects: () => [fakeRect],
        }),
      }),
    });

    try {
      view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)));

      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);

      window.dispatchEvent(new Event('blur'));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(true);
      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
      expect(removeAllRanges).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'getSelection', {
        configurable: true,
        value: originalGetSelection,
      });
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it('keeps overlay styling and clears a stale browser range when one remains visible', async () => {
    const view = await createEditor('hello');
    const originalGetSelection = window.getSelection;
    let selectionCleared = false;
    const removeAllRanges = vi.fn(() => {
      selectionCleared = true;
    });
    const fakeRect = { height: 19, top: 120 } as DOMRect;

    Object.defineProperty(window, 'getSelection', {
      configurable: true,
      value: () => ({
        anchorOffset: 0,
        focusOffset: 4,
        isCollapsed: selectionCleared,
        rangeCount: selectionCleared ? 0 : 1,
        removeAllRanges,
        getRangeAt: () => ({
          getClientRects: () => [fakeRect],
        }),
      }),
    });

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)));

      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);

      const setCurSelection = vi.spyOn(
        (view as unknown as {
          domObserver: {
            setCurSelection: () => void;
            suppressSelectionUpdates: () => void;
          };
        }).domObserver,
        'setCurSelection',
      );
      const suppressSelectionUpdates = vi.spyOn(
        (view as unknown as {
          domObserver: {
            setCurSelection: () => void;
            suppressSelectionUpdates: () => void;
          };
        }).domObserver,
        'suppressSelectionUpdates',
      );
      setCurSelection.mockClear();
      suppressSelectionUpdates.mockClear();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(removeAllRanges).toHaveBeenCalled();
      expect(suppressSelectionUpdates).toHaveBeenCalled();
      expect(setCurSelection).toHaveBeenCalled();
      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
    } finally {
      Object.defineProperty(window, 'getSelection', {
        configurable: true,
        value: originalGetSelection,
      });
    }
  });

  it('keeps overlay styling for editor select-all selections', async () => {
    const view = await createEditor('hello\n\nworld');

    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
  });

  it('does not draw text selection overlay on editable list gap placeholders', async () => {
    const view = await createEditor(['- one', '- \u2800', '- two'].join('\n'));

    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(getOverlayText(view)).toBe('onetwo');
    expect(getOverlayText(view)).not.toContain('\u2800');
  });

  it('does not draw text selection overlay on invisible blank-line placeholders', async () => {
    const view = await createEditor(['one', '\u200B', '\u200B\u200C', 'two'].join('\n'));

    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(getOverlayText(view)).toBe('onetwo');
    expect(getOverlayText(view)).not.toContain('\u200B');
    expect(getOverlayText(view)).not.toContain('\u200C');
  });

  it('does not draw text selection overlay on whitespace-only lines', async () => {
    const view = await createEditor(['one', '   ', '\t', 'two'].join('\n'));

    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(getOverlayText(view)).toBe('onetwo');
  });

  it('splits text selection overlays around newline-only spans inside text nodes', () => {
    const decorations: Decoration[] = [];

    addTextSelectionOverlayDecorations(
      decorations,
      'one\n\n  \n\ttwo',
      10,
      10,
      22
    );

    expect(decorations).toHaveLength(2);
  });

  it('caps text selection overlay decorations within a single text node', () => {
    const decorations: Decoration[] = [];
    const text = Array.from({ length: 1005 }, () => 'x\u200B').join('');

    addTextSelectionOverlayDecorations(
      decorations,
      text,
      10,
      10,
      10 + text.length
    );

    expect(decorations).toHaveLength(1000);
  });

  it('splits text selection overlays around inline editor-only placeholder characters', async () => {
    const view = await createEditor('a\u200Bb\u200Cc\u2800d');

    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(getOverlayText(view)).toBe('abcd');
    expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(4);
  });

  it('skips text selection overlays across structurally large selections', async () => {
    const view = await createEditor(Array.from({ length: 1005 }, (_, index) => `line ${index}`).join('\n\n'));

    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(false);
    expect(view.dom.classList.contains(LARGE_SELECTION_CLASS)).toBe(false);
    expect(view.dom.querySelectorAll('.editor-large-selection-visible').length).toBeGreaterThan(0);
    expect(view.dom.querySelectorAll(`.${TEXT_SELECTION_OVERLAY_CLASS}`)).toHaveLength(0);
  });

  it('caps text selection overlay node scans', async () => {
    const view = await createEditor(Array.from({ length: 8 }, (_, index) => `line ${index}`).join('\n\n'));

    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    const capped = createTextSelectionDecorationState(view.state, 4);
    const complete = createTextSelectionDecorationState(view.state, 100);

    expect(capped.decorationCount).toBeLessThan(complete.decorationCount);
    expect(complete.decorationCount).toBe(8);
  });

  it('clears stale native browser ranges for editor select-all overlay selections', async () => {
    const view = await createEditor('hello\n\nworld');
    const originalGetSelection = window.getSelection;
    const removeAllRanges = vi.fn();
    const fakeRect = { height: 19, top: 120 } as DOMRect;

    Object.defineProperty(window, 'getSelection', {
      configurable: true,
      value: () => ({
        anchorOffset: 0,
        focusOffset: 4,
        isCollapsed: false,
        rangeCount: 1,
        removeAllRanges,
        getRangeAt: () => ({
          getClientRects: () => [fakeRect],
        }),
      }),
    });

    try {
      view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(removeAllRanges).toHaveBeenCalled();
      expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(true);
      expect(view.dom.classList.contains(POINTER_NATIVE_SELECTION_CLASS)).toBe(false);
    } finally {
      Object.defineProperty(window, 'getSelection', {
        configurable: true,
        value: originalGetSelection,
      });
    }
  });

  it('adds block selection styling to formulas covered by editor select-all', async () => {
    const view = await createEditor('before\n\n$$\nx^2\n$$\n\nafter', mathPlugin);

    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(
      view.dom.querySelector('[data-type="math-block"]')?.classList.contains('editor-block-selected')
    ).toBe(true);
    expect(
      view.dom.querySelector('[data-type="math-block"]')?.classList.contains('md-focus')
    ).toBe(true);
    expect(
      view.dom.querySelector('[data-type="math-block"]')?.classList.contains('editor-atomic-selected')
    ).toBe(true);
  });

  it('adds block selection styling to tables covered by editor select-all', async () => {
    const view = await createEditor('| A | B |\n| --- | --- |\n| 1 | 2 |', [gfm]);

    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(view.dom.querySelector('table')?.classList.contains('editor-block-selected')).toBe(
      true
    );
    expect(view.dom.querySelector('table')?.classList.contains('md-focus')).toBe(
      true
    );
    expect(view.dom.querySelector('table')?.classList.contains('editor-atomic-selected')).toBe(
      true
    );
  });

  it.each([
    {
      typeName: 'video',
      plugins: videoPlugin,
      attrs: { src: '', title: '', width: 560, height: 315 },
      selector: '[data-type="video"]',
    },
    {
      typeName: 'toc',
      plugins: tocPlugin,
      attrs: { maxLevel: 6 },
      selector: '[data-type="toc"]',
    },
  ])('adds block selection styling to $typeName blocks covered by editor select-all', async ({ typeName, plugins, attrs, selector }) => {
    const view = await createEditor('placeholder', plugins);
    const nodeType = view.state.schema.nodes[typeName];
    expect(nodeType).toBeDefined();

    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, nodeType.create(attrs)));
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));

    expect(view.dom.querySelector(selector)?.classList.contains('editor-block-selected')).toBe(
      true
    );
    expect(view.dom.querySelector(selector)?.classList.contains('md-focus')).toBe(
      true
    );
    expect(view.dom.querySelector(selector)?.classList.contains('editor-atomic-selected')).toBe(
      true
    );
  });

  it('does not hide native selection styling for node selections', async () => {
    const view = await createEditor('hello\n\n---\n\nworld');
    const hrPos = findNodePos(view, 'hr');

    expect(hrPos).toBeGreaterThanOrEqual(0);

    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, hrPos)));

    expect(view.dom.classList.contains(OVERLAY_ACTIVE_CLASS)).toBe(false);
  });
});
