import { create } from 'zustand';
import { ACCOUNT_AUTH_INVALIDATED_EVENT } from '@/lib/account/sessionEvent';
import { translate } from '@/lib/i18n';
import { clearManagedBudgetUnlessQuotaExhausted, useManagedAIStore } from '@/stores/useManagedAIStore';
import { clearWebSearchQuotaExhausted } from '@/stores/useWebSearchQuotaStore';
import {
  createCheckStatus,
  createCancelConnect,
  createHandleAuthCallback,
  invalidateAccountSessionAuthState,
  createRequestEmailCode,
  createSignIn,
  createSignOut,
  createVerifyEmailCode,
} from './authActions';
import {
  ACCOUNT_STATUS_REFRESH_KEY,
  ACCOUNT_USER_BROADCAST_CHANNEL,
  ACCOUNT_USER_BROADCAST_TYPE,
  loadPersistedUser,
  normalizePersistedUser,
} from './authSupport';
import { createHydrateAvatar } from './avatarActions';
import {
  ACCOUNT_USER_PERSIST_KEY,
  initialAccountSessionState,
  type AccountSessionStore,
} from './state';

export type { AccountProvider, AccountSessionActions, AccountSessionState } from './state';
export { ACCOUNT_USER_PERSIST_KEY } from './state';

const persistedUser = loadPersistedUser();

export const useAccountSessionStore = create<AccountSessionStore>((set, get) => ({
  ...initialAccountSessionState,
  ...persistedUser,
  checkStatus: createCheckStatus(set, get),
  signIn: createSignIn(set, get),
  requestEmailCode: createRequestEmailCode(set, get),
  verifyEmailCode: createVerifyEmailCode(set, get),
  handleAuthCallback: createHandleAuthCallback(set, get),
  signOut: createSignOut(set, get),
  clearError: () => set({ error: null }),
  cancelConnect: createCancelConnect(set, get),
  hydrateAvatar: createHydrateAvatar(set, get),
}));

let invalidationListenerRegistered = false;
let persistenceListenerRegistered = false;
let broadcastListenerRegistered = false;
let accountBroadcastChannel: BroadcastChannel | null = null;

function registerAccountAuthInvalidationListener(): void {
  if (invalidationListenerRegistered || typeof window === 'undefined') {
    return;
  }

  window.addEventListener(ACCOUNT_AUTH_INVALIDATED_EVENT, (event) => {
    const invalidationReason = event instanceof CustomEvent && event.detail?.reason === 'device_limit'
      ? 'device_limit'
      : null;
    invalidateAccountSessionAuthState();
    useManagedAIStore.getState().clearBudget();
    clearWebSearchQuotaExhausted();
    useAccountSessionStore.setState({
      isConnected: false,
      provider: null,
      username: null,
      primaryEmail: null,
      avatarUrl: null,
      membershipTier: null,
      membershipName: null,
      localAvatarUrl: null,
      isConnecting: false,
      isLoading: false,
      hasCheckedStatus: true,
      error: invalidationReason === 'device_limit' ? translate('account.error.deviceLimit') : null,
    });
  });

  invalidationListenerRegistered = true;
}

function registerAccountPersistenceListener(): void {
  if (persistenceListenerRegistered || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('storage', (event) => {
    if (event.key === ACCOUNT_STATUS_REFRESH_KEY) {
      void useAccountSessionStore.getState().checkStatus().catch(() => undefined);
      return;
    }

    if (event.key !== ACCOUNT_USER_PERSIST_KEY) {
      return;
    }

    invalidateAccountSessionAuthState();
    const identity = loadPersistedUser();
    if (identity.isConnected !== true) {
      clearManagedBudgetUnlessQuotaExhausted();
    }

    useAccountSessionStore.setState({
      ...initialAccountSessionState,
      ...identity,
      isLoading: false,
      hasCheckedStatus: false,
      error: null,
    });
    void useAccountSessionStore.getState().hydrateAvatar().catch(() => undefined);
  });

  persistenceListenerRegistered = true;
}

function applyPersistedAccountIdentity(identity: Partial<AccountSessionStore>): void {
  invalidateAccountSessionAuthState();
  if (identity.isConnected !== true) {
    clearManagedBudgetUnlessQuotaExhausted();
  }

  useAccountSessionStore.setState({
    ...initialAccountSessionState,
    ...identity,
    isLoading: false,
    hasCheckedStatus: false,
    error: null,
  });
  void useAccountSessionStore.getState().hydrateAvatar().catch(() => undefined);
}

function registerAccountBroadcastListener(): void {
  if (broadcastListenerRegistered || typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return;
  }

  try {
    accountBroadcastChannel = new BroadcastChannel(ACCOUNT_USER_BROADCAST_CHANNEL);
    accountBroadcastChannel.addEventListener('message', (event) => {
      const payload = event.data as { type?: unknown; identity?: unknown } | null;
      if (!payload || payload.type !== ACCOUNT_USER_BROADCAST_TYPE) {
        return;
      }

      applyPersistedAccountIdentity(normalizePersistedUser(payload.identity));
    });
    broadcastListenerRegistered = true;
  } catch {
    accountBroadcastChannel?.close();
    accountBroadcastChannel = null;
  }
}

registerAccountAuthInvalidationListener();
registerAccountPersistenceListener();
registerAccountBroadcastListener();
