import { resolveDesktopSessionToken } from './accountSessionAuth.mjs';
import { normalizeDesktopAccountProvider } from './accountCredentialStore.mjs';
import {
  normalizeDesktopAccountAvatarUrl,
  normalizeDesktopAccountEmail,
  normalizeDesktopAccountMembershipName,
  normalizeDesktopAccountUsername,
} from './accountIdentityNormalization.mjs';

export function createDesktopAuthPersistence({
  readDesktopSessionIdentity,
  writeStoredAccountCredentials,
}) {
  async function persistDesktopAuthResult(provider, result) {
    const appSessionToken = resolveDesktopSessionToken(result);
    const rawUsername = normalizeDesktopAccountUsername(result?.username);
    const rawPrimaryEmail = normalizeDesktopAccountEmail(result?.primaryEmail);
    const rawAvatarUrl = normalizeDesktopAccountAvatarUrl(result?.avatarUrl);
    const rawMembershipTier =
      result?.membershipTier === 'free' ||
      result?.membershipTier === 'plus' ||
      result?.membershipTier === 'pro' ||
      result?.membershipTier === 'max' ||
      result?.membershipTier === 'ultra'
        ? result.membershipTier
        : null;
    const rawMembershipName = normalizeDesktopAccountMembershipName(result?.membershipName);
    const budget = result?.budget && typeof result.budget === 'object' && !Array.isArray(result.budget)
      ? result.budget
      : null;

    if (!appSessionToken) {
      throw new Error('Account sign-in result missing session token');
    }

    const fallbackProvider =
      normalizeDesktopAccountProvider(result?.provider, null) ??
      provider;
    const fallbackUsername = rawUsername ?? rawPrimaryEmail ?? '';
    const fallbackPrimaryEmail = rawPrimaryEmail;
    const fallbackAvatarUrl = rawAvatarUrl;
    const authenticatedAt = Date.now();

    if (!fallbackUsername) {
      const sessionIdentity = await readDesktopSessionIdentity(appSessionToken).catch((error) => {
        return null;
      });
      const resolvedProvider =
        sessionIdentity?.provider ??
        fallbackProvider;
      const resolvedUsername = sessionIdentity?.username ?? fallbackUsername;
      const resolvedPrimaryEmail = sessionIdentity?.primaryEmail ?? fallbackPrimaryEmail;
      const resolvedAvatarUrl = sessionIdentity?.avatarUrl ?? fallbackAvatarUrl;
      const resolvedMembershipTier = rawMembershipTier ?? sessionIdentity?.membershipTier ?? null;
      const resolvedMembershipName = rawMembershipName ?? sessionIdentity?.membershipName ?? null;

      if (!resolvedUsername) {
        throw new Error('Account sign-in completed but no desktop account identity could be resolved');
      }

      const credentials = {
        appSessionToken,
        provider: resolvedProvider,
        username: resolvedUsername,
        primaryEmail: resolvedPrimaryEmail,
        avatarUrl: resolvedAvatarUrl,
        membershipTier: resolvedMembershipTier,
        membershipName: resolvedMembershipName,
        authenticatedAt,
      };
      const persistent = await writeStoredAccountCredentials(credentials);

      return {
        success: true,
        provider: resolvedProvider,
        username: resolvedUsername,
        primaryEmail: credentials.primaryEmail,
        avatarUrl: credentials.avatarUrl,
        membershipTier: credentials.membershipTier,
        membershipName: credentials.membershipName,
        ...(budget ? { budget } : {}),
        persistent: persistent !== false,
        error: null,
      };
    }

    const credentials = {
      appSessionToken,
      provider: fallbackProvider,
      username: fallbackUsername,
      primaryEmail: fallbackPrimaryEmail,
      avatarUrl: fallbackAvatarUrl,
      membershipTier: rawMembershipTier,
      membershipName: rawMembershipName,
      authenticatedAt,
    };
    const persistent = await writeStoredAccountCredentials(credentials);

    return {
      success: true,
      provider: fallbackProvider,
      username: fallbackUsername,
      primaryEmail: credentials.primaryEmail,
      avatarUrl: credentials.avatarUrl,
      membershipTier: credentials.membershipTier,
      membershipName: credentials.membershipName,
      ...(budget ? { budget } : {}),
      persistent: persistent !== false,
      error: null,
    };
  }

  return {
    persistDesktopAuthResult,
  };
}
