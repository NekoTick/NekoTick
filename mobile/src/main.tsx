import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppLauncher } from '@capacitor/app-launcher';
import { Browser } from '@capacitor/browser';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StreamingHttp } from '@vlaina/capacitor-streaming-http';
import '@/fontImports';
import { configureNativeAccountHttp } from '@/lib/account/capacitorRuntime';
import { configureNativeAIFetch } from '@/lib/ai/nativeFetchRuntime';
import { configureNativeExternalUrlOpener } from '@/lib/navigation/externalLinks';
import { configureNativeFileShare } from '@/lib/nativeFileShare';
import './styles/mobile-utilities.css';
import '@/index.css';
import './styles/mobile-base.css';
import './styles/mobile-shell.css';
import './styles/mobile-overlays.css';
import './styles/mobile-content.css';
import './styles/mobile-settings.css';
import './styles/mobile-visual.css';
import './styles/mobile-workspace.css';
import { clearMobileFileShareCache, createMobileFileShareHandler } from './app/nativeFileShare';
import { prepareMobileStorage } from './app/mobileBootstrap';
import { installMobileWebApiPolyfills } from './app/mobileWebApiPolyfills';
import { createNativeStreamingFetch } from './network/nativeStreamingFetch';

installMobileWebApiPolyfills();
configureNativeAccountHttp((request) => CapacitorHttp.request(request));
configureNativeAIFetch(
  Capacitor.isNativePlatform()
    ? createNativeStreamingFetch(StreamingHttp)
    : null,
);
configureNativeExternalUrlOpener(
  Capacitor.isNativePlatform()
    ? async (url) => {
        const protocol = new URL(url).protocol;
        if (protocol === 'http:' || protocol === 'https:') {
          await Browser.open({ url });
          return;
        }
        const result = await AppLauncher.openUrl({ url });
        if (!result.completed) throw new Error('No application can open this URL.');
      }
    : null,
);
configureNativeFileShare(
  Capacitor.isNativePlatform()
    ? createMobileFileShareHandler(Filesystem, Share)
    : null,
);

const rootElement = document.getElementById('root') ?? document.body.appendChild(
  Object.assign(document.createElement('div'), { id: 'root' }),
);
const splashWatchdog = window.setTimeout(() => {
  void SplashScreen.hide().catch(() => undefined);
}, 8000);

async function startMobileApp(): Promise<void> {
  await prepareMobileStorage();
  if (Capacitor.isNativePlatform()) {
    await clearMobileFileShareCache(Filesystem).catch(() => undefined);
  }
  const [{ MobileApp }, { installMobileNativeRuntime }] = await Promise.all([
    import('./MobileApp'),
    import('./app/nativeRuntime'),
  ]);
  const runtime = await installMobileNativeRuntime();
  const platform = {
    ...runtime.hooks,
    onReady: async () => {
      try {
        await runtime.hooks.onReady?.();
      } finally {
        window.clearTimeout(splashWatchdog);
      }
    },
  };

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <MobileApp platform={platform} />
    </React.StrictMode>,
  );
}

void startMobileApp().catch((error: unknown) => {
  window.clearTimeout(splashWatchdog);
  void SplashScreen.hide().catch(() => undefined);
  rootElement.className = 'mobile-startup-error';
  rootElement.setAttribute('role', 'alert');
  rootElement.textContent = error instanceof Error
    ? `Vlaina could not start: ${error.message}`
    : 'Vlaina could not start.';
});
