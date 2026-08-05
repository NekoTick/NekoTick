import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('moves focus between confirm and cancel with ArrowUp and ArrowDown', () => {
    render(
      <ConfirmDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete Note"
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />,
    );

    const dialog = screen.getByRole('dialog');
    const title = screen.getByRole('heading', { name: 'Delete Note' });
    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });

    expect(confirmButton).toHaveFocus();
    expect(title).toHaveClass('select-none');

    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    expect(cancelButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'ArrowUp' });
    expect(confirmButton).toHaveFocus();
  });

  it('does not move focus on composing arrow keys', () => {
    render(
      <ConfirmDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete Note"
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />,
    );

    const dialog = screen.getByRole('dialog');
    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'isComposing', { value: true });
    dialog.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(confirmButton).toHaveFocus();
  });

  it('cycles through aux, confirm, and cancel actions with arrow keys', () => {
    render(
      <ConfirmDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onAuxAction={vi.fn()}
        title="Delete Note"
        auxActionText="Archive"
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />,
    );

    const dialog = screen.getByRole('dialog');
    const auxButton = screen.getByRole('button', { name: 'Archive' });
    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });

    expect(confirmButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'ArrowUp' });
    expect(auxButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    expect(confirmButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    expect(cancelButton).toHaveFocus();
  });
});
