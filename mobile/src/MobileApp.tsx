import { useCallback, useEffect, useState } from 'react';
import { AccountLoginDialog } from '@/components/layout/AccountLoginDialog';
import {
  OPEN_SETTINGS_EVENT,
  REQUEST_CLOSE_SETTINGS_EVENT,
  resolveSettingsOpenTab,
  type OpenSettingsDetail,
  type SettingsOpenTab,
} from '@/components/Settings/settingsEvents';
import { ACCOUNT_LOGIN_REQUESTED_EVENT } from '@/lib/account/sessionEvent';
import { flushCurrentPendingEditorMarkdown } from '@/stores/notes/pendingEditorMarkdownFlusher';
import { useAccountSessionStore } from '@/stores/accountSession';
import { useNotesStore } from '@/stores/useNotesStore';
import { useUIStore, type AppViewMode } from '@/stores/uiSlice';
import {
  installMobileNavigationEventConsumers,
} from './app/mobileNavigationEvents';
import { MobileProviders } from './app/MobileProviders';
import {
  getMobilePlatformHooks,
  type MobilePlatformHooks,
  type MobileViewMode,
} from './app/mobilePlatform';
import { MobileMoreSheet } from './components/MobileMoreSheet';
import { MobileSidebarSheet } from './components/MobileSidebarSheet';
import { MobileTopBar } from './components/MobileTopBar';
import { MobileAccountScreen } from './screens/MobileAccountScreen';
import { MobileMainView } from './screens/MobileMainView';
import { MobileSettingsScreen } from './screens/MobileSettingsScreen';

function isMobileViewMode(view: AppViewMode): view is MobileViewMode {
  return view === 'notes' || view === 'chat' || view === 'whiteboard' || view === 'graph';
}

interface MobileAppProps {
  platform?: MobilePlatformHooks;
}

export function MobileApp({ platform }: MobileAppProps) {
  const [defaultPlatform] = useState(getMobilePlatformHooks);
  const resolvedPlatform = platform ?? defaultPlatform;
  const appViewMode = useUIStore((state) => state.appViewMode);
  const setAppViewMode = useUIStore((state) => state.setAppViewMode);
  const currentNotePath = useNotesStore((state) => state.currentNote?.path ?? null);
  const isConnected = useAccountSessionStore((state) => state.isConnected);
  const activeView: MobileViewMode = isMobileViewMode(appViewMode) ? appViewMode : 'notes';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsOpenTab>();
  const [accountOpen, setAccountOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const requestCloseSettings = useCallback(() => {
    window.dispatchEvent(new Event(REQUEST_CLOSE_SETTINGS_EVENT));
  }, []);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);

  const openSettings = useCallback((tab?: SettingsOpenTab) => {
    setSidebarOpen(false);
    setMoreOpen(false);
    setAccountOpen(false);
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  const openAccount = useCallback(() => {
    setSidebarOpen(false);
    setMoreOpen(false);
    if (useAccountSessionStore.getState().isConnected) {
      setAccountOpen(true);
    } else {
      setLoginOpen(true);
    }
  }, []);

  const changeView = useCallback((view: MobileViewMode) => {
    flushCurrentPendingEditorMarkdown();
    closeSidebar();
    closeMore();
    setAppViewMode(view);
  }, [closeMore, closeSidebar, setAppViewMode]);

  const createNote = useCallback(() => {
    void useNotesStore.getState().createNote(undefined, { asDraft: true });
  }, []);

  const shareCurrentNote = useCallback(() => {
    if (!resolvedPlatform.share) return;
    flushCurrentPendingEditorMarkdown();
    const note = useNotesStore.getState().currentNote;
    if (!note) return;
    const title = note.path.split('/').pop()?.replace(/\.md$/i, '') || 'Vlaina';
    void resolvedPlatform.share({ title, text: note.content }).catch(() => undefined);
  }, [resolvedPlatform]);

  useEffect(() => {
    if (!isMobileViewMode(appViewMode)) setAppViewMode('notes');
  }, [appViewMode, setAppViewMode]);

  useEffect(() => {
    resolvedPlatform.onViewChange?.(activeView);
  }, [activeView, resolvedPlatform]);

  useEffect(() => {
    return installMobileNavigationEventConsumers(
      { activeView, loginOpen, settingsOpen, accountOpen, moreOpen, sidebarOpen },
      {
        closeLogin,
        closeSettings: requestCloseSettings,
        closeAccount,
        closeMore,
        closeSidebar,
        changeView,
      },
    );
  }, [
    accountOpen,
    activeView,
    changeView,
    closeAccount,
    closeLogin,
    closeMore,
    closeSidebar,
    loginOpen,
    requestCloseSettings,
    settingsOpen,
    sidebarOpen,
    moreOpen,
  ]);

  useEffect(() => {
    const handleOpenSettings = (event: Event) => {
      const requested = resolveSettingsOpenTab(
        (event as CustomEvent<OpenSettingsDetail>).detail?.tab,
      );
      openSettings(requested ?? undefined);
    };
    const handleOpenLogin = () => setLoginOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings);
    window.addEventListener(ACCOUNT_LOGIN_REQUESTED_EVENT, handleOpenLogin);
    return () => {
      window.removeEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings);
      window.removeEventListener(ACCOUNT_LOGIN_REQUESTED_EVENT, handleOpenLogin);
    };
  }, [openSettings]);

  useEffect(() => {
    if (isConnected) setLoginOpen(false);
  }, [isConnected]);

  return (
    <MobileProviders platform={resolvedPlatform}>
      <div className="mobile-app" data-active-view={activeView}>
        <MobileTopBar
          activeView={activeView}
          onOpenSidebar={() => setSidebarOpen(true)}
          onViewChange={changeView}
        />
        <MobileMainView activeView={activeView} onCreateNote={createNote} />

        <MobileSidebarSheet
          activeView={activeView}
          open={sidebarOpen}
          onClose={closeSidebar}
          onOpenMore={() => {
            closeSidebar();
            setMoreOpen(true);
          }}
        />
        <MobileMoreSheet
          open={moreOpen}
          onClose={closeMore}
          onOpenAccount={openAccount}
          onOpenSettings={() => openSettings()}
          onShare={activeView === 'notes' && currentNotePath ? shareCurrentNote : undefined}
        />
        <MobileSettingsScreen
          open={settingsOpen}
          requestedTab={settingsTab}
          onClose={closeSettings}
        />
        <MobileAccountScreen
          open={accountOpen}
          onClose={closeAccount}
          onSwitchAccount={() => {
            closeAccount();
            setLoginOpen(true);
          }}
        />
        <AccountLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </div>
    </MobileProviders>
  );
}
