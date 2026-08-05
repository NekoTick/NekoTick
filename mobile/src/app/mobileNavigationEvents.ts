import { parseMobileDeepLink } from './mobileDeepLinks';
import type { MobileViewMode } from './mobilePlatform';

export const MOBILE_BACK_REQUEST_EVENT = 'vlaina:mobile-back-request';
export const MOBILE_URL_OPEN_EVENT = 'vlaina:mobile-url-open';

export interface MobileUrlOpenDetail {
  url: string;
}

export interface MobileNavigationState {
  activeView: MobileViewMode;
  loginOpen: boolean;
  settingsOpen: boolean;
  accountOpen: boolean;
  moreOpen: boolean;
  sidebarOpen: boolean;
}

export interface MobileNavigationActions {
  closeLogin: () => void;
  closeSettings: () => void;
  closeAccount: () => void;
  closeMore: () => void;
  closeSidebar: () => void;
  changeView: (view: MobileViewMode) => void;
}

export function installMobileNavigationEventConsumers(
  state: MobileNavigationState,
  actions: MobileNavigationActions,
): () => void {
  const handleBack = (event: Event) => {
    if (state.loginOpen) {
      event.preventDefault();
      actions.closeLogin();
    } else if (state.settingsOpen) {
      event.preventDefault();
      actions.closeSettings();
    } else if (state.accountOpen) {
      event.preventDefault();
      actions.closeAccount();
    } else if (state.moreOpen) {
      event.preventDefault();
      actions.closeMore();
    } else if (state.sidebarOpen) {
      event.preventDefault();
      actions.closeSidebar();
    } else if (state.activeView !== 'notes') {
      event.preventDefault();
      actions.changeView('notes');
    }
  };

  const handleOpenUrl = (event: Event) => {
    const detail = (event as CustomEvent<MobileUrlOpenDetail>).detail;
    const route = parseMobileDeepLink(detail?.url ?? '');
    if (route) actions.changeView(route.view);
  };

  window.addEventListener(MOBILE_BACK_REQUEST_EVENT, handleBack);
  window.addEventListener(MOBILE_URL_OPEN_EVENT, handleOpenUrl);
  return () => {
    window.removeEventListener(MOBILE_BACK_REQUEST_EVENT, handleBack);
    window.removeEventListener(MOBILE_URL_OPEN_EVENT, handleOpenUrl);
  };
}
