import type { AccountProvider, MembershipTier } from '@/stores/accountSession/state';
import { normalizeAccountProvider } from '@/lib/account/provider';
import { isNativeCapacitorRuntime } from './capacitorRuntime';
import {
  clearWebAccountCredentials,
  getCachedWebAccountStatus,
  saveWebAccountCredentials,
  type WebAccountStatus,
} from './webSession';
import { handleWebAccountAuthCallback } from './webCallback';
import { API_BASE } from './webAccountApi';
import {
  delay,
  fetchAccount,
  fetchAccountJson,
  readAccountJson,
  readJsonErrorMessage,
  retryTransientAccountNetworkError,
  withAccountRequestTimeout,
} from './webAccountHttp';
import {
  normalizeEmailCodeInput,
  normalizeEmailInput,
} from './webAccountInput';
import {
  probeWebSession,
  revokeWebSession,
} from './webAccountSessionRequests';

const WEB_RESULT_POLL_ATTEMPTS = 10;
const WEB_RESULT_POLL_DELAY_MS = 300;

interface WebAuthResult {
  success: boolean;
  pending?: boolean;
  provider?: string;
  username?: string;
  primaryEmail?: string | null;
  avatarUrl?: string | null;
  error?: string;
}

interface NormalizedWebAccountResult {
  success: boolean;
  provider: AccountProvider | null;
  username?: string;
  primaryEmail: string | null;
  avatarUrl: string | null;
  membershipTier: MembershipTier | null;
  membershipName: string | null;
  error?: string;
}

function authStartPath(_provider: Exclude<AccountProvider, 'email'>): string {
  return '/auth/google';
}

function webResultPath(_provider: Exclude<AccountProvider, 'email'>): string {
  return '/auth/google/web/result';
}

function normalizeWebAuthResult(
  data: WebAuthResult,
  fallbackProvider: AccountProvider
): NormalizedWebAccountResult {
  return {
    success: data.success,
    provider: normalizeAccountProvider(data.provider) || fallbackProvider,
    username: data.username,
    primaryEmail: data.primaryEmail || null,
    avatarUrl: data.avatarUrl || null,
    membershipTier: null,
    membershipName: null,
    error: data.error,
  };
}

function isSupportedWebAccountOrigin(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  if (isNativeCapacitorRuntime()) {
    return true;
  }

  const hostname = window.location.hostname.trim().toLowerCase();
  if (!hostname) {
    return true;
  }

  return hostname === 'vlaina.com' || hostname.endsWith('.vlaina.com');
}

function getUnsupportedWebAccountOriginMessage(): string {
  return 'Web sign-in is unavailable on local development origins. Use vlaina.com/pricing or the desktop app.';
}

function assertSupportedWebAccountOrigin(): void {
  if (!isSupportedWebAccountOrigin()) {
    throw new Error(getUnsupportedWebAccountOriginMessage());
  }
}

function persistConnectedWebAccount(result: NormalizedWebAccountResult): void {
  if (!result.success || !result.username || !result.provider) {
    return;
  }

  saveWebAccountCredentials({
    provider: result.provider,
    username: result.username,
    primaryEmail: result.primaryEmail,
    avatarUrl: result.avatarUrl,
    membershipTier: result.membershipTier,
    membershipName: result.membershipName,
  });
}

