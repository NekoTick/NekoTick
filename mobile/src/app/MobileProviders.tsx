import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { MarkdownThemeLoader } from '@/components/markdown-theme/MarkdownThemeLoader';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastContainer } from '@/components/ui/Toast';
import { useSyncInit } from '@/hooks/useSyncInit';
import { useUnifiedExternalSync } from '@/hooks/useUnifiedExternalSync';
import { useDocumentLanguage, useI18n } from '@/lib/i18n';
import { applyMarkdownFontSize } from '@/lib/markdown/markdownFontSize';
import {
  normalizeColorModePreference,
  suppressDocumentThemeTransitions,
  syncDocumentColorModeClass,
} from '@/lib/theme/colorModeSync';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { useAIStoreRuntimeEffects } from '@/stores/useAIStore';
import { useUIStore } from '@/stores/uiSlice';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { MOBILE_NOTES_ROOT } from './mobileBootstrap';
import type { MobilePlatformHooks } from './mobilePlatform';

interface MobileProvidersProps {
  children: ReactNode;
  platform: MobilePlatformHooks;
}

function MobileThemeRuntime() {
  const { setTheme } = useTheme();
  const colorMode = useUnifiedStore((state) => state.data.settings.ui?.colorMode);

  useLayoutEffect(() => {
    const normalized = normalizeColorModePreference(colorMode);
    const releaseTransitions = suppressDocumentThemeTransitions();
    const stopSync = syncDocumentColorModeClass(normalized);
    setTheme(normalized);
    releaseTransitions();
    return stopSync;
  }, [colorMode, setTheme]);

  return null;
}

function MobileRuntime({ platform }: { platform: MobilePlatformHooks }) {
  const { language } = useI18n();
  const fontSize = useUIStore((state) => state.fontSize);
  const initializeNotesRoot = useNotesRootStore((state) => state.initialize);
  const openNotesRoot = useNotesRootStore((state) => state.openNotesRoot);
  const loadUnifiedStore = useUnifiedStore((state) => state.load);

  useDocumentLanguage(language);
  useSyncInit();
  useUnifiedExternalSync();
  useAIStoreRuntimeEffects();

  useLayoutEffect(() => {
    applyMarkdownFontSize(fontSize);
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.dataset.mobileApp = 'true';
    document.body.dataset.mobileApp = 'true';
    return () => {
      delete document.documentElement.dataset.mobileApp;
      delete document.body.dataset.mobileApp;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await Promise.allSettled([
          loadUnifiedStore(),
          Promise.resolve(initializeNotesRoot()),
        ]);
        if (cancelled) return;
        if (!useNotesRootStore.getState().currentNotesRoot) {
          await openNotesRoot(MOBILE_NOTES_ROOT, 'Vlaina');
        }
      } finally {
        if (!cancelled) await platform.onReady?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initializeNotesRoot, loadUnifiedStore, openNotesRoot, platform]);

  return null;
}

export function MobileProviders({ children, platform }: MobileProvidersProps) {
  return (
    <ThemeProvider>
      <MobileThemeRuntime />
      <MarkdownThemeLoader />
      <ErrorBoundary>
        <MobileRuntime platform={platform} />
        {children}
        <ToastContainer />
      </ErrorBoundary>
    </ThemeProvider>
  );
}
