import type { StoreApi } from 'zustand';
import type { AccountSessionActions, AccountSessionState } from './state';
import { hasElectronDesktopBridge } from '@/lib/desktop/backend';
import { accountCommands } from '@/lib/account/desktopCommands';
import { webAccountCommands, handleAuthCallback as parseAuthCallback } from '@/lib/account/webCommands';
import { isOauthAccountProvider, normalizeAccountProvider } from '@/lib/account/provider';
import {
  AUTH_PROVIDER_STORAGE_KEY,
  AUTH_STATE_STORAGE_KEY,
  clearAuthIntent,
  isEmailCodeRequestCooldownError,
  normalizeAuthError,
} from './authSupport';
import { applyDisconnectedAccount } from './sessionState';
import {
  getCurrentEmailAuthLocale,
  isAuthorizationCancellation,
  normalizeEmailInput,
  readStoredAuthIntentValue,
} from './authInput';
import { selectRelevantElectronAuthEntries } from './electronAuthDebug';
import {
  invalidateAccountSessionChecks,
  isCurrentAccountAuthAttempt,
  startAccountAuthAttempt,
} from './authFlowState';
import { clearWebSearchQuotaExhausted } from '@/stores/useWebSearchQuotaStore';

type Set = StoreApi<AccountSessionState & AccountSessionActions>['setState'];
type Get = StoreApi<AccountSessionState & AccountSessionActions>['getState'];

export { createCheckStatus } from './checkStatusAction';
export { createSignIn } from './signInAction';
export { createVerifyEmailCode } from './verifyEmailCodeAction';
export { invalidateAccountSessionAuthState } from './authFlowState';
export { selectRelevantElectronAuthEntries };

export function createRequestEmailCode(set: Set, get: Get): (email: string) => Promise<boolean> {
  let inFlightRequest: { email: string; promise: Promise<boolean> } | null = null;

  return async (email: string) => {
    const normalizedEmail = normalizeEmailInput(email);
    if (!normalizedEmail) {
      set({ error: normalizeAuthError('Invalid email address') });
      return false;
    }

    const { isConnected, primaryEmail } = get();
    if (isConnected && normalizeEmailInput(primaryEmail) === normalizedEmail) {
      set({ error: normalizeAuthError('You are already signed in with this email') });
      return false;
    }

    if (inFlightRequest?.email === normalizedEmail) {
      return await inFlightRequest.promise;
    }

    const requestPromise = (async () => {
      const authAttemptVersion = startAccountAuthAttempt();
      set({ error: null });
      try {
        const ok = hasElectronDesktopBridge()
          ? await accountCommands.requestEmailAuthCode(normalizedEmail, getCurrentEmailAuthLocale())
          : await webAccountCommands.requestEmailCode(normalizedEmail, getCurrentEmailAuthLocale());
        if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
          return false;
        }
        if (!ok) {
          set({ error: normalizeAuthError('Failed to send verification code') });
        }
        return ok;
      } catch (error) {
        if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
          return false;
        }
        const message = error instanceof Error ? error.message : String(error);
        if (isEmailCodeRequestCooldownError(message)) {
          set({ error: null });
          return true;
        }
        set({ error: normalizeAuthError(message) });
        return false;
      }
    })();
    inFlightRequest = { email: normalizedEmail, promise: requestPromise };

    try {
      return await requestPromise;
    } finally {
      if (inFlightRequest?.promise === requestPromise) {
        inFlightRequest = null;
      }
    }
  };
}

export function createHandleAuthCallback(set: Set, get: Get): () => Promise<boolean> {
  return async () => {
    if (hasElectronDesktopBridge()) return false;

    const callback = parseAuthCallback();
    if (!callback) return false;

    const authAttemptVersion = startAccountAuthAttempt();
    set({ isConnecting: true, error: null });

    const savedState = readStoredAuthIntentValue(AUTH_STATE_STORAGE_KEY);
    const savedProvider = normalizeAccountProvider(readStoredAuthIntentValue(AUTH_PROVIDER_STORAGE_KEY));
    clearAuthIntent();

    if (callback.error) {
      set({
        error: isAuthorizationCancellation(callback.error) ? null : normalizeAuthError(callback.error),
        isConnecting: false,
      });
      return false;
    }

    if (!callback.provider || !savedState || !callback.state || savedState !== callback.state) {
      set({ error: normalizeAuthError('Account sign-in state mismatch'), isConnecting: false });
      return false;
    }

    if (savedProvider && savedProvider !== callback.provider) {
      set({ error: normalizeAuthError('Account sign-in provider mismatch'), isConnecting: false });
      return false;
    }

    if (!isOauthAccountProvider(callback.provider)) {
      set({ error: normalizeAuthError('Unsupported account sign-in provider'), isConnecting: false });
      return false;
    }

    try {
      const result = await webAccountCommands.completeAuth(callback.provider, callback.state);
      if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
        return false;
      }
      if (result.success && result.username) {
        invalidateAccountSessionChecks();
        await get().checkStatus({ force: true });
        if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
          return false;
        }
        set({ isConnecting: false, error: null });
        return true;
      }

      const errorMessage = result.error || 'Account sign-in failed';
      set({
        error: isAuthorizationCancellation(errorMessage) ? null : normalizeAuthError(errorMessage),
        isConnecting: false,
      });
      return false;
    } catch (error) {
      if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      set({ error: normalizeAuthError(message), isConnecting: false });
      return false;
    }
  };
}

export function createSignOut(set: Set, _get: Get): () => Promise<void> {
  return async () => {
    const authAttemptVersion = startAccountAuthAttempt();
    const win = window as Window & { __authTimeout?: number | ReturnType<typeof setTimeout> | null };
    if (win.__authTimeout) {
      clearTimeout(win.__authTimeout);
      win.__authTimeout = null;
    }
    clearAuthIntent();

    const isDesktop = hasElectronDesktopBridge();
    try {
      if (isDesktop) {
        await accountCommands.accountDisconnect();
      } else {
        await webAccountCommands.disconnect();
      }
    } catch (error) {
      if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      set({ error: normalizeAuthError(message) });
      return;
    }

    if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
      return;
    }
    if (!isDesktop) {
      webAccountCommands.clearLocalSession();
    }
    applyDisconnectedAccount(set);
    clearWebSearchQuotaExhausted();
  };
}

export function createCancelConnect(set: Set, _get: Get): () => Promise<void> {
  return async () => {
    const authAttemptVersion = startAccountAuthAttempt();
    const win = window as Window & { __authTimeout?: number | ReturnType<typeof setTimeout> | null };
    if (win.__authTimeout) {
      clearTimeout(win.__authTimeout);
      win.__authTimeout = null;
    }
    clearAuthIntent();

    if (hasElectronDesktopBridge()) {
      await accountCommands.cancelAccountAuth().catch(() => undefined);
    }

    if (isCurrentAccountAuthAttempt(authAttemptVersion)) {
      set({ isConnecting: false, error: null });
    }
  };
}
