import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardTextEditingState } from '../../hooks/useWhiteboardTextEditing';
import { WhiteboardTextEditor } from './WhiteboardTextEditor';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const editing: WhiteboardTextEditingState = {
  element: {
    color: '#111111', fontSize: 24, height: 30, id: 'text-1', lineHeight: 1.25,
    text: 'Hello', type: 'text', width: 40, x: 20, y: 30,
  },
  original: null,
};

describe('WhiteboardTextEditor', () => {
  it('edits text with the same handwritten family used on the canvas', () => {
    render(<WhiteboardTextEditor editing={editing} onChange={vi.fn()} onCommit={vi.fn()} />);

    expect(screen.getByRole('textbox')).toHaveStyle({
      fontFamily: themeWhiteboardTokens.whiteboardTextFontFamily,
    });
  });

  it('keeps ordinary Enter available for multiline text', () => {
    const onCommit = vi.fn();
    render(<WhiteboardTextEditor editing={editing} onChange={vi.fn()} onCommit={onCommit} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('places the caret at the character nearest an existing-text click', () => {
    render(<WhiteboardTextEditor
      editing={{ ...editing, initialCaretPoint: { x: 41, y: 45 }, original: editing.element }}
      onChange={vi.fn()}
      onCommit={vi.fn()}
    />);
    const editor = screen.getByRole('textbox') as HTMLTextAreaElement;

    expect(editor.selectionStart).toBe(3);
    expect(editor.selectionEnd).toBe(3);
  });

  it('selects all text when editing starts from the keyboard', () => {
    render(<WhiteboardTextEditor
      editing={{ ...editing, original: editing.element }}
      onChange={vi.fn()}
      onCommit={vi.fn()}
    />);
    const editor = screen.getByRole('textbox') as HTMLTextAreaElement;

    expect(editor.selectionStart).toBe(0);
    expect(editor.selectionEnd).toBe(editing.element.text.length);
  });

  it('flips crossed text around its own center', () => {
    render(<WhiteboardTextEditor
      editing={{ ...editing, element: { ...editing.element, flipX: true } }}
      onChange={vi.fn()}
      onCommit={vi.fn()}
    />);

    expect(screen.getByRole('textbox')).toHaveStyle({
      transform: 'scale(-1, 1)',
      transformOrigin: themeWhiteboardTokens.elementTransformOrigin,
    });
  });

  it.each([
    { key: 'Escape' },
    { ctrlKey: true, key: 'Enter' },
    { key: 'Enter', metaKey: true },
  ])('confirms editing with $key keyboard submission', (keyboard) => {
    const onCommit = vi.fn();
    render(<WhiteboardTextEditor editing={editing} onChange={vi.fn()} onCommit={onCommit} />);

    fireEvent.keyDown(screen.getByRole('textbox'), keyboard);

    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('publishes input before confirming on blur', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<WhiteboardTextEditor editing={editing} onChange={onChange} onCommit={onCommit} />);
    const editor = screen.getByRole('textbox');

    fireEvent.change(editor, { target: { value: 'Hello\nworld' } });
    fireEvent.blur(editor);

    expect(onChange).toHaveBeenLastCalledWith('Hello\nworld');
    expect(onCommit).toHaveBeenCalledOnce();
  });
});
