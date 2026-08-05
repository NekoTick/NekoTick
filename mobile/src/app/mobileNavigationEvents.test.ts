import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MOBILE_BACK_REQUEST_EVENT,
  MOBILE_URL_OPEN_EVENT,
  installMobileNavigationEventConsumers,
  type MobileNavigationActions,
  type MobileNavigationState,
} from './mobileNavigationEvents';

const NOTES_STATE: MobileNavigationState = {
  activeView: 'notes',
  loginOpen: false,
  settingsOpen: false,
  accountOpen: false,
  moreOpen: false,
  sidebarOpen: false,
};

const disposers: Array<() => void> = [];

function install(
  state: Partial<MobileNavigationState> = {},
): MobileNavigationActions & { dispose: () => void } {
  const actions: MobileNavigationActions = {
    closeLogin: vi.fn(),
    closeSettings: vi.fn(),
    closeAccount: vi.fn(),
    closeMore: vi.fn(),
    closeSidebar: vi.fn(),
    changeView: vi.fn(),
  };
  const dispose = installMobileNavigationEventConsumers(
    { ...NOTES_STATE, ...state },
    actions,
  );
  disposers.push(dispose);
  return { ...actions, dispose };
}

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
});

describe('mobile navigation event consumers', () => {
  it.each([
    [{ loginOpen: true, settingsOpen: true }, 'closeLogin'],
    [{ settingsOpen: true, accountOpen: true }, 'closeSettings'],
    [{ accountOpen: true, moreOpen: true }, 'closeAccount'],
    [{ moreOpen: true, sidebarOpen: true }, 'closeMore'],
    [{ sidebarOpen: true, activeView: 'chat' }, 'closeSidebar'],
  ] as const)('closes only the top mobile layer for %o', (state, actionName) => {
    const actions = install(state);
    const request = new Event(MOBILE_BACK_REQUEST_EVENT, { cancelable: true });

    expect(window.dispatchEvent(request)).toBe(false);
    expect(actions[actionName]).toHaveBeenCalledOnce();
    expect(Object.values(actions).filter((action) => vi.isMockFunction(action))
      .reduce((calls, action) => calls + action.mock.calls.length, 0)).toBe(1);
  });

  it('returns a non-notes view to Notes before allowing system exit', () => {
    const actions = install({ activeView: 'graph' });
    const request = new Event(MOBILE_BACK_REQUEST_EVENT, { cancelable: true });

    expect(window.dispatchEvent(request)).toBe(false);
    expect(actions.changeView).toHaveBeenCalledWith('notes');
  });

  it('leaves an unobstructed Notes back request unconsumed', () => {
    install();
    const request = new Event(MOBILE_BACK_REQUEST_EVENT, { cancelable: true });

    expect(window.dispatchEvent(request)).toBe(true);
    expect(request.defaultPrevented).toBe(false);
  });

  it('routes valid mobile URLs and ignores invalid URLs', () => {
    const actions = install();

    window.dispatchEvent(new CustomEvent(MOBILE_URL_OPEN_EVENT, {
      detail: { url: 'vlaina://open/whiteboard' },
    }));
    window.dispatchEvent(new CustomEvent(MOBILE_URL_OPEN_EVENT, {
      detail: { url: 'https://example.test/graph' },
    }));

    expect(actions.changeView).toHaveBeenCalledOnce();
    expect(actions.changeView).toHaveBeenCalledWith('whiteboard');
  });
});
