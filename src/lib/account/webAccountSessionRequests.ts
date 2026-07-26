import type { MembershipTier } from '@/stores/accountSession/state';
import type { ManagedBudgetPayload } from '@/lib/ai/managed/types';
import { normalizeAccountProvider } from '@/lib/account/provider';
import {
  getCachedWebAccountStatus,
  type WebAccountStatus,
} from './webSession';
import { API_BASE } from './webAccountApi';
import {
  fetchAccount,
  readAccountJson,
  withAccountRequestTimeout,
} from './webAccountHttp';

interface SessionStatusResponse {
  success: boolean;
  connected: boolean;
  provider?: string | null;
  username?: string | null;
  primaryEmail?: string | null;
  avatarUrl?: string | null;
  membershipTier?: MembershipTier | null;
  membershipName?: string | null;
  budget?: ManagedBudgetPayload | null;
}

export async function probeWebSession(): Promise<WebAccountStatus> {
  const response = await fetchAccount(`${API_BASE}/auth/session?include_budget=1`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 401 || response.status === 403) {
    return getCachedWebAccountStatus();
  }

  if (!response.ok) {
    throw new Error(`Failed to verify session: HTTP ${response.status}`);
  }

  const data = await withAccountRequestTimeout((signal) => readAccountJson<SessionStatusResponse>(response, signal));
  return {
    connected: data.connected === true,
    provider: normalizeAccountProvider(data.provider),
    username: typeof data.username === 'string' ? data.username : null,
    primaryEmail: typeof data.primaryEmail === 'string' ? data.primaryEmail : null,
    avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
    membershipTier:
      data.membershipTier === 'free' || data.membershipTier === 'plus' || data.membershipTier === 'pro' || data.membershipTier === 'max'
        || data.membershipTier === 'ultra'
        ? data.membershipTier
        : null,
    membershipName: typeof data.membershipName === 'string' ? data.membershipName : null,
    budget: data.budget && typeof data.budget === 'object' ? data.budget : null,
  };
}

export async function revokeWebSession(): Promise<void> {
  const response = await fetchAccount(`${API_BASE}/auth/session/revoke`, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
  });

  if (response.ok || response.status === 401 || response.status === 403) {
    return;
  }

  throw new Error(`Failed to revoke session: HTTP ${response.status}`);
}
