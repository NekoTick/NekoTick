import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChatInputEventHandlers } from './useChatInputEventHandlers';

describe('useChatInputEventHandlers', () => {
  it('keeps the mention action stable while using the latest draft and caret handler', () => {
    const textarea = document.createElement('textarea');
    const handleMessageChange = vi.fn();
    const scheduleComposerFocus = vi.fn();
    const stableOptions = {
      clearHistoryNavigationOnInput: vi.fn(),
      discardRemovedAttachmentUndoStack: vi.fn(),
      handleFileChange: vi.fn(async () => {}),
      handleHistoryKeyDown: vi.fn(() => false),
      handleKeyDown: vi.fn(),
      handleMentionKeyDown: vi.fn(() => false),
      handleMessageChange,
      handlePaste: vi.fn(async () => {}),
      isComposing: false,
      markExplicitMultiline: vi.fn(),
      scheduleComposerFocus,
      scheduleFocusOnWindowFocus: vi.fn(),
      textareaRef: { current: textarea },
      triggerFileSelect: vi.fn(),
    };
    const firstCaretHandler = vi.fn();
    const latestCaretHandler = vi.fn();
    const { result, rerender } = renderHook(({
      handleCaretChange,
      message,
    }: {
      handleCaretChange: (start: number, end?: number) => void;
      message: string;
    }) => useChatInputEventHandlers({
      ...stableOptions,
      handleCaretChange,
      message,
    }), {
      initialProps: { handleCaretChange: firstCaretHandler, message: 'first' },
    });
    const initialMentionAction = result.current.handleTriggerMentionSelect;

    textarea.value = 'latest';
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    rerender({ handleCaretChange: latestCaretHandler, message: 'latest' });

    expect(result.current.handleTriggerMentionSelect).toBe(initialMentionAction);

    act(() => {
      result.current.handleTriggerMentionSelect();
    });

    expect(handleMessageChange).toHaveBeenCalledWith('latest @');
    expect(firstCaretHandler).not.toHaveBeenCalled();
    expect(latestCaretHandler).toHaveBeenCalledWith('latest @'.length);
    expect(scheduleComposerFocus).toHaveBeenCalledWith('latest @'.length);
  });
});
