import { describe, expect, it } from 'vitest';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { TextSelection } from '@milkdown/kit/prose/state';
import {
  floatingToolbarPlugin,
  moveSelectionForArrowNavigation,
  shouldHideToolbarForArrowNavigation,
} from './floatingToolbarPlugin';
import { floatingToolbarKey } from './floatingToolbarKey';
import { resolveDocumentHistoryShortcut } from './floatingToolbarPluginViewUtils';

async function createTextSelection(from: number, to: number) {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, 'hello world');
    })
    .use(commonmark);

  await editor.create();
  const view = editor.ctx.get(editorViewCtx);
  const selection = TextSelection.create(view.state.doc, from, to);
  await editor.destroy();
  return selection;
}

describe('floating toolbar keyboard handling', () => {
  it('recognizes platform undo and redo shortcuts without intercepting composition', () => {
    expect(resolveDocumentHistoryShortcut(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true })
    )).toBe('undo');
    expect(resolveDocumentHistoryShortcut(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true })
    )).toBe('redo');
    expect(resolveDocumentHistoryShortcut(
      new KeyboardEvent('keydown', { key: 'y', ctrlKey: true })
    )).toBe('redo');
    expect(resolveDocumentHistoryShortcut(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, isComposing: true })
    )).toBeNull();
  });

  it('handles plain ArrowLeft when a text selection is active', async () => {
    const selection = await createTextSelection(1, 6);

    expect(shouldHideToolbarForArrowNavigation(
      selection,
      new KeyboardEvent('keydown', { key: 'ArrowLeft' })
    )).toBe(true);
  });

  it('handles plain ArrowRight when a text selection is active', async () => {
    const selection = await createTextSelection(1, 6);

    expect(shouldHideToolbarForArrowNavigation(
      selection,
      new KeyboardEvent('keydown', { key: 'ArrowRight' })
    )).toBe(true);
  });

  it('handles plain ArrowUp when a text selection is active', async () => {
    const selection = await createTextSelection(1, 6);

    expect(shouldHideToolbarForArrowNavigation(
      selection,
      new KeyboardEvent('keydown', { key: 'ArrowUp' })
    )).toBe(true);
  });

  it('handles plain ArrowDown when a text selection is active', async () => {
    const selection = await createTextSelection(1, 6);

    expect(shouldHideToolbarForArrowNavigation(
      selection,
      new KeyboardEvent('keydown', { key: 'ArrowDown' })
    )).toBe(true);
  });

  it('does not hide on modified arrow key selection movement', async () => {
    const selection = await createTextSelection(1, 6);

    expect(shouldHideToolbarForArrowNavigation(
      selection,
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true })
    )).toBe(false);
  });

  it('does not hide during IME composition arrow key movement', async () => {
    const selection = await createTextSelection(1, 6);

    expect(shouldHideToolbarForArrowNavigation(
      selection,
      new KeyboardEvent('keydown', { key: 'ArrowRight', isComposing: true })
    )).toBe(false);
  });

  it('does not hide for an already empty selection', async () => {
    const selection = await createTextSelection(3, 3);

    expect(shouldHideToolbarForArrowNavigation(
      selection,
      new KeyboardEvent('keydown', { key: 'ArrowRight' })
    )).toBe(false);
  });

  it('does not restore a replaced text selection around the inserted text', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, 'hello world');
      })
      .use(commonmark)
      .use(floatingToolbarPlugin);
    await editor.create();
    const view = editor.ctx.get(editorViewCtx);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
    expect(floatingToolbarKey.getState(view.state)?.isVisible).toBe(true);

    view.dispatch(view.state.tr.insertText('P', 1, 6));

    expect(view.state.selection.empty).toBe(true);
    expect(view.state.selection.from).toBe(2);
    expect(floatingToolbarKey.getState(view.state)?.isVisible).toBe(false);

    await editor.destroy();
  });

  it('moves a vertical arrow target past an atomic block without creating a structural text selection', async () => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(defaultValueCtx, ['before', '', '---', '', 'after'].join('\n'));
      })
      .use(commonmark);
    await editor.create();
    const view = editor.ctx.get(editorViewCtx);
    let hrPos = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'hr') {
        hrPos = pos;
        return false;
      }
      return true;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 7)));
    view.coordsAtPos = (() => ({ left: 10, right: 10, top: 10, bottom: 30 })) as never;
    view.posAtCoords = (() => ({ pos: hrPos, inside: hrPos })) as never;

    expect(moveSelectionForArrowNavigation(
      view,
      new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true })
    )).toBe(true);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.empty).toBe(true);
    expect(view.state.selection.$from.parent.inlineContent).toBe(true);
    expect(view.state.selection.from).toBeGreaterThan(hrPos);

    await editor.destroy();
  });
});
