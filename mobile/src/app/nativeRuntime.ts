import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { flushPendingWrites } from '@/lib/storage/flushPendingWrites';
import { flushCurrentPendingEditorMarkdown } from '@/stores/notes/pendingEditorMarkdownFlusher';
import {
  MOBILE_BACK_REQUEST_EVENT,
  MOBILE_URL_OPEN_EVENT,
  type MobileUrlOpenDetail,
} from './mobileNavigationEvents';
import type { MobilePlatformHooks, MobileShareOptions, MobileViewMode } from './mobilePlatform';

interface InstalledMobileRuntime {
  hooks: MobilePlatformHooks;
  dispose: () => Promise<void>;
}

const MOBILE_FLUSH_TIMEOUT_MS = import.meta.env.MODE === 'test' ? 20 : 5000;

async function waitForPendingWrites(task: Promise<boolean>): Promise<boolean> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<boolean>((resolve) => {
    timeoutId = setTimeout(() => resolve(false), MOBILE_FLUSH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([task, timeout]);
  } catch {
    return false;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

function closeTopDialog(): boolean {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
    .filter((dialog) => dialog.offsetParent !== null || dialog.getClientRects().length > 0);
  const dialog = dialogs.at(-1);
  if (!dialog) return false;
  dialog.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true,
  }));
  return true;
}

let lastOpenedUrl = '';
let lastOpenedUrlAt = 0;

function dispatchOpenUrl(url: string): void {
  if (!url.trim()) return;
  const now = Date.now();
  if (url === lastOpenedUrl && now - lastOpenedUrlAt < 2000) return;
  lastOpenedUrl = url;
  lastOpenedUrlAt = now;
  window.dispatchEvent(new CustomEvent<MobileUrlOpenDetail>(MOBILE_URL_OPEN_EVENT, {
    detail: { url },
  }));
}

function setKeyboardHeight(height: number): void {
  const normalized = Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0;
  document.documentElement.style.setProperty('--vlaina-mobile-keyboard-height', `${normalized}px`);
  document.documentElement.toggleAttribute('data-mobile-keyboard-open', normalized > 0);
}

async function syncStatusBarStyle(): Promise<void> {
  const isDark = document.documentElement.classList.contains('dark');
  await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
}

export async function installMobileNativeRuntime(): Promise<InstalledMobileRuntime> {
  let activeFlush: Promise<boolean> | null = null;
  const requestPendingWritesFlush = () => {
    if (!activeFlush) {
      activeFlush = flushPendingWrites().finally(() => {
        activeFlush = null;
      });
    }
    return activeFlush;
  };

  if (!Capacitor.isNativePlatform()) {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') {
        void requestPendingWritesFlush().catch(() => undefined);
      }
    };
    const flushOnPageHide = () => {
      void requestPendingWritesFlush().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flushOnPageHide);
    return {
      hooks: {
        share: async (options: MobileShareOptions) => {
          if (!navigator.share) return false;
          await navigator.share({ title: options.title, text: options.text, url: options.url });
          return true;
        },
      },
      dispose: async () => {
        document.removeEventListener('visibilitychange', flushWhenHidden);
        window.removeEventListener('pagehide', flushOnPageHide);
      },
    };
  }

  const listeners: PluginListenerHandle[] = [];
  let currentView: MobileViewMode = 'notes';
  let ready = false;
  let backgroundCycleActive = false;
  let keyboardOpen = false;
  let previousView: MobileViewMode = currentView;

  const flushForBackground = () => {
    if (backgroundCycleActive) return;
    backgroundCycleActive = true;
    flushCurrentPendingEditorMarkdown();
    void requestPendingWritesFlush().catch(() => undefined);
  };
  const handleBack = async () => {
    if (keyboardOpen) {
      keyboardOpen = false;
      setKeyboardHeight(0);
      await Keyboard.hide().catch(() => undefined);
      return;
    }
    if (closeTopDialog()) return;
    const request = new Event(MOBILE_BACK_REQUEST_EVENT, { cancelable: true });
    if (!window.dispatchEvent(request)) return;
    if (currentView !== 'notes') return;
    flushCurrentPendingEditorMarkdown();
    if (await waitForPendingWrites(requestPendingWritesFlush())) {
      await App.exitApp();
    }
  };

  await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);
  await syncStatusBarStyle().catch(() => undefined);
  if (Capacitor.getPlatform() === 'android') {
    const statusBar = await StatusBar.getInfo().catch(() => undefined);
    if (statusBar?.height) {
      document.documentElement.style.setProperty(
        '--vlaina-mobile-native-status-bar-height',
        `${statusBar.height}px`,
      );
    }
  }

  const themeObserver = new MutationObserver(() => {
    void syncStatusBarStyle().catch(() => undefined);
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  const handleKeyboardShow = ({ keyboardHeight }: { keyboardHeight: number }) => {
    keyboardOpen = true;
    setKeyboardHeight(keyboardHeight);
  };
  const handleKeyboardHide = () => {
    keyboardOpen = false;
    setKeyboardHeight(0);
  };

  const listenerResults = await Promise.allSettled([
    App.addListener('pause', flushForBackground),
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) flushForBackground();
    }),
    App.addListener('resume', () => {
      backgroundCycleActive = false;
      window.dispatchEvent(new Event('focus'));
    }),
    App.addListener('backButton', () => {
      void handleBack().catch(() => undefined);
    }),
    App.addListener('appUrlOpen', ({ url }) => dispatchOpenUrl(url)),
    Keyboard.addListener('keyboardWillShow', handleKeyboardShow),
    Keyboard.addListener('keyboardDidShow', handleKeyboardShow),
    Keyboard.addListener('keyboardWillHide', handleKeyboardHide),
    Keyboard.addListener('keyboardDidHide', handleKeyboardHide),
  ]);
  for (const result of listenerResults) {
    if (result.status === 'fulfilled') listeners.push(result.value);
  }

  const hooks: MobilePlatformHooks = {
    onReady: async () => {
      if (ready) return;
      ready = true;
      const launch = await App.getLaunchUrl().catch(() => undefined);
      if (launch?.url) window.setTimeout(() => dispatchOpenUrl(launch.url), 0);
      await SplashScreen.hide().catch(() => undefined);
    },
    onViewChange: (view) => {
      currentView = view;
      if (view === previousView) return;
      previousView = view;
      void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    },
    share: async (options: MobileShareOptions) => {
      const supported = await Share.canShare().catch(() => ({ value: false }));
      if (!supported.value) return false;
      await Share.share(options);
      return true;
    },
  };

  return {
    hooks,
    dispose: async () => {
      themeObserver.disconnect();
      setKeyboardHeight(0);
      document.documentElement.style.removeProperty('--vlaina-mobile-native-status-bar-height');
      await Promise.all(listeners.map((listener) => listener.remove()));
    },
  };
}
