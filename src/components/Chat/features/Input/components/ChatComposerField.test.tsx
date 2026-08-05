import { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposerField } from './ChatComposerField';

function renderField() {
  return render(
    <ChatComposerField
      textareaRef={createRef<HTMLTextAreaElement>()}
      message="@3\nlong pasted text"
      ariaLabel="Write a message"
      placeholder="Message"
      textareaScrollTop={48}
      mentionPreviewParts={[{
        key: 'mention:3',
        type: 'mention',
        text: '@3',
        start: 0,
        end: 2,
        mention: {
          path: '/notes/3.md',
          title: '3',
          kind: 'note',
        },
      }]}
      onChange={vi.fn()}
      onCompositionStart={vi.fn()}
      onCompositionEnd={vi.fn()}
      onKeyDown={vi.fn()}
      onSelect={vi.fn()}
      onClick={vi.fn()}
      onBlur={vi.fn()}
      onPaste={vi.fn()}
      onScroll={vi.fn()}
      onFocusMentionEnd={vi.fn()}
      onRemoveMention={vi.fn()}
    />,
  );
}

describe('ChatComposerField', () => {
  it('exposes a stable accessible name independent of its placeholder', () => {
    const { getByRole } = renderField();

    expect(getByRole('textbox', { name: 'Write a message' })).toBeInTheDocument();
  });

  it('clips mention preview tokens to the textarea viewport', () => {
    const { container } = renderField();
    const token = container.querySelector('[data-mention-preview-token="true"]');
    const clipRoot = token?.parentElement?.parentElement;

    expect(token).not.toBeNull();
    expect(clipRoot).toHaveClass('relative');
    expect(clipRoot).toHaveClass('overflow-hidden');
  });
});