export const webAccountCommands = {
  async startAuth(
    provider: Exclude<AccountProvider, 'email'>
  ): Promise<{ authUrl: string; state: string } | null> {
    if (isNativeCapacitorRuntime()) {
      throw new Error('OAuth sign-in is unavailable in the native app.');
    }
    assertSupportedWebAccountOrigin();

    try {
      return await retryTransientAccountNetworkError(async () => {
        const res = await fetchAccount(`${API_BASE}${authStartPath(provider)}`, {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!res.ok) return null;
        return await withAccountRequestTimeout((signal) => readAccountJson<{ authUrl: string; state: string }>(res, signal));
      });
    } catch {
      return null;
    }
  },

  async completeAuth(
    provider: Exclude<AccountProvider, 'email'>,
    state: string
  ): Promise<{
    success: boolean;
    provider?: AccountProvider | null;
    username?: string;
    primaryEmail?: string | null;
    avatarUrl?: string | null;
    membershipTier?: MembershipTier | null;
    membershipName?: string | null;
    error?: string;
  }> {
    try {
      const endpoint = new URL(`${API_BASE}${webResultPath(provider)}`);
      endpoint.searchParams.set('state', state);
      for (let attempt = 0; attempt < WEB_RESULT_POLL_ATTEMPTS; attempt += 1) {
        const { data } = await fetchAccountJson<WebAuthResult>(endpoint, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
        });
        if (data.pending === true && !data.success) {
          await delay(WEB_RESULT_POLL_DELAY_MS);
          continue;
        }

        const result = normalizeWebAuthResult(data, provider);
        persistConnectedWebAccount(result);
        return result;
      }
      return { success: false, error: 'Account sign-in timed out' };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  async requestEmailCode(email: string, locale?: string): Promise<boolean> {
    assertSupportedWebAccountOrigin();
    const normalizedEmail = normalizeEmailInput(email);
    if (!normalizedEmail) {
      throw new Error('Invalid email address');
    }

    const response = await retryTransientAccountNetworkError(() =>
      fetchAccount(`${API_BASE}/auth/email/request-code`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: normalizedEmail, locale: locale || null }),
      })
    );

    if (response.ok) {
      return true;
    }

    throw new Error(await readJsonErrorMessage(response, `Failed to send verification code: HTTP ${response.status}`));
  },

  async verifyEmailCode(email: string, code: string): Promise<{
    success: boolean;
    provider?: AccountProvider | null;
    username?: string;
    primaryEmail?: string | null;
    avatarUrl?: string | null;
    membershipTier?: MembershipTier | null;
    membershipName?: string | null;
    error?: string;
  }> {
    assertSupportedWebAccountOrigin();
    const normalizedEmail = normalizeEmailInput(email);
    if (!normalizedEmail) {
      return {
        success: false,
        provider: 'email',
        primaryEmail: null,
        avatarUrl: null,
        membershipTier: null,
        membershipName: null,
        error: 'Invalid email address',
      };
    }
    const normalizedCode = normalizeEmailCodeInput(code);
    if (!normalizedCode) {
      return {
        success: false,
        provider: 'email',
        primaryEmail: null,
        avatarUrl: null,
        membershipTier: null,
        membershipName: null,
        error: 'Invalid verification code',
      };
    }

    try {
      const { data } = await fetchAccountJson<WebAuthResult>(`${API_BASE}/auth/email/verify-code`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: normalizedEmail, code: normalizedCode, target: 'web' }),
      });
      const result = normalizeWebAuthResult(data, 'email');
      persistConnectedWebAccount(result);
      return result;
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  getStatus(): WebAccountStatus {
    return getCachedWebAccountStatus();
  },

  async probeStatus(): Promise<WebAccountStatus> {
    const cached = getCachedWebAccountStatus();
    if (!isSupportedWebAccountOrigin()) {
      return cached;
    }

    try {
      const status = await probeWebSession();
      if (status.connected) {
        return {
          connected: true,
          provider: status.provider || cached.provider,
          username: status.username || cached.username,
          primaryEmail: status.primaryEmail || cached.primaryEmail,
          avatarUrl: status.avatarUrl || cached.avatarUrl,
          membershipTier: status.membershipTier || cached.membershipTier,
          membershipName: status.membershipName || cached.membershipName,
          budget: status.budget ?? null,
        };
      }
      return status;
    } catch {
      return cached;
    }
  },

  async disconnect(): Promise<void> {
    await revokeWebSession();
  },

  clearLocalSession(): void {
    clearWebAccountCredentials();
  },
};

export const handleAuthCallback = handleWebAccountAuthCallback;
