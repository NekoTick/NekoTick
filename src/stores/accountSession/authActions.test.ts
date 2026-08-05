import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasElectronDesktopBridge: vi.fn(),
  accountCommands: {
    getAccountSessionStatus: vi.fn(),
    accountAuth: vi.fn(),
    requestEmailAuthCode: vi.fn(),
    verifyEmailAuthCode: vi.fn(),
    accountDisconnect: vi.fn(),
    cancelAccountAuth: vi.fn(),
    getAuthDebugLog: vi.fn(),
  },
  webAccountCommands: {
    probeStatus: vi.fn(),
    startAuth: vi.fn(),
    requestEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
    completeAuth: vi.fn(),
    disconnect: vi.fn(),
    clearLocalSession: vi.fn(),
    handleAuthCallback: vi.fn(),
  },
  normalizeAccountProvider: vi.fn((value) => value ?? null),
  isOauthAccountProvider: vi.fn((value) => value === 'google'),
  persistUser: vi.fn(),
  refreshAvatar: vi.fn().mockResolvedValue(undefined),
  broadcastAccountStatusRefresh: vi.fn(),
  clearPersistedUser: vi.fn(),
  clearAuthIntent: vi.fn(() => {
    sessionStorage.removeItem('vlaina_auth_state');
    sessionStorage.removeItem('vlaina_auth_provider');
  }),
  isEmailCodeRequestCooldownError: vi.fn((value: string) => /please wait.*before request/i.test(value)),
  normalizeAuthError: vi.fn((value: string) => `normalized:${value}`),
  normalizePersistedUser: vi.fn((value: Record<string, unknown>) => ({
    isConnected: value?.isConnected === true,
    provider: value?.provider === 'google' || value?.provider === 'email' ? value.provider : null,
    username:
      typeof value?.username === 'string' && value.username.length <= 256 && value.username.trim()
        ? value.username.trim()
        : null,
    primaryEmail:
      typeof value?.primaryEmail === 'string' && value.primaryEmail.length <= 320 && value.primaryEmail.trim()
        ? value.primaryEmail.trim()
        : null,
    avatarUrl:
      typeof value?.avatarUrl === 'string' &&
      value.avatarUrl.length <= 4096 &&
      /^https:\/\/(?!127\.0\.0\.1|localhost)/i.test(value.avatarUrl.trim())
        ? value.avatarUrl.trim()
        : null,
    membershipTier:
      value?.membershipTier === 'free' ||
      value?.membershipTier === 'plus' ||
      value?.membershipTier === 'pro' ||
      value?.membershipTier === 'max' ||
      value?.membershipTier === 'ultra'
        ? value.membershipTier
        : null,
    membershipName:
      typeof value?.membershipName === 'string' && value.membershipName.length <= 128 && value.membershipName.trim()
        ? value.membershipName.trim()
        : null,
  })),
  applyDisconnectedAccount: vi.fn(),
  normalizeManagedBudgetPayload: vi.fn((value: unknown) => value),
  applyBudgetSnapshot: vi.fn(),
  refreshBudget: vi.fn().mockResolvedValue(undefined),
  refreshBudgetIfStale: vi.fn().mockResolvedValue(undefined),
  clearBudget: vi.fn(),
  managedBudget: null as { active: boolean; usedPercent: number; remainingPercent: number; status: string } | null,
  getEffectiveAppLanguage: vi.fn(() => 'zh-CN'),
  useUIStoreGetState: vi.fn(() => ({ languagePreference: 'zh-CN' })),
}));

vi.mock('@/lib/desktop/backend', () => ({
  hasElectronDesktopBridge: mocks.hasElectronDesktopBridge,
}));

vi.mock('@/lib/account/desktopCommands', () => ({
  accountCommands: mocks.accountCommands,
}));

vi.mock('@/lib/account/webCommands', () => ({
  webAccountCommands: mocks.webAccountCommands,
  handleAuthCallback: mocks.webAccountCommands.handleAuthCallback,
}));

vi.mock('@/lib/account/provider', () => ({
  normalizeAccountProvider: mocks.normalizeAccountProvider,
  isOauthAccountProvider: mocks.isOauthAccountProvider,
}));

vi.mock('./authSupport', () => ({
  AUTH_PROVIDER_STORAGE_KEY: 'vlaina_auth_provider',
  AUTH_STATE_STORAGE_KEY: 'vlaina_auth_state',
  broadcastAccountStatusRefresh: mocks.broadcastAccountStatusRefresh,
  persistUser: mocks.persistUser,
  refreshAvatar: mocks.refreshAvatar,
  clearPersistedUser: mocks.clearPersistedUser,
  clearAuthIntent: mocks.clearAuthIntent,
  isEmailCodeRequestCooldownError: mocks.isEmailCodeRequestCooldownError,
  normalizeAuthError: mocks.normalizeAuthError,
  normalizePersistedUser: mocks.normalizePersistedUser,
}));

vi.mock('./sessionState', () => ({
  applyDisconnectedAccount: mocks.applyDisconnectedAccount,
}));

vi.mock('@/lib/ai/managed/normalizers', () => ({
  normalizeManagedBudgetPayload: mocks.normalizeManagedBudgetPayload,
}));

vi.mock('@/stores/useManagedAIStore', () => ({
  clearManagedBudgetUnlessQuotaExhausted: () => {
    const budget = mocks.managedBudget;
    if (
      budget &&
      (budget.active === false || budget.status === 'exhausted' || budget.remainingPercent <= 0)
    ) {
      return;
    }
    mocks.clearBudget();
  },
  useManagedAIStore: {
    getState: vi.fn(() => ({
      applyBudgetSnapshot: mocks.applyBudgetSnapshot,
      refreshBudget: mocks.refreshBudget,
      refreshBudgetIfStale: mocks.refreshBudgetIfStale,
      clearBudget: mocks.clearBudget,
      budget: mocks.managedBudget,
    })),
  },
}));

vi.mock('@/lib/i18n/languages', () => ({
  getEffectiveAppLanguage: mocks.getEffectiveAppLanguage,
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: {
    getState: mocks.useUIStoreGetState,
  },
}));

