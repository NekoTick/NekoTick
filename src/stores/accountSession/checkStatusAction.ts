import type { StoreApi } from 'zustand';
import { hasElectronDesktopBridge } from '@/lib/desktop/backend';
import { accountCommands } from '@/lib/account/desktopCommands';
import { normalizeManagedBudgetPayload } from '@/lib/ai/managed/normalizers';
import { webAccountCommands } from '@/lib/account/webCommands';
import { translate } from '@/lib/i18n';
import { normalizeAccountProvider } from '@/lib/account/provider';
import { clearManagedBudgetUnlessQuotaExhausted, useManagedAIStore } from '@/stores/useManagedAIStore';
import {
  broadcastAccountStatusRefresh,
  clearPersistedUser,
  normalizePersistedUser,
  persistUser,
  refreshAvatar,
} from './authSupport';
import { applyDisconnectedAccount } from './sessionState';
import type { AccountSessionActions, AccountSessionState } from './state';
import {
  ACCOUNT_STATUS_REFRESH_INTERVAL_MS,
  clearCurrentCheckStatusPromise,
  getAccountSessionMutationVersion,
  getCurrentCheckStatusPromise,
  getLastCheckStatusSyncAt,
  isCurrentAccountSessionMutation,
  markCheckStatusSynced,
  setCurrentCheckStatusPromise,
} from './authFlowState';

type Set = StoreApi<AccountSessionState & AccountSessionActions>['setState'];
type Get = StoreApi<AccountSessionState & AccountSessionActions>['getState'];

export function createCheckStatus(set: Set, get: Get): (options?: { force?: boolean; refreshBudget?: 'force' }) => Promise<void> {
  return async (options = {}) => {
    const requestVersion = getAccountSessionMutationVersion();
    const currentPromise = getCurrentCheckStatusPromise(requestVersion);
    if (currentPromise) {
      return currentPromise;
    }

    const currentState = get();
    const now = Date.now();
    if (
      !options.force &&
      currentState.hasCheckedStatus &&
      getLastCheckStatusSyncAt() > 0 &&
      now - getLastCheckStatusSyncAt() < ACCOUNT_STATUS_REFRESH_INTERVAL_MS
    ) {
      return;
    }

    set({ isLoading: true });

    let promise!: Promise<void>;
    promise = (async () => {
      try {
        const status = hasElectronDesktopBridge()
          ? await accountCommands.getAccountSessionStatus()
          : await webAccountCommands.probeStatus();
        if (!isCurrentAccountSessionMutation(requestVersion)) {
          return;
        }

        const connected = status?.connected === true;
        const normalizedIdentity = normalizePersistedUser({
          isConnected: connected,
          provider: normalizeAccountProvider(status?.provider),
          username: status?.username ?? null,
          primaryEmail: status?.primaryEmail ?? null,
          avatarUrl: status?.avatarUrl ?? null,
          membershipTier: status?.membershipTier ?? null,
          membershipName: status?.membershipName ?? null,
        });
        const provider = normalizeAccountProvider(normalizedIdentity.provider);
        const sessionInvalidated = status && 'sessionInvalidated' in status && status.sessionInvalidated === true;
        const sessionInvalidationReason = status && 'sessionInvalidationReason' in status
          ? status.sessionInvalidationReason
          : null;
        const username = normalizedIdentity.username ?? null;
        const primaryEmail = normalizedIdentity.primaryEmail ?? null;
        const avatarUrl = normalizedIdentity.avatarUrl ?? null;
        const membershipTier = normalizedIdentity.membershipTier ?? null;
        const membershipName = normalizedIdentity.membershipName ?? null;
        const sessionBudget = status && 'budget' in status ? status.budget : null;
        const persistent = !(status && 'persistent' in status && status.persistent === false);
        let shouldRefreshBudgetIfStale = connected;
        let shouldForceRefreshBudget = connected && options.refreshBudget === 'force';
        if (connected && sessionBudget && typeof sessionBudget === 'object') {
          const normalizedBudget = normalizeManagedBudgetPayload(sessionBudget);
          useManagedAIStore.getState().applyBudgetSnapshot(normalizedBudget);
          shouldRefreshBudgetIfStale = false;
          shouldForceRefreshBudget ||= (
            typeof normalizedBudget.remainingPercent !== 'number' ||
            !Number.isFinite(normalizedBudget.remainingPercent)
          );
        }

        if (!connected && sessionInvalidated) {
          applyDisconnectedAccount(set);
          if (sessionInvalidationReason === 'device_limit') {
            set({ error: translate('account.error.deviceLimit') });
          }
          useManagedAIStore.getState().clearBudget();
          markCheckStatusSynced();
          return;
        }

        if (!connected && get().isConnected === true) {
          set({ isLoading: false, hasCheckedStatus: true });
          markCheckStatusSynced();
          return;
        }

        if (!connected) {
          clearManagedBudgetUnlessQuotaExhausted();
        }

        set({
          isConnected: connected,
          provider,
          username,
          primaryEmail,
          avatarUrl,
          membershipTier,
          membershipName,
          isLoading: false,
          hasCheckedStatus: true,
          error: connected ? null : get().error,
        });
        markCheckStatusSynced();

        if (connected && !persistent) {
          clearPersistedUser();
          broadcastAccountStatusRefresh();
        } else {
          persistUser({ isConnected: connected, provider, username, primaryEmail, avatarUrl, membershipTier, membershipName });
        }
        if (shouldForceRefreshBudget) {
          void useManagedAIStore.getState().refreshBudget();
        } else if (shouldRefreshBudgetIfStale) {
          void useManagedAIStore.getState().refreshBudgetIfStale();
        }
        await refreshAvatar(set, get, username, avatarUrl);
      } catch (error) {
        console.error('Failed to check account auth status:', error);
        if (isCurrentAccountSessionMutation(requestVersion)) {
          set({ isLoading: false, hasCheckedStatus: true });
        }
      } finally {
        clearCurrentCheckStatusPromise(promise);
      }
    })();
    setCurrentCheckStatusPromise(requestVersion, promise);

    return promise;
  };
}
