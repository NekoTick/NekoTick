import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/lib/ai/types';
import { UserMessageEditor } from './UserMessageEditor';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/hooks/usePredictedTextareaHeight', () => ({
  usePredictedTextareaHeight: () => ({ syncHeight: vi.fn() }),
}));

const message: ChatMessage = {
  id: 'message-1',
  role: 'user',
  content: 'original',
  modelId: 'model-1',
  timestamp: 1,
  versions: [],
  currentVersionIndex: 0,
};

describe('UserMessageEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not measure or reset the textarea selection on ordinary changes', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    render(
      <UserMessageEditor
        message={message}
        parsedContent={{ text: 'original', imageSources: [] }}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const getClientRects = vi.spyOn(textarea, 'getClientRects');
    const setSelectionRange = vi.spyOn(textarea, 'setSelectionRange');

    fireEvent.change(textarea, { target: { value: 'ordinary typing' } });

    expect(getClientRects).not.toHaveBeenCalled();
    expect(setSelectionRange).not.toHaveBeenCalled();
  });

  it('does not save a composing edit from the save button', () => {
    const onEdit = vi.fn();
    render(
      <UserMessageEditor
        message={message}
        parsedContent={{ text: 'original', imageSources: [] }}
        onClose={vi.fn()}
        onEdit={onEdit}
      />,
    );

    const textarea = screen.getByRole('textbox');
    const saveButton = screen.getByText('common.send');

    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: 'nihon' } });
    fireEvent.click(saveButton);

    expect(onEdit).not.toHaveBeenCalled();

    fireEvent.compositionEnd(textarea);
    fireEvent.change(textarea, { target: { value: '日本' } });
    fireEvent.click(saveButton);

    expect(onEdit).toHaveBeenCalledWith('message-1', '日本');
  });

  it('does not save or block default handling for composing Enter', () => {
    const onClose = vi.fn();
    const onEdit = vi.fn();
    render(
      <UserMessageEditor
        message={message}
        parsedContent={{ text: 'original', imageSources: [] }}
        onClose={onClose}
        onEdit={onEdit}
      />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: 'hao' } });

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'isComposing', { value: true });
    textarea.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
