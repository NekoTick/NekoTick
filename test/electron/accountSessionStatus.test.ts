import { describe, expect, it } from 'vitest';
import {
  buildCachedDesktopStatus,
  buildDisconnectedDesktopStatus,
  isDesktopSessionWithinGracePeriod,
  resolveDesktopSessionProbe,
} from '../../electron/accountSessionStatus.mjs';

const credentials = {
  appSessionToken: 'nts_example',
  provider: 'google',
  username: 'vladelaina',
  primaryEmail: 'vladelaina@gmail.com',
  avatarUrl: 'https://example.com/avatar.png',
};

const cachedMemberCredentials = {
  ...credentials,
  membershipTier: 'pro',
  membershipName: 'Pro',
};

const recentlyAuthenticatedCredentials = {
  ...credentials,
  authenticatedAt: 1_000,
};

describe('desktop account session status resolution', () => {
  it('returns disconnected when no credentials exist', () => {
    expect(resolveDesktopSessionProbe(null, { kind: 'error' })).toEqual({
      status: buildDisconnectedDesktopStatus(),
      nextCredentials: null,
      clearStoredCredentials: false,
    });
  });

  it('disconnects and clears cached credentials when auth/session is unauthorized', () => {
    expect(resolveDesktopSessionProbe(credentials, { kind: 'unauthorized' })).toEqual({
      status: {
        ...buildDisconnectedDesktopStatus(),
        sessionInvalidated: true,
      },
      nextCredentials: null,
      clearStoredCredentials: true,
    });
  });

  it('preserves the device-limit reason on an unauthorized session', () => {
    expect(resolveDesktopSessionProbe(credentials, {
      kind: 'unauthorized',
      sessionInvalidationReason: 'device_limit',
    })).toMatchObject({
      status: {
        connected: false,
        sessionInvalidated: true,
        sessionInvalidationReason: 'device_limit',
      },
      clearStoredCredentials: true,
    });
  });

  it('keeps cached desktop identity when auth/session errors', () => {
    expect(resolveDesktopSessionProbe(credentials, { kind: 'error' })).toEqual({
      status: buildCachedDesktopStatus(credentials),
      nextCredentials: credentials,
      clearStoredCredentials: false,
    });
  });

  it('keeps cached membership when auth/session errors', () => {
    expect(resolveDesktopSessionProbe(cachedMemberCredentials, { kind: 'error' })).toEqual({
      status: {
        connected: true,
        provider: 'google',
        username: 'vladelaina',
        primaryEmail: 'vladelaina@gmail.com',
        avatarUrl: 'https://example.com/avatar.png',
        membershipTier: 'pro',
        membershipName: 'Pro',
        persistent: true,
      },
      nextCredentials: cachedMemberCredentials,
      clearStoredCredentials: false,
    });
  });

  it('accepts cached ultra membership from the API tier model', () => {
    expect(buildCachedDesktopStatus({
      ...credentials,
      membershipTier: 'ultra',
      membershipName: 'Ultra',
    })).toMatchObject({
      connected: true,
      membershipTier: 'ultra',
      membershipName: 'Ultra',
      persistent: true,
    });
  });

  it('marks memory-only credentials as non-persistent', () => {
    expect(buildCachedDesktopStatus({
      ...credentials,
      persistent: false,
    })).toMatchObject({
      connected: true,
      username: 'vladelaina',
      persistent: false,
    });
  });

  it('filters unsafe cached avatar and membership fields', () => {
    expect(buildCachedDesktopStatus({
      ...credentials,
      avatarUrl: 'http://127.0.0.1/avatar.png',
      membershipName: 'P'.repeat(129),
    })).toMatchObject({
      connected: true,
      avatarUrl: null,
      membershipName: null,
      persistent: true,
    });
  });

  it('keeps cached credentials when the payload says disconnected', () => {
    expect(
      resolveDesktopSessionProbe(credentials, {
        kind: 'ok',
        payload: { connected: false },
      }),
    ).toEqual({
      status: buildCachedDesktopStatus(credentials),
      nextCredentials: credentials,
      clearStoredCredentials: false,
    });
  });

  it('merges payload identity when auth/session resolves successfully', () => {
    expect(
      resolveDesktopSessionProbe(credentials, {
        kind: 'ok',
        rotatedAppSessionToken: 'nts_rotated',
        payload: {
          connected: true,
          provider: 'google',
          username: 'octocat',
          primaryEmail: 'octo@example.com',
          avatarUrl: 'https://example.com/next.png',
          membershipTier: 'pro',
          membershipName: 'Pro',
        },
      }),
    ).toEqual({
      status: {
        connected: true,
        provider: 'google',
        username: 'octocat',
        primaryEmail: 'octo@example.com',
        avatarUrl: 'https://example.com/next.png',
        membershipTier: 'pro',
        membershipName: 'Pro',
        persistent: true,
      },
      nextCredentials: {
        appSessionToken: 'nts_rotated',
        provider: 'google',
        username: 'octocat',
        primaryEmail: 'octo@example.com',
        avatarUrl: 'https://example.com/next.png',
        membershipTier: 'pro',
        membershipName: 'Pro',
        authenticatedAt: null,
        persistent: true,
      },
      clearStoredCredentials: false,
    });
  });

  it('filters unsafe payload identity fields when auth/session resolves successfully', () => {
    expect(
      resolveDesktopSessionProbe(cachedMemberCredentials, {
        kind: 'ok',
        payload: {
          connected: true,
          username: `${' '.repeat(257)}octocat`,
          primaryEmail: `${' '.repeat(321)}octo@example.com`,
          avatarUrl: 'http://127.0.0.1/avatar.png',
          membershipName: 'P'.repeat(129),
        },
      }),
    ).toMatchObject({
      status: {
        connected: true,
        username: 'vladelaina',
        primaryEmail: 'vladelaina@gmail.com',
        avatarUrl: 'https://example.com/avatar.png',
        membershipName: 'Pro',
      },
      nextCredentials: {
        username: 'vladelaina',
        primaryEmail: 'vladelaina@gmail.com',
        avatarUrl: 'https://example.com/avatar.png',
        membershipName: 'Pro',
      },
    });
  });

  it('preserves authenticatedAt when auth/session refreshes stored credentials', () => {
    const resolved = resolveDesktopSessionProbe(recentlyAuthenticatedCredentials, {
      kind: 'ok',
      payload: {
        connected: true,
        username: 'vladelaina',
      },
    });

    expect(resolved.nextCredentials?.authenticatedAt).toBe(1_000);
    expect(isDesktopSessionWithinGracePeriod(resolved.nextCredentials, 20_000, 30_000)).toBe(true);
  });

  it('treats recent desktop auth records as being within the activation grace period', () => {
    expect(
      isDesktopSessionWithinGracePeriod(
        {
          ...credentials,
          authenticatedAt: 1_000,
        },
        20_000,
        30_000,
      ),
    ).toBe(true);

    expect(
      isDesktopSessionWithinGracePeriod(
        {
          ...credentials,
          authenticatedAt: 1_000,
        },
        40_000,
        30_000,
      ),
    ).toBe(false);

    expect(isDesktopSessionWithinGracePeriod(credentials, 20_000, 30_000)).toBe(false);
  });
});
