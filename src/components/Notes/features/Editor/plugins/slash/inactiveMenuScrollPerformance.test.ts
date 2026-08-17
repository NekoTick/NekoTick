import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmojiShortcutMenuView } from '../emoji-shortcut/EmojiShortcutMenuView';
import { SlashMenuView } from './SlashMenuView';

function createEditorView() {
  const scrollRoot = document.createElement('div');
  scrollRoot.dataset.noteScrollRoot = 'true';
  const dom = document.createElement('div');
  scrollRoot.appendChild(dom);
  document.body.appendChild(scrollRoot);

  return {
    dom,
    scrollRoot,
    view: {
      composing: false,
      dispatch: vi.fn(),
      dom,
      state: {},
    } as unknown as EditorView,
  };
}

describe('inactive editor menus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('does not schedule slash menu layout while the menu is closed', () => {
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');
    const { scrollRoot, view } = createEditorView();
    const menu = new SlashMenuView(view, {} as never);
    requestAnimationFrameSpy.mockClear();

    scrollRoot.dispatchEvent(new Event('scroll'));

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    menu.destroy();
  });

  it('does not schedule emoji menu layout while the menu is closed', () => {
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');
    const { scrollRoot, view } = createEditorView();
    const menu = new EmojiShortcutMenuView(view);
    requestAnimationFrameSpy.mockClear();

    scrollRoot.dispatchEvent(new Event('scroll'));

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    menu.destroy();
  });
});
