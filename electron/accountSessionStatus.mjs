import {
  normalizeDesktopAccountAvatarUrl,
  normalizeDesktopAccountEmail,
  normalizeDesktopAccountMembershipName,
  normalizeDesktopAccountUsername,
} from './accountIdentityNormalization.mjs';

export function buildDisconnectedDesktopStatus(options = {}) {
  return {
    connected: false,
    provider: null,
    username: null,
    primaryEmail: null,
    avatarUrl: null,
    membershipTier: null,
    membershipName: null,
    ...(options.sessionInvalidated ? { sessionInvalidated: true } : {}),
    ...(options.sessionInvalidationReason === 'device_limit'
      ? { sessionInvalidationReason: 'device_limit' }
      : {}),
  };
}

export function buildCachedDesktopStatus(credentials) {
  return {
    connected: true,
    provider: credentials.provider,
    username: credentials.username,
    primaryEmail: normalizeDesktopAccountEmail(credentials.primaryEmail),
    avatarUrl: normalizeDesktopAccountAvatarUrl(credentials.avatarUrl),
    membershipTier:
      credentials.membershipTier === 'free' ||
      credentials.membershipTier === 'plus' ||
      credentials.membershipTier === 'pro' ||
      credentials.membershipTier === 'max' ||
      credentials.membershipTier === 'ultra'
        ? credentials.membershipTier
        : null,
    membershipName:
      normalizeDesktopAccountMembershipName(credentials.membershipName),
    persistent: credentials.persistent !== false,
  };
}

export function isDesktopSessionWithinGracePeriod(
  credentials,
  now = Date.now(),
  gracePeriodMs = 60_000,
) {
  const authenticatedAt =
    typeof credentials?.authenticatedAt === 'number' && Number.isFinite(credentials.authenticatedAt)
      ? credentials.authenticatedAt
      : null;

  if (authenticatedAt == null) {
    return false;
  }

  return now - authenticatedAt >= 0 && now - authenticatedAt <= gracePeriodMs;
}

export function resolveDesktopSessionProbe(credentials, probe) {
  if (!credentials) {
    return {
      status: buildDisconnectedDesktopStatus(),
      nextCredentials: null,
      clearStoredCredentials: false,
    };
  }

  if (probe.kind === 'unauthorized') {
    return {
      status: buildDisconnectedDesktopStatus({
        sessionInvalidated: true,
        sessionInvalidationReason: probe.sessionInvalidationReason,
      }),
      nextCredentials: null,
      clearStoredCredentials: true,
    };
  }

  if (probe.kind === 'non_ok') {
    return {
      status: buildCachedDesktopStatus(credentials),
      nextCredentials: credentials,
      clearStoredCredentials: false,
    };
  }

  if (probe.kind === 'error') {
    return {
      status: buildCachedDesktopStatus(credentials),
      nextCredentials: credentials,
      clearStoredCredentials: false,
    };
  }

  if (probe.payload?.connected !== true) {
    return {
      status: buildCachedDesktopStatus(credentials),
      nextCredentials: credentials,
      clearStoredCredentials: false,
    };
  }

  const payloadUsername = normalizeDesktopAccountUsername(probe.payload?.username);
  const payloadPrimaryEmail = normalizeDesktopAccountEmail(probe.payload?.primaryEmail);
  const payloadAvatarUrl = normalizeDesktopAccountAvatarUrl(probe.payload?.avatarUrl);
  const payloadMembershipName = normalizeDesktopAccountMembershipName(probe.payload?.membershipName);

  const nextCredentials = {
    appSessionToken: probe.rotatedAppSessionToken ?? credentials.appSessionToken,
    provider:
      typeof probe.payload?.provider === 'string' && probe.payload.provider.trim()
        ? probe.payload.provider.trim()
        : credentials.provider,
    username: payloadUsername ?? credentials.username,
    primaryEmail: payloadPrimaryEmail ?? normalizeDesktopAccountEmail(credentials.primaryEmail),
    avatarUrl: payloadAvatarUrl ?? normalizeDesktopAccountAvatarUrl(credentials.avatarUrl),
    membershipTier:
      probe.payload?.membershipTier === 'free' ||
      probe.payload?.membershipTier === 'plus' ||
      probe.payload?.membershipTier === 'pro' ||
      probe.payload?.membershipTier === 'max' ||
      probe.payload?.membershipTier === 'ultra'
        ? probe.payload.membershipTier
        : credentials.membershipTier ?? null,
    membershipName: payloadMembershipName ?? normalizeDesktopAccountMembershipName(credentials.membershipName),
    authenticatedAt: credentials.authenticatedAt ?? null,
    persistent: credentials.persistent !== false,
  };

  return {
    status: {
      connected: true,
      provider: nextCredentials.provider,
      username: nextCredentials.username,
      primaryEmail: nextCredentials.primaryEmail,
      avatarUrl: nextCredentials.avatarUrl,
      membershipTier: nextCredentials.membershipTier,
      membershipName: nextCredentials.membershipName,
      persistent: nextCredentials.persistent !== false,
      ...(probe.payload?.budget && typeof probe.payload.budget === 'object'
        ? { budget: probe.payload.budget }
        : {}),
    },
    nextCredentials,
    clearStoredCredentials: false,
  };
}
