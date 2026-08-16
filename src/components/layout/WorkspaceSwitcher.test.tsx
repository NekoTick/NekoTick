import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

const hoisted = vi.hoisted(() => {
  const aiState = {
    authPromptSessionId: null,
    currentSessionId: null,
    temporaryChatEnabled: false,
    setAuthPromptSessionId: vi.fn(),
  };
  return { aiState };
});

vi.mock('@/stores/accountSession', () => {
  const state = {
    isConnected: false,
    username: null,
    primaryEmail: null,
    signOut: vi.fn(),
  };
  return {
    useAccountSessionStore: (selector: (accountState: typeof state) => unknown) => selector(state),
  };
});

vi.mock('@/stores/useAIStore', () => ({ actions: { promoteTemporarySession: vi.fn() } }));
vi.mock('@/stores/ai/chatState', () => ({
  useAIUIStore: Object.assign(
    (selector: (state: typeof hoisted.aiState) => unknown) => selector(hoisted.aiState),
    { getState: () => hoisted.aiState },
  ),
}));
vi.mock('@/hooks/useUserAvatar', () => ({ useUserAvatar: () => null }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name, className }: { name: string; className?: string }) => (
    <span data-testid={`icon-${name}`} className={className} />
  ),
}));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./AccountAvatarImage', () => ({
  AccountAvatarImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));
vi.mock('./LoginPrompt', () => ({ LoginPrompt: () => null }));
vi.mock('./AccountLoginDialog', () => ({ AccountLoginDialog: () => null }));
vi.mock('./UserIdentityCard', () => ({ UserIdentityCard: () => null }));
vi.mock('./AppMenu', () => ({ AppMenu: () => null }));
vi.mock('@/components/common/ConfirmDialog', () => ({ ConfirmDialog: () => null }));

describe('WorkspaceSwitcher', () => {
  afterEach(cleanup);

  it('shows the branded app name and menu chevron beside the logo', () => {
    const { container } = render(<WorkspaceSwitcher />);
    const trigger = container.querySelector('button');
    const appName = screen.getByText('vlaina');

    expect(trigger).not.toBeNull();
    expect(appName).toHaveClass('shrink-0', 'whitespace-nowrap');
    expect(appName).not.toHaveClass('truncate');
    expect(screen.getByTestId('icon-nav.chevronDown')).toHaveClass(
      'opacity-[var(--vlaina-opacity-0)]',
      'group-hover:opacity-[var(--vlaina-opacity-100)]',
    );
    expect(trigger).toHaveClass(
      'text-[var(--vlaina-color-brand-wordmark)]',
      'hover:text-[var(--vlaina-color-brand-wordmark-hover)]',
    );
  });
});
