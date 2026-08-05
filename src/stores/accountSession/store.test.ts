import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccountSessionStore } from '../accountSession/store';
import { useManagedAIStore } from '../useManagedAIStore';
import { ACCOUNT_USER_PERSIST_KEY } from '../accountSession/state';
import { ACCOUNT_STATUS_REFRESH_KEY } from '../accountSession/authSupport';
import { ACCOUNT_AUTH_INVALIDATED_EVENT } from '@/lib/account/sessionEvent';
import { translate } from '@/lib/i18n';

describe('accountSession store', () => {
  beforeEach(() => {
    localStorage.clear();
    useManagedAIStore.getState().clearBudget();
  });

  it('clears in-memory auth state when the web session is invalidated', () => {
    useManagedAIStore.setState({
      budget: {
        active: true,
        usedPercent: 20,
        remainingPercent: 80,
        status: 'active',
      },
      lastBudgetSyncAt: 1,
    });
    useAccountSessionStore.setState({
      isConnected: true,
      provider: 'google',
      username: 'octocat',
      primaryEmail: null,
      avatarUrl: 'https://example.com/avatar.png',
      localAvatarUrl: 'local-avatar',
      isConnecting: true,
      isLoading: true,
      hasCheckedStatus: true,
      error: 'oops',
    });

    window.dispatchEvent(new Event(ACCOUNT_AUTH_INVALIDATED_EVENT));

    const state = useAccountSessionStore.getState();
    expect(state.isConnected).toBe(false);
    expect(state.provider).toBeNull();
    expect(state.username).toBeNull();
    expect(state.avatarUrl).toBeNull();
    expect(state.localAvatarUrl).toBeNull();
    expect(state.isConnecting).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.hasCheckedStatus).toBe(true);
    expect(state.error).toBeNull();
    expect(useManagedAIStore.getState().budget).toBeNull();
  });

  it('keeps a localized explanation when device limits invalidate the session', () => {
    useAccountSessionStore.setState({
      isConnected: true,
      provider: 'google',
      username: 'account-user',
      error: null,
    });

    window.dispatchEvent(new CustomEvent(ACCOUNT_AUTH_INVALIDATED_EVENT, {
      detail: { reason: 'device_limit' },
    }));

    expect(useAccountSessionStore.getState()).toMatchObject({
      isConnected: false,
      error: translate('account.error.deviceLimit'),
    });
  });

  it('reloads persisted account identity after a cross-window storage update', () => {
    useAccountSessionStore.setState({
      isConnected: false,
      provider: null,
      username: null,
      primaryEmail: null,
      avatarUrl: null,
      localAvatarUrl: null,
      membershipTier: null,
      membershipName: null,
      isConnecting: false,
      isLoading: false,
      hasCheckedStatus: true,
      error: null,
    });

    const nextIdentity = JSON.stringify({
      isConnected: true,
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: 'Pro',
    });

    localStorage.setItem(ACCOUNT_USER_PERSIST_KEY, nextIdentity);

    window.dispatchEvent(new StorageEvent('storage', {
      key: ACCOUNT_USER_PERSIST_KEY,
      newValue: nextIdentity,
    }));

    const state = useAccountSessionStore.getState();
    expect(state.isConnected).toBe(true);
    expect(state.provider).toBe('google');
    expect(state.username).toBe('alice');
    expect(state.primaryEmail).toBe('alice@example.com');
    expect(state.membershipTier).toBe('pro');
    expect(state.membershipName).toBe('Pro');
    expect(state.hasCheckedStatus).toBe(false);
    expect(typeof state.checkStatus).toBe('function');
    expect(typeof state.signOut).toBe('function');
  });

  it('clears managed budget after a cross-window storage sign-out', () => {
    useManagedAIStore.setState({
      budget: {
        active: true,
        usedPercent: 20,
        remainingPercent: 80,
        status: 'active',
      },
      lastBudgetSyncAt: 1,
    });

    const nextIdentity = JSON.stringify({
      isConnected: false,
      provider: null,
      username: null,
      primaryEmail: null,
      avatarUrl: null,
      membershipTier: null,
      membershipName: null,
    });

    localStorage.setItem(ACCOUNT_USER_PERSIST_KEY, nextIdentity);
    window.dispatchEvent(new StorageEvent('storage', {
      key: ACCOUNT_USER_PERSIST_KEY,
      newValue: nextIdentity,
    }));

    const state = useAccountSessionStore.getState();
    expect(state.isConnected).toBe(false);
    expect(useManagedAIStore.getState().budget).toBeNull();
  });

  it('checks desktop account status after a cross-window refresh signal', () => {
    const checkStatus = vi.fn().mockResolvedValue(undefined);
    useAccountSessionStore.setState({ checkStatus });

    window.dispatchEvent(new StorageEvent('storage', {
      key: ACCOUNT_STATUS_REFRESH_KEY,
      newValue: String(Date.now()),
    }));

    expect(checkStatus).toHaveBeenCalledTimes(1);
  });
});
