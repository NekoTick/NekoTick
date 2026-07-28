import electron from 'electron';
import { isSupportedAccountProvider } from './accountCredentialStore.mjs';
import { bindDesktopAuthLoopbackServer } from './accountLoopbackServer.mjs';
import { normalizeExternalUrl } from './externalUrlPolicy.mjs';
import { buildDesktopDeviceHeaders } from './accountDeviceIdentity.mjs';
import {
  accountErrorResult,
  accountNetworkErrorResult,
  delay,
  generateDesktopVerifier,
  getErrorMessage,
  isSecureStorageUnavailableError,
  normalizeAuthStateInput,
  retryTransientAccountNetworkError,
  throwIfAborted,
  withAccountRequestTimeout,
} from './accountAuthFlowUtils.mjs';

const { shell } = electron;

export function createDesktopOauthFlow({
  apiBaseUrl,
  fetchDesktopJson,
  persistDesktopAuthResult,
  getDesktopDeviceId = async () => null,
}) {
  let activeOauthFlow = null;

  function buildDesktopAuthStartUrl(provider) {
    return `${apiBaseUrl}/auth/${provider}/desktop/start`;
  }

  function buildDesktopAuthResultUrl(provider) {
    return `${apiBaseUrl}/auth/${provider}/desktop/result`;
  }

  async function requestDesktopAuthResult(provider, state, verifier, resultToken, signal) {
    const deviceId = await getDesktopDeviceId();
    const { data } = await withAccountRequestTimeout((requestSignal) =>
      fetchDesktopJson(buildDesktopAuthResultUrl(provider), {
        method: 'POST',
        signal: requestSignal,
        headers: buildDesktopDeviceHeaders(deviceId, {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          state,
          verifier,
          resultToken,
        }),
      }), signal);
    return data;
  }

  async function waitForDesktopAuthCompletion(provider, state, verifier, resultToken, expiresInSeconds, signal) {
    const deadline = Date.now() + Math.max(300, Math.min(900, expiresInSeconds ?? 300)) * 1000;
    while (true) {
      throwIfAborted(signal);
      const result = await requestDesktopAuthResult(provider, state, verifier, resultToken, signal);
      if (result?.success === true || result?.pending !== true) {
        return result;
      }

      if (Date.now() >= deadline) {
        throw new Error('Authorization timed out');
      }

      await delay(200, signal);
    }
  }

  async function performDesktopOauth(provider) {
    if (!isSupportedAccountProvider(provider) || provider === 'email') {
      return accountErrorResult('Unsupported desktop sign-in provider');
    }
    activeOauthFlow?.cancel('Authorization cancelled');

    const verifier = generateDesktopVerifier();
    const abortController = new AbortController();
    const flow = {
      provider,
      cancelled: false,
      loopback: null,
      abortController,
      cancel(reason = 'Authorization cancelled') {
        this.cancelled = true;
        this.abortController.abort();
        this.loopback?.cancel(reason);
      },
    };
    activeOauthFlow = flow;
    let loopback = null;

    try {
      loopback = await bindDesktopAuthLoopbackServer({
        timeoutSeconds: 300,
      });
      flow.loopback = loopback;
      const deviceId = await getDesktopDeviceId();

      const { data: authStart } = await retryTransientAccountNetworkError(
        () =>
          withAccountRequestTimeout((requestSignal) =>
            fetchDesktopJson(buildDesktopAuthStartUrl(provider), {
              method: 'POST',
              signal: requestSignal,
              headers: buildDesktopDeviceHeaders(deviceId, {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              }),
              body: JSON.stringify({
                callbackUrl: loopback.callbackUrl,
                verifier,
              }),
            }), abortController.signal),
        abortController.signal,
      );

      const state = normalizeAuthStateInput(authStart?.state);
      const rawAuthUrl = typeof authStart?.authUrl === 'string' ? authStart.authUrl : '';
      const expiresInSeconds =
        typeof authStart?.expiresInSeconds === 'number' ? authStart.expiresInSeconds : 300;

      if (!authStart?.success || !state || !rawAuthUrl) {
        loopback.close();
        return accountErrorResult('Sign-in start response is missing auth URL or state');
      }
      let normalizedAuthUrl;
      try {
        normalizedAuthUrl = normalizeExternalUrl(rawAuthUrl);
      } catch {
        loopback.close();
        return accountErrorResult('Sign-in start response contains unsupported auth URL');
      }

      if (flow.cancelled) {
        loopback.close();
        return accountErrorResult('Authorization cancelled');
      }

      await shell.openExternal(normalizedAuthUrl);
      const callback = await loopback.waitForCallback();
      if (flow.cancelled) {
        return accountErrorResult('Authorization cancelled');
      }
      if (callback.state !== state) {
        return accountErrorResult('OAuth state mismatch');
      }
      const result = await waitForDesktopAuthCompletion(
        provider,
        callback.state,
        verifier,
        callback.resultToken,
        expiresInSeconds,
        abortController.signal
      );
      if (flow.cancelled) {
        return accountErrorResult('Authorization cancelled');
      }

      if (!result?.success) {
        return accountErrorResult(callback.error || result?.error || 'Authorization failed');
      }

      const persisted = await persistDesktopAuthResult(provider, result);
      if (flow.cancelled) {
        return accountErrorResult('Authorization cancelled');
      }
      return persisted;
    } catch (error) {
      loopback?.close();
      if (flow.cancelled || error?.name === 'AbortError') {
        return accountErrorResult('Authorization cancelled');
      }
      if (isSecureStorageUnavailableError(error)) {
        return accountErrorResult(getErrorMessage(error));
      }
      return accountNetworkErrorResult(error);
    } finally {
      if (activeOauthFlow === flow) {
        activeOauthFlow = null;
      }
    }
  }

  function cancelDesktopOauth() {
    if (!activeOauthFlow) {
      return false;
    }

    activeOauthFlow.cancel('Authorization cancelled');
    return true;
  }

  return { cancelDesktopOauth, performDesktopOauth };
}
