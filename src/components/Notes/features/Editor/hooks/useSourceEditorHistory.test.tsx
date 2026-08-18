import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSourceEditorHistory } from './useSourceEditorHistory';

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  textarea.value = value;
  textarea.setSelectionRange(value.length, value.length);
}

describe('useSourceEditorHistory', () => {
  it('groups continuous typing into one undoable change and restores the selection on redo', () => {
    const textarea = document.createElement('textarea');
    const textareaRef = { current: textarea };
    const { result } = renderHook(() => useSourceEditorHistory({
      currentNoteContent: 'Alpha',
      currentNotePath: 'alpha.md',
      textareaRef,
    }));

    setTextareaValue(textarea, 'Alpha');
    act(() => result.current.syncCurrentContent());

    act(() => {
      result.current.captureBeforeInput(textarea);
      setTextareaValue(textarea, 'Alpha a');
      result.current.recordChange('Alpha', textarea, 'insertText');
      result.current.captureBeforeInput(textarea);
      setTextareaValue(textarea, 'Alpha ab');
      result.current.recordChange('Alpha a', textarea, 'insertText');
    });

    const undo = result.current.takeHistoryShortcut(new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
    }));
    expect(undo).toMatchObject({ handled: true, snapshot: { value: 'Alpha' } });
    expect(textarea.value).toBe('Alpha');

    const redo = result.current.takeHistoryShortcut(new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      shiftKey: true,
    }));
    expect(redo).toMatchObject({ handled: true, snapshot: { value: 'Alpha ab' } });
    expect(textarea.value).toBe('Alpha ab');
    expect(textarea.selectionStart).toBe('Alpha ab'.length);
  });

  it('isolates note histories and drops a history when external content replaces it', () => {
    const textarea = document.createElement('textarea');
    const textareaRef = { current: textarea };
    const { result, rerender } = renderHook(
      ({ path, content }) => useSourceEditorHistory({
        currentNoteContent: content,
        currentNotePath: path,
        textareaRef,
      }),
      { initialProps: { path: 'alpha.md', content: 'Alpha' } },
    );

    setTextareaValue(textarea, 'Alpha');
    act(() => result.current.syncCurrentContent());
    act(() => {
      result.current.captureBeforeInput(textarea);
      setTextareaValue(textarea, 'Alpha edit');
      result.current.recordChange('Alpha', textarea, 'insertText');
    });

    rerender({ path: 'beta.md', content: 'Beta' });
    setTextareaValue(textarea, 'Beta');
    act(() => result.current.syncCurrentContent());
    act(() => {
      result.current.captureBeforeInput(textarea);
      setTextareaValue(textarea, 'Beta edit');
      result.current.recordChange('Beta', textarea, 'insertText');
    });

    rerender({ path: 'alpha.md', content: 'Alpha edit' });
    setTextareaValue(textarea, 'Alpha edit');
    expect(result.current.syncCurrentContent()).toMatchObject({ value: 'Alpha edit' });
    expect(result.current.takeHistoryShortcut(new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
    }))).toMatchObject({ snapshot: { value: 'Alpha' } });

    rerender({ path: 'beta.md', content: 'Beta externally replaced' });
    setTextareaValue(textarea, 'Beta externally replaced');
    act(() => result.current.syncCurrentContent());
    expect(result.current.takeHistoryShortcut(new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
    }))).toEqual({ handled: true, snapshot: null });
    expect(textarea.value).toBe('Beta externally replaced');
  });

  it('records an IME composition as one undoable change', () => {
    const textarea = document.createElement('textarea');
    const textareaRef = { current: textarea };
    const { result } = renderHook(() => useSourceEditorHistory({
      currentNoteContent: 'Input: ',
      currentNotePath: 'composition.md',
      textareaRef,
    }));

    setTextareaValue(textarea, 'Input: ');
    act(() => result.current.syncCurrentContent());
    act(() => {
      result.current.beginComposition(textarea);
      setTextareaValue(textarea, 'Input: 你好');
      result.current.commitComposition(textarea);
    });

    expect(result.current.takeHistoryShortcut(new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
    }))).toMatchObject({ snapshot: { value: 'Input: ' } });
  });

  it('does not record a duplicate composition change with the same value', () => {
    const textarea = document.createElement('textarea');
    const textareaRef = { current: textarea };
    const { result } = renderHook(() => useSourceEditorHistory({
      currentNoteContent: 'Input: ',
      currentNotePath: 'composition-duplicate.md',
      textareaRef,
    }));

    setTextareaValue(textarea, 'Input: ');
    act(() => result.current.syncCurrentContent());
    act(() => {
      result.current.beginComposition(textarea);
      setTextareaValue(textarea, 'Input: 你好');
      result.current.commitComposition(textarea);
      result.current.recordChange('Input: 你好', textarea, 'insertCompositionText');
    });

    expect(result.current.takeHistoryShortcut(new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
    }))).toMatchObject({ snapshot: { value: 'Input: ' } });
  });

  it('keeps a selection deletion separate from subsequent backward deletion', () => {
    const textarea = document.createElement('textarea');
    const textareaRef = { current: textarea };
    const { result } = renderHook(() => useSourceEditorHistory({
      currentNoteContent: 'abcdef',
      currentNotePath: 'selection-delete.md',
      textareaRef,
    }));

    setTextareaValue(textarea, 'abcdef');
    act(() => result.current.syncCurrentContent());
    act(() => {
      textarea.setSelectionRange(2, 4);
      result.current.captureBeforeInput(textarea);
      setTextareaValue(textarea, 'abef');
      textarea.setSelectionRange(2, 2);
      result.current.recordChange('abcdef', textarea, 'deleteContentBackward');

      result.current.captureBeforeInput(textarea);
      setTextareaValue(textarea, 'aef');
      textarea.setSelectionRange(1, 1);
      result.current.recordChange('abef', textarea, 'deleteContentBackward');
    });

    expect(result.current.takeHistoryShortcut(new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
    }))).toMatchObject({ snapshot: { value: 'abef' } });
    expect(result.current.takeHistoryShortcut(new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
    }))).toMatchObject({ snapshot: { value: 'abcdef' } });
  });

  it('evicts the oldest note history when the note cache is full', () => {
    const textarea = document.createElement('textarea');
    const textareaRef = { current: textarea };
    const { result, rerender } = renderHook(
      ({ path, content }) => useSourceEditorHistory({
        currentNoteContent: content,
        currentNotePath: path,
        textareaRef,
      }),
      { initialProps: { path: 'oldest.md', content: 'Oldest' } },
    );

    setTextareaValue(textarea, 'Oldest');
    act(() => result.current.syncCurrentContent());
    act(() => {
      result.current.captureBeforeInput(textarea);
      setTextareaValue(textarea, 'Oldest edit');
      result.current.recordChange('Oldest', textarea, 'insertText');
    });

    for (let index = 0; index < 50; index += 1) {
      const content = `Note ${index}`;
      rerender({ path: `note-${index}.md`, content });
      setTextareaValue(textarea, content);
      act(() => result.current.syncCurrentContent());
    }

    rerender({ path: 'oldest.md', content: 'Oldest edit' });
    setTextareaValue(textarea, 'Oldest edit');
    act(() => result.current.syncCurrentContent());

    expect(result.current.takeHistoryShortcut(new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
    }))).toEqual({ handled: true, snapshot: null });
  });
});
