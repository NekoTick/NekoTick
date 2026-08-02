import {
  buildCachedDesktopStatus,
  buildDisconnectedDesktopStatus,
  isDesktopSessionWithinGracePeriod,
  resolveDesktopSessionProbe,
} from './accountSessionStatus.mjs';
import {
  buildDesktopSessionHeaders,
  desktopLegacySessionHeader,
} from './accountSessionAuth.mjs';
import { normalizeDesktopAccountProvider } from './accountCredentialStore.mjs';
import { createDesktopAccountJsonClient } from './accountJsonClient.mjs';
import {
  normalizeDesktopAccountAvatarUrl,
  normalizeDesktopAccountEmail,
  normalizeDesktopAccountMembershipName,
  normalizeDesktopAccountUsername,
} from './accountIdentityNormalization.mjs';
import {
  delay,
  raceWithAbort,
  throwIfAborted,
} from './accountSessionAbort.mjs';

const desktopSessionRetryDelaysMs = [250, 500, 1000, 2000, 3000, 5000];
const desktopSessionActivationGracePeriodMs = 60_000;

export function createDesktopAccountSessionClient({
  apiBaseUrl,
  fetchImpl = fetch,
  readStoredAccountCredentials,
  clearStoredAccountCredentialsIfCurrent,
  rotateStoredSessionToken,
  writeStoredAccountCredentialsIfCurrent,
}) {
  const { fetchDesktopJson, fetchJson, readJsonResponse } = createDesktopAccountJsonClient({ fetchImpl });

  function shouldGraceDesktopSession(credentials) {
    return isDesktopSessionWithinGracePeriod(
      credentials,
      Date.now(),
      desktopSessionActivationGracePeriodMs,
    );
  }

  async function performStoredSessionRequest(credentials, url, init = {}) {
    throwIfAborted(init.signal);
    const response = await raceWithAbort(fetchImpl(url, {
      ...init,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
        ...buildDesktopSessionHeaders(credentials.appSessionToken),
      },
    }), init.signal);
    throwIfAborted(init.signal);

    return response;
  }

  async function fetchWithStoredSession(url, init = {}) {
    throwIfAborted(init.signal);
    let credentials = await readStoredAccountCredentials();
    throwIfAborted(init.signal);
    if (!credentials) {
      throw new Error('vlaina sign-in required');
    }

    let response = await performStoredSessionRequest(credentials, url, init);
    const method = String(init.method ?? 'GET').toUpperCase();
    const retryUnauthorized = method === 'GET' || method === 'HEAD';

    for (let attempt = 0; attempt < desktopSessionRetryDelaysMs.length; attempt += 1) {
      if (!retryUnauthorized || response.status !== 401) {
        break;
      }
      if (!shouldGraceDesktopSession(credentials)) {
        break;
      }

      const delayMs = desktopSessionRetryDelaysMs[attempt];
      await delay(delayMs, init.signal);

      credentials = (await readStoredAccountCredentials()) ?? credentials;
      throwIfAborted(init.signal);
      response = await performStoredSessionRequest(credentials, url, init);
    }

    if (response.status === 401) {
      if (shouldGraceDesktopSession(credentials)) {
        throw new Error('vlaina session is still activating');
      }
      throw new Error('vlaina session is temporarily unavailable');
    }

    throwIfAborted(init.signal);
    await rotateStoredSessionToken(response.headers, credentials.appSessionToken);
    throwIfAborted(init.signal);
    return response;
  }

  async function fetchWithOptionalStoredSession(url, init = {}) {
    throwIfAborted(init.signal);
    const credentials = await readStoredAccountCredentials();
    throwIfAborted(init.signal);
    if (credentials) {
      return await fetchWithStoredSession(url, init);
    }

    const response = await raceWithAbort(fetchImpl(url, {
      ...init,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    }), init.signal);
    throwIfAborted(init.signal);

    return response;
  }

  async function probeDesktopSession(appSessionToken, eventPrefix = 'session_status:http', options = {}) {
    const sessionUrl = options.includeBudget
      ? `${apiBaseUrl}/auth/session?include_budget=1`
      : `${apiBaseUrl}/auth/session`;
    return await fetchJson(sessionUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: buildDesktopSessionHeaders(appSessionToken, {
        Accept: 'application/json',
      }),
    }, eventPrefix);
  }

  async function probeDesktopSessionWithRetry(
    appSessionToken,
    eventPrefix = 'session_status:http',
    { retryUnauthorized = true, includeBudget = false } = {},
  ) {
    let lastResult = await probeDesktopSession(appSessionToken, eventPrefix, { includeBudget });

    for (let attempt = 0; attempt < desktopSessionRetryDelaysMs.length; attempt += 1) {
      if (lastResult.response.status !== 401 && lastResult.response.status !== 403) {
        return lastResult;
      }
      if (!retryUnauthorized) {
        return lastResult;
      }

      const delayMs = desktopSessionRetryDelaysMs[attempt];
      await delay(delayMs);

      lastResult = await probeDesktopSession(
        appSessionToken,
        `${eventPrefix}:retry_${attempt + 1}`,
        { includeBudget },
      );
    }

    return lastResult;
  }

  async function getDesktopAccountSessionStatus() {
    const credentials = await readStoredAccountCredentials();
    if (!credentials) {
      return buildDisconnectedDesktopStatus({ sessionInvalidated: true });
    }

    try {
      const { response, payload, text } = await probeDesktopSessionWithRetry(
        credentials.appSessionToken,
        'session_status:http',
        { retryUnauthorized: shouldGraceDesktopSession(credentials), includeBudget: true },
      );
      const currentCredentials = await readStoredAccountCredentials();
      if (!currentCredentials || currentCredentials.appSessionToken !== credentials.appSessionToken) {
        return currentCredentials
          ? buildCachedDesktopStatus(currentCredentials)
          : buildDisconnectedDesktopStatus({ sessionInvalidated: true });
      }

      if (response.status === 401 || response.status === 403) {
        if (shouldGraceDesktopSession(credentials)) {
          return buildCachedDesktopStatus(credentials);
        }

        const resolved = resolveDesktopSessionProbe(credentials, { kind: 'unauthorized' });
        if (resolved.clearStoredCredentials) {
          await clearStoredAccountCredentialsIfCurrent(credentials.appSessionToken);
        }
        return resolved.status;
      }

      if (!response.ok) {
        return resolveDesktopSessionProbe(credentials, { kind: 'non_ok' }).status;
      }

      await rotateStoredSessionToken(response.headers, credentials.appSessionToken);
      const rotatedCredentials = await readStoredAccountCredentials();
      const responseToken = response.headers.get(desktopLegacySessionHeader)?.trim();
      const expectedCurrentToken = responseToken || credentials.appSessionToken;
      if (!rotatedCredentials || rotatedCredentials.appSessionToken !== expectedCurrentToken) {
        return rotatedCredentials
          ? buildCachedDesktopStatus(rotatedCredentials)
          : buildDisconnectedDesktopStatus({ sessionInvalidated: true });
      }
      const resolved = resolveDesktopSessionProbe(credentials, {
        kind: 'ok',
        payload,
        rotatedAppSessionToken: rotatedCredentials.appSessionToken,
      });
      if (resolved.clearStoredCredentials) {
        await clearStoredAccountCredentialsIfCurrent(rotatedCredentials.appSessionToken);
      }
      if (resolved.nextCredentials) {
        const written = await writeStoredAccountCredentialsIfCurrent(
          resolved.nextCredentials,
          rotatedCredentials.appSessionToken,
        );
        if (!written) {
          const latestCredentials = await readStoredAccountCredentials();
          return latestCredentials
            ? buildCachedDesktopStatus(latestCredentials)
            : buildDisconnectedDesktopStatus({ sessionInvalidated: true });
        }
      }

      return resolved.status;
    } catch (error) {
      const currentCredentials = await readStoredAccountCredentials();
      return currentCredentials
        ? buildCachedDesktopStatus(currentCredentials)
        : buildDisconnectedDesktopStatus({ sessionInvalidated: true });
    }
  }

  async function readDesktopSessionIdentity(appSessionToken) {
    const { response, payload, text } = await probeDesktopSessionWithRetry(
      appSessionToken,
      'session_identity:http',
    );

    if (response.status === 401 || response.status === 403) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to verify desktop session: HTTP ${response.status}`);
    }

    if (payload?.connected !== true) {
      return null;
    }

    const identity = {
      provider: normalizeDesktopAccountProvider(payload.provider),
      username: normalizeDesktopAccountUsername(payload.username),
      primaryEmail: normalizeDesktopAccountEmail(payload.primaryEmail),
      avatarUrl: normalizeDesktopAccountAvatarUrl(payload.avatarUrl),
      membershipTier:
        payload.membershipTier === 'free' ||
        payload.membershipTier === 'plus' ||
        payload.membershipTier === 'pro' ||
        payload.membershipTier === 'max' ||
        payload.membershipTier === 'ultra'
          ? payload.membershipTier
          : null,
      membershipName: normalizeDesktopAccountMembershipName(payload.membershipName),
    };
    return identity;
  }

  return {
    fetchDesktopJson,
    fetchWithOptionalStoredSession,
    fetchWithStoredSession,
    getDesktopAccountSessionStatus,
    readDesktopSessionIdentity,
    readJsonResponse,
  };
}
