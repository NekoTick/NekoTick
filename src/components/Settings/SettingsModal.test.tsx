import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCachedDesktopUpdateInfo, writeCachedDesktopUpdateInfo } from '@/lib/desktop/updateStatus';
import { SettingsModal } from './SettingsModal';
import { REQUEST_CLOSE_SETTINGS_EVENT } from './settingsEvents';

const mocks = vi.hoisted(() => ({
  setTitleBarOverlayVisible: vi.fn().mockResolvedValue(false),
  flushPendingSave: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: {
      children: ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
      [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

vi.mock('@/components/common/BlurBackdrop', () => ({
  BlurBackdrop: () => <div data-testid="blur-backdrop" />,
}));

vi.mock('@/components/common/DialogCloseIconButton', () => ({
  DialogCloseIconButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" aria-label={label} onClick={onClick} />
  ),
}));

vi.mock('@/hooks/useWindowDragGesture', () => ({
  useWindowDragGesture: () => ({
    beginWindowDragTracking: vi.fn(),
    stopWindowDragTracking: vi.fn(),
  }),
}));

vi.mock('./hooks/useModalBehavior', () => ({
  useModalBehavior: vi.fn(),
}));

vi.mock('./tabs/AboutTab', () => ({
  AboutTab: () => <div data-testid="about-tab" />,
}));

vi.mock('./tabs/MarkdownTab', () => ({
  MarkdownTab: () => <div data-testid="markdown-tab" />,
}));

vi.mock('./tabs/AppearanceTab', () => ({
  AppearanceTab: () => <div data-testid="appearance-tab" />,
}));

vi.mock('./tabs/AITab', () => ({
  AITab: () => <div data-testid="ai-tab" />,
}));

vi.mock('./tabs/LanguageTab', () => ({
  LanguageTab: () => <div data-testid="language-tab" />,
}));

vi.mock('@/stores/ai/providerActions', () => ({
  actions: {
    deleteIncompleteCustomProviders: vi.fn(),
  },
}));

vi.mock('@/lib/desktop/window', () => ({
  desktopWindow: {
    setTitleBarOverlayVisible: mocks.setTitleBarOverlayVisible,
  },
}));

vi.mock('@/lib/storage/unifiedStorage', () => ({
  flushPendingSave: mocks.flushPendingSave,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'common.close': 'Close',
      'account.settings': 'Settings',
      'settings.general': 'General',
      'settings.tabs.markdown': 'Markdown',
      'settings.tabs.ai': 'AI',
      'settings.tabs.appearance': 'Appearance',
      'settings.tabs.language': 'Language',
      'settings.tabs.about': 'About',
      'settings.updateIndicator': 'Update',
      'settings.about.updateAction': 'Update',
    }[key] ?? key),
  }),
}));

const communitySettings = {
  qqGroupNumber: '',
  qqQrCodeText: '',
  wechatQrCodeText: '',
};

function setScrollMetrics(
  element: HTMLElement,
  metrics: { clientHeight: number; scrollHeight: number; scrollTop?: number },
) {
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => metrics.clientHeight,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => metrics.scrollHeight,
  });

  let currentScrollTop = metrics.scrollTop ?? 0;
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      currentScrollTop = value;
    },
  });
}

describe('SettingsModal', () => {
  afterEach(() => {
    cleanup();
    clearCachedDesktopUpdateInfo();
    vi.clearAllMocks();
  });

  it('names the dialog and exposes the active settings section', () => {
    render(
      <SettingsModal
        open
        communitySettings={communitySettings}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Markdown' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'AI' })).not.toHaveAttribute('aria-current');
  });

  it('hides the native Windows titlebar overlay while settings is open', async () => {
    const { rerender } = render(
      <SettingsModal
        open
        communitySettings={communitySettings}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mocks.setTitleBarOverlayVisible).toHaveBeenCalledWith(false);
    });

    rerender(
      <SettingsModal
        open={false}
        communitySettings={communitySettings}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mocks.setTitleBarOverlayVisible).toHaveBeenLastCalledWith(true);
    });
  });

  it('marks the About tab when a cached desktop update is available', async () => {
    writeCachedDesktopUpdateInfo({
      currentVersion: '0.1.16',
      latestVersion: '99.99.99',
      updateAvailable: true,
      downloadUrl: 'https://github.com/vladelaina/vlaina/releases/download/v99.99.99/vlaina-99.99.99-linux-x86_64.AppImage',
      releaseUrl: 'https://github.com/vladelaina/vlaina/releases/tag/v99.99.99',
      platformAssetName: 'vlaina-99.99.99-linux-x86_64.AppImage',
      hasPlatformAsset: true,
      releaseNotes: '',
      publishedAt: '2026-06-27T00:00:00.000Z',
    });

    render(
      <SettingsModal
        open
        communitySettings={communitySettings}
        onClose={vi.fn()}
      />,
    );

    const aboutTab = screen.getByRole('button', { name: /About Update/ });
    expect(aboutTab).toHaveAttribute('data-settings-tab', 'about');
    expect(document.querySelector('[data-desktop-update-indicator="badge"]')).toHaveTextContent('Update');

    act(() => {
      clearCachedDesktopUpdateInfo();
    });

    await waitFor(() => {
      expect(document.querySelector('[data-desktop-update-indicator="badge"]')).toBeNull();
    });
  });

  it('leaves wheel scrolling on the settings content root to the browser', () => {
    render(
      <SettingsModal
        open
        communitySettings={communitySettings}
        onClose={vi.fn()}
      />,
    );

    const scrollRoot = document.querySelector('[data-settings-scroll-root="content"]') as HTMLElement | null;
    expect(scrollRoot).not.toBeNull();

    setScrollMetrics(scrollRoot!, { clientHeight: 200, scrollHeight: 800, scrollTop: 0 });
    fireEvent.wheel(scrollRoot!, { deltaY: 160 });

    expect(scrollRoot!.scrollTop).toBe(0);
  });

  it('leaves wheel scrolling on the settings sidebar root to the browser', () => {
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');
    render(
      <SettingsModal
        open
        communitySettings={communitySettings}
        onClose={vi.fn()}
      />,
    );

    const scrollRoot = document.querySelector('[data-settings-scroll-root="sidebar"]') as HTMLElement | null;
    expect(scrollRoot).not.toBeNull();

    requestAnimationFrameSpy.mockClear();
    scrollRoot!.style.overflowY = 'auto';
    setScrollMetrics(scrollRoot!, { clientHeight: 120, scrollHeight: 360, scrollTop: 10 });
    fireEvent.wheel(scrollRoot!, { deltaY: 80 });

    expect(scrollRoot!.scrollTop).toBe(10);
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
  });

  it('flushes pending settings before closing', async () => {
    let finishFlush: (() => void) | undefined;
    mocks.flushPendingSave.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishFlush = resolve;
    }));
    const onClose = vi.fn();
    render(
      <SettingsModal
        open
        communitySettings={communitySettings}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(mocks.flushPendingSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    finishFlush?.();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('routes shortcut close requests through the pending settings flush', async () => {
    const onClose = vi.fn();
    render(
      <SettingsModal
        open
        communitySettings={communitySettings}
        onClose={onClose}
      />,
    );

    window.dispatchEvent(new Event(REQUEST_CLOSE_SETTINGS_EVENT));

    await waitFor(() => expect(mocks.flushPendingSave).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
