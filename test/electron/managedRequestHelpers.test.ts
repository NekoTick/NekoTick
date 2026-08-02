import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManagedRequestHelpers } from '../../electron/managedRequestHelpers.mjs';

const MANAGED_MUTATION_TIMEOUT_MS = 300_000;

describe('managed request helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts managed mutations after five minutes and reports a timeout', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchWithStoredSession = vi.fn((_url: string, init: RequestInit) => {
      requestSignal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    });
    const helpers = createManagedRequestHelpers({
      apiBaseUrl: 'https://api.example.test',
      managedApiBaseUrl: 'https://api.example.test/v1',
      fetchWithStoredSession,
      readJsonResponse: vi.fn(),
    });

    const request = helpers.requestManagedJson('/chat/completions', { method: 'POST' });
    const expectation = expect(request).rejects.toThrow('Managed API request timed out.');
    expect(requestSignal?.aborted).toBe(false);
    expect(fetchWithStoredSession.mock.calls[0]?.[1]?.redirect).toBe('error');

    await vi.advanceTimersByTimeAsync(MANAGED_MUTATION_TIMEOUT_MS);

    expect(requestSignal?.aborted).toBe(true);
    await expectation;
  });
});
