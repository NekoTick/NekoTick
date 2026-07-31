import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarInlineRenameInput } from './SidebarInlineRenameInput';

describe('SidebarInlineRenameInput', () => {
  it('focuses and selects the full value on mount', async () => {
    render(
      <SidebarInlineRenameInput
        value="Example"
        onValueChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        aria-label="Rename"
      />,
    );

    const input = screen.getByLabelText('Rename') as HTMLTextAreaElement;

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe('Example'.length);
    });
  });

  it('submits on blur and Enter, and cancels on Escape', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <SidebarInlineRenameInput
        value="Example"
        onValueChange={() => {}}
        onSubmit={onSubmit}
        onCancel={onCancel}
        aria-label="Rename"
      />,
    );

    const input = screen.getByLabelText('Rename');

    fireEvent.blur(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps renaming active when the application window loses focus', async () => {
    const onSubmit = vi.fn();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);

    render(
      <SidebarInlineRenameInput
        value="Example"
        onValueChange={() => {}}
        onSubmit={onSubmit}
        onCancel={() => {}}
        aria-label="Rename"
      />,
    );

    const input = screen.getByLabelText('Rename');
    await waitFor(() => expect(input).toHaveFocus());

    hasFocus.mockReturnValue(false);
    fireEvent.blur(input);

    expect(onSubmit).not.toHaveBeenCalled();

    hasFocus.mockReturnValue(true);
    fireEvent.focus(window);

    expect(input).toHaveFocus();
  });

  it('does not submit on blur or Enter while composing text', () => {
    const onSubmit = vi.fn();

    render(
      <SidebarInlineRenameInput
        value="nihao"
        onValueChange={() => {}}
        onSubmit={onSubmit}
        onCancel={() => {}}
        aria-label="Rename"
      />,
    );

    const input = screen.getByLabelText('Rename');

    fireEvent.compositionStart(input);
    fireEvent.blur(input);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits again after composition ends', () => {
    const onSubmit = vi.fn();

    render(
      <SidebarInlineRenameInput
        value="你好"
        onValueChange={() => {}}
        onSubmit={onSubmit}
        onCancel={() => {}}
        aria-label="Rename"
      />,
    );

    const input = screen.getByLabelText('Rename');

    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('normalizes pasted newlines without writing line breaks into the value', () => {
    const onValueChange = vi.fn();

    render(
      <SidebarInlineRenameInput
        value="Example"
        onValueChange={onValueChange}
        onSubmit={() => {}}
        onCancel={() => {}}
        aria-label="Rename"
      />,
    );

    const input = screen.getByLabelText('Rename');

    fireEvent.change(input, { target: { value: 'Alpha\nBeta\r\nGamma' } });

    expect(onValueChange).toHaveBeenCalledWith('Alpha Beta Gamma');
  });

  it('does not turn image clipboard companion text into a file or folder name', () => {
    const onValueChange = vi.fn();
    render(
      <SidebarInlineRenameInput
        value="Example"
        onValueChange={onValueChange}
        onSubmit={() => {}}
        onCancel={() => {}}
        aria-label="Rename"
      />,
    );
    const input = screen.getByLabelText('Rename');
    const file = new File(['image'], 'rename.png', { type: 'image/png' });

    expect(fireEvent.paste(input, {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
        getData: () => 'https://example.test/companion',
      },
    })).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('Example');
  });

  it('stops click and mouse down propagation', () => {
    const onParentClick = vi.fn();
    const onParentMouseDown = vi.fn();

    render(
      <div onClick={onParentClick} onMouseDown={onParentMouseDown}>
        <SidebarInlineRenameInput
          value="Example"
          onValueChange={() => {}}
          onSubmit={() => {}}
          onCancel={() => {}}
          aria-label="Rename"
        />
      </div>,
    );

    const input = screen.getByLabelText('Rename');

    fireEvent.mouseDown(input);
    fireEvent.click(input);

    expect(onParentMouseDown).not.toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
