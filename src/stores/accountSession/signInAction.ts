import type { StoreApi } from 'zustand';
import { hasElectronDesktopBridge } from '@/lib/desktop/backend';
import { accountCommands } from '@/lib/account/desktopCommands';
import { webAccountCommands } from '@/lib/account/webCommands';
import { normalizeAccountProvider } from '@/lib/account/provider';
import {
  AUTH_PROVIDER_STORAGE_KEY,
  AUTH_STATE_STORAGE_KEY,
  clearPersistedUser,
  normalizeAuthError,
  normalizePersistedUser,
  persistUser,
  refreshAvatar,
} from './authSupport';
import {
  isCurrentAccountAuthAttempt,
  invalidateAccountSessionChecks,
  startAccountAuthAttempt,
} from './authFlowState';
import {
  isAuthorizationCancellation,
  isValidAuthIntentValue,
  normalizeWebAuthRedirectUrl,
} from './authInput';
import type { AccountProvider, AccountSessionActions, AccountSessionState } from './state';
import { applyDesktopAuthBudget } from './desktopAuthBudget';

type Set = StoreApi<AccountSessionState & AccountSessionActions>['setState'];
type Get = StoreApi<AccountSessionState & AccountSessionActions>['getState'];

export function createSignIn(
  set: Set,
  get: Get
): (provider: Exclude<AccountProvider, 'email'>) => Promise<boolean> {
  return async (provider) => {
    const authAttemptVersion = startAccountAuthAttempt();
    set({ isConnecting: true, error: null });

    const isDesktop = hasElectronDesktopBridge();
    const win = window as Window & { __authTimeout?: number | ReturnType<typeof setTimeout> | null };
    if (win.__authTimeout) {
      clearTimeout(win.__authTimeout);
      win.__authTimeout = null;
    }
    const timeoutId = setTimeout(() => {
      if (isCurrentAccountAuthAttempt(authAttemptVersion) && get().isConnecting) {
        if (isDesktop) {
          void accountCommands.cancelAccountAuth().catch(() => undefined);
        }
        set({ isConnecting: false, error: null });
      }
    }, isDesktop ? 300000 : 60000);

    win.__authTimeout = timeoutId;

    if (isDesktop) {
      try {
        const result = await accountCommands.accountAuth(provider);
        clearTimeout(timeoutId);
        if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
          return false;
        }

        if (result?.success) {
          const normalizedIdentity = normalizePersistedUser({
            isConnected: true,
            provider: normalizeAccountProvider(result.provider) ?? provider,
            username: result.username ?? null,
            primaryEmail: result.primaryEmail ?? null,
            avatarUrl: result.avatarUrl ?? null,
            membershipTier: result.membershipTier ?? null,
            membershipName: result.membershipName ?? null,
          });
          const providerFromResult = normalizeAccountProvider(normalizedIdentity.provider);
          const username = normalizedIdentity.username ?? null;
          const primaryEmail = normalizedIdentity.primaryEmail ?? null;
          const avatarUrl = normalizedIdentity.avatarUrl ?? null;
          const membershipTier = normalizedIdentity.membershipTier ?? null;
          const membershipName = normalizedIdentity.membershipName ?? null;

          invalidateAccountSessionChecks();
          set({
            isConnected: true,
            provider: providerFromResult,
            username,
            primaryEmail,
            avatarUrl,
            membershipTier,
            membershipName,
            isConnecting: false,
            isLoading: false,
            hasCheckedStatus: true,
            error: null,
          });
          if (result.persistent === false) {
            clearPersistedUser();
          } else {
            persistUser({
              isConnected: true,
              provider: providerFromResult,
              username,
              primaryEmail,
              avatarUrl,
              membershipTier,
              membershipName,
            });
          }
          applyDesktopAuthBudget(result.budget);
          void get().checkStatus({ force: true }).catch(() => undefined);
          void refreshAvatar(set, get, username, avatarUrl);
          return true;
        }

        const errorMessage = result?.error || 'Authorization failed';
        set({
          error: isAuthorizationCancellation(errorMessage) ? null : normalizeAuthError(errorMessage),
          isConnecting: false,
        });
        return false;
      } catch (error) {
        clearTimeout(timeoutId);
        if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
          return false;
        }
        const message = error instanceof Error ? error.message : String(error);
        set({
          error: isAuthorizationCancellation(message) ? null : normalizeAuthError(message),
          isConnecting: false,
        });
        return false;
      }
    }

    try {
      const authData = await webAccountCommands.startAuth(provider);
      clearTimeout(timeoutId);
      if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
        return false;
      }
      const authUrl = normalizeWebAuthRedirectUrl(authData?.authUrl);
      if (!authData || !isValidAuthIntentValue(authData.state) || !authUrl) {
        set({ error: normalizeAuthError('Failed to start account sign-in'), isConnecting: false });
        return false;
      }

      try {
        sessionStorage.setItem(AUTH_STATE_STORAGE_KEY, authData.state);
        sessionStorage.setItem(AUTH_PROVIDER_STORAGE_KEY, provider);
      } catch {
        if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
          return false;
        }
        set({ error: normalizeAuthError('Unable to store sign-in state in this browser session'), isConnecting: false });
        return false;
      }
      window.location.href = authUrl;
      return true;
    } catch (error) {
      clearTimeout(timeoutId);
      if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      set({ error: normalizeAuthError(message), isConnecting: false });
      return false;
    }
  };
}
