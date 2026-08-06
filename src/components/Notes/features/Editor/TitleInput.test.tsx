import { fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TitleInput } from './TitleInput';
import { NATIVE_CARET_OVERLAY_REFRESH_EVENT } from '@/hooks/useNativeCaretOverlay';
import { flushCurrentTitleCommit } from './utils/titleCommitRegistry';

const focusEditorMock = vi.hoisted(() => ({
  focusEditorToFirstLineEnd: vi.fn(),
}));

const blockSelectionMocks = vi.hoisted(() => ({
  clearCurrentEditorBlockSelection: vi.fn(),
}));

const notesState = {
  renameNote: vi.fn<(path: string, title: string) => Promise<void>>().mockResolvedValue(undefined),
  renameAbsoluteNote: vi.fn<(path: string, title: string) => Promise<void>>().mockResolvedValue(undefined),
  updateDraftNoteName: vi.fn(),
  saveNote: vi.fn<(options?: { explicit?: boolean; throwOnError?: boolean }) => Promise<void>>()
    .mockResolvedValue(undefined),
  currentNote: { path: 'docs/test.md' } as { path: string } | null,
  error: null as string | null,
  saveError: null as string | null,
  saveErrorPath: null as string | null,
  notesPath: '/notesRoot',
};

vi.mock('@/stores/useNotesStore', () => ({
  useNotesStore: Object.assign(
    (selector: (state: typeof notesState) => unknown) => selector(notesState),
    {
      getState: () => ({
        ...notesState,
      }),
    },
  ),
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: (selector: (state: { setNotesPreviewTitle: typeof vi.fn }) => unknown) =>
    selector({ setNotesPreviewTitle: vi.fn() }),
}));

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: (selector: (state: { addToast: typeof vi.fn }) => unknown) =>
    selector({ addToast: vi.fn() }),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./utils/focusEditor', () => ({
  focusEditorToFirstLineEnd: focusEditorMock.focusEditorToFirstLineEnd,
}));

vi.mock('./utils/editorViewRegistry', () => ({
  clearCurrentEditorBlockSelection: blockSelectionMocks.clearCurrentEditorBlockSelection,
}));

