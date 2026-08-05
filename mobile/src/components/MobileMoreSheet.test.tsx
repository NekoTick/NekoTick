import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileMoreSheet } from './MobileMoreSheet';

const controls = vi.hoisted(() => ({
  account: {
    isConnected: false,
    username: null as string | null,
    primaryEmail: null as string | null,
    membershipName: null as string | null,
  },
  avatar: null as string | null,
}));

vi.mock('@/components/layout/AccountAvatarImage', () => ({
  AccountAvatarImage: ({ src }: { src: string | null }) => (
    <img data-testid="account-avatar" alt="" src={src ?? undefined} />
  ),
}));
vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('@/hooks/useUserAvatar', () => ({
  useUserAvatar: () => controls.avatar,
}));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/stores/accountSession', () => ({
  useAccountSessionStore: (selector: (state: typeof controls.account) => unknown) => (
    selector(controls.account)
  ),
}));
vi.mock('./MobileLayer', () => ({
  MobileLayer: ({
    children,
    onClose,
    open,
    title,
    variant,
  }: {
    children: ReactNode;
    onClose: () => void;
    open: boolean;
    title: string;
    variant: string;
  }) => open ? (
    <section role="dialog" aria-label={title} data-variant={variant}>
      <button type="button" onClick={onClose}>Close layer</button>
      {children}
    </section>
  ) : null,
}));

function renderSheet({ onShare }: { onShare?: () => void } = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    onOpenAccount: vi.fn(),
    onOpenSettings: vi.fn(),
    onShare,
  };
  render(<MobileMoreSheet {...props} />);
  return props;
}

describe('MobileMoreSheet', () => {
  beforeEach(() => {
    controls.account.isConnected = false;
    controls.account.username = null;
    controls.account.primaryEmail = null;
    controls.account.membershipName = null;
    controls.avatar = null;
  });

  it('shows the signed-out identity and opens Account after closing', () => {
    const props = renderSheet();

    expect(screen.getByRole('dialog', { name: 'sidebar.more' })).toHaveAttribute(
      'data-variant',
      'sheet',
    );
    expect(screen.getByText('account.signIn')).toBeInTheDocument();
    expect(screen.getByText('Vlaina')).toBeInTheDocument();
    expect(screen.queryByTestId('account-avatar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /account\.signIn/i }));

    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onOpenAccount).toHaveBeenCalledOnce();
    expect(props.onClose.mock.invocationCallOrder[0]).toBeLessThan(
      props.onOpenAccount.mock.invocationCallOrder[0],
    );
  });

  it('shows the connected account identity and avatar', () => {
    controls.account.isConnected = true;
    controls.account.username = 'Ada';
    controls.account.primaryEmail = 'ada@example.test';
    controls.account.membershipName = 'Pro';
    controls.avatar = 'https://example.test/avatar.png';

    renderSheet();

    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('ada@example.test')).toBeInTheDocument();
    expect(screen.getByTestId('account-avatar')).toHaveAttribute(
      'src',
      controls.avatar,
    );
  });

  it('runs Share and Settings actions only after closing the sheet', () => {
    const onShare = vi.fn();
    const props = renderSheet({ onShare });

    fireEvent.click(screen.getByRole('button', { name: /mobile\.share/i }));
    fireEvent.click(screen.getByRole('button', { name: /account\.settings/i }));

    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(onShare).toHaveBeenCalledOnce();
    expect(props.onOpenSettings).toHaveBeenCalledOnce();
    expect(props.onClose.mock.invocationCallOrder[0]).toBeLessThan(
      onShare.mock.invocationCallOrder[0],
    );
    expect(props.onClose.mock.invocationCallOrder[1]).toBeLessThan(
      props.onOpenSettings.mock.invocationCallOrder[0],
    );
  });

  it('omits Share when no share action is available', () => {
    renderSheet();

    expect(screen.queryByText('mobile.share')).not.toBeInTheDocument();
  });
});
