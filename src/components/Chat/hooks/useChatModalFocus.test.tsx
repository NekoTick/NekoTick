import { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChatModalFocus } from './useChatModalFocus';

function ModalHarness({
  onClose = () => {},
  showNestedDialog = false,
}: {
  onClose?: () => void;
  showNestedDialog?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  useChatModalFocus({
    modalRef,
    onClose: () => {
      onClose();
      setOpen(false);
    },
    open,
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {open ? (
        <div ref={modalRef} role="dialog" aria-modal="true" tabIndex={-1}>
          <button type="button">First</button>
          <button type="button">Last</button>
          {showNestedDialog ? (
            <div role="dialog" aria-modal="true">
              <button type="button">Nested</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

describe('useChatModalFocus', () => {
  it('focuses the first control and keeps Tab navigation inside the dialog', async () => {
    render(<ModalHarness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    fireEvent.click(opener);

    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    await waitFor(() => expect(first).toHaveFocus());

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('closes on Escape and restores focus to the opener', async () => {
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);

    const first = screen.getByRole('button', { name: 'First' });
    await waitFor(() => expect(first).toHaveFocus());
    fireEvent.keyDown(first, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('does not intercept keyboard events owned by a nested dialog', async () => {
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} showNestedDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const nested = screen.getByRole('button', { name: 'Nested' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());
    nested.focus();

    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    nested.dispatchEvent(tabEvent);
    fireEvent.keyDown(nested, { key: 'Escape' });

    expect(tabEvent.defaultPrevented).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });
});
