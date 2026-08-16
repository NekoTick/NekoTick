import { useEffect, useRef } from 'react';
import { useAccountSessionStore } from '@/stores/accountSession';
import { hasElectronDesktopBridge } from '@/lib/desktop/backend';

const TOKEN_CHECK_INTERVAL = 4 * 60 * 1000;

export function useSyncInit() {
  const checkStatus = useAccountSessionStore((state) => state.checkStatus);
  const handleAuthCallback = useAccountSessionStore((state) => state.handleAuthCallback);
  const isConnected = useAccountSessionStore((state) => state.isConnected);
  const authHandledRef = useRef(false);

  useEffect(() => {
    if (hasElectronDesktopBridge() || authHandledRef.current) return;
    authHandledRef.current = true;

    const run = async () => {
      const handled = await handleAuthCallback();
      if (!handled) {
        await checkStatus();
      }
    };

    const params = new URLSearchParams(window.location.search);
    if (params.has('auth_state') || params.has('auth_error') || params.has('auth_provider')) {
      void run().catch(() => undefined);
      return;
    }

    void checkStatus().catch(() => undefined);
  }, [handleAuthCallback, checkStatus]);

  useEffect(() => {
    void useAccountSessionStore.getState().hydrateAvatar().catch(() => undefined);
    if (!hasElectronDesktopBridge()) return;
    void checkStatus().catch(() => undefined);
  }, [checkStatus]);

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const stopStatusPolling = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const startStatusPolling = () => {
      if (intervalId !== null || document.visibilityState !== 'visible') {
        return;
      }

      intervalId = setInterval(() => {
        void checkStatus().catch(() => undefined);
      }, TOKEN_CHECK_INTERVAL);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkStatus().catch(() => undefined);
        startStatusPolling();
      } else {
        stopStatusPolling();
      }
    };

    startStatusPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopStatusPolling();
    };
  }, [isConnected, checkStatus]);
}
