import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasElectronDesktopBridge } from '@/lib/desktop/backend';
import { NATIVE_CARET_OVERLAY_REFRESH_EVENT } from '@/hooks/useNativeCaretOverlay';
import { AccountEmailCodeCard } from './AccountEmailCodeCard';
import { AccountSignInOptions } from './AccountSignInOptions';

const { openExternalHrefMock } = vi.hoisted(() => ({
  openExternalHrefMock: vi.fn(),
}));

vi.mock('@/lib/desktop/backend', () => ({
  hasElectronDesktopBridge: vi.fn(),
}));

vi.mock('@/lib/navigation/externalLinks', () => ({
  openExternalHref: openExternalHrefMock,
}));

const mockedHasElectronDesktopBridge = vi.mocked(hasElectronDesktopBridge);

function buildProps() {
  return {
    isConnecting: false,
    error: null,
    onOauthSignIn: vi.fn(),
    onEmailCodeRequest: vi.fn().mockResolvedValue(true),
    onEmailCodeVerify: vi.fn().mockResolvedValue(true),
  };
}

describe('AccountSignInOptions', () => {
  beforeEach(() => {
    mockedHasElectronDesktopBridge.mockReset();
    mockedHasElectronDesktopBridge.mockReturnValue(false);
    openExternalHrefMock.mockReset();
  });

  it('shows OAuth buttons on web', () => {
    render(<AccountSignInOptions {...buildProps()} />);

    expect(screen.getByRole('button', { name: /continue with google/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /continue with github/i })).toBeNull();
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeTruthy();
  });

  it('shows OAuth buttons on desktop and keeps email sign-in available', () => {
    mockedHasElectronDesktopBridge.mockReturnValue(true);

    render(<AccountSignInOptions {...buildProps()} />);

    expect(screen.getByRole('button', { name: /continue with google/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /continue with github/i })).toBeNull();
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeTruthy();
  });

  it('hides OAuth in the native Capacitor app while keeping email sign-in available', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });

    render(<AccountSignInOptions {...buildProps()} />);

    expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull();
    expect(screen.queryByText(/^or$/i)).toBeNull();
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('resets the email code form when OAuth sign-in starts from the verification step', async () => {
    const props = buildProps();
    render(<AccountSignInOptions {...props} />);

    fireEvent.change(screen.getByPlaceholderText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));

    await screen.findByRole('button', { name: 'user@example.com' });
    expect(document.querySelector('input[autocomplete="one-time-code"]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(props.onOauthSignIn).toHaveBeenCalledWith('google');
    await waitFor(() => {
      expect(document.querySelector('input[autocomplete="one-time-code"]')).toBeNull();
      expect(screen.getByPlaceholderText(/email address/i)).toBeTruthy();
    });
  });

  it('refreshes the native caret overlay when the account error layout changes', () => {
    const handleRefresh = vi.fn();
    document.addEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleRefresh);
    const { rerender } = render(<AccountSignInOptions {...buildProps()} />);
    handleRefresh.mockClear();

    rerender(<AccountSignInOptions {...buildProps()} error="Sign-in failed" />);

    expect(handleRefresh).toHaveBeenCalledTimes(1);
    document.removeEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleRefresh);
  });

  it('focuses the code input after requesting an email code', async () => {
    const onEmailCodeRequest = vi.fn().mockResolvedValue(true);

    render(
      <AccountEmailCodeCard
        onEmailCodeRequest={onEmailCodeRequest}
        onEmailCodeVerify={vi.fn().mockResolvedValue(true)}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));

    await waitFor(() => {
      const codeInput = document.querySelector('input[autocomplete="one-time-code"]');
      expect(codeInput).toBeTruthy();
      expect(document.activeElement).toBe(codeInput);
    });
  });

  it('focuses the email input when the email sign-in card opens', async () => {
    render(
      <AccountEmailCodeCard
        onEmailCodeRequest={vi.fn().mockResolvedValue(true)}
        onEmailCodeVerify={vi.fn().mockResolvedValue(true)}
      />
    );

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByPlaceholderText(/email address/i));
    });
  });

  it('centers the email input text', () => {
    render(
      <AccountEmailCodeCard
        onEmailCodeRequest={vi.fn().mockResolvedValue(true)}
        onEmailCodeVerify={vi.fn().mockResolvedValue(true)}
      />
    );

    expect(screen.getByPlaceholderText(/email address/i)).toHaveClass('text-center');
  });

  it('blurs the focused account email input when the card unmounts', () => {
    const handleRefresh = vi.fn();
    document.addEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleRefresh);
    const { unmount } = render(
      <AccountEmailCodeCard
        onEmailCodeRequest={vi.fn().mockResolvedValue(true)}
        onEmailCodeVerify={vi.fn().mockResolvedValue(true)}
      />
    );

    const emailInput = screen.getByPlaceholderText(/email address/i);
    emailInput.focus();
    expect(document.activeElement).toBe(emailInput);

    unmount();

    expect(document.activeElement).not.toBe(emailInput);
    expect(handleRefresh).toHaveBeenCalledTimes(1);
    document.removeEventListener(NATIVE_CARET_OVERLAY_REFRESH_EVENT, handleRefresh);
  });

  it('keeps the email field selection-compatible for the shared caret overlay', () => {
    render(
      <AccountEmailCodeCard
        onEmailCodeRequest={vi.fn().mockResolvedValue(true)}
        onEmailCodeVerify={vi.fn().mockResolvedValue(true)}
      />
    );

    const emailInput = screen.getByPlaceholderText(/email address/i);
    expect(emailInput).toHaveAttribute('type', 'text');
    expect(emailInput).toHaveAttribute('inputmode', 'email');
    expect(emailInput).toHaveAttribute('autocomplete', 'email');
  });

  it('keeps the verification code field selection-compatible for the shared caret overlay', async () => {
    render(
      <AccountEmailCodeCard
        onEmailCodeRequest={vi.fn().mockResolvedValue(true)}
        onEmailCodeVerify={vi.fn().mockResolvedValue(true)}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));

    await waitFor(() => {
      const codeInput = document.querySelector('input[autocomplete="one-time-code"]');
      expect(codeInput).toBeTruthy();
      expect(codeInput).toHaveAttribute('type', 'text');
      expect(codeInput).toHaveAttribute('inputmode', 'numeric');
      expect(codeInput).toHaveAttribute('autocomplete', 'one-time-code');
    });
  });

  it('keeps the verify button disabled until the email code has 6 digits', async () => {
    const onEmailCodeVerify = vi.fn().mockResolvedValue(true);
    render(
      <AccountEmailCodeCard
        onEmailCodeRequest={vi.fn().mockResolvedValue(true)}
        onEmailCodeVerify={onEmailCodeVerify}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));

    const codeInput = await waitFor(() => {
      const input = document.querySelector('input[autocomplete="one-time-code"]');
      expect(input).toBeTruthy();
      return input as HTMLInputElement;
    });
    const verifyButton = screen.getByRole('button', { name: /verify and sign in/i });

    expect(verifyButton).toBeDisabled();

    fireEvent.change(codeInput, { target: { value: '12345' } });
    expect(verifyButton).toBeDisabled();
    fireEvent.submit(codeInput.closest('form')!);
    expect(onEmailCodeVerify).not.toHaveBeenCalled();

    fireEvent.change(codeInput, { target: { value: '123456' } });
    expect(verifyButton).toBeEnabled();
    fireEvent.click(verifyButton);
    await waitFor(() => {
      expect(onEmailCodeVerify).toHaveBeenCalledWith('user@example.com', '123456');
    });
  });

  it('ignores spaces in pasted verification codes before limiting to 6 digits', async () => {
    const onEmailCodeVerify = vi.fn().mockResolvedValue(true);
    render(
      <AccountEmailCodeCard
        onEmailCodeRequest={vi.fn().mockResolvedValue(true)}
        onEmailCodeVerify={onEmailCodeVerify}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));

    const codeInput = await waitFor(() => {
      const input = document.querySelector('input[autocomplete="one-time-code"]');
      expect(input).toBeTruthy();
      return input as HTMLInputElement;
    });

    expect(codeInput).not.toHaveAttribute('maxLength');

    fireEvent.change(codeInput, { target: { value: '119 413' } });
    expect(codeInput).toHaveValue('119413');

    fireEvent.click(screen.getByRole('button', { name: /verify and sign in/i }));
    await waitFor(() => {
      expect(onEmailCodeVerify).toHaveBeenCalledWith('user@example.com', '119413');
    });
  });

  it('shows the requested email on the verification step and uses it to return to email editing', async () => {
    const onEmailCodeRequest = vi.fn().mockResolvedValue(true);
    render(
      <AccountEmailCodeCard
        onEmailCodeRequest={onEmailCodeRequest}
        onEmailCodeVerify={vi.fn().mockResolvedValue(true)}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));

    const emailButton = await screen.findByRole('button', { name: 'user@example.com' });
    expect(screen.queryByText(/enter the code sent to your inbox/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /change email address/i })).toBeNull();

    fireEvent.click(emailButton);

    const emailInput = screen.getByPlaceholderText(/email address/i);
    expect(emailInput).toHaveValue('user@example.com');
    expect(document.activeElement).toBe(emailInput);

    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));

    await screen.findByRole('button', { name: 'user@example.com' });
    expect(onEmailCodeRequest).toHaveBeenCalledTimes(2);
  });

  it('requests a new email code after returning when the email address changes', async () => {
    const onEmailCodeRequest = vi.fn().mockResolvedValue(true);
    render(
      <AccountEmailCodeCard
        onEmailCodeRequest={onEmailCodeRequest}
        onEmailCodeVerify={vi.fn().mockResolvedValue(true)}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));

    const emailButton = await screen.findByRole('button', { name: 'user@example.com' });
    fireEvent.click(emailButton);
    fireEvent.change(screen.getByPlaceholderText(/email address/i), {
      target: { value: 'other@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));

    await screen.findByRole('button', { name: 'other@example.com' });
    expect(onEmailCodeRequest).toHaveBeenCalledTimes(2);
  });

  it('does not send duplicate code requests while the same email request is in flight', async () => {
    let resolveRequest!: (value: boolean) => void;
    const onEmailCodeRequest = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRequest = resolve;
        })
    );
    render(
      <AccountEmailCodeCard
        onEmailCodeRequest={onEmailCodeRequest}
        onEmailCodeVerify={vi.fn().mockResolvedValue(true)}
      />
    );

    const emailInput = screen.getByPlaceholderText(/email address/i);
    fireEvent.change(emailInput, {
      target: { value: 'user@example.com' },
    });
    const form = emailInput.closest('form');
    expect(form).toBeTruthy();

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(onEmailCodeRequest).toHaveBeenCalledTimes(1);

    resolveRequest(true);
    await screen.findByRole('button', { name: 'user@example.com' });
  });

  it('does not send duplicate verification requests while the same code is in flight', async () => {
    let resolveVerify!: (value: boolean) => void;
    const onEmailCodeVerify = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveVerify = resolve;
        })
    );
    render(
      <AccountEmailCodeCard
        onEmailCodeRequest={vi.fn().mockResolvedValue(true)}
        onEmailCodeVerify={onEmailCodeVerify}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));

    const codeInput = await waitFor(() => {
      const input = document.querySelector('input[autocomplete="one-time-code"]');
      expect(input).toBeTruthy();
      return input as HTMLInputElement;
    });
    fireEvent.change(codeInput, { target: { value: '123456' } });

    const form = codeInput.closest('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(onEmailCodeVerify).toHaveBeenCalledTimes(1);

    resolveVerify(true);
    await waitFor(() => {
      expect(onEmailCodeVerify).toHaveBeenCalledWith('user@example.com', '123456');
    });
  });

  it('opens the privacy policy from the sign-in agreement', () => {
    render(<AccountSignInOptions {...buildProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /privacy policy/i }));

    expect(openExternalHrefMock).toHaveBeenCalledWith('https://github.com/vladelaina/vlaina/blob/main/PRIVACY.md');
  });

  it('opens the terms from the sign-in agreement', () => {
    render(<AccountSignInOptions {...buildProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /terms of service/i }));

    expect(openExternalHrefMock).toHaveBeenCalledWith('https://github.com/vladelaina/vlaina/blob/main/TERMS.md');
  });
});
