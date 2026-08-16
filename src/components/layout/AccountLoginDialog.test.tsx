import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountLoginDialog } from './AccountLoginDialog';

const mocks = vi.hoisted(() => ({
  focusComposerInput: vi.fn(),
  setTitleBarOverlayVisible: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/ui/composerFocusRegistry', () => ({
  focusComposerInput: () => mocks.focusComposerInput(),
}));

vi.mock('@/lib/desktop/window', () => ({
  desktopWindow: {
    setTitleBarOverlayVisible: mocks.setTitleBarOverlayVisible,
  },
}));

vi.mock('@/stores/accountSession', () => {
  const state = {
    isConnecting: false,
    error: null,
    signIn: vi.fn(),
    requestEmailCode: vi.fn().mockResolvedValue(true),
    verifyEmailCode: vi.fn().mockResolvedValue(true),
    cancelConnect: vi.fn(),
    clearError: vi.fn(),
  };
  return {
    useAccountSessionStore: (selector: (accountState: typeof state) => unknown) => selector(state),
  };
});

describe('AccountLoginDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the native Windows titlebar overlay while login is open', async () => {
    const { rerender } = render(<AccountLoginDialog open onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(mocks.setTitleBarOverlayVisible).toHaveBeenCalledWith(false);
    });

    rerender(<AccountLoginDialog open={false} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(mocks.setTitleBarOverlayVisible).toHaveBeenLastCalledWith(true);
    });
  });

  it('keeps the dialog open when clicking outside the sign-in panel', () => {
    const onOpenChange = vi.fn();

    render(<AccountLoginDialog open onOpenChange={onOpenChange} />);

    fireEvent.pointerDown(document.body, { button: 0 });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('focuses the email input after opening', async () => {
    render(<AccountLoginDialog open onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector('input[autocomplete="email"]'));
    });
  });

  it('focuses the chat composer after closing', async () => {
    const onOpenChange = vi.fn();

    function LoginDialogHarness() {
      const [open, setOpen] = React.useState(true);
      return (
        <AccountLoginDialog
          open={open}
          onOpenChange={(nextOpen) => {
            onOpenChange(nextOpen);
            setOpen(nextOpen);
          }}
        />
      );
    }

    render(<LoginDialogHarness />);

    fireEvent.click(screen.getByLabelText('Close'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => {
      expect(mocks.focusComposerInput).toHaveBeenCalled();
    });
  });
});
