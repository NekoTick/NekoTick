import type { StoreApi } from 'zustand';
import { accountCommands } from '@/lib/account/desktopCommands';
import { hasElectronDesktopBridge } from '@/lib/desktop/backend';
import { normalizeAccountProvider } from '@/lib/account/provider';
import { webAccountCommands } from '@/lib/account/webCommands';
import type { AccountSessionActions, AccountSessionState } from './state';
import {
  clearPersistedUser,
  normalizeAuthError,
  normalizePersistedUser,
  persistUser,
  refreshAvatar,
} from './authSupport';
import { normalizeEmailCodeInput, normalizeEmailInput } from './authInput';
import {
  invalidateAccountSessionChecks,
  isCurrentAccountAuthAttempt,
  startAccountAuthAttempt,
} from './authFlowState';
import { applyDesktopAuthBudget } from './desktopAuthBudget';

type Set = StoreApi<AccountSessionState & AccountSessionActions>['setState'];
type Get = StoreApi<AccountSessionState & AccountSessionActions>['getState'];

export function createVerifyEmailCode(set: Set, get: Get): (email: string, code: string) => Promise<boolean> {
  let inFlightVerification: {
    email: string;
    code: string;
    promise: Promise<boolean>;
  } | null = null;

  return async (email: string, code: string) => {
    const normalizedEmail = normalizeEmailInput(email);
    if (!normalizedEmail) {
      set({ error: normalizeAuthError('Invalid email address') });
      return false;
    }

    const normalizedCode = normalizeEmailCodeInput(code);
    if (!normalizedCode) {
      set({ error: normalizeAuthError('Invalid verification code') });
      return false;
    }

    if (
      inFlightVerification?.email === normalizedEmail &&
      inFlightVerification.code === normalizedCode
    ) {
      return await inFlightVerification.promise;
    }

    const verificationPromise = verifyEmailCode(set, get, normalizedEmail, normalizedCode);
    inFlightVerification = {
      email: normalizedEmail,
      code: normalizedCode,
      promise: verificationPromise,
    };

    try {
      return await verificationPromise;
    } finally {
      if (inFlightVerification?.promise === verificationPromise) {
        inFlightVerification = null;
      }
    }
  };
}

async function verifyEmailCode(set: Set, get: Get, email: string, code: string): Promise<boolean> {
  const authAttemptVersion = startAccountAuthAttempt();
  set({ error: null });
  try {
    if (hasElectronDesktopBridge()) {
      const result = await accountCommands.verifyEmailAuthCode(email, code);
      if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
        return false;
      }
      if (result?.success) {
        const normalizedIdentity = normalizePersistedUser({
          isConnected: true,
          provider: normalizeAccountProvider(result.provider) ?? 'email',
          username: result.username ?? null,
          primaryEmail: result.primaryEmail ?? email,
          avatarUrl: result.avatarUrl ?? null,
          membershipTier: result.membershipTier ?? null,
          membershipName: result.membershipName ?? null,
        });
        const provider = normalizeAccountProvider(normalizedIdentity.provider);
        const username = normalizedIdentity.username ?? null;
        const primaryEmail = normalizedIdentity.primaryEmail ?? null;
        const avatarUrl = normalizedIdentity.avatarUrl ?? null;
        const membershipTier = normalizedIdentity.membershipTier ?? null;
        const membershipName = normalizedIdentity.membershipName ?? null;
        if (!provider || !username) {
          set({ error: normalizeAuthError('Email sign-in failed') });
          return false;
        }

        invalidateAccountSessionChecks();
        set({
          isConnected: true,
          provider,
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
            provider,
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
      set({ error: normalizeAuthError(result?.error || 'Email sign-in failed') });
      return false;
    }

    const result = await webAccountCommands.verifyEmailCode(email, code);
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

    set({ error: normalizeAuthError(result.error || 'Email sign-in failed') });
    return false;
  } catch (error) {
    if (!isCurrentAccountAuthAttempt(authAttemptVersion)) {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error);
    set({ error: normalizeAuthError(message) });
    return false;
  }
}
