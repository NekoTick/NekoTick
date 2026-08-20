import { act, renderHook } from '@testing-library/react';
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import { baseKeymap } from '@milkdown/kit/prose/commands';
import type { EditorView } from '@milkdown/kit/prose/view';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotesStore } from '@/stores/useNotesStore';
import { flushCurrentPendingEditorMarkdown } from '@/stores/notes/pendingEditorMarkdownFlusher';
import {
  collapseCommittedCompositionSelection,
  replaceRecentCompositionText,
  replaceSelectedTextWithCommittedComposition,
  usePendingMarkdownAutosave,
} from './usePendingMarkdownAutosave';
import {
  captureCompositionStartSelection,
  getSelectedCompositionText,
  splitBlockAfterCommittedCompositionSelection,
} from './pendingMarkdownCompositionSelection';

function createEditor(defaultValue = '') {
  return Editor.make()
    .config((ctx) => {
      ctx.set(defaultValueCtx, defaultValue);
    })
    .use(commonmark);
}

function findTextEndPos(view: EditorView, text: string): number {
  let foundPos: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (foundPos !== null) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index >= 0) {
      foundPos = pos + index + text.length;
      return false;
    }
    return true;
  });

  if (foundPos === null) {
    throw new Error(`Unable to find text: ${text}`);
  }
  return foundPos;
}

function getDocText(view: EditorView): string {
  return view.state.doc.textBetween(0, view.state.doc.content.size, '\n');
}

function setNativeCaretAtTextBoundary(
  view: EditorView,
  text: string,
  boundary: 'start' | 'end',
): number {
  const walker = view.dom.ownerDocument.createTreeWalker(view.dom, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const value = node.nodeValue ?? '';
    const textOffset = value.indexOf(text);
    if (textOffset >= 0) {
      const caretOffset = textOffset + (boundary === 'end' ? text.length : 0);
      const selection = view.dom.ownerDocument.getSelection();
      const range = view.dom.ownerDocument.createRange();
      range.setStart(node, caretOffset);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return view.posAtDOM(node, caretOffset, -1);
    }
    node = walker.nextNode();
  }
  throw new Error(`Unable to find native text: ${text}`);
}