describe('TitleInput', () => {
  let width = 0;
  let scrollHeight = 1200;
  let originalRect: typeof HTMLTextAreaElement.prototype.getBoundingClientRect;
  let originalScrollHeight: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    notesState.currentNote = { path: 'docs/test.md' };
    notesState.error = null;
    notesState.saveError = null;
    notesState.saveErrorPath = null;
    width = 0;
    scrollHeight = 1200;
    originalRect = HTMLTextAreaElement.prototype.getBoundingClientRect;
    originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight');

    HTMLTextAreaElement.prototype.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 40,
      width,
      height: 40,
      toJSON: () => ({}),
    });
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    });
  });

  afterEach(() => {
    HTMLTextAreaElement.prototype.getBoundingClientRect = originalRect;
    if (originalScrollHeight) {
      Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', originalScrollHeight);
    } else {
      delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight;
    }
    vi.useRealTimers();
  });

  it('keeps system spelling assistance available for note titles', () => {
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" />);

    expect(screen.getByRole('textbox')).toHaveAttribute('spellcheck', 'true');
  });

  it('blocks companion text from image clipboard payloads without blocking ordinary text', () => {
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" />);

    const input = screen.getByDisplayValue('test');
    const file = new File(['image'], 'title.png', { type: 'image/png' });

    expect(fireEvent.paste(input, {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
        getData: () => 'https://example.test/companion',
      },
    })).toBe(false);
    expect(fireEvent.paste(input, {
      clipboardData: {
        items: [],
        files: [],
        getData: (type: string) => type === 'text/html'
          ? '<a href="https://example.test/companion"><img src="https://images.example.test/title.png"></a>'
          : 'https://example.test/companion',
      },
    })).toBe(false);
    expect(fireEvent.paste(input, {
      clipboardData: {
        items: [],
        files: [],
        getData: () => 'ordinary title text',
      },
    })).toBe(true);
    expect(input).toHaveValue('test');
  });

  it('does not lock a bogus title height when first measured before layout has width', () => {
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" />);

    const input = screen.getByDisplayValue('test') as HTMLTextAreaElement;
    expect(input.style.height).toBe('');

    width = 360;
    scrollHeight = 44;

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(input.style.height).toBe('46px');
  });

  it('keeps the measured title height while its parent view is hidden', async () => {
    width = 360;
    scrollHeight = 44;
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" />);

    const input = screen.getByDisplayValue('test') as HTMLTextAreaElement;
    expect(input.style.height).toBe('46px');

    width = 0;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'next title' } });
    });

    expect(input.style.height).toBe('46px');
  });

  it('resets stale internal title scroll before refreshing the focused caret overlay', async () => {
    width = 360;
    scrollHeight = 44;
    const caretRefreshListener = vi.fn();
    document.addEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, caretRefreshListener);

    try {
      render(<TitleInput notePath="/notesRoot/test.md" initialTitle="Long title" />);

      const input = screen.getByDisplayValue('Long title') as HTMLTextAreaElement;
      input.focus();
      input.scrollTop = 28;
      input.scrollLeft = 6;

      await act(async () => {
        fireEvent.change(input, { target: { value: '' } });
      });

      expect(input.scrollTop).toBe(0);
      expect(input.scrollLeft).toBe(0);
      expect(caretRefreshListener).toHaveBeenCalled();
    } finally {
      document.removeEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, caretRefreshListener);
    }
  });

  it.each([
    { ctrlKey: true },
    { shiftKey: true },
    { metaKey: true },
    { altKey: true },
  ])('does not intercept modified ArrowDown in the title input: %o', (eventInit) => {
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" />);

    const input = screen.getByDisplayValue('test') as HTMLTextAreaElement;

    expect(
      fireEvent.keyDown(input, {
        key: 'ArrowDown',
        ...eventInit,
      })
    ).toBe(true);
  });

  it('moves from the title to the first body line end on plain ArrowDown', async () => {
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" />);

    const input = screen.getByDisplayValue('test') as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.keyDown(input, {
        key: 'ArrowDown',
      });
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(focusEditorMock.focusEditorToFirstLineEnd).toHaveBeenCalledTimes(1);
  });

  it('clears the active editor block selection when focusing the title', () => {
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" />);

    const input = screen.getByDisplayValue('test') as HTMLTextAreaElement;
    fireEvent.focus(input);

    expect(blockSelectionMocks.clearCurrentEditorBlockSelection).toHaveBeenCalledTimes(1);
  });

  it('does not commit or move focus when Enter is pressed during IME composition', () => {
    const onEnter = vi.fn();
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" onEnter={onEnter} />);

    const input = screen.getByDisplayValue('test') as HTMLTextAreaElement;

    expect(
      fireEvent.keyDown(input, {
        key: 'Enter',
        isComposing: true,
      })
    ).toBe(true);

    expect(onEnter).not.toHaveBeenCalled();
    expect(notesState.renameNote).not.toHaveBeenCalled();
    expect(notesState.renameAbsoluteNote).not.toHaveBeenCalled();
  });

  it('does not move focus when the composition session is active but keydown is not marked composing', () => {
    const onEnter = vi.fn();
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" onEnter={onEnter} />);

    const input = screen.getByDisplayValue('test') as HTMLTextAreaElement;
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false });

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(onEnter).not.toHaveBeenCalled();
    expect(focusEditorMock.focusEditorToFirstLineEnd).not.toHaveBeenCalled();
  });

  it('does not leave the title input on ArrowDown during IME composition', () => {
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" />);

    const input = screen.getByDisplayValue('test') as HTMLTextAreaElement;

    expect(
      fireEvent.keyDown(input, {
        key: 'ArrowDown',
        isComposing: true,
      })
    ).toBe(true);

    expect(notesState.renameNote).not.toHaveBeenCalled();
    expect(notesState.renameAbsoluteNote).not.toHaveBeenCalled();
  });

  it('does not commit a composing title on blur', async () => {
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" />);

    const input = screen.getByDisplayValue('test') as HTMLTextAreaElement;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'nihao' } });
    await act(async () => {
      fireEvent.blur(input);
    });

    expect(notesState.renameNote).not.toHaveBeenCalled();
    expect(notesState.renameAbsoluteNote).not.toHaveBeenCalled();
  });

  it('does not commit the title when the application window loses focus', async () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" />);

    const input = screen.getByDisplayValue('test') as HTMLTextAreaElement;
    input.focus();
    fireEvent.change(input, { target: { value: 'Renamed' } });

    hasFocus.mockReturnValue(false);
    await act(async () => {
      fireEvent.blur(input);
    });

    expect(notesState.renameNote).not.toHaveBeenCalled();

    hasFocus.mockReturnValue(true);
    fireEvent.focus(window);

    expect(input).toHaveFocus();
  });

  it('reports a failed rename to strict lifecycle title flushes', async () => {
    notesState.renameNote.mockImplementationOnce(async () => {
      notesState.error = 'rename denied';
    });
    render(<TitleInput notePath="docs/test.md" initialTitle="test" />);
    fireEvent.change(screen.getByDisplayValue('test'), { target: { value: 'Renamed' } });

    await expect(flushCurrentTitleCommit()).rejects.toThrow('rename denied');

    expect(notesState.renameNote).toHaveBeenCalledWith('docs/test.md', 'Renamed');
  });

  it('waits for an in-flight title rename during a strict lifecycle flush', async () => {
    let resolveRename: () => void = () => undefined;
    notesState.renameNote.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveRename = resolve;
    }));
    render(<TitleInput notePath="docs/test.md" initialTitle="test" />);
    const input = screen.getByDisplayValue('test');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await vi.waitFor(() => expect(notesState.renameNote).toHaveBeenCalledTimes(1));

    let strictFlushSettled = false;
    const strictFlush = flushCurrentTitleCommit().finally(() => {
      strictFlushSettled = true;
    });
    await Promise.resolve();
    expect(strictFlushSettled).toBe(false);

    notesState.currentNote = { path: 'docs/Renamed.md' };
    resolveRename();
    await expect(strictFlush).resolves.toBeUndefined();
  });

  it('does not save a composing draft title on blur', async () => {
    render(<TitleInput notePath="draft:test" initialTitle="Draft title" />);

    const input = screen.getByDisplayValue('Draft title') as HTMLTextAreaElement;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'nihao' } });
    await act(async () => {
      fireEvent.blur(input);
    });

    expect(notesState.updateDraftNoteName).not.toHaveBeenCalled();
    expect(notesState.saveNote).not.toHaveBeenCalled();
  });

  it('keeps a cleared existing title empty on blur so the Untitled placeholder remains visible', async () => {
    render(<TitleInput notePath="/notesRoot/test.md" initialTitle="test" />);

    const input = screen.getByDisplayValue('test') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '' } });
    await act(async () => {
      fireEvent.blur(input);
    });

    expect(input.value).toBe('');
    expect(screen.getByPlaceholderText('notes.untitled')).toBe(input);
    expect(notesState.renameNote).not.toHaveBeenCalled();
    expect(notesState.renameAbsoluteNote).not.toHaveBeenCalled();
  });

  it('clears a draft title on blur instead of restoring the previous draft name', async () => {
    render(<TitleInput notePath="draft:test" initialTitle="Draft title" />);

    const input = screen.getByDisplayValue('Draft title') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '' } });
    await act(async () => {
      fireEvent.blur(input);
    });

    expect(input.value).toBe('');
    expect(notesState.updateDraftNoteName).toHaveBeenCalledWith('draft:test', '');
    expect(notesState.saveNote).toHaveBeenCalledWith({ explicit: false });
  });
});
