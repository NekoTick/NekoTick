import {
  buildDesktopSessionHeaders,
  desktopLegacySessionHeader,
} from './accountSessionAuth.mjs';
import {
  createAccountCredentialStore,
} from './accountCredentialStore.mjs';
import {
  buildDesktopDeviceHeaders,
  createDesktopDeviceIdentityStore,
} from './accountDeviceIdentity.mjs';
import { createDesktopAuthPersistence } from './accountAuthPersistence.mjs';
import { createDesktopAccountSessionClient } from './accountSessionClient.mjs';
import { createDesktopOauthFlow } from './accountDesktopOauthFlow.mjs';
import {
  accountErrorResult,
  getErrorMessage,
  normalizeEmailCodeInput,
  normalizeEmailInput,
  primitiveToString,
  raceWithAbort,
  retryTransientAccountNetworkError,
  withAccountRequestTimeout,
} from './accountAuthFlowUtils.mjs';

export function createDesktopAccountService({ apiBaseUrl, fetchImpl = fetch }) {
  const { getDesktopDeviceId } = createDesktopDeviceIdentityStore();
  void getDesktopDeviceId().catch(() => undefined);
  const {
    readStoredAccountCredentials,
    writeStoredAccountCredentials,
    writeStoredAccountCredentialsIfCurrent,
    clearStoredAccountCredentialsIfCurrent,
    rotateStoredSessionToken,
  } = createAccountCredentialStore({
    desktopLegacySessionHeader,
  });

  const sessionClient = createDesktopAccountSessionClient({
    apiBaseUrl,
    fetchImpl,
    readStoredAccountCredentials,
    clearStoredAccountCredentialsIfCurrent,
    rotateStoredSessionToken,
    writeStoredAccountCredentialsIfCurrent,
    getDesktopDeviceId,
  });
  const {
    fetchDesktopJson,
    fetchWithStoredSession,
    getDesktopAccountSessionStatus,
    readDesktopSessionIdentity,
    readJsonResponse,
  } = sessionClient;
  const { persistDesktopAuthResult } = createDesktopAuthPersistence({
    readDesktopSessionIdentity,
    writeStoredAccountCredentials,
  });
  const { cancelDesktopOauth, performDesktopOauth } = createDesktopOauthFlow({
    apiBaseUrl,
    fetchDesktopJson,
    persistDesktopAuthResult,
    getDesktopDeviceId,
  });
  let inFlightEmailVerification = null;

  async function verifyDesktopEmailCode(email, code) {
    let data;
    try {
      const deviceId = await getDesktopDeviceId();
      ({ data } = await withAccountRequestTimeout((signal) =>
        fetchDesktopJson(`${apiBaseUrl}/auth/email/verify-code`, {
          method: 'POST',
          signal,
          headers: buildDesktopDeviceHeaders(deviceId, {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            email,
            code,
            target: 'desktop',
          }),
        }))
      );
    } catch (error) {
      return accountErrorResult(getErrorMessage(error));
    }

    if (!data?.success) {
      return accountErrorResult(data?.error || 'Email sign-in failed');
    }

    return await persistDesktopAuthResult('email', data);
  }

  function registerAccountIpc({ handleIpc }) {
    handleIpc('desktop:account:get-session-status', async () => {
      return await getDesktopAccountSessionStatus();
    });

    handleIpc('desktop:account:start-auth', async (_event, provider) => {
      return await performDesktopOauth(primitiveToString(provider) ?? '');
    });

    handleIpc('desktop:account:cancel-auth', async () => {
      return cancelDesktopOauth();
    });

    handleIpc('desktop:account:request-email-code', async (_event, email, locale) => {
      const normalizedEmail = normalizeEmailInput(email);
      if (!normalizedEmail) {
        throw new Error('Invalid email address');
      }
      const normalizedLocale = primitiveToString(locale) || null;

      await retryTransientAccountNetworkError(() =>
        withAccountRequestTimeout(async (signal) => {
          const response = await raceWithAbort(fetchImpl(`${apiBaseUrl}/auth/email/request-code`, {
            method: 'POST',
            cache: 'no-store',
            signal,
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: normalizedEmail, locale: normalizedLocale }),
          }), signal);

          await readJsonResponse(response, `Failed to send verification code: HTTP ${response.status}`, signal);
        })
      );
      return true;
    });

    handleIpc('desktop:account:verify-email-code', async (_event, email, code) => {
      const normalizedEmail = normalizeEmailInput(email);
      if (!normalizedEmail) {
        return accountErrorResult('Invalid email address');
      }
      const normalizedCode = normalizeEmailCodeInput(code);
      if (!normalizedCode) {
        return accountErrorResult('Invalid verification code');
      }

      if (
        inFlightEmailVerification?.email === normalizedEmail &&
        inFlightEmailVerification.code === normalizedCode
      ) {
        return await inFlightEmailVerification.promise;
      }

      const verificationPromise = verifyDesktopEmailCode(normalizedEmail, normalizedCode);
      inFlightEmailVerification = {
        email: normalizedEmail,
        code: normalizedCode,
        promise: verificationPromise,
      };

      try {
        return await verificationPromise;
      } finally {
        if (inFlightEmailVerification?.promise === verificationPromise) {
          inFlightEmailVerification = null;
        }
      }
    });

    handleIpc('desktop:account:disconnect', async () => {
      const credentials = await readStoredAccountCredentials();
      if (credentials?.appSessionToken) {
        try {
          const deviceId = await getDesktopDeviceId();
          await withAccountRequestTimeout((signal) =>
            raceWithAbort(fetchImpl(`${apiBaseUrl}/auth/session/revoke`, {
              method: 'POST',
              signal,
              headers: buildDesktopDeviceHeaders(
                deviceId,
                buildDesktopSessionHeaders(credentials.appSessionToken),
              ),
            }), signal)
          );
        } catch {
        }
      }

      if (credentials?.appSessionToken) {
        await clearStoredAccountCredentialsIfCurrent(credentials.appSessionToken);
      }
    });
  }

  return {
    fetchWithStoredSession,
    readJsonResponse,
    registerAccountIpc,
  };
}