describe('usePendingMarkdownAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotesStore.setState({
      currentNote: { path: 'docs/alpha.md', content: '# alpha' },
      isDirty: false,
      openTabs: [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['docs/alpha.md', { content: '# alpha', modifiedAt: 1 }]]),
      notesPath: '/notesRoot',
    });
  });

  it('skips full-document composition reads for oversized selections', () => {
    const textBetween = vi.fn(() => {
      throw new Error('oversized composition selection should not be read');
    });
    const view = {
      state: {
        doc: { textBetween },
        selection: { empty: false, from: 1, to: 1_000 },
      },
    } as unknown as EditorView;

    expect(captureCompositionStartSelection(view)).toBeNull();
    expect(getSelectedCompositionText(view)).toBeNull();
    expect(collapseCommittedCompositionSelection(view, '好')).toBe(false);
    expect(replaceSelectedTextWithCommittedComposition(view, '好')).toBe(false);
    expect(textBetween).not.toHaveBeenCalled();
  });

  afterEach(() => {
    delete (globalThis as { __VL_TEST_CONTENT_COMMIT_THROTTLE_MS__?: number })
      .__VL_TEST_CONTENT_COMMIT_THROTTLE_MS__;
    vi.useRealTimers();
  });

  it('repairs stale pinyin near the caret with committed composition text', async () => {
    const editor = createEditor(['# alpha', '', 'nihao'].join('\n'));
    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const pinyinEnd = findTextEndPos(view, 'nihao');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pinyinEnd)));

      expect(replaceRecentCompositionText(view, 'nihao', '你好')).toBe(true);
      expect(view.state.doc.textBetween(0, view.state.doc.content.size, '\n')).toContain('你好');
      expect(view.state.doc.textBetween(0, view.state.doc.content.size, '\n')).not.toContain('nihao');
    } finally {
      await editor.destroy();
    }
  });

  it('does not duplicate an ASCII IME commit after a link during delayed finalization', async () => {
    const editor = createEditor('[target](https://example.com)');
    await editor.create();
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '[target](https://example.com)',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const linkEnd = findTextEndPos(view, 'target');
      const markUserInput = result.current.createUserInputMarker(view, null);

      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, linkEnd)));
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', {
          inputType: 'insertCompositionText',
          data: 'v',
        }));
        view.dispatch(view.state.tr.insertText('v1', linkEnd));
        markUserInput(new CompositionEvent('compositionend', { data: 'v1' }));
        vi.advanceTimersByTime(100);
      });

      expect(getDocText(view)).toContain('targetv1');
      expect(getDocText(view)).not.toContain('targetv11');
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('repairs an incomplete ASCII IME commit once', async () => {
    const editor = createEditor('[target](https://example.com)v');
    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const textEnd = findTextEndPos(view, 'v');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, textEnd)));

      expect(replaceRecentCompositionText(view, 'v', 'v1')).toBe(true);
      expect(replaceRecentCompositionText(view, 'v', 'v1')).toBe(false);
      expect(getDocText(view)).toContain('v1');
      expect(getDocText(view)).not.toContain('v11');
    } finally {
      await editor.destroy();
    }
  });

  it('does not repair oversized composition text', async () => {
    const editor = createEditor('a');
    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const textEnd = findTextEndPos(view, 'a');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, textEnd)));

      expect(replaceRecentCompositionText(view, 'a', '中'.repeat(129))).toBe(false);
      expect(getDocText(view)).toBe('a');
    } finally {
      await editor.destroy();
    }
  });

  it('does not repair an earlier identical residue during duplicate or delayed finalization', async () => {
    const editor = createEditor('ha ha');
    await editor.create();
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: 'ha ha',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const textEnd = findTextEndPos(view, 'ha ha');
      const markUserInput = result.current.createUserInputMarker(view, null);

      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, textEnd)));
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', {
          inputType: 'insertCompositionText',
          data: 'ha',
        }));
        markUserInput(new CompositionEvent('compositionend', { data: '好' }));
        markUserInput(new CompositionEvent('compositionend', { data: '好' }));
        vi.advanceTimersByTime(100);
      });

      expect(getDocText(view)).toBe('ha 好');
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('invalidates delayed finalization when the next composition starts', async () => {
    const editor = createEditor('啊');
    await editor.create();
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '啊',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const textEnd = findTextEndPos(view, '啊');
      const markUserInput = result.current.createUserInputMarker(view, null);

      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, textEnd)));
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', {
          inputType: 'insertCompositionText',
          data: 'a',
        }));
        markUserInput(new CompositionEvent('compositionend', { data: '啊' }));

        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', {
          inputType: 'insertCompositionText',
          data: 'a',
        }));
        view.dispatch(view.state.tr.insertText('a', textEnd));
        vi.advanceTimersByTime(100);
      });

      expect(getDocText(view)).toBe('啊a');
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('invalidates delayed composition finalization before an undo shortcut', async () => {
    const editor = createEditor('啊');
    await editor.create();
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '啊',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const textEnd = findTextEndPos(view, '啊');
      const markUserInput = result.current.createUserInputMarker(view, null);

      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, textEnd)));
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', {
          inputType: 'insertCompositionText',
          data: 'a',
        }));
        markUserInput(new CompositionEvent('compositionend', { data: '啊' }));
        markUserInput(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
        view.dispatch(view.state.tr.insertText('a', textEnd));
        vi.advanceTimersByTime(100);
      });

      expect(getDocText(view)).toBe('啊a');
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('waits until compositionend propagation finishes before repairing stale pinyin', async () => {
    const editor = createEditor('nihao');
    await editor.create();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: 'nihao',
      updateContent: vi.fn(),
      debouncedSave: vi.fn(),
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const pinyinEnd = findTextEndPos(view, 'nihao');
      const markUserInput = result.current.createUserInputMarker(view, null);

      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pinyinEnd)));
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', {
          inputType: 'insertCompositionText',
          data: 'nihao',
        }));
        markUserInput(new CompositionEvent('compositionend', { data: '你好' }));
      });

      expect(getDocText(view)).toContain('nihao');
      expect(getDocText(view)).not.toContain('你好');

      act(() => {
        vi.advanceTimersByTime(0);
      });

      expect(getDocText(view)).toContain('你好');
      expect(getDocText(view)).not.toContain('nihao');
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('does not import a transient native caret during an active composition session', async () => {
    const editor = createEditor('nihao');
    await editor.create();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: 'nihao',
      updateContent: vi.fn(),
      debouncedSave: vi.fn(),
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const pinyinEnd = findTextEndPos(view, 'nihao');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pinyinEnd)));
      view.focus();
      const transientCaret = setNativeCaretAtTextBoundary(view, 'nihao', 'start');
      expect(transientCaret).toBeLessThan(pinyinEnd);

      const markUserInput = result.current.createUserInputMarker(view, null);
      act(() => {
        markUserInput(new Event('compositionstart'));
        markUserInput(new KeyboardEvent('keydown', { key: ' ' }));
      });

      expect(view.state.selection.from).toBe(pinyinEnd);
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('repairs pinyin residue split around committed composition text', async () => {
    const editor = createEditor(['# alpha', '', 'h好a'].join('\n'));
    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const mixedEnd = findTextEndPos(view, 'h好a');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, mixedEnd)));

      expect(replaceRecentCompositionText(view, 'ha', '好')).toBe(true);
      expect(getDocText(view)).toContain('好');
      expect(getDocText(view)).not.toContain('h好a');
    } finally {
      await editor.destroy();
    }
  });

  it('repairs partial pinyin residue split around committed composition text', async () => {
    const editor = createEditor(['# alpha', '', 'h好a'].join('\n'));
    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const mixedEnd = findTextEndPos(view, 'h好a');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, mixedEnd)));

      expect(replaceRecentCompositionText(view, 'hao', '好')).toBe(true);
      expect(getDocText(view)).toContain('好');
      expect(getDocText(view)).not.toContain('h好a');
    } finally {
      await editor.destroy();
    }
  });

  it('keeps pinyin residue available when committed text is inserted before compositionend', async () => {
    const editor = createEditor(['# alpha', '', 'h好a'].join('\n'));
    await editor.create();
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha\n\nh好a',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const mixedEnd = findTextEndPos(view, 'h好a');
      const markUserInput = result.current.createUserInputMarker(view, null);

      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, mixedEnd)));
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'ha' }));
        markUserInput(new InputEvent('beforeinput', { inputType: 'insertText', data: '好' }));
        markUserInput(new CompositionEvent('compositionend', { data: '好' }));
        vi.advanceTimersByTime(0);
      });

      expect(getDocText(view)).toContain('好');
      expect(getDocText(view)).not.toContain('h好a');
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('collapses a selection that still covers committed composition text', async () => {
    const editor = createEditor(['# alpha', '', '你好'].join('\n'));
    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const chineseEnd = findTextEndPos(view, '你好');
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
      );

      expect(collapseCommittedCompositionSelection(view, '你好')).toBe(true);
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.from).toBe(chineseEnd);
    } finally {
      await editor.destroy();
    }
  });

  it('does not collapse a committed composition selection to a stale earlier position', async () => {
    const editor = createEditor(['m', '', '放但是发生的'].join('\n'));
    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const stalePosition = findTextEndPos(view, 'm');
      const committedEnd = findTextEndPos(view, '放但是发生的');
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, committedEnd - 1, committedEnd)),
      );

      expect(collapseCommittedCompositionSelection(view, '的', stalePosition)).toBe(true);
      expect(view.state.selection.from).toBe(committedEnd);
    } finally {
      await editor.destroy();
    }
  });

  it('keeps a valid same-paragraph append position after committed composition text', async () => {
    const editor = createEditor('你好AB');
    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const committedEnd = findTextEndPos(view, '你好');
      const appendedEnd = findTextEndPos(view, '你好AB');
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, committedEnd - 2, committedEnd)),
      );

      expect(collapseCommittedCompositionSelection(view, '你好', appendedEnd)).toBe(true);
      expect(view.state.selection.from).toBe(appendedEnd);
    } finally {
      await editor.destroy();
    }
  });

  it('syncs a visible caret before ordinary Enter when the editor state is stale', async () => {
    const editor = createEditor([
      '1. 国内的==下载蹭小青==蛙',
      '2. 买域名',
      '   1. vlaina.io',
      '   2. vlaina.cn',
      '   3. vlaina.md',
      '',
      'sk-test-randomized-placeholder-token-1234567890',
      'm',
      '😁',
      '放但是发生的”我”在”的“的',
    ].join('\n'));
    await editor.create();

    let unmountHook = () => {};
    try {
      const view = editor.ctx.get(editorViewCtx);
      const stalePosition = findTextEndPos(view, 'sk-test-randomized-placeholder-token-1234567890');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, stalePosition)));
      view.focus();
      const visibleCaretPosition = setNativeCaretAtTextBoundary(
        view,
        '放但是发生的”我”在”的“的',
        'end',
      );
      const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
        currentNotePath: 'docs/alpha.md',
        currentNoteDiskRevision: 0,
        currentNoteContent: getDocText(view),
        updateContent: vi.fn(),
        debouncedSave: vi.fn(),
      }));
      unmountHook = unmount;
      const markUserInput = result.current.createUserInputMarker(view, null);
      const enter = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });

      act(() => markUserInput(enter));

      expect(view.state.selection.from).toBe(visibleCaretPosition);
      expect(baseKeymap.Enter(view.state, view.dispatch, view)).toBe(true);
      expect(getDocText(view)).toContain('放但是发生的”我”在”的“的\n');
      expect(view.state.selection.$from.parent.textContent).toBe('');
    } finally {
      unmountHook();
      await editor.destroy();
    }
  });

  it('replaces the pre-composition selected text with committed composition text', async () => {
    const editor = createEditor(['# alpha', '', 'Typing caret paragraph 45 sentinel text'].join('\n'));
    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const targetEnd = findTextEndPos(view, 'paragraph 45 sentinel');
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.create(view.state.doc, targetEnd - 'paragraph 45 sentinel'.length, targetEnd),
        ),
      );

      expect(replaceSelectedTextWithCommittedComposition(view, '马上回车中文-45-e2e')).toBe(true);
      expect(getDocText(view)).toContain('Typing caret 马上回车中文-45-e2e text');
      expect(getDocText(view)).not.toContain('paragraph 45 sentinel');
    } finally {
      await editor.destroy();
    }
  });

  it('commits composition text over the start selection even if the current selection moved before compositionend', async () => {
    const editor = createEditor(['# alpha', '', 'Typing caret paragraph 45 sentinel text'].join('\n'));
    await editor.create();
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha\n\nTyping caret paragraph 45 sentinel text',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const targetEnd = findTextEndPos(view, 'paragraph 45 sentinel');
      const targetFrom = targetEnd - 'paragraph 45 sentinel'.length;
      const markUserInput = result.current.createUserInputMarker(view, null);

      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, targetFrom, targetEnd)));
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', {
          inputType: 'insertCompositionText',
          data: '马上回车中文-45-e2e',
        }));
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, targetEnd)));
        markUserInput(new CompositionEvent('compositionend', { data: '马上回车中文-45-e2e' }));
        vi.advanceTimersByTime(0);
      });

      expect(getDocText(view)).toContain('Typing caret 马上回车中文-45-e2e text');
      expect(getDocText(view)).not.toContain('paragraph 45 sentinel');
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.from).toBe(findTextEndPos(view, '马上回车中文-45-e2e'));
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('uses the latest non-ascii composition data when compositionend does not expose event data', async () => {
    const editor = createEditor(['# alpha', '', 'Typing caret paragraph 45 sentinel text'].join('\n'));
    await editor.create();
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha\n\nTyping caret paragraph 45 sentinel text',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const targetEnd = findTextEndPos(view, 'paragraph 45 sentinel');
      const targetFrom = targetEnd - 'paragraph 45 sentinel'.length;
      const markUserInput = result.current.createUserInputMarker(view, null);

      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, targetFrom, targetEnd)));
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', {
          inputType: 'insertCompositionText',
          data: '马上回车中文-45-e2e',
        }));
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, targetFrom, targetEnd)));
        markUserInput(new Event('compositionend'));
        vi.advanceTimersByTime(0);
      });

      expect(getDocText(view)).toContain('Typing caret 马上回车中文-45-e2e text');
      expect(getDocText(view)).not.toContain('paragraph 45 sentinel');
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('appends normal text after IME commit when selection still covers committed text', async () => {
    const editor = createEditor(['# alpha', '', '你好'].join('\n'));
    await editor.create();
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha\n\n你好',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const chineseEnd = findTextEndPos(view, '你好');
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
      );

      const firstFollowUpInput = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: 'A',
      });
      const secondFollowUpInput = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: 'B',
      });
      act(() => {
        const markUserInput = result.current.createUserInputMarker(view, null);
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'nihao' }));
        markUserInput(new CompositionEvent('compositionend', { data: '你好' }));
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
        );
        markUserInput(firstFollowUpInput);
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
        );
        markUserInput(secondFollowUpInput);
      });

      const appendedEnd = findTextEndPos(view, '你好AB');
      expect(firstFollowUpInput.defaultPrevented).toBe(true);
      expect(secondFollowUpInput.defaultPrevented).toBe(true);
      expect(getDocText(view)).toContain('你好AB');
      expect(getDocText(view)).not.toContain('你好BA');
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.from).toBe(appendedEnd);

      act(() => {
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
        );
        result.current.configureMarkdownListener({
          get: vi.fn((token) => (token === editorViewCtx ? view : null)),
        } as never, '# alpha\n\n你好')('# alpha\n\n你好AB');
        vi.advanceTimersByTime(1_000);
      });

      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.from).toBe(appendedEnd);

      act(() => {
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
        );
        result.current.createUserInputMarker(view, null)(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: 'C',
        }));
      });

      const continuedEnd = findTextEndPos(view, '你好ABC');
      expect(getDocText(view)).toContain('你好ABC');
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.from).toBe(continuedEnd);
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('does not append follow-up text after the selection moves away from the IME commit', async () => {
    const editor = createEditor(['# alpha', '', '你好', 'target'].join('\n'));
    await editor.create();
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha\n\n你好\ntarget',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const chineseEnd = findTextEndPos(view, '你好');
      const targetEnd = findTextEndPos(view, 'target');
      const markUserInput = result.current.createUserInputMarker(view, null);
      const movedSelectionInput = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: 'B',
      });

      act(() => {
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
        );
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'nihao' }));
        markUserInput(new CompositionEvent('compositionend', { data: '你好' }));
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
        );
        markUserInput(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: 'A',
        }));

        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, targetEnd)));
        markUserInput(movedSelectionInput);
      });

      expect(movedSelectionInput.defaultPrevented).toBe(false);
      expect(getDocText(view)).toContain('你好A');
      expect(getDocText(view)).not.toContain('你好AB');
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.from).toBe(targetEnd);
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('splits the block after IME commit when Enter arrives while the committed text is still selected', async () => {
    const editor = createEditor(['# alpha', '', '你好'].join('\n'));
    await editor.create();
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha\n\n你好',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const chineseEnd = findTextEndPos(view, '你好');
      const markUserInput = result.current.createUserInputMarker(view, null);
      const enter = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });

      act(() => {
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
        );
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'nihao' }));
        markUserInput(new CompositionEvent('compositionend', { data: '你好' }));
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
        );
        markUserInput(enter);
      });

      expect(enter.defaultPrevented).toBe(true);
      expect(getDocText(view)).toContain('你好\n');
      expect(getDocText(view)).not.toContain('nihao');
      expect(view.state.selection.empty).toBe(true);
      expect(view.state.selection.from).toBeGreaterThanOrEqual(chineseEnd);
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('persists one IME replacement when committed text is followed immediately by Enter', async () => {
    const initialContent = '# alpha\n\nTyping caret paragraph 45 sentinel text';
    const committedText = '马上回车中文-45-e2e';
    const followUpText = 'AfterEnter45E2E';
    const editor = createEditor(initialContent);
    await editor.create();
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: initialContent,
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const serializer = editor.ctx.get(serializerCtx);
      const targetText = 'paragraph 45 sentinel';
      const targetEnd = findTextEndPos(view, targetText);
      const targetFrom = targetEnd - targetText.length;
      const markUserInput = result.current.createUserInputMarker(view, null);
      const markdownListener = result.current.configureMarkdownListener({
        get: vi.fn((token) => (token === editorViewCtx ? view : null)),
      } as never, initialContent);

      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, targetFrom, targetEnd)));
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', {
          inputType: 'insertCompositionText',
          data: committedText,
        }));
        const committedInput = new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: committedText,
        });
        markUserInput(committedInput);
        if (!committedInput.defaultPrevented) {
          view.dispatch(view.state.tr.insertText(committedText));
        }
        markUserInput(new CompositionEvent('compositionend', { data: committedText }));

        const enter = new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        });
        markUserInput(enter);
        expect(baseKeymap.Enter(view.state, view.dispatch, view)).toBe(true);

        markUserInput(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: followUpText,
        }));
        view.dispatch(view.state.tr.insertText(followUpText));
        markdownListener(serializer(view.state.doc));
        vi.advanceTimersByTime(16);
        vi.advanceTimersByTime(120);
      });

      const editorText = getDocText(view);
      expect(editorText.split(committedText)).toHaveLength(2);
      expect(editorText).toContain(`Typing caret ${committedText}\n${followUpText} text`);
      expect(updateContent).toHaveBeenCalledTimes(1);
      expect(updateContent.mock.calls[0]?.[0].split(committedText)).toHaveLength(2);
      expect(debouncedSave).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('ignores a stale IME append position before the selected committed text on Enter', async () => {
    const editor = createEditor(['m', '', '放但是发生的'].join('\n'));
    await editor.create();

    try {
      const view = editor.ctx.get(editorViewCtx);
      const stalePosition = findTextEndPos(view, 'm');
      const committedEnd = findTextEndPos(view, '放但是发生的');
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, committedEnd - 1, committedEnd)),
      );
      const enter = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });

      const splitPosition = splitBlockAfterCommittedCompositionSelection(
        view,
        enter,
        '的',
        stalePosition,
      );

      expect(splitPosition).not.toBeNull();
      expect(enter.defaultPrevented).toBe(true);
      expect(view.state.selection.$from.parent.textContent).toBe('');
      expect(getDocText(view)).toContain('放但是发生的\n');
      expect(getDocText(view)).not.toContain('放但是发生\n的');
    } finally {
      await editor.destroy();
    }
  });

  it('allows explicit pointer selection to replace committed IME text', async () => {
    const editor = createEditor(['# alpha', '', '你好'].join('\n'));
    await editor.create();
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha\n\n你好',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const chineseEnd = findTextEndPos(view, '你好');
      const markUserInput = result.current.createUserInputMarker(view, null);
      const replacementInput = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: 'X',
      });

      act(() => {
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
        );
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'nihao' }));
        markUserInput(new CompositionEvent('compositionend', { data: '你好' }));
        markUserInput(new Event('pointerdown'));
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
        );
        markUserInput(replacementInput);
      });

      expect(replacementInput.defaultPrevented).toBe(false);
      expect(getDocText(view)).toContain('你好');
      expect(getDocText(view)).not.toContain('你好X');
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('saves explicit replacement after pointer selection removes the committed IME text', async () => {
    const editor = createEditor(['# alpha', '', '你好'].join('\n'));
    await editor.create();
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha\n\n你好',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const chineseEnd = findTextEndPos(view, '你好');
      const markUserInput = result.current.createUserInputMarker(view, null);
      const markdownListener = result.current.configureMarkdownListener({
        get: vi.fn((token) => (token === editorViewCtx ? view : null)),
      } as never, '# alpha\n\n你好');

      act(() => {
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
        );
        markUserInput(new Event('compositionstart'));
        markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'nihao' }));
        markUserInput(new CompositionEvent('compositionend', { data: '你好' }));
        markUserInput(new Event('pointerdown'));
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, chineseEnd - '你好'.length, chineseEnd)),
        );
        markUserInput(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: 'X',
        }));
        markdownListener('# alpha\n\nX');
        vi.advanceTimersByTime(240);
        vi.advanceTimersByTime(16);
      });

      expect(updateContent).toHaveBeenCalledTimes(1);
      expect(updateContent).toHaveBeenCalledWith('# alpha\n\nX');
      expect(debouncedSave).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('does not intercept ordinary selected-text replacement outside IME settle', async () => {
    const editor = createEditor(['# alpha', '', 'replace me'].join('\n'));
    await editor.create();
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha\n\nreplace me',
      updateContent,
      debouncedSave,
    }));

    try {
      const view = editor.ctx.get(editorViewCtx);
      const textEnd = findTextEndPos(view, 'replace me');
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, textEnd - 'replace me'.length, textEnd)),
      );

      const replacementInput = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: 'X',
      });
      act(() => {
        result.current.createUserInputMarker(view, null)(replacementInput);
      });

      expect(replacementInput.defaultPrevented).toBe(false);
      expect(getDocText(view)).toContain('replace me');
      expect(getDocText(view)).not.toContain('replace meX');
    } finally {
      unmount();
      await editor.destroy();
    }
  });

  it('treats editor echoes after a disk revision change as non-user updates', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = { dom: document.createElement('div') };
    const ctx = { get: vi.fn() };

    const { result, rerender } = renderHook(
      ({ diskRevision, content }) => usePendingMarkdownAutosave({
        currentNotePath: 'docs/alpha.md',
        currentNoteDiskRevision: diskRevision,
        currentNoteContent: content,
        updateContent,
        debouncedSave,
      }),
      { initialProps: { diskRevision: 0, content: '# alpha' } },
    );

    act(() => {
      result.current.createUserInputMarker(editorView as never, null)(new KeyboardEvent('keydown'));
      result.current.configureMarkdownListener(ctx, '# alpha')('# user edit');
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).toHaveBeenCalledTimes(1);

    useNotesStore.setState({
      currentNote: { path: 'docs/alpha.md', content: '# external edit' },
      isDirty: false,
      openTabs: [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['docs/alpha.md', { content: '# external edit', modifiedAt: 2 }]]),
    });

    rerender({ diskRevision: 1, content: '# external edit' });

    act(() => {
      result.current.configureMarkdownListener(ctx, '# external edit')('# stale editor echo');
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).toHaveBeenCalledTimes(1);
    expect(debouncedSave).toHaveBeenCalledTimes(1);
  });

  it('treats block drag user input events as saveable edits', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = { dom: document.createElement('div') };
    const ctx = { get: vi.fn() };

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      result.current.createUserInputMarker(editorView as never, null)(
        new CustomEvent('editor:block-user-input')
      );
      result.current.configureMarkdownListener(ctx, '# alpha')('# moved');
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).toHaveBeenCalledWith('# moved');
    expect(debouncedSave).toHaveBeenCalledTimes(1);
  });

  it('skips same-content editor echoes without scheduling autosave work', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = { dom: document.createElement('div') };
    const ctx = { get: vi.fn() };

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      result.current.createUserInputMarker(editorView as never, null)(new KeyboardEvent('keydown'));
      result.current.configureMarkdownListener(ctx, '# alpha')('# alpha');
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
  });

  it('coalesces rapid editor updates and applies only the latest markdown on the next frame', () => {
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const editorView = { dom: document.createElement('div') };
    const ctx = { get: vi.fn() };

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      result.current.createUserInputMarker(editorView as never, null)(new KeyboardEvent('keydown'));
      const listener = result.current.configureMarkdownListener(ctx, '# alpha');
      listener('# alpha a');
      listener('# alpha ab');
      listener('# alpha abc');
    });

    expect(updateContent).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).toHaveBeenCalledTimes(1);
    expect(updateContent).toHaveBeenCalledWith('# alpha abc');
    expect(debouncedSave).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid live markdown preview events to the latest markdown', () => {
    (globalThis as { __VL_TEST_CONTENT_COMMIT_THROTTLE_MS__?: number })
      .__VL_TEST_CONTENT_COMMIT_THROTTLE_MS__ = 120;
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = { dom: document.createElement('div') };
    const ctx = { get: vi.fn() };
    const previewListener = vi.fn();
    window.addEventListener('editor:note-markdown-preview', previewListener);

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    try {
      act(() => {
        result.current.createUserInputMarker(editorView as never, null)(new KeyboardEvent('keydown'));
        const listener = result.current.configureMarkdownListener(ctx, '# alpha');
        listener('# alpha a');
        listener('# alpha ab');
        listener('# alpha abc');
        vi.advanceTimersByTime(16);
      });

      expect(previewListener).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(120);
      });

      expect(previewListener).toHaveBeenCalledTimes(1);
      expect(previewListener.mock.calls[0]?.[0]).toMatchObject({
        detail: {
          path: 'docs/alpha.md',
          content: '# alpha abc',
        },
      });
    } finally {
      window.removeEventListener('editor:note-markdown-preview', previewListener);
    }
  });

  it('normalizes editor-only rendered HTML boundary helpers before publishing live previews', () => {
    (globalThis as { __VL_TEST_CONTENT_COMMIT_THROTTLE_MS__?: number })
      .__VL_TEST_CONTENT_COMMIT_THROTTLE_MS__ = 120;
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const editorView = { dom: document.createElement('div') };
    const ctx = { get: vi.fn() };
    const previewListener = vi.fn();
    window.addEventListener('editor:note-markdown-preview', previewListener);

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    const rawMarkdown = [
      '<img src="./assets/demo.svg" alt="Demo" />',
      '',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      'After image.',
    ].join('\n');
    const expected = [
      '<img src="./assets/demo.svg" alt="Demo" />',
      '',
      'After image.',
    ].join('\n');

    try {
      act(() => {
        result.current.createUserInputMarker(editorView as never, null)(
          new CustomEvent('editor:image-user-input')
        );
        result.current.configureMarkdownListener(ctx, '# alpha')(rawMarkdown);
        vi.advanceTimersByTime(16);
      });

      act(() => {
        vi.advanceTimersByTime(120);
      });

      expect(previewListener).toHaveBeenCalledTimes(1);
      expect(previewListener.mock.calls[0]?.[0]).toMatchObject({
        detail: {
          path: 'docs/alpha.md',
          content: expected,
        },
      });
      expect(updateContent).toHaveBeenCalledWith(expected);
      expect(previewListener.mock.calls[0]?.[0].detail.content).not.toContain(
        'vlaina-rendered-html-boundary-blank-line'
      );
    } finally {
      window.removeEventListener('editor:note-markdown-preview', previewListener);
    }
  });

  it('normalizes leaked editor-only comments out of display math before publishing live previews', () => {
    (globalThis as { __VL_TEST_CONTENT_COMMIT_THROTTLE_MS__?: number })
      .__VL_TEST_CONTENT_COMMIT_THROTTLE_MS__ = 120;
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const editorView = { dom: document.createElement('div') };
    const ctx = { get: vi.fn() };
    const previewListener = vi.fn();
    window.addEventListener('editor:note-markdown-preview', previewListener);

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: ['$$', 'hi', '$$'].join('\n'),
      updateContent,
      debouncedSave,
    }));

    const rawMarkdown = [
      '$$',
      '<!--vlaina-markdown-blank-line-->',
      'hi',
      '<!--vlaina-markdown-blank-line-->',
      '$$',
    ].join('\n');
    const expected = ['$$', 'hi', '$$'].join('\n');

    try {
      act(() => {
        result.current.createUserInputMarker(editorView as never, null)(
          new CustomEvent('editor:math-user-input')
        );
        result.current.configureMarkdownListener(ctx, expected)(rawMarkdown);
        vi.advanceTimersByTime(16);
      });

      act(() => {
        vi.advanceTimersByTime(120);
      });

      expect(previewListener).toHaveBeenCalledTimes(1);
      expect(previewListener.mock.calls[0]?.[0]).toMatchObject({
        detail: {
          path: 'docs/alpha.md',
          content: expected,
        },
      });
      expect(updateContent).toHaveBeenCalledWith(expected);
      expect(previewListener.mock.calls[0]?.[0].detail.content).not.toContain(
        'vlaina-markdown-blank-line'
      );
    } finally {
      window.removeEventListener('editor:note-markdown-preview', previewListener);
    }
  });

  it('preserves user-authored rendered HTML boundary comments in live previews', () => {
    (globalThis as { __VL_TEST_CONTENT_COMMIT_THROTTLE_MS__?: number })
      .__VL_TEST_CONTENT_COMMIT_THROTTLE_MS__ = 120;
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const editorView = { dom: document.createElement('div') };
    const ctx = { get: vi.fn() };
    const previewListener = vi.fn();
    window.addEventListener('editor:note-markdown-preview', previewListener);

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    const expected = [
      'Before',
      '',
      '<!--vlaina-rendered-html-boundary-blank-line-->',
      'After',
    ].join('\n');

    try {
      act(() => {
        result.current.createUserInputMarker(editorView as never, null)(
          new CustomEvent('editor:markdown-user-input')
        );
        result.current.configureMarkdownListener(ctx, '# alpha')(expected);
        vi.advanceTimersByTime(16);
      });

      act(() => {
        vi.advanceTimersByTime(120);
      });

      expect(previewListener).toHaveBeenCalledTimes(1);
      expect(previewListener.mock.calls[0]?.[0]).toMatchObject({
        detail: {
          path: 'docs/alpha.md',
          content: expected,
        },
      });
      expect(updateContent).toHaveBeenCalledWith(expected);
    } finally {
      window.removeEventListener('editor:note-markdown-preview', previewListener);
    }
  });

  it('flushes the latest pending raw markdown when unmounted before the next frame', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = { dom: document.createElement('div') };
    const ctx = { get: vi.fn() };

    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      result.current.createUserInputMarker(editorView as never, null)(new KeyboardEvent('keydown'));
      result.current.configureMarkdownListener(ctx, '# alpha')('# pending before unmount');
    });

    unmount();

    expect(useNotesStore.getState().currentNote).toEqual({
      path: 'docs/alpha.md',
      content: '# pending before unmount',
    });
    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
  });

  it('flushes delayed pending markdown before the commit throttle elapses', () => {
    (globalThis as { __VL_TEST_CONTENT_COMMIT_THROTTLE_MS__?: number })
      .__VL_TEST_CONTENT_COMMIT_THROTTLE_MS__ = 120;
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const editorView = { dom: document.createElement('div') };
    const ctx = { get: vi.fn() };

    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      result.current.createUserInputMarker(editorView as never, null)(new KeyboardEvent('keydown'));
      result.current.configureMarkdownListener(ctx, '# alpha')('# delayed');
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).not.toHaveBeenCalled();
    expect(useNotesStore.getState().currentNote?.content).toBe('# alpha');

    unmount();

    expect(useNotesStore.getState().currentNote).toEqual({
      path: 'docs/alpha.md',
      content: '# delayed',
    });
    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
  });

  it('does not apply delayed editor markdown after an external disk reload changes the note', () => {
    (globalThis as { __VL_TEST_CONTENT_COMMIT_THROTTLE_MS__?: number })
      .__VL_TEST_CONTENT_COMMIT_THROTTLE_MS__ = 120;
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const editorView = { dom: document.createElement('div') };
    const ctx = { get: vi.fn() };

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      result.current.createUserInputMarker(editorView as never, null)(new KeyboardEvent('keydown'));
      result.current.configureMarkdownListener(ctx, '# alpha')('# alpha local');
      vi.advanceTimersByTime(16);
    });

    useNotesStore.setState({
      currentNote: { path: 'docs/alpha.md', content: '# external edit' },
      isDirty: false,
      openTabs: [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['docs/alpha.md', { content: '# external edit', modifiedAt: 2 }]]),
    });

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(useNotesStore.getState().currentNote).toEqual({
      path: 'docs/alpha.md',
      content: '# external edit',
    });
    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
  });

  it('does not flush stale pending markdown while unmounting after an external disk reload', () => {
    (globalThis as { __VL_TEST_CONTENT_COMMIT_THROTTLE_MS__?: number })
      .__VL_TEST_CONTENT_COMMIT_THROTTLE_MS__ = 120;
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = { dom: document.createElement('div') };
    const ctx = { get: vi.fn() };

    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      result.current.createUserInputMarker(editorView as never, null)(new KeyboardEvent('keydown'));
      result.current.configureMarkdownListener(ctx, '# alpha')('# alpha local');
      vi.advanceTimersByTime(16);
    });

    useNotesStore.setState({
      currentNote: { path: 'docs/alpha.md', content: '# external edit' },
      isDirty: false,
      openTabs: [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['docs/alpha.md', { content: '# external edit', modifiedAt: 2 }]]),
    });

    unmount();

    expect(useNotesStore.getState().currentNote).toEqual({
      path: 'docs/alpha.md',
      content: '# external edit',
    });
    expect(useNotesStore.getState().isDirty).toBe(false);
    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
  });

  it('does not restore stale editor content while unmounting after an external disk reload', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      state: { doc: {} },
    };
    const serializer = vi.fn(() => '# stale editor content');
    const editor = {
      ctx: {
        get: vi.fn((token) => {
          if (token === editorViewCtx) return editorView;
          if (token === serializerCtx) return serializer;
          return null;
        }),
      },
    };

    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      result.current.setEditorGetter(() => editor as never);
      result.current.createUserInputMarker(editorView as never, serializer)(new KeyboardEvent('keydown'));
    });
    serializer.mockClear();

    useNotesStore.setState({
      currentNote: { path: 'docs/alpha.md', content: '# external edit' },
      isDirty: false,
      openTabs: [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['docs/alpha.md', { content: '# external edit', modifiedAt: 2 }]]),
    });

    unmount();

    expect(useNotesStore.getState().currentNote).toEqual({
      path: 'docs/alpha.md',
      content: '# external edit',
    });
    expect(useNotesStore.getState().isDirty).toBe(false);
    expect(useNotesStore.getState().openTabs).toEqual([
      { path: 'docs/alpha.md', name: 'alpha', isDirty: false },
    ]);
    expect(serializer).not.toHaveBeenCalled();
  });

  it('does not fallback serialize stale editor content after an external disk reload', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      state: { doc: {} },
    };
    const serializer = vi.fn(() => '# stale editor content');
    const editor = {
      ctx: {
        get: vi.fn((token) => {
          if (token === editorViewCtx) return editorView;
          if (token === serializerCtx) return serializer;
          return null;
        }),
      },
    };

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      result.current.setEditorGetter(() => editor as never);
      result.current.createUserInputMarker(editorView as never, serializer)(new KeyboardEvent('keydown'));
    });

    useNotesStore.setState({
      currentNote: { path: 'docs/alpha.md', content: '# external edit' },
      isDirty: false,
      openTabs: [{ path: 'docs/alpha.md', name: 'alpha', isDirty: false }],
      noteContentsCache: new Map([['docs/alpha.md', { content: '# external edit', modifiedAt: 2 }]]),
    });

    expect(flushCurrentPendingEditorMarkdown()).toBe(false);

    expect(useNotesStore.getState().currentNote).toEqual({
      path: 'docs/alpha.md',
      content: '# external edit',
    });
    expect(useNotesStore.getState().isDirty).toBe(false);
    expect(serializer).not.toHaveBeenCalled();
    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
  });

  it('does not save IME composition text when the editor is unmounted mid-composition', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: true,
      state: { doc: {} },
    };
    const serializer = vi.fn(() => '# alpha cuo w');
    const ctx = {
      get: vi.fn((token) => {
        if (token === editorViewCtx) return editorView;
        if (token === serializerCtx) return serializer;
        return null;
      }),
    };

    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      result.current.setEditorGetter(() => ({ ctx } as never));
      const markUserInput = result.current.createUserInputMarker(editorView as never, serializer);
      markUserInput(new Event('compositionstart'));
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha cuo w');
    });

    unmount();

    expect(useNotesStore.getState().currentNote).toEqual({
      path: 'docs/alpha.md',
      content: '# alpha',
    });
    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
    expect(serializer).not.toHaveBeenCalled();
  });

  it('saves the committed IME text after composition ends', () => {
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: false,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => {
        if (token === editorViewCtx) return editorView;
        return null;
      }),
    };

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      markUserInput(new Event('compositionstart'));
      editorView.composing = true;
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha cuo w');
      editorView.composing = false;
      markUserInput(new Event('compositionend'));
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha 错误');
      vi.advanceTimersByTime(240);
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).toHaveBeenCalledTimes(1);
    expect(updateContent).toHaveBeenCalledWith('# alpha 错误');
    expect(debouncedSave).toHaveBeenCalledTimes(1);
  });

  it('waits for the final IME markdown snapshot after compositionend emits stale romanized text first', () => {
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: false,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => {
        if (token === editorViewCtx) return editorView;
        return null;
      }),
    };

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      markUserInput(new Event('compositionstart'));
      editorView.composing = true;
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha c');
      editorView.composing = false;
      markUserInput(new Event('compositionend'));
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha cuo w');
      vi.advanceTimersByTime(80);
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha 错误');
      vi.advanceTimersByTime(240);
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).toHaveBeenCalledTimes(1);
    expect(updateContent).toHaveBeenCalledWith('# alpha 错误');
    expect(debouncedSave).toHaveBeenCalledTimes(1);
  });

  it('does not save stale romanized composition markdown if the committed text snapshot never arrives', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: false,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => {
        if (token === editorViewCtx) return editorView;
        return null;
      }),
    };

    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      markUserInput(new Event('compositionstart'));
      editorView.composing = true;
      markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'cuo w' }));
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha cuo w');
      markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: '错误' }));
      editorView.composing = false;
      markUserInput(new Event('compositionend'));
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha cuo w');
      vi.advanceTimersByTime(240);
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
    expect(useNotesStore.getState().currentNote?.content).toBe('# alpha');
    unmount();
  });

  it('does not accept an earlier identical phrase as proof that the current composition committed', () => {
    useNotesStore.setState({
      currentNote: { path: 'docs/alpha.md', content: '# 你好' },
      noteContentsCache: new Map([['docs/alpha.md', { content: '# 你好', modifiedAt: 1 }]]),
    });
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: false,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => token === editorViewCtx ? editorView : null),
    };

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# 你好',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      const markdownListener = result.current.configureMarkdownListener(ctx as never, '# 你好');
      markUserInput(new Event('compositionstart'));
      editorView.composing = true;
      markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'nihao' }));
      markdownListener('# 你好\n\nnihao');
      editorView.composing = false;
      markUserInput(new CompositionEvent('compositionend', { data: '你好' }));
      markdownListener('# 你好\n\nnihao');
      vi.advanceTimersByTime(240);
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
    expect(useNotesStore.getState().currentNote?.content).toBe('# 你好');
  });

  it('does not save stale pinyin when committed Chinese is only reported by compositionend', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: false,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => {
        if (token === editorViewCtx) return editorView;
        return null;
      }),
    };

    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      markUserInput(new Event('compositionstart'));
      editorView.composing = true;
      markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'nihao' }));
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha nihao');
      editorView.composing = false;
      markUserInput(new CompositionEvent('compositionend', { data: '你好' }));
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha nihao');
      vi.advanceTimersByTime(240);
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
    expect(useNotesStore.getState().currentNote?.content).toBe('# alpha');
    unmount();
  });

  it('saves a final insertFromComposition commit when compositionend data is empty', () => {
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: false,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => token === editorViewCtx ? editorView : null),
    };

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      const markdownListener = result.current.configureMarkdownListener(ctx as never, '# alpha');
      markUserInput(new Event('compositionstart'));
      editorView.composing = true;
      markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'nihao' }));
      markdownListener('# alpha nihao');
      editorView.composing = false;
      markUserInput(new CompositionEvent('compositionend', { data: '' }));
      markUserInput(new InputEvent('beforeinput', { inputType: 'insertFromComposition', data: '你好' }));
      markdownListener('# alpha 你好');
      vi.advanceTimersByTime(240);
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).toHaveBeenCalledWith('# alpha 你好');
    expect(debouncedSave).toHaveBeenCalledTimes(1);
  });

  it('does not save stale pinyin after selection repair is suppressed without a fresh input snapshot', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: false,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => {
        if (token === editorViewCtx) return editorView;
        return null;
      }),
    };

    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      const markdownListener = result.current.configureMarkdownListener(ctx as never, '# alpha');
      markUserInput(new Event('compositionstart'));
      editorView.composing = true;
      markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'nihao' }));
      markdownListener('# alpha nihao');
      editorView.composing = false;
      markUserInput(new CompositionEvent('compositionend', { data: '你好' }));
      markUserInput(new Event('pointerdown'));
      markUserInput(new KeyboardEvent('keydown', { key: 'a' }));
      vi.advanceTimersByTime(240);
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
    expect(useNotesStore.getState().currentNote?.content).toBe('# alpha');
    unmount();
  });

  it('saves committed Chinese when the final snapshot matches compositionend data', () => {
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: false,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => {
        if (token === editorViewCtx) return editorView;
        return null;
      }),
    };

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      markUserInput(new Event('compositionstart'));
      editorView.composing = true;
      markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'nihao' }));
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha nihao');
      editorView.composing = false;
      markUserInput(new CompositionEvent('compositionend', { data: '你好' }));
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha 你好');
      vi.advanceTimersByTime(240);
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).toHaveBeenCalledTimes(1);
    expect(updateContent).toHaveBeenCalledWith('# alpha 你好');
    expect(debouncedSave).toHaveBeenCalledTimes(1);
  });

  it('does not save composition markdown just because the settle timer fires before compositionend', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: true,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => {
        if (token === editorViewCtx) return editorView;
        return null;
      }),
    };

    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      markUserInput(new Event('compositionstart'));
      markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'cuo' }));
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha cuo');
      vi.advanceTimersByTime(240);
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
    expect(useNotesStore.getState().currentNote?.content).toBe('# alpha');
    unmount();
  });

  it('flushes committed IME markdown when switching away before the settle window elapses', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: false,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => {
        if (token === editorViewCtx) return editorView;
        return null;
      }),
    };

    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      markUserInput(new Event('compositionstart'));
      editorView.composing = true;
      markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: '错误' }));
      editorView.composing = false;
      markUserInput(new Event('compositionend'));
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha 错误');
      vi.advanceTimersByTime(40);
    });

    unmount();

    expect(useNotesStore.getState().currentNote).toEqual({
      path: 'docs/alpha.md',
      content: '# alpha 错误',
    });
    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
  });

  it('does not flush stale romanized IME markdown when switching away before settle', () => {
    const updateContent = vi.fn();
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: false,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => {
        if (token === editorViewCtx) return editorView;
        return null;
      }),
    };

    const { result, unmount } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      markUserInput(new Event('compositionstart'));
      editorView.composing = true;
      markUserInput(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: '错误' }));
      editorView.composing = false;
      markUserInput(new Event('compositionend'));
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha cuo w');
      vi.advanceTimersByTime(40);
    });

    unmount();

    expect(useNotesStore.getState().currentNote).toEqual({
      path: 'docs/alpha.md',
      content: '# alpha',
    });
    expect(updateContent).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();
  });

  it('does not apply an older pending snapshot after newer typing starts before the debounce fires', () => {
    (globalThis as { __VL_TEST_CONTENT_COMMIT_THROTTLE_MS__?: number })
      .__VL_TEST_CONTENT_COMMIT_THROTTLE_MS__ = 120;
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: false,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => {
        if (token === editorViewCtx) return editorView;
        return null;
      }),
    };

    useNotesStore.setState({
      currentNote: { path: 'docs/alpha.md', content: '# alpha stale' },
      noteContentsCache: new Map([['docs/alpha.md', { content: '# alpha stale', modifiedAt: 1 }]]),
    });

    const { result } = renderHook(() => usePendingMarkdownAutosave({
      currentNotePath: 'docs/alpha.md',
      currentNoteDiskRevision: 0,
      currentNoteContent: '# alpha stale',
      updateContent,
      debouncedSave,
    }));

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      const listener = result.current.configureMarkdownListener(ctx as never, '# alpha stale');

      markUserInput(new KeyboardEvent('keydown', { key: 'Backspace' }));
      listener('# alpha');
      vi.advanceTimersByTime(16);

      markUserInput(new KeyboardEvent('keydown', { key: 'c' }));
      markUserInput(new InputEvent('beforeinput', { inputType: 'insertText', data: 'c' }));
      vi.advanceTimersByTime(120);

      listener('# alphac');
      vi.advanceTimersByTime(16);
      vi.advanceTimersByTime(120);
    });

    expect(updateContent).toHaveBeenCalledTimes(1);
    expect(updateContent).toHaveBeenCalledWith('# alphac');
    expect(debouncedSave).toHaveBeenCalledTimes(1);
  });

  it('does not reset user-input tracking just because local content props changed', () => {
    const updateContent = vi.fn((content: string) => {
      useNotesStore.setState((state) => ({
        currentNote: state.currentNote ? { ...state.currentNote, content } : state.currentNote,
      }));
    });
    const debouncedSave = vi.fn();
    const editorView = {
      dom: document.createElement('div'),
      composing: false,
      state: { doc: {} },
    };
    const ctx = {
      get: vi.fn((token) => {
        if (token === editorViewCtx) return editorView;
        return null;
      }),
    };

    const { result, rerender } = renderHook(
      ({ content }) => usePendingMarkdownAutosave({
        currentNotePath: 'docs/alpha.md',
        currentNoteDiskRevision: 0,
        currentNoteContent: content,
        updateContent,
        debouncedSave,
      }),
      { initialProps: { content: '# alpha' } },
    );

    act(() => {
      const markUserInput = result.current.createUserInputMarker(editorView as never, null);
      const listener = result.current.configureMarkdownListener(ctx as never, '# alpha');
      markUserInput(new KeyboardEvent('keydown', { key: 'a' }));
      listener('# alpha a');
      vi.advanceTimersByTime(16);
    });

    rerender({ content: '# alpha a' });

    act(() => {
      result.current.createUserInputMarker(editorView as never, null)(
        new KeyboardEvent('keydown', { key: 'b' })
      );
      result.current.configureMarkdownListener(ctx as never, '# alpha')('# alpha ab');
      vi.advanceTimersByTime(16);
    });

    expect(updateContent).toHaveBeenCalledTimes(2);
    expect(updateContent).toHaveBeenLastCalledWith('# alpha ab');
    expect(debouncedSave).toHaveBeenCalledTimes(2);
  });
});