import {
  createCheckStatus,
  createHandleAuthCallback,
  createRequestEmailCode,
  createCancelConnect,
  createSignIn,
  createSignOut,
  invalidateAccountSessionAuthState,
  selectRelevantElectronAuthEntries,
  createVerifyEmailCode,
} from './authActions';

describe('accountSession auth actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    Object.values(mocks.accountCommands).forEach((fn) => fn.mockReset());
    Object.values(mocks.webAccountCommands).forEach((fn) => fn.mockReset());
    mocks.hasElectronDesktopBridge.mockReset();
    mocks.normalizeAccountProvider.mockClear();
    mocks.isOauthAccountProvider.mockClear();
    mocks.persistUser.mockClear();
    mocks.refreshAvatar.mockClear();
    mocks.refreshAvatar.mockResolvedValue(undefined);
    mocks.broadcastAccountStatusRefresh.mockClear();
    mocks.clearPersistedUser.mockClear();
    mocks.clearAuthIntent.mockClear();
    mocks.isEmailCodeRequestCooldownError.mockClear();
    mocks.isEmailCodeRequestCooldownError.mockImplementation((value: string) => /please wait.*before request/i.test(value));
    mocks.normalizeAuthError.mockClear();
    mocks.applyDisconnectedAccount.mockClear();
    mocks.normalizeManagedBudgetPayload.mockClear();
    mocks.applyBudgetSnapshot.mockClear();
    mocks.refreshBudget.mockClear();
    mocks.refreshBudgetIfStale.mockClear();
    mocks.clearBudget.mockClear();
    mocks.managedBudget = null;
    mocks.getEffectiveAppLanguage.mockClear();
    mocks.getEffectiveAppLanguage.mockReturnValue('zh-CN');
    mocks.useUIStoreGetState.mockClear();
    mocks.useUIStoreGetState.mockReturnValue({ languagePreference: 'zh-CN' });
    vi.stubGlobal('console', {
      ...console,
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('checkStatus persists connected desktop identities and refreshes avatar', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      membershipTier: 'pro',
      membershipName: 'Pro',
      budget: {
        active: true,
        usedPercent: 25,
        remainingPercent: 75,
        status: 'normal',
      },
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ error: 'stale error' }));

    await createCheckStatus(set as never, get as never)();

    expect(set).toHaveBeenNthCalledWith(1, { isLoading: true });
    expect(set).toHaveBeenNthCalledWith(2, {
      isConnected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      membershipTier: 'pro',
      membershipName: 'Pro',
      isLoading: false,
      hasCheckedStatus: true,
      error: null,
    });
    expect(mocks.persistUser).toHaveBeenCalledWith({
      isConnected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      membershipTier: 'pro',
      membershipName: 'Pro',
    });
    expect(mocks.normalizeManagedBudgetPayload).toHaveBeenCalledWith({
      active: true,
      usedPercent: 25,
      remainingPercent: 75,
      status: 'normal',
    });
    expect(mocks.applyBudgetSnapshot).toHaveBeenCalledWith({
      active: true,
      usedPercent: 25,
      remainingPercent: 75,
      status: 'normal',
    });
    expect(mocks.refreshBudget).not.toHaveBeenCalled();
    expect(mocks.refreshBudgetIfStale).not.toHaveBeenCalled();
    expect(mocks.refreshAvatar).toHaveBeenCalledWith(
      set,
      get,
      'vla',
      'https://example.com/avatar.png',
    );
  });

  it('checkStatus normalizes status identity before storing it', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: true,
      provider: 'google',
      username: ' vla ',
      primaryEmail: ' vla@example.com ',
      avatarUrl: 'http://127.0.0.1/avatar.png',
      membershipTier: 'pro',
      membershipName: 'P'.repeat(129),
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ error: null }));

    await createCheckStatus(set as never, get as never)();

    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      membershipName: null,
    }));
    expect(mocks.persistUser).toHaveBeenCalledWith(expect.objectContaining({
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      membershipName: null,
    }));
    expect(mocks.refreshAvatar).toHaveBeenCalledWith(set, get, 'vla', null);
  });

  it('checkStatus does not persist temporary desktop account identities', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      membershipTier: 'free',
      membershipName: 'Free',
      persistent: false,
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ error: null }));

    await createCheckStatus(set as never, get as never)();

    expect(mocks.clearPersistedUser).toHaveBeenCalledTimes(1);
    expect(mocks.broadcastAccountStatusRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.persistUser).not.toHaveBeenCalled();
    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({
      isConnected: true,
      username: 'vla',
      isLoading: false,
    }));
  });

  it('checkStatus preserves the current account state when probing throws', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    mocks.webAccountCommands.probeStatus.mockRejectedValue(new Error('boom'));

    const set = vi.fn();
    const get = vi.fn(() => ({ error: null }));

    await createCheckStatus(set as never, get as never)();

    expect(set).toHaveBeenLastCalledWith({ isLoading: false, hasCheckedStatus: true });
    expect(mocks.applyDisconnectedAccount).not.toHaveBeenCalled();
  });

  it('starts a background budget refresh when connected status has no budget payload', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: 'Pro',
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ error: null }));

    await createCheckStatus(set as never, get as never)();

    expect(mocks.refreshBudgetIfStale).toHaveBeenCalledTimes(1);
    expect(mocks.refreshBudget).not.toHaveBeenCalled();
  });

  it('force-refreshes managed budget on explicit billing returns even when status has no budget payload', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: 'Pro',
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ error: null }));

    await createCheckStatus(set as never, get as never)({ refreshBudget: 'force' });

    expect(mocks.refreshBudget).toHaveBeenCalledTimes(1);
    expect(mocks.refreshBudgetIfStale).not.toHaveBeenCalled();
  });

  it('force-refreshes budget when the session budget is missing its percentage', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.normalizeManagedBudgetPayload.mockReturnValueOnce({
      active: true,
      usedPercent: 10,
      remainingPercent: Number.NaN,
      status: 'active',
    });
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: 'Pro',
      budget: {
        active: true,
        usedPercent: 10,
        status: 'active',
      },
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ error: null }));

    await createCheckStatus(set as never, get as never)();

    expect(mocks.applyBudgetSnapshot).toHaveBeenCalledWith({
      active: true,
      usedPercent: 10,
      remainingPercent: Number.NaN,
      status: 'active',
    });
    expect(mocks.refreshBudget).toHaveBeenCalledTimes(1);
    expect(mocks.refreshBudgetIfStale).not.toHaveBeenCalled();
  });

  it('does not treat null normalized remaining percentage as a complete budget', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.normalizeManagedBudgetPayload.mockReturnValueOnce({
      active: true,
      usedPercent: 10,
      remainingPercent: null,
      status: 'active',
    });
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: 'Pro',
      budget: {
        active: true,
        usedPercent: 10,
        status: 'active',
      },
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ error: null }));

    await createCheckStatus(set as never, get as never)();

    expect(mocks.refreshBudget).toHaveBeenCalledTimes(1);
    expect(mocks.refreshBudgetIfStale).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent status checks for the same account session version', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    let resolveStatus!: (value: unknown) => void;
    mocks.accountCommands.getAccountSessionStatus.mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );

    const set = vi.fn();
    const get = vi.fn(() => ({ error: null, isConnected: false }));
    const checkStatus = createCheckStatus(set as never, get as never);

    const first = checkStatus();
    const second = checkStatus();

    expect(mocks.accountCommands.getAccountSessionStatus).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ isLoading: true });

    resolveStatus({
      connected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      membershipTier: 'ultra',
      membershipName: 'Ultra',
    });

    await Promise.all([first, second]);

    expect(mocks.persistUser).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({
      isConnected: true,
      username: 'vla',
      membershipTier: 'ultra',
      isLoading: false,
    }));
  });

  it('skips non-forced status checks while the current status is fresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_900_000_000_000);
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: 'Pro',
    });

    const state = { error: null, hasCheckedStatus: false };
    const set = vi.fn((updates: Record<string, unknown>) => {
      Object.assign(state, updates);
    });
    const get = vi.fn(() => state);
    const checkStatus = createCheckStatus(set as never, get as never);

    await checkStatus();
    await checkStatus();
    await checkStatus({ force: true });

    expect(mocks.accountCommands.getAccountSessionStatus).toHaveBeenCalledTimes(2);
  });

  it('checkStatus preserves an existing account when probing reports disconnected', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: false,
      provider: null,
      username: null,
      primaryEmail: null,
      avatarUrl: null,
      membershipTier: null,
      membershipName: null,
    });

    const set = vi.fn();
    const get = vi.fn(() => ({
      isConnected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      membershipTier: 'pro',
      membershipName: 'Pro',
      error: null,
    }));

    await createCheckStatus(set as never, get as never)();

    expect(set).toHaveBeenNthCalledWith(1, { isLoading: true });
    expect(set).toHaveBeenNthCalledWith(2, { isLoading: false, hasCheckedStatus: true });
    expect(mocks.persistUser).not.toHaveBeenCalled();
    expect(mocks.refreshAvatar).not.toHaveBeenCalled();
    expect(mocks.applyDisconnectedAccount).not.toHaveBeenCalled();
    expect(mocks.clearBudget).not.toHaveBeenCalled();
  });

  it('clears budget when status reports disconnected and no account is currently connected', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: false,
      provider: null,
      username: null,
      primaryEmail: null,
      avatarUrl: null,
      membershipTier: null,
      membershipName: null,
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ isConnected: false, error: null }));

    await createCheckStatus(set as never, get as never)();

    expect(mocks.clearBudget).toHaveBeenCalledTimes(1);
    expect(mocks.refreshBudget).not.toHaveBeenCalled();
    expect(mocks.refreshBudgetIfStale).not.toHaveBeenCalled();
  });

  it('preserves an exhausted budget when a disconnected focus probe has no current account', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: false,
      provider: null,
      username: null,
      primaryEmail: null,
      avatarUrl: null,
      membershipTier: null,
      membershipName: null,
    });
    mocks.managedBudget = {
      active: false,
      usedPercent: 100,
      remainingPercent: 0,
      status: 'exhausted',
    };

    const set = vi.fn();
    const get = vi.fn(() => ({ isConnected: false, error: null }));

    await createCheckStatus(set as never, get as never)();

    expect(mocks.clearBudget).not.toHaveBeenCalled();
    expect(mocks.refreshBudget).not.toHaveBeenCalled();
    expect(mocks.refreshBudgetIfStale).not.toHaveBeenCalled();
  });

  it('disconnects and clears budget when the desktop session is invalidated', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: false,
      provider: null,
      username: null,
      primaryEmail: null,
      avatarUrl: null,
      membershipTier: null,
      membershipName: null,
      sessionInvalidated: true,
    });

    const set = vi.fn();
    const get = vi.fn(() => ({
      isConnected: true,
      membershipTier: null,
      error: null,
    }));

    await createCheckStatus(set as never, get as never)();

    expect(mocks.applyDisconnectedAccount).toHaveBeenCalledWith(set);
    expect(mocks.clearBudget).toHaveBeenCalledTimes(1);
    expect(mocks.persistUser).not.toHaveBeenCalled();
    expect(mocks.refreshAvatar).not.toHaveBeenCalled();
  });

  it('shows a localized explanation when the desktop session is evicted by the device limit', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.getAccountSessionStatus.mockResolvedValue({
      connected: false,
      provider: null,
      username: null,
      primaryEmail: null,
      avatarUrl: null,
      membershipTier: null,
      membershipName: null,
      sessionInvalidated: true,
      sessionInvalidationReason: 'device_limit',
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ isConnected: true, error: null }));

    await createCheckStatus(set as never, get as never)();

    expect(mocks.applyDisconnectedAccount).toHaveBeenCalledWith(set);
    expect(set).toHaveBeenCalledWith({
      error: '๑ᵒᯅᵒ๑ 登录设备已达到 5 台上限，此设备已退出。请重新登录以继续使用。',
    });
  });

  it('ignores an in-flight status probe after sign-out invalidates the account session', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    let resolveStatus!: (value: unknown) => void;
    mocks.accountCommands.getAccountSessionStatus.mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );
    mocks.accountCommands.accountDisconnect.mockResolvedValue(undefined);

    const set = vi.fn();
    const get = vi.fn(() => ({ error: null, isConnected: true }));
    const checkStatus = createCheckStatus(set as never, get as never);
    const signOut = createSignOut(set as never, get as never);

    const checkPromise = checkStatus();
    await signOut();

    resolveStatus({
      connected: true,
      provider: 'google',
      username: 'stale',
      primaryEmail: 'stale@example.com',
      avatarUrl: 'https://example.com/stale.png',
      membershipTier: 'pro',
      membershipName: 'Pro',
    });
    await checkPromise;

    expect(mocks.applyDisconnectedAccount).toHaveBeenCalledWith(set);
    expect(mocks.persistUser).not.toHaveBeenCalled();
    expect(mocks.refreshAvatar).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ isLoading: false }));
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({
      isConnected: true,
      username: 'stale',
    }));
  });

  it('signIn stores web auth intent and redirects on successful web auth start', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    mocks.webAccountCommands.startAuth.mockResolvedValue({
      authUrl: '#auth-callback-test',
      state: 'state-123',
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ isConnecting: true }));
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    const result = await createSignIn(set as never, get as never)('google');

    expect(result).toBe(true);
    expect(sessionStorage.getItem('vlaina_auth_state')).toBe('state-123');
    expect(sessionStorage.getItem('vlaina_auth_provider')).toBe('google');
    expect(window.location.hash).toBe('#auth-callback-test');
    expect(set).toHaveBeenCalledWith({ isConnecting: true, error: null });
    expect(setTimeoutSpy).toHaveBeenCalled();
  });

  it('signIn rejects oversized web auth state before storing intent', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    mocks.webAccountCommands.startAuth.mockResolvedValue({
      authUrl: '#auth-callback-oversized-state',
      state: 'x'.repeat(4097),
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ isConnecting: true }));
    const initialHash = window.location.hash;

    const result = await createSignIn(set as never, get as never)('google');

    expect(result).toBe(false);
    expect(sessionStorage.getItem('vlaina_auth_state')).toBeNull();
    expect(sessionStorage.getItem('vlaina_auth_provider')).toBeNull();
    expect(window.location.hash).toBe(initialHash);
    expect(mocks.normalizeAuthError).toHaveBeenCalledWith('Failed to start account sign-in');
    expect(set).toHaveBeenLastCalledWith({
      error: 'normalized:Failed to start account sign-in',
      isConnecting: false,
    });
  });

  it.each([
    ['javascript URL', 'javascript:alert(1)'],
    ['credentialed URL', 'https://user:pass@accounts.example.com/oauth'],
    ['local-network URL', 'http://127.0.0.1:3000/oauth'],
    ['oversized URL before trim', `${' '.repeat(4097)}#auth-callback`],
  ])('signIn rejects unsafe web auth redirect %s before storing intent', async (_label, authUrl) => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    mocks.webAccountCommands.startAuth.mockResolvedValue({
      authUrl,
      state: 'state-123',
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ isConnecting: true }));
    const initialHash = window.location.hash;

    const result = await createSignIn(set as never, get as never)('google');

    expect(result).toBe(false);
    expect(sessionStorage.getItem('vlaina_auth_state')).toBeNull();
    expect(sessionStorage.getItem('vlaina_auth_provider')).toBeNull();
    expect(window.location.hash).toBe(initialHash);
    expect(mocks.normalizeAuthError).toHaveBeenCalledWith('Failed to start account sign-in');
    expect(set).toHaveBeenLastCalledWith({
      error: 'normalized:Failed to start account sign-in',
      isConnecting: false,
    });
  });

  it('signIn does not redirect when web auth intent cannot be stored', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    mocks.webAccountCommands.startAuth.mockResolvedValue({
      authUrl: '#auth-callback-storage-fail',
      state: 'state-123',
    });
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error('storage unavailable');
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

    const set = vi.fn();
    const get = vi.fn(() => ({ isConnecting: true }));
    const initialHash = window.location.hash;

    const result = await createSignIn(set as never, get as never)('google');

    expect(result).toBe(false);
    expect(window.location.hash).toBe(initialHash);
    expect(mocks.normalizeAuthError).toHaveBeenCalledWith('Unable to store sign-in state in this browser session');
    expect(set).toHaveBeenLastCalledWith({
      error: 'normalized:Unable to store sign-in state in this browser session',
      isConnecting: false,
    });
  });

  it('signIn normalizes electron auth failures without checking status', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.accountAuth.mockResolvedValue({
      success: false,
      error: 'missing session token',
    });
    const checkStatus = vi.fn();
    const set = vi.fn();
    const get = vi.fn(() => ({ isConnecting: true, checkStatus }));

    const result = await createSignIn(set as never, get as never)('google');

    expect(result).toBe(false);
    expect(checkStatus).not.toHaveBeenCalled();
    expect(mocks.normalizeAuthError).toHaveBeenCalledWith('missing session token');
    expect(set).toHaveBeenLastCalledWith({
      error: 'normalized:missing session token',
      isConnecting: false,
    });
  });

  it('signIn applies successful desktop auth before the status refresh finishes', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.accountAuth.mockResolvedValue({
      success: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      error: null,
    });
    let resolveStatus!: () => void;
    const statusPromise = new Promise<void>((resolve) => {
      resolveStatus = resolve;
    });
    const checkStatus = vi.fn(() => statusPromise);
    const set = vi.fn();
    const get = vi.fn(() => ({ isConnecting: true, checkStatus }));

    const result = await createSignIn(set as never, get as never)('google');

    expect(result).toBe(true);
    expect(checkStatus).toHaveBeenCalledWith({ force: true });
    expect(set).toHaveBeenLastCalledWith({
      isConnected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      membershipTier: null,
      membershipName: null,
      isConnecting: false,
      isLoading: false,
      hasCheckedStatus: true,
      error: null,
    });
    expect(mocks.persistUser).toHaveBeenCalledWith({
      isConnected: true,
      provider: 'google',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      membershipTier: null,
      membershipName: null,
    });

    resolveStatus();
    await statusPromise;
  });

  it('signIn clears desktop auth cancellation without showing an error', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.accountAuth.mockResolvedValue({
      success: false,
      error: 'Authorization cancelled',
    });
    const checkStatus = vi.fn();
    const set = vi.fn();
    const get = vi.fn(() => ({ isConnecting: true, checkStatus }));

    const result = await createSignIn(set as never, get as never)('google');

    expect(result).toBe(false);
    expect(checkStatus).not.toHaveBeenCalled();
    expect(mocks.normalizeAuthError).not.toHaveBeenCalledWith('Authorization cancelled');
    expect(set).toHaveBeenLastCalledWith({
      error: null,
      isConnecting: false,
    });
  });

  it('signIn cancels pending desktop auth when the desktop timeout expires', async () => {
    vi.useFakeTimers();
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.accountAuth.mockReturnValue(new Promise(() => undefined));
    mocks.accountCommands.cancelAccountAuth.mockResolvedValue(true);
    const set = vi.fn();
    const get = vi.fn(() => ({ isConnecting: true }));

    void createSignIn(set as never, get as never)('google');
    await vi.advanceTimersByTimeAsync(300000);

    expect(mocks.accountCommands.cancelAccountAuth).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenLastCalledWith({ isConnecting: false, error: null });
  });

  it('ignores a successful desktop sign-in result after the connection attempt is cancelled', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    let resolveAuth!: (value: unknown) => void;
    mocks.accountCommands.accountAuth.mockReturnValue(
      new Promise((resolve) => {
        resolveAuth = resolve;
      }),
    );
    mocks.accountCommands.cancelAccountAuth.mockResolvedValue(true);
    const checkStatus = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn();
    const get = vi.fn(() => ({ isConnecting: true, checkStatus }));

    const signInPromise = createSignIn(set as never, get as never)('google');
    await createCancelConnect(set as never, get as never)();

    resolveAuth({ success: true });
    await expect(signInPromise).resolves.toBe(false);

    expect(checkStatus).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ isConnecting: false, error: null });
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ error: 'Authorization failed' }));
  });

  it('ignores a successful desktop sign-in result after external auth state invalidation', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    let resolveAuth!: (value: unknown) => void;
    mocks.accountCommands.accountAuth.mockReturnValue(
      new Promise((resolve) => {
        resolveAuth = resolve;
      }),
    );
    const checkStatus = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn();
    const get = vi.fn(() => ({ isConnecting: true, checkStatus }));

    const signInPromise = createSignIn(set as never, get as never)('google');
    invalidateAccountSessionAuthState();

    resolveAuth({ success: true });
    await expect(signInPromise).resolves.toBe(false);

    expect(checkStatus).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalledWith({ isConnecting: false, error: null });
  });

  it('does not let an older desktop sign-in timeout cancel a newer attempt', async () => {
    vi.useFakeTimers();
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.accountAuth.mockReturnValue(new Promise(() => undefined));
    mocks.accountCommands.cancelAccountAuth.mockResolvedValue(true);
    const set = vi.fn();
    const get = vi.fn(() => ({ isConnecting: true }));

    void createSignIn(set as never, get as never)('google');
    void createSignIn(set as never, get as never)('google');
    await vi.advanceTimersByTimeAsync(299999);

    expect(mocks.accountCommands.cancelAccountAuth).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(mocks.accountCommands.cancelAccountAuth).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenLastCalledWith({ isConnecting: false, error: null });
  });

  it('requestEmailCode rejects invalid or duplicate emails before any network call', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    const set = vi.fn();
    const get = vi.fn(() => ({
      isConnected: true,
      primaryEmail: 'vla@example.com',
    }));

    await expect(createRequestEmailCode(set as never, get as never)('bad')).resolves.toBe(false);
    await expect(
      createRequestEmailCode(set as never, get as never)('VLA@example.com')
    ).resolves.toBe(false);

    expect(mocks.webAccountCommands.requestEmailCode).not.toHaveBeenCalled();
    expect(mocks.normalizeAuthError).toHaveBeenCalledWith('Invalid email address');
    expect(mocks.normalizeAuthError).toHaveBeenCalledWith('You are already signed in with this email');
    expect(set).toHaveBeenNthCalledWith(1, { error: 'normalized:Invalid email address' });
    expect(set).toHaveBeenNthCalledWith(2, { error: 'normalized:You are already signed in with this email' });
  });

  it('requestEmailCode rejects oversized emails before trimming them', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    const set = vi.fn();
    const get = vi.fn(() => ({
      isConnected: false,
      primaryEmail: null,
    }));

    await expect(
      createRequestEmailCode(set as never, get as never)(`${' '.repeat(4097)}vla@example.com`)
    ).resolves.toBe(false);

    expect(mocks.webAccountCommands.requestEmailCode).not.toHaveBeenCalled();
    expect(mocks.normalizeAuthError).toHaveBeenCalledWith('Invalid email address');
    expect(set).toHaveBeenLastCalledWith({ error: 'normalized:Invalid email address' });
  });

  it('requestEmailCode sends normalized emails to the account API', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    mocks.webAccountCommands.requestEmailCode.mockResolvedValue(true);
    const set = vi.fn();
    const get = vi.fn(() => ({
      isConnected: false,
      primaryEmail: null,
    }));

    await expect(createRequestEmailCode(set as never, get as never)(' VLA@example.com ')).resolves.toBe(true);

    expect(mocks.webAccountCommands.requestEmailCode).toHaveBeenCalledWith('vla@example.com', 'zh-CN');
  });

  it('requestEmailCode coalesces concurrent requests for the same address', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    let resolveRequest!: (value: boolean) => void;
    mocks.webAccountCommands.requestEmailCode.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    const set = vi.fn();
    const get = vi.fn(() => ({ isConnected: false, primaryEmail: null }));
    const requestEmailCode = createRequestEmailCode(set as never, get as never);

    const first = requestEmailCode(' VLA@example.com ');
    const second = requestEmailCode('vla@example.com');

    expect(mocks.webAccountCommands.requestEmailCode).toHaveBeenCalledTimes(1);
    resolveRequest(true);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(mocks.webAccountCommands.requestEmailCode).toHaveBeenCalledTimes(1);
  });

  it('requestEmailCode sends the current app locale through the desktop bridge', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.useUIStoreGetState.mockReturnValue({ languagePreference: 'system' });
    mocks.getEffectiveAppLanguage.mockReturnValue('ja');
    mocks.accountCommands.requestEmailAuthCode.mockResolvedValue(true);
    const set = vi.fn();
    const get = vi.fn(() => ({
      isConnected: false,
      primaryEmail: null,
    }));

    await expect(createRequestEmailCode(set as never, get as never)(' VLA@example.com ')).resolves.toBe(true);

    expect(mocks.getEffectiveAppLanguage).toHaveBeenCalledWith('system');
    expect(mocks.accountCommands.requestEmailAuthCode).toHaveBeenCalledWith('vla@example.com', 'ja');
    expect(mocks.webAccountCommands.requestEmailCode).not.toHaveBeenCalled();
  });

  it('treats email code request cooldown responses as an already-sent code', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    mocks.webAccountCommands.requestEmailCode.mockRejectedValue(
      new Error('error: please wait before requesting another code'),
    );
    const set = vi.fn();
    const get = vi.fn(() => ({
      isConnected: false,
      primaryEmail: null,
    }));

    await expect(createRequestEmailCode(set as never, get as never)('vla@example.com')).resolves.toBe(true);

    expect(mocks.normalizeAuthError).not.toHaveBeenCalled();
    expect(set).toHaveBeenLastCalledWith({ error: null });
  });

  it('requesting a new email code invalidates an older pending verification result', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    let resolveVerify!: (value: { success: boolean; username?: string; error?: string }) => void;
    mocks.webAccountCommands.verifyEmailCode.mockReturnValue(
      new Promise((resolve) => {
        resolveVerify = resolve;
      }),
    );
    mocks.webAccountCommands.requestEmailCode.mockResolvedValue(true);
    const checkStatus = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn();
    const get = vi.fn(() => ({
      isConnected: false,
      primaryEmail: null,
      checkStatus,
    }));

    const verifyPromise = createVerifyEmailCode(set as never, get as never)(
      'vla@example.com',
      '123456',
    );
    await expect(createRequestEmailCode(set as never, get as never)('vla@example.com')).resolves.toBe(true);

    resolveVerify({ success: true, username: 'vla' });
    await expect(verifyPromise).resolves.toBe(false);

    expect(checkStatus).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalledWith({ isConnecting: false, error: null });
  });

  it('ignores an older email code request failure after a newer auth attempt starts', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    let rejectRequest!: (error: Error) => void;
    mocks.webAccountCommands.requestEmailCode.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    mocks.webAccountCommands.startAuth.mockResolvedValue({
      authUrl: '#new-auth',
      state: 'state-new',
    });
    const set = vi.fn();
    const get = vi.fn(() => ({
      isConnected: false,
      primaryEmail: null,
      isConnecting: true,
    }));

    const requestPromise = createRequestEmailCode(set as never, get as never)('vla@example.com');
    await expect(createSignIn(set as never, get as never)('google')).resolves.toBe(true);

    rejectRequest(new Error('network down'));
    await expect(requestPromise).resolves.toBe(false);

    expect(mocks.normalizeAuthError).not.toHaveBeenCalledWith('network down');
    expect(set).not.toHaveBeenCalledWith({ error: 'normalized:network down' });
  });

  it('verifyEmailCode applies successful desktop verification before the status refresh finishes', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.verifyEmailAuthCode.mockResolvedValue({
      success: true,
      provider: 'email',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      error: null,
    });
    let resolveStatus!: () => void;
    const statusPromise = new Promise<void>((resolve) => {
      resolveStatus = resolve;
    });
    const checkStatus = vi.fn(() => statusPromise);
    const set = vi.fn();
    const get = vi.fn(() => ({ checkStatus }));

    const result = await createVerifyEmailCode(set as never, get as never)(
      'vla@example.com',
      '123456',
    );

    expect(result).toBe(true);
    expect(mocks.accountCommands.verifyEmailAuthCode).toHaveBeenCalledWith('vla@example.com', '123456');
    expect(checkStatus).toHaveBeenCalledWith({ force: true });
    expect(set).toHaveBeenLastCalledWith({
      isConnected: true,
      provider: 'email',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      membershipTier: null,
      membershipName: null,
      isConnecting: false,
      isLoading: false,
      hasCheckedStatus: true,
      error: null,
    });
    expect(mocks.persistUser).toHaveBeenCalledWith({
      isConnected: true,
      provider: 'email',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      membershipTier: null,
      membershipName: null,
    });

    resolveStatus();
    await statusPromise;
  });

  it('verifyEmailCode coalesces concurrent submissions of the same one-time code', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    let resolveVerification!: (value: {
      success: boolean;
      provider: 'email';
      username: string;
      primaryEmail: string;
      avatarUrl: null;
      error: null;
    }) => void;
    mocks.accountCommands.verifyEmailAuthCode.mockReturnValue(
      new Promise((resolve) => {
        resolveVerification = resolve;
      })
    );
    const checkStatus = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn();
    const get = vi.fn(() => ({ checkStatus }));
    const verifyEmailCode = createVerifyEmailCode(set as never, get as never);

    const first = verifyEmailCode(' VLA@example.com ', ' 123456 ');
    const second = verifyEmailCode('vla@example.com', '123456');

    expect(mocks.accountCommands.verifyEmailAuthCode).toHaveBeenCalledTimes(1);
    resolveVerification({
      success: true,
      provider: 'email',
      username: 'vla',
      primaryEmail: 'vla@example.com',
      avatarUrl: null,
      error: null,
    });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(mocks.accountCommands.verifyEmailAuthCode).toHaveBeenCalledTimes(1);
  });

  it('verifyEmailCode rejects invalid email or code values before any network call', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    const set = vi.fn();
    const get = vi.fn(() => ({ checkStatus: vi.fn() }));

    await expect(createVerifyEmailCode(set as never, get as never)('bad', '123456')).resolves.toBe(false);
    await expect(createVerifyEmailCode(set as never, get as never)('vla@example.com', '12345')).resolves.toBe(false);
    await expect(
      createVerifyEmailCode(set as never, get as never)('vla@example.com', `${'1'.repeat(65)}23456`)
    ).resolves.toBe(false);

    expect(mocks.webAccountCommands.verifyEmailCode).not.toHaveBeenCalled();
    expect(mocks.normalizeAuthError).toHaveBeenCalledWith('Invalid email address');
    expect(mocks.normalizeAuthError).toHaveBeenCalledWith('Invalid verification code');
    expect(set).toHaveBeenNthCalledWith(1, { error: 'normalized:Invalid email address' });
    expect(set).toHaveBeenNthCalledWith(2, { error: 'normalized:Invalid verification code' });
    expect(set).toHaveBeenNthCalledWith(3, { error: 'normalized:Invalid verification code' });
  });

  it('handleAuthCallback rejects mismatched callback state and provider', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    sessionStorage.setItem('vlaina_auth_state', 'expected-state');
    sessionStorage.setItem('vlaina_auth_provider', 'google');
    mocks.webAccountCommands.handleAuthCallback.mockReturnValue({
      provider: 'google',
      state: 'wrong-state',
      error: null,
    });
    const set = vi.fn();
    const get = vi.fn(() => ({ checkStatus: vi.fn() }));

    const result = await createHandleAuthCallback(set as never, get as never)();

    expect(result).toBe(false);
    expect(mocks.clearAuthIntent).toHaveBeenCalledTimes(1);
    expect(mocks.webAccountCommands.completeAuth).not.toHaveBeenCalled();
    expect(mocks.normalizeAuthError).toHaveBeenCalledWith('Account sign-in state mismatch');
    expect(set).toHaveBeenLastCalledWith({
      error: 'normalized:Account sign-in state mismatch',
      isConnecting: false,
    });
  });

  it('handleAuthCallback rejects oversized stored auth intent values before completion', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    sessionStorage.setItem('vlaina_auth_state', 'x'.repeat(4097));
    sessionStorage.setItem('vlaina_auth_provider', 'google');
    mocks.webAccountCommands.handleAuthCallback.mockReturnValue({
      provider: 'google',
      state: 'expected-state',
      error: null,
    });
    const set = vi.fn();
    const get = vi.fn(() => ({ checkStatus: vi.fn() }));

    const result = await createHandleAuthCallback(set as never, get as never)();

    expect(result).toBe(false);
    expect(mocks.clearAuthIntent).toHaveBeenCalledTimes(1);
    expect(mocks.webAccountCommands.completeAuth).not.toHaveBeenCalled();
    expect(mocks.normalizeAuthError).toHaveBeenCalledWith('Account sign-in state mismatch');
    expect(set).toHaveBeenLastCalledWith({
      error: 'normalized:Account sign-in state mismatch',
      isConnecting: false,
    });
  });

  it('handleAuthCallback clears user-denied oauth callbacks without showing an error', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    sessionStorage.setItem('vlaina_auth_state', 'expected-state');
    sessionStorage.setItem('vlaina_auth_provider', 'google');
    mocks.webAccountCommands.handleAuthCallback.mockReturnValue({
      provider: 'google',
      state: 'expected-state',
      error: 'access_denied',
    });
    const set = vi.fn();
    const get = vi.fn(() => ({ checkStatus: vi.fn() }));

    const result = await createHandleAuthCallback(set as never, get as never)();

    expect(result).toBe(false);
    expect(mocks.clearAuthIntent).toHaveBeenCalledTimes(1);
    expect(mocks.normalizeAuthError).not.toHaveBeenCalledWith('access_denied');
    expect(mocks.webAccountCommands.completeAuth).not.toHaveBeenCalled();
    expect(set).toHaveBeenLastCalledWith({
      error: null,
      isConnecting: false,
    });
  });

  it('handleAuthCallback completes supported oauth callbacks and refreshes status', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    sessionStorage.setItem('vlaina_auth_state', 'expected-state');
    sessionStorage.setItem('vlaina_auth_provider', 'google');
    mocks.webAccountCommands.handleAuthCallback.mockReturnValue({
      provider: 'google',
      state: 'expected-state',
      error: null,
    });
    mocks.webAccountCommands.completeAuth.mockResolvedValue({
      success: true,
      username: 'vla',
    });
    const checkStatus = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn();
    const get = vi.fn(() => ({ checkStatus }));

    const result = await createHandleAuthCallback(set as never, get as never)();

    expect(result).toBe(true);
    expect(mocks.webAccountCommands.completeAuth).toHaveBeenCalledWith('google', 'expected-state');
    expect(checkStatus).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenLastCalledWith({ isConnecting: false, error: null });
  });

  it('handleAuthCallback normalizes completion failures and clears connecting state', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    sessionStorage.setItem('vlaina_auth_state', 'expected-state');
    sessionStorage.setItem('vlaina_auth_provider', 'google');
    mocks.webAccountCommands.handleAuthCallback.mockReturnValue({
      provider: 'google',
      state: 'expected-state',
      error: null,
    });
    mocks.webAccountCommands.completeAuth.mockRejectedValue(new Error('network down'));
    const set = vi.fn();
    const get = vi.fn(() => ({ checkStatus: vi.fn() }));

    const result = await createHandleAuthCallback(set as never, get as never)();

    expect(result).toBe(false);
    expect(mocks.normalizeAuthError).toHaveBeenCalledWith('network down');
    expect(set).toHaveBeenLastCalledWith({
      error: 'normalized:network down',
      isConnecting: false,
    });
  });

  it('ignores stale oauth completion failures after a newer auth attempt starts', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    sessionStorage.setItem('vlaina_auth_state', 'expected-state');
    sessionStorage.setItem('vlaina_auth_provider', 'google');
    mocks.webAccountCommands.handleAuthCallback.mockReturnValue({
      provider: 'google',
      state: 'expected-state',
      error: null,
    });
    let rejectComplete!: (error: Error) => void;
    mocks.webAccountCommands.completeAuth.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectComplete = reject;
      }),
    );
    mocks.webAccountCommands.startAuth.mockResolvedValue({
      authUrl: '#new-auth-attempt',
      state: 'new-state',
    });
    const set = vi.fn();
    const get = vi.fn(() => ({ checkStatus: vi.fn(), isConnecting: true }));

    const callbackPromise = createHandleAuthCallback(set as never, get as never)();
    await expect(createSignIn(set as never, get as never)('google')).resolves.toBe(true);

    rejectComplete(new Error('old failure'));
    await expect(callbackPromise).resolves.toBe(false);

    expect(mocks.normalizeAuthError).not.toHaveBeenCalledWith('old failure');
    expect(set).not.toHaveBeenCalledWith({
      error: 'normalized:old failure',
      isConnecting: false,
    });
  });

  it('signOut clears pending auth timeout and applies disconnected state after desktop disconnect', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.accountDisconnect.mockResolvedValue(undefined);
    const timeoutId = window.setTimeout(() => undefined, 1000);
    (window as Window & { __authTimeout?: number | null }).__authTimeout = timeoutId;
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const set = vi.fn();

    await createSignOut(set as never, vi.fn() as never)();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutId);
    expect(mocks.clearAuthIntent).toHaveBeenCalledTimes(1);
    expect(mocks.accountCommands.accountDisconnect).toHaveBeenCalledTimes(1);
    expect(mocks.applyDisconnectedAccount).toHaveBeenCalledWith(set);
  });

  it('signOut clears web identity only after the current revoke succeeds', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    mocks.webAccountCommands.disconnect.mockResolvedValue(undefined);
    const set = vi.fn();

    await createSignOut(set as never, vi.fn() as never)();

    expect(mocks.webAccountCommands.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.webAccountCommands.clearLocalSession).toHaveBeenCalledTimes(1);
    expect(mocks.applyDisconnectedAccount).toHaveBeenCalledWith(set);
  });

  it('does not let an older web sign-out clear a newer authentication attempt', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(false);
    let resolveDisconnect!: () => void;
    mocks.webAccountCommands.disconnect.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDisconnect = resolve;
      })
    );
    mocks.webAccountCommands.requestEmailCode.mockResolvedValue(true);
    const set = vi.fn();
    const get = vi.fn(() => ({ isConnected: false, primaryEmail: null }));

    const signOut = createSignOut(set as never, get as never)();
    await expect(createRequestEmailCode(set as never, get as never)('new@example.com')).resolves.toBe(true);
    resolveDisconnect();
    await signOut;

    expect(mocks.webAccountCommands.clearLocalSession).not.toHaveBeenCalled();
    expect(mocks.applyDisconnectedAccount).not.toHaveBeenCalled();
  });

  it('cancelConnect clears pending desktop auth in the main process', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    mocks.accountCommands.cancelAccountAuth.mockResolvedValue(true);
    const timeoutId = window.setTimeout(() => undefined, 1000);
    (window as Window & { __authTimeout?: number | null }).__authTimeout = timeoutId;
    sessionStorage.setItem('vlaina_auth_state', 'state');

    const set = vi.fn();
    await createCancelConnect(set as never, vi.fn() as never)();

    expect(mocks.clearAuthIntent).toHaveBeenCalledTimes(1);
    expect(mocks.accountCommands.cancelAccountAuth).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ isConnecting: false, error: null });
  });

  it('does not let an older cancellation overwrite a newer authentication attempt', async () => {
    mocks.hasElectronDesktopBridge.mockReturnValue(true);
    let resolveCancel!: () => void;
    mocks.accountCommands.cancelAccountAuth.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveCancel = () => resolve(true);
      })
    );
    mocks.accountCommands.requestEmailAuthCode.mockResolvedValue(true);
    const set = vi.fn();
    const get = vi.fn(() => ({ isConnected: false, primaryEmail: null }));

    const cancel = createCancelConnect(set as never, get as never)();
    await expect(createRequestEmailCode(set as never, get as never)('new@example.com')).resolves.toBe(true);
    resolveCancel();
    await cancel;

    expect(set).not.toHaveBeenCalledWith({ isConnecting: false, error: null });
  });

  it('keeps session retry and identity diagnostics in the filtered electron auth log', () => {
    const entries = [
      { timestamp: '2026-04-22T07:40:28.035Z', event: 'ipc:start_auth', details: null },
      { timestamp: '2026-04-22T07:40:28.100Z', event: 'session_identity:start', details: null },
      { timestamp: '2026-04-22T07:40:28.200Z', event: 'session_identity:http:request', details: null },
      { timestamp: '2026-04-22T07:40:28.300Z', event: 'session_identity:http:response', details: null },
      { timestamp: '2026-04-22T07:40:28.400Z', event: 'session_status:start', details: null },
      { timestamp: '2026-04-22T07:40:28.500Z', event: 'session_status:http:request', details: null },
      { timestamp: '2026-04-22T07:40:28.600Z', event: 'session_status:http:response', details: null },
      { timestamp: '2026-04-22T07:40:28.700Z', event: 'session_status:http:retry_scheduled', details: null },
      { timestamp: '2026-04-22T07:40:28.800Z', event: 'stored_session:http:retry_1:response', details: null },
      { timestamp: '2026-04-22T07:40:28.900Z', event: 'noise:event', details: null },
    ];

    expect(selectRelevantElectronAuthEntries(entries)).toEqual([
      entries[0],
      entries[1],
      entries[2],
      entries[3],
      entries[4],
      entries[5],
      entries[6],
      entries[7],
      entries[8],
    ]);
  });
});
