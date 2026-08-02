import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_PROVIDER_ERROR_BODY_BYTES,
  MAX_PROVIDER_JSON_RESPONSE_BODY_BYTES,
} from '../providers/boundedResponseText';
import type { AIModel, Provider } from '../types';
import { MANAGED_PROVIDER_ID } from '../managed/constants';
import { checkModelHealth } from './singleModel';

const provider: Provider = {
  id: 'provider-1',
  name: 'Provider',
  type: 'newapi',
  apiHost: 'https://api.example.com',
  apiKey: 'sk-test',
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
};

function createModel(id: string, overrides: Partial<AIModel> = {}): AIModel {
  return {
    id,
    apiModelId: id,
    name: id,
    providerId: provider.id,
    enabled: true,
    createdAt: 1,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkModelHealth', () => {
  it('uses embeddings endpoint for embedding models', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await checkModelHealth(provider, createModel('text-embedding-3-large'));
    expect(result.status).toBe('success');
    expect(result.endpoint).toBe('embeddings');

    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/embeddings');
    const body = JSON.parse(String(requestInit.body));
    expect(body.model).toBe('text-embedding-3-large');
    expect(body.input).toBe('hello world');
  });

  it('does not expose upstream business errors when HTTP status is 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await checkModelHealth(provider, createModel('gpt-4o-mini'));
    expect(result.status).toBe('error');
    expect(result.error).not.toContain('quota exceeded');
    expect(result.error).toContain('My brain needs a breather');
  });

  it('does not expose embedded xml errors returned inside chat success payloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '<error type="SERVER_ERROR" code="503">No available channel for model grok-4.1 under group default</error>',
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const result = await checkModelHealth(provider, createModel('grok-4.1'));
    expect(result.status).toBe('error');
    expect(result.error).not.toContain('No available channel for model grok-4.1 under group default');
    expect(result.error).toContain('My brain needs a breather');
  });

  it('treats plain-text 200 responses as errors without exposing the body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('No available channel for model grok-4.1 under group default', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    );

    const result = await checkModelHealth(provider, createModel('grok-4.1'));
    expect(result.status).toBe('error');
    expect(result.error).not.toContain('No available channel for model grok-4.1 under group default');
    expect(result.error).toContain('My brain needs a breather');
  });

  it('treats unexpected 200 payloads as errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await checkModelHealth(provider, createModel('gpt-4o-mini'));
    expect(result.status).toBe('error');
    expect(result.error).toContain('Unexpected benchmark response');
  });

  it('uses a minimal text prompt and output cap for chat health checks', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '6' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await checkModelHealth(provider, createModel('gpt-4o-mini'));
    expect(result.status).toBe('success');
    expect(result.endpoint).toBe('chat');

    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    const body = JSON.parse(String(requestInit.body));
    expect(body).toMatchObject({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'say 6' }],
      max_completion_tokens: 128,
      stream: false,
    });
  });

  it('uses the signed-in managed API session for managed model health checks', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '6' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const managedProvider = {
      ...provider,
      id: MANAGED_PROVIDER_ID,
      apiHost: 'https://should-not-be-used.example.test',
      apiKey: 'unused-test-key',
    };

    const result = await checkModelHealth(
      managedProvider,
      createModel('managed-gpt', { providerId: MANAGED_PROVIDER_ID, apiModelId: 'gpt-5.5-pro' })
    );

    expect(result).toMatchObject({ status: 'success', endpoint: 'chat' });
    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.vlaina.com/v1/chat/completions');
    expect(requestInit.credentials).toBe('include');
    expect(requestInit.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      model: 'gpt-5.5-pro',
      messages: [{ role: 'user', content: 'say 6' }],
      max_completion_tokens: 128,
      stream: false,
    });
  });

  it('reports managed API failures as model health errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'model unavailable' } }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const managedProvider = { ...provider, id: MANAGED_PROVIDER_ID };

    const result = await checkModelHealth(
      managedProvider,
      createModel('managed-gpt', { providerId: MANAGED_PROVIDER_ID })
    );

    expect(result).toMatchObject({
      status: 'error',
      error: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
      endpoint: 'chat',
    });
  });

  it('uses responses endpoint for codex-style models', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ output: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await checkModelHealth(provider, createModel('codex-mini-latest'));
    expect(result.status).toBe('success');
    expect(result.endpoint).toBe('responses');

    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/responses');
    const body = JSON.parse(String(requestInit.body));
    expect(body.input).toBe('say 6');
    expect(body.max_output_tokens).toBe(128);
  });

  it('accepts image benchmark success bodies larger than the error-body limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: 'x'.repeat(MAX_PROVIDER_ERROR_BODY_BYTES + 1) }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await checkModelHealth(provider, createModel('gpt-image-2'));

    expect(result).toMatchObject({
      status: 'success',
      endpoint: 'image',
    });
  });

  it('uses Anthropic messages endpoint when the provider endpoint type is Anthropic', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await checkModelHealth(
      { ...provider, endpointType: 'anthropic' },
      createModel('claude-sonnet-4-5')
    );
    expect(result.status).toBe('success');
    expect(result.endpoint).toBe('chat');

    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/messages');
    expect(requestInit.headers).toEqual({
      'x-api-key': 'sk-test',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'Content-Type': 'application/json',
    });
    const body = JSON.parse(String(requestInit.body));
    expect(body).toMatchObject({
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'say 6' }],
      max_tokens: 128,
    });
  });

  it('uses a model-level Anthropic endpoint type ahead of the provider endpoint type', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await checkModelHealth(
      { ...provider, endpointType: 'openai' },
      createModel('claude-sonnet-4-5', { endpointType: 'anthropic', endpointTypeCheckedAt: 1 })
    );
    expect(result.status).toBe('success');
    expect(result.endpoint).toBe('chat');

    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/messages');
    expect(requestInit.headers).toEqual({
      'x-api-key': 'sk-test',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'Content-Type': 'application/json',
    });
  });

  it('falls back to OpenAI for Claude health checks when a model-level Anthropic endpoint no longer matches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Not found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const result = await checkModelHealth(
      { ...provider, endpointType: 'openai' },
      createModel('claude-sonnet-4-5', { endpointType: 'anthropic', endpointTypeCheckedAt: 1 })
    );

    expect(result.status).toBe('success');
    expect(result.endpoint).toBe('chat');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.example.com/v1/messages');
    expect(fetchSpy.mock.calls[1][0]).toBe('https://api.example.com/v1/chat/completions');
    expect(fetchSpy.mock.calls[1][1]?.headers).toEqual({
      Authorization: 'Bearer sk-test',
      'Content-Type': 'application/json',
    });
  });

  it('ignores unverified model-level endpoint types during health checks', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await checkModelHealth(
      { ...provider, endpointType: 'openai' },
      createModel('claude-sonnet-4-5', { endpointType: 'anthropic' })
    );
    expect(result.status).toBe('success');

    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(requestInit.headers).toEqual({
      Authorization: 'Bearer sk-test',
      'Content-Type': 'application/json',
    });
  });

  it('falls back to the Anthropic endpoint for Claude health checks after OpenAI endpoint-shaped failures', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Not found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const result = await checkModelHealth(
      { ...provider, endpointType: 'openai' },
      createModel('claude-sonnet-4-5')
    );

    expect(result.status).toBe('success');
    expect(result.endpoint).toBe('chat');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions');
    expect(fetchSpy.mock.calls[1][0]).toBe('https://api.example.com/v1/messages');
    expect(fetchSpy.mock.calls[1][1]?.headers).toMatchObject({
      'x-api-key': 'sk-test',
      'anthropic-version': '2023-06-01',
    });
  });

  it('falls back to the Anthropic endpoint for Claude health checks after 403 endpoint mismatch responses', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          error: { message: '模型 claude-sonnet-4-6 不支持 /v1/chat/completions 接口' },
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const result = await checkModelHealth(
      { ...provider, endpointType: 'openai' },
      createModel('claude-sonnet-4-6')
    );

    expect(result.status).toBe('success');
    expect(result.endpoint).toBe('chat');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions');
    expect(fetchSpy.mock.calls[1][0]).toBe('https://api.example.com/v1/messages');
  });

  it('does not fall back to Anthropic for ordinary 403 Claude health check failures', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Forbidden request. Check model access.' } }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await checkModelHealth(
      { ...provider, endpointType: 'openai' },
      createModel('claude-sonnet-4-6')
    );

    expect(result).toMatchObject({
      status: 'error',
      endpoint: 'chat',
      error: 'Authentication failed. Check your API key or sign in again.',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to OpenAI for Claude health checks after provider Anthropic endpoint-shaped failures', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Not found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const result = await checkModelHealth(
      { ...provider, endpointType: 'anthropic' },
      createModel('claude-sonnet-4-5')
    );

    expect(result.status).toBe('success');
    expect(result.endpoint).toBe('chat');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.example.com/v1/messages');
    expect(fetchSpy.mock.calls[1][0]).toBe('https://api.example.com/v1/chat/completions');
  });

  it('does not hide Claude health check rate limits behind Anthropic fallback', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Too many requests' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await checkModelHealth(
      { ...provider, endpointType: 'openai' },
      createModel('claude-sonnet-4-5')
    );

    expect(result).toMatchObject({
      status: 'error',
      endpoint: 'chat',
      error: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions');
  });

  it('does not classify downstream abort-shaped failures as user-aborted benchmark requests', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue({ name: 'AbortError', message: 'Aborted' });

    const result = await checkModelHealth(provider, createModel('gpt-4o-mini'));

    expect(result).toMatchObject({
      status: 'error',
      error: 'The custom channel could not be reached. Check your network or the upstream service, then try again.',
      endpoint: 'chat',
    });
  });

  it('classifies external abort signals as aborted benchmark requests', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await checkModelHealth(provider, createModel('gpt-4o-mini'), {
      signal: controller.signal,
    });

    expect(result).toMatchObject({
      status: 'error',
      error: 'Request aborted',
      endpoint: 'chat',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('classifies external aborts during response body parsing as aborted benchmark requests', async () => {
    const controller = new AbortController();
    const reader = {
      read: vi.fn(async () => {
        controller.abort();
        return {
          done: false,
          value: new TextEncoder().encode(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
        };
      }),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: {
        getReader: () => reader,
      },
    } as unknown as Response);

    const result = await checkModelHealth(provider, createModel('gpt-4o-mini'), {
      signal: controller.signal,
    });

    expect(result).toMatchObject({
      status: 'error',
      error: 'Request aborted',
      endpoint: 'chat',
    });
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('classifies timeouts during response body parsing as benchmark timeouts', async () => {
    vi.useFakeTimers();
    try {
      const reader = {
        read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
        cancel: vi.fn(async () => undefined),
        releaseLock: vi.fn(),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: {
          getReader: () => reader,
        },
      } as unknown as Response);

      const pending = checkModelHealth(provider, createModel('gpt-4o-mini'), {
        timeoutMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(reader.read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);

      await expect(pending).resolves.toMatchObject({
        status: 'error',
        error: 'Request timed out (1s)',
        endpoint: 'chat',
      });
      expect(reader.cancel).toHaveBeenCalledTimes(1);
      expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows slow models to run past ten seconds before the default benchmark timeout', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      });

      let settled = false;
      const pending = checkModelHealth(provider, createModel('slow-thinking-model'))
        .finally(() => {
          settled = true;
        });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(60_000);
      await expect(pending).resolves.toMatchObject({
        status: 'error',
        error: 'Request timed out (70s)',
        endpoint: 'chat',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds oversized benchmark response bodies', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        cancel,
      }),
      {
        status: 200,
        headers: {
          'content-length': String(MAX_PROVIDER_JSON_RESPONSE_BODY_BYTES + 1),
        },
      }
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

    const result = await checkModelHealth(provider, createModel('gpt-4o-mini'));

    expect(result).toMatchObject({
      status: 'error',
      error: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
      endpoint: 'chat',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(() => response.body?.getReader()).not.toThrow();
  });
});
