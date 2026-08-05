import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REQUEST_CLOSE_SETTINGS_EVENT,
  SETTINGS_BEFORE_CLOSE_EVENT,
  SETTINGS_CLOSED_EVENT,
} from '@/components/Settings/settingsEvents';
import { MobileSettingsScreen } from './MobileSettingsScreen';

const controls = vi.hoisted(() => ({
  deleteIncompleteProviders: vi.fn(),
  flushPendingSave: vi.fn(() => Promise.resolve()),
  loadCommunitySettings: vi.fn(() => Promise.resolve({
    qqGroupNumber: '123456',
    qqQrCodeText: '',
    wechatQrCodeText: '',
  })),
}));

vi.mock('@/components/Settings/tabs/aboutCommunitySettings', () => ({
  emptyCommunitySettings: {
    qqGroupNumber: '',
    qqQrCodeText: '',
    wechatQrCodeText: '',
  },
  loadCommunitySettings: controls.loadCommunitySettings,
}));
vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/lib/storage/unifiedStorage', () => ({
  flushPendingSave: controls.flushPendingSave,
}));
vi.mock('@/stores/useAIStore', () => ({
  actions: {
    deleteIncompleteCustomProviders: controls.deleteIncompleteProviders,
  },
}));
vi.mock('../components/MobileLayer', () => ({
  MobileLayer: ({
    children,
    onClose,
    open,
    title,
  }: {
    children: ReactNode;
    onClose: () => void;
    open: boolean;
    title: string;
  }) => open ? (
    <section role="dialog" aria-label={title}>
      <button type="button" onClick={onClose}>Layer back</button>
      {children}
    </section>
  ) : null,
}));
vi.mock('./MobileSettingsContent', () => ({
  MobileSettingsContent: ({
    activeTab,
    communitySettings,
  }: {
    activeTab: string;
    communitySettings: { qqGroupNumber: string };
  }) => (
    <div data-testid="settings-content" data-active-tab={activeTab}>
      {communitySettings.qqGroupNumber}
    </div>
  ),
}));

const SETTINGS_LINKS = [
  ['markdown', 'settings.tabs.markdown'],
  ['ai', 'settings.tabs.ai'],
  ['appearance', 'settings.tabs.appearance'],
  ['language', 'settings.tabs.language'],
  ['about', 'settings.tabs.about'],
] as const;

describe('MobileSettingsScreen', () => {
  beforeEach(() => {
    controls.flushPendingSave.mockResolvedValue(undefined);
    controls.loadCommunitySettings.mockResolvedValue({
      qqGroupNumber: '123456',
      qqQrCodeText: '',
      wechatQrCodeText: '',
    });
  });

  it('opens each settings category from the index', () => {
    render(<MobileSettingsScreen open onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'account.settings' })).toBeInTheDocument();
    for (const [tab, label] of SETTINGS_LINKS) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute(
        'data-mobile-settings-link',
        tab,
      );
    }

    fireEvent.click(screen.getByRole('button', { name: 'settings.tabs.ai' }));

    expect(screen.getByRole('dialog', { name: 'settings.tabs.ai' })).toBeInTheDocument();
    expect(screen.getByTestId('settings-content')).toHaveAttribute('data-active-tab', 'ai');
  });

  it('returns to the index before closing and flushes state on final close', async () => {
    const onClose = vi.fn();
    const beforeClose = vi.fn();
    const closed = vi.fn();
    window.addEventListener(SETTINGS_BEFORE_CLOSE_EVENT, beforeClose);
    window.addEventListener(SETTINGS_CLOSED_EVENT, closed);
    render(<MobileSettingsScreen open onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'settings.tabs.markdown' }));
    fireEvent.click(screen.getByRole('button', { name: 'Layer back' }));

    expect(screen.getByRole('dialog', { name: 'account.settings' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(controls.flushPendingSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Layer back' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(beforeClose).toHaveBeenCalledOnce();
    expect(controls.deleteIncompleteProviders).toHaveBeenCalledOnce();
    expect(controls.flushPendingSave).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
    window.removeEventListener(SETTINGS_BEFORE_CLOSE_EVENT, beforeClose);
    window.removeEventListener(SETTINGS_CLOSED_EVENT, closed);
  });

  it('uses the same nested back behavior for mobile close requests', async () => {
    const onClose = vi.fn();
    render(<MobileSettingsScreen open requestedTab="appearance" onClose={onClose} />);
    await screen.findByRole('dialog', { name: 'settings.tabs.appearance' });

    act(() => {
      window.dispatchEvent(new Event(REQUEST_CLOSE_SETTINGS_EVENT));
    });
    expect(screen.getByRole('dialog', { name: 'account.settings' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event(REQUEST_CLOSE_SETTINGS_EVENT));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('resolves feedback and updated requested tabs while open', async () => {
    const { rerender } = render(
      <MobileSettingsScreen open requestedTab="feedback" onClose={vi.fn()} />,
    );

    await screen.findByRole('dialog', { name: 'settings.tabs.about' });
    expect(screen.getByTestId('settings-content')).toHaveAttribute('data-active-tab', 'about');

    rerender(<MobileSettingsScreen open requestedTab="language" onClose={vi.fn()} />);

    await screen.findByRole('dialog', { name: 'settings.tabs.language' });
    expect(screen.getByTestId('settings-content')).toHaveAttribute('data-active-tab', 'language');
    await waitFor(() => expect(screen.getByTestId('settings-content')).toHaveTextContent('123456'));
    expect(controls.loadCommunitySettings).toHaveBeenCalled();
  });
});
