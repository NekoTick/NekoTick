import { describe, expect, it, vi } from 'vitest';
import type { AIModel, Provider } from '@/lib/ai/types';
import { sendMessageWithEndpointFallback } from './sendMessageWithEndpointFallback';

function buildProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'provider-1',
    name: 'Test provider',
    type: 'newapi',
    apiHost: 'https://api.example.test/v1',
    apiKey: 'sk-test-token',
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function buildModel(overrides: Partial<AIModel> = {}): AIModel {
  return {
    id: 'provider-1::claude-test',
    apiModelId: 'claude-test',
    name: 'Claude Test',
    providerId: 'provider-1',
    enabled: true,
    createdAt: 1,
    ...overrides,
  };
}

function buildManagedProvider(): Provider {
  return buildProvider({
    id: 'vlaina-managed',
    name: 'Vlaina AI',
    apiHost: 'https://managed.example.test/v1',
    apiKey: '',
  });
}

describe('sendMessageWithEndpointFallback', () => {
  it('uses a verified model endpoint ahead of the provider endpoint', async () => {
    const updateProvider = vi.fn();
    const client = { sendMessage: vi.fn().mockResolvedValue('ok') };

    await expect(sendMessageWithEndpointFallback({
      content: 'hi',
      history: [],
      model: buildModel({ endpointType: 'anthropic', endpointTypeCheckedAt: 1 }),
      provider: buildProvider({ endpointType: 'openai', endpointTypeCheckedAt: 1 }),
      onChunk: vi.fn(),
      client,
      updateProvider,
    })).resolves.toBe('ok');

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage.mock.calls[0][3]).toMatchObject({ endpointType: 'anthropic' });
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('uses a verified provider endpoint when the model has no verified override', async () => {
    const updateProvider = vi.fn();
    const client = { sendMessage: vi.fn().mockResolvedValue('ok') };

    await sendMessageWithEndpointFallback({
      content: 'hi',
      history: [],
      model: buildModel(),
      provider: buildProvider({ endpointType: 'anthropic', endpointTypeCheckedAt: 1 }),
      onChunk: vi.fn(),
      client,
      updateProvider,
    });

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage.mock.calls[0][3]).toMatchObject({ endpointType: 'anthropic' });
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('tries an unverified provider once through the OpenAI-compatible endpoint and records success', async () => {
    const updateProvider = vi.fn();
    const client = { sendMessage: vi.fn().mockResolvedValue('openai ok') };

    await expect(sendMessageWithEndpointFallback({
      content: 'hi',
      history: [],
      model: buildModel({ endpointType: 'anthropic' }),
      provider: buildProvider({ endpointType: 'anthropic' }),
      onChunk: vi.fn(),
      client,
      updateProvider,
    })).resolves.toBe('openai ok');

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage.mock.calls[0][3]).toMatchObject({ endpointType: 'openai' });
    expect(updateProvider).toHaveBeenCalledWith('provider-1', {
      endpointType: 'openai',
      endpointTypeCheckedAt: expect.any(Number),
    });
  });

  it.each([
    ['invalid request', { statusCode: 400, message: 'Invalid request' }],
    ['endpoint-shaped forbidden response', { statusCode: 403, message: 'Unsupported endpoint' }],
    ['not found response', { statusCode: 404, message: 'Not found' }],
    ['method not allowed response', { statusCode: 405, message: 'Method not allowed' }],
    ['unprocessable response', { statusCode: 422, message: 'Unprocessable entity' }],
    ['rate limit response', { statusCode: 429, message: 'Too many requests' }],
    ['transient response', { statusCode: 503, message: 'Service unavailable' }],
    ['transport failure', new Error('AI_PROVIDER_CONNECTION_FAILED')],
  ])('does not replay a chat POST after a %s', async (_name, upstreamError) => {
    const updateProvider = vi.fn();
    const client = { sendMessage: vi.fn().mockRejectedValue(upstreamError) };

    await expect(sendMessageWithEndpointFallback({
      content: 'hi',
      history: [],
      model: buildModel(),
      provider: buildProvider({ endpointType: 'openai', endpointTypeCheckedAt: 1 }),
      onChunk: vi.fn(),
      client,
      updateProvider,
    })).rejects.toBe(upstreamError);

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage.mock.calls[0][3]).toMatchObject({ endpointType: 'openai' });
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('does not probe another endpoint when an unverified request fails', async () => {
    const upstreamError = { statusCode: 404, message: 'Not found' };
    const updateProvider = vi.fn();
    const client = { sendMessage: vi.fn().mockRejectedValue(upstreamError) };

    await expect(sendMessageWithEndpointFallback({
      content: 'hi',
      history: [],
      model: buildModel(),
      provider: buildProvider(),
      onChunk: vi.fn(),
      client,
      updateProvider,
    })).rejects.toBe(upstreamError);

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage.mock.calls[0][3]).toMatchObject({ endpointType: 'openai' });
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('forwards streaming chunks and request options without creating another attempt', async () => {
    const onChunk = vi.fn();
    const onComputerCommandStatus = vi.fn();
    const options = { computerUseEnabled: true, onComputerCommandStatus };
    const client = {
      sendMessage: vi.fn(async (
        _content,
        _history,
        _model,
        _provider,
        chunk,
        _signal,
        _options,
      ) => {
        chunk?.('partial');
        return 'complete';
      }),
    };

    await expect(sendMessageWithEndpointFallback({
      content: 'hi',
      history: [],
      model: buildModel(),
      provider: buildProvider({ endpointType: 'openai', endpointTypeCheckedAt: 1 }),
      onChunk,
      options,
      client,
    })).resolves.toBe('complete');

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage.mock.calls[0][6]).toBe(options);
    expect(onChunk).toHaveBeenCalledOnce();
    expect(onChunk).toHaveBeenCalledWith('partial');
  });

  it('does not call the provider when the request is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = { sendMessage: vi.fn() };

    await expect(sendMessageWithEndpointFallback({
      content: 'hi',
      history: [],
      model: buildModel(),
      provider: buildProvider(),
      onChunk: vi.fn(),
      signal: controller.signal,
      client,
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('does not record endpoint state when a request resolves after cancellation', async () => {
    const controller = new AbortController();
    const updateProvider = vi.fn();
    const client = {
      sendMessage: vi.fn(() => {
        controller.abort();
        return Promise.resolve('late result');
      }),
    };

    await expect(sendMessageWithEndpointFallback({
      content: 'hi',
      history: [],
      model: buildModel(),
      provider: buildProvider(),
      onChunk: vi.fn(),
      signal: controller.signal,
      client,
      updateProvider,
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('does not forward chunks emitted after cancellation', async () => {
    const controller = new AbortController();
    const onChunk = vi.fn();
    const client = {
      sendMessage: vi.fn(async (_content, _history, _model, _provider, chunk) => {
        controller.abort();
        chunk?.('late chunk');
        return 'late result';
      }),
    };

    await expect(sendMessageWithEndpointFallback({
      content: 'hi',
      history: [],
      model: buildModel(),
      provider: buildProvider({ endpointType: 'openai', endpointTypeCheckedAt: 1 }),
      onChunk,
      signal: controller.signal,
      client,
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('sends managed requests once without applying custom-provider endpoint state', async () => {
    const updateProvider = vi.fn();
    const client = { sendMessage: vi.fn().mockResolvedValue('managed ok') };

    await expect(sendMessageWithEndpointFallback({
      content: 'hi',
      history: [],
      model: buildModel({
        id: 'vlaina-managed::claude-test',
        providerId: 'vlaina-managed',
        endpointType: 'anthropic',
        endpointTypeCheckedAt: 1,
      }),
      provider: buildManagedProvider(),
      onChunk: vi.fn(),
      client,
      updateProvider,
    })).resolves.toBe('managed ok');

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage.mock.calls[0][3]).toEqual(buildManagedProvider());
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('does not replay managed failures', async () => {
    const upstreamError = new Error('UPSTREAM_UNAVAILABLE');
    const client = { sendMessage: vi.fn().mockRejectedValue(upstreamError) };

    await expect(sendMessageWithEndpointFallback({
      content: 'hi',
      history: [],
      model: buildModel({
        id: 'vlaina-managed::claude-test',
        providerId: 'vlaina-managed',
      }),
      provider: buildManagedProvider(),
      onChunk: vi.fn(),
      client,
    })).rejects.toBe(upstreamError);

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
  });
});
