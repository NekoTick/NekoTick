import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIErrorType, type AIModel, type ChatMessage, type Provider } from '../types';
import { getUserFacingAIError } from '../errors';
import { OpenAICompatibleClient } from './openai';
import { MAX_PROVIDER_MODEL_ID_CHARS, MAX_PROVIDER_MODEL_LIST_IDS } from './modelDetection';
import { MAX_OPENAI_STREAM_ERROR_FIELD_CHARS, MAX_OPENAI_STREAM_LINE_CHARS } from '@/lib/ai/streaming';
import { MAX_PROVIDER_ERROR_BODY_BYTES, MAX_PROVIDER_JSON_RESPONSE_BODY_BYTES } from './boundedResponseText';
import { MAX_INLINE_IMAGE_BYTES } from '@/lib/markdown/dataImagePolicy';
import { MAX_THINKING_TAG_MATCHES } from '@/lib/ai/stripThinkingContent';
import { MAX_API_TRANSCRIPT_MESSAGES, MAX_API_TRANSCRIPT_STRING_CHARS } from '@/lib/ai/apiTranscript';
import { MAX_CURRENT_REQUEST_CONTENT_PARTS, MAX_CURRENT_REQUEST_MESSAGE_CHARS } from '@/lib/ai/requestContext';
import { translate } from '@/lib/i18n';

const mocks = vi.hoisted(() => ({
  bridge: undefined as undefined | {
    computer?: {
      startCommand: ReturnType<typeof vi.fn>;
      cancelCommand: ReturnType<typeof vi.fn>;
      onCommandEvent: ReturnType<typeof vi.fn>;
    };
    webSearch?: {
      search: ReturnType<typeof vi.fn>;
      read: ReturnType<typeof vi.fn>;
      readBatch: ReturnType<typeof vi.fn>;
      cancelRequest: ReturnType<typeof vi.fn>;
    };
  },
}));

vi.mock('@/lib/electron/bridge', () => ({
  getElectronBridge: () => mocks.bridge,
}));

function buildProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'provider-1',
    name: 'Test',
    type: 'newapi',
    apiHost: 'https://api.example.com',
    apiKey: 'sk-test',
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function buildModel(overrides: Partial<AIModel> = {}): AIModel {
  return {
    id: 'provider-1::claude-sonnet-4-5',
    apiModelId: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    providerId: 'provider-1',
    enabled: true,
    createdAt: 1,
    ...overrides,
  };
}

function streamResponse(text: string): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

describe('OpenAICompatibleClient endpoint detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.bridge = undefined;
  });

  it('falls back to Anthropic model listing and returns the detected endpoint type', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-4-5' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider());

    expect(result).toEqual({
      models: ['claude-sonnet-4-5'],
      endpointType: 'anthropic',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-test' },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/v1/models',
      expect.objectContaining({
        headers: {
          'x-api-key': 'sk-test',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      }),
    );
  });

  it('accepts a recognized empty OpenAI-compatible model list without fallback', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider());

    expect(result).toEqual({ models: [], endpointType: 'openai' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back when an HTTP 200 model list has an invalid schema', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false,
        message: 'fake upstream failure',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: 'claude-sonnet-4-5' }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider());

    expect(result).toEqual({
      models: ['claude-sonnet-4-5'],
      endpointType: 'anthropic',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses a recorded Anthropic endpoint type first', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'claude-opus-4-1' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(
      buildProvider({ endpointType: 'anthropic' }),
    );

    expect(result.endpointType).toBe('anthropic');
    expect(result.models).toEqual(['claude-opus-4-1']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({
        headers: {
          'x-api-key': 'sk-test',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      }),
    );
  });

  it('falls back from a recorded Anthropic endpoint type to OpenAI-compatible model listing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(
      buildProvider({ endpointType: 'anthropic' }),
    );

    expect(result).toEqual({
      models: ['gpt-4o-mini'],
      endpointType: 'openai',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/v1/models',
      expect.objectContaining({
        headers: {
          'x-api-key': 'sk-test',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-test' },
      }),
    );
  });

  it('does not fall back to another endpoint after model listing is externally aborted', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
      controller.abort();
      return Promise.reject(new DOMException('cancelled', 'AbortError'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer sk-test' },
      signal: expect.any(AbortSignal),
    });
  });

  it('rejects model listing results that resolve after external cancellation', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => {
      controller.abort();
      return new Response(JSON.stringify({ data: [{ id: 'late-model' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces model listing timeouts as timeout failures instead of user cancellation', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const request = new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider());
      const expectation = expect(request).rejects.toThrow('Model listing request timed out.');

      await vi.advanceTimersByTimeAsync(10_000);
      await vi.advanceTimersByTimeAsync(10_000);

      await expectation;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps model listing timeouts active while parsing response bodies', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: () => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined),
            cancel: vi.fn(async () => undefined),
            releaseLock: vi.fn(),
          }),
        },
      }));
      vi.stubGlobal('fetch', fetchMock);

      const request = new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider());
      const expectation = expect(request).rejects.toThrow('Model listing request timed out.');

      await vi.advanceTimersByTimeAsync(10_000);
      await vi.advanceTimersByTimeAsync(10_000);

      await expectation;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts provider model listing responses larger than the small error-body limit', async () => {
    const largeModels = Array.from({ length: 4096 }, (_, index) => `provider-model-${index}`);
    const responseBody = JSON.stringify({ data: largeModels });
    expect(responseBody.length).toBeGreaterThan(MAX_PROVIDER_ERROR_BODY_BYTES);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(responseBody, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider());

    expect(result.endpointType).toBe('openai');
    expect(result.models).toHaveLength(MAX_PROVIDER_MODEL_LIST_IDS);
    expect(result.models[0]).toBe('provider-model-0');
  });

  it('cancels failed model listing response bodies before endpoint fallback', async () => {
    const cancel = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('unauthorized'));
          },
          cancel,
        }),
        { status: 401 },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-4-5' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider());

    expect(result).toEqual({
      models: ['claude-sonnet-4-5'],
      endpointType: 'anthropic',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('bounds oversized provider model listing JSON responses before falling back', async () => {
    const cancel = vi.fn();
    const oversizedResponse = new Response(
      new ReadableStream({
        cancel,
      }),
      {
        status: 200,
        headers: {
          'content-length': String(MAX_PROVIDER_JSON_RESPONSE_BODY_BYTES + 1),
        },
      },
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(oversizedResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-4-5' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider());

    expect(result).toEqual({
      models: ['claude-sonnet-4-5'],
      endpointType: 'anthropic',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(() => oversizedResponse.body?.getReader()).not.toThrow();
  });

  it('sanitizes model ids returned by provider model listing endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { id: ' gpt-4o-mini ' },
          'claude-sonnet-4-5',
          { id: '' },
          { id: 42 },
          { id: 'GPT-4O-MINI' },
          {},
          { id: 'CLAUDE-SONNET-4-5' },
        ],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider());

    expect(result).toEqual({
      models: ['gpt-4o-mini', 'claude-sonnet-4-5'],
      endpointType: 'openai',
    });
  });

  it('bounds model ids returned by provider model listing endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: `${'x'.repeat(MAX_PROVIDER_MODEL_ID_CHARS)}overflow` }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider());

    expect(result).toEqual({
      models: ['x'.repeat(MAX_PROVIDER_MODEL_ID_CHARS)],
      endpointType: 'openai',
    });
  });

  it('limits model ids returned by provider model listing endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: Array.from({ length: MAX_PROVIDER_MODEL_LIST_IDS + 5 }, (_, index) => `model-${index}`),
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider());

    expect(result.endpointType).toBe('openai');
    expect(result.models).toHaveLength(MAX_PROVIDER_MODEL_LIST_IDS);
    expect(result.models[0]).toBe('model-0');
    expect(result.models.at(-1)).toBe(`model-${MAX_PROVIDER_MODEL_LIST_IDS - 1}`);
  });

  it('uses alternate OpenAI-compatible model list fields when data has no valid ids', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: '' }, {}, 42],
        models: [' qwen3-coder ', { name: 'deepseek-chat' }, { model: 'kimi-k2' }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(buildProvider());

    expect(result).toEqual({
      models: ['qwen3-coder', 'deepseek-chat', 'kimi-k2'],
      endpointType: 'openai',
    });
  });

  it('sanitizes string model ids returned by Anthropic-compatible model listing endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [' claude-sonnet-4-5 ', { id: 'CLAUDE-SONNET-4-5' }, { id: 'claude-opus-4-1' }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().getModelsWithEndpointDetection(
      buildProvider({ endpointType: 'anthropic' }),
    );

    expect(result).toEqual({
      models: ['claude-sonnet-4-5', 'claude-opus-4-1'],
      endpointType: 'anthropic',
    });
  });

  it('sends chat requests to Anthropic when the endpoint type is recorded', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onChunk = vi.fn();

    const result = await new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      onChunk,
    );

    expect(result).toBe('hello');
    expect(onChunk).toHaveBeenCalledWith('hello');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'x-api-key': 'sk-test',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'Content-Type': 'application/json',
        },
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });
  });

  it('does not apply the computer-use text cap to normal Anthropic streams', async () => {
    const block = 'x'.repeat(600 * 1024);
    const encoder = new TextEncoder();
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        for (const text of [block, block]) {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text },
            })}\n\n`,
          ));
        }
        controller.close();
      },
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const result = await new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
    );

    expect(result).toHaveLength(block.length * 2);
  });

  it('accepts a complete Anthropic JSON response from a non-streaming compatible endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'message',
      content: [
        { type: 'thinking', thinking: 'plan' },
        { type: 'text', text: 'complete reply' },
      ],
    }))));
    const onChunk = vi.fn();

    const result = await new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      onChunk,
    );

    expect(result).toBe('<think>plan</think>complete reply');
    expect(onChunk).toHaveBeenLastCalledWith('<think>plan</think>complete reply');
  });

  it('sends current safe image inputs to Anthropic as image content blocks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"seen"}}\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      [
        { type: 'text', text: 'describe this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,aGk=' } },
      ],
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'aGk=',
            },
          },
        ],
      },
    ]);
  });

  it('does not send local attachment image URLs to Anthropic as content blocks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"seen"}}\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      [
        { type: 'text', text: 'describe this' },
        { type: 'image_url', image_url: { url: 'attachment://safe.png' } },
        { type: 'image_url', image_url: { url: 'app-file://attachment/local.png' } },
      ],
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
    );

    const bodyText = fetchMock.mock.calls[0][1].body;
    const body = JSON.parse(bodyText);
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'describe this' }],
      },
    ]);
    expect(bodyText).not.toContain('attachment://');
    expect(bodyText).not.toContain('app-file://');
  });

  it('sanitizes current text image references before Anthropic requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"seen"}}\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      'Look ![file](file:///tmp/secret.png) and <img src="attachment://safe.png" alt="local">',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
    );

    const bodyText = fetchMock.mock.calls[0][1].body;
    const body = JSON.parse(bodyText);
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: 'Look [Image] and [Image]',
      },
    ]);
    expect(bodyText).not.toContain('file:///tmp/secret.png');
    expect(bodyText).not.toContain('attachment://safe.png');
  });

  it('aborts Anthropic streams after response headers have returned', async () => {
    const cancelStream = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n',
        ));
      },
      cancel: cancelStream,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const chunks: string[] = [];

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      (chunk) => {
        chunks.push(chunk);
        controller.abort();
      },
      controller.signal,
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(chunks).toEqual(['partial']);
    expect(cancelStream).toHaveBeenCalled();
  });

  it('does not complete Anthropic streams after a residual chunk callback cancels', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response([
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"residual"}}',
      ].join('\n'), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const chunks: string[] = [];

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      (chunk) => {
        chunks.push(chunk);
        controller.abort();
      },
      controller.signal,
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(chunks).toEqual(['residual']);
  });

  it('normalizes non-abort Anthropic reader failures after chat cancellation', async () => {
    const controller = new AbortController();
    const stream = new ReadableStream({
      async pull() {
        controller.abort();
        throw new TypeError('reader closed by runtime');
      },
    });
    const response = new Response(stream, { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
      controller.signal,
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(() => response.body?.getReader()).not.toThrow();
  });

  it('rejects Anthropic streams promptly when reader read and cancel both ignore abort', async () => {
    const controller = new AbortController();
    const fakeReader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
      cancel: vi.fn(() => new Promise<void>(() => undefined)),
      releaseLock: vi.fn(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => fakeReader,
      },
    }));

    const request = new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
      controller.signal,
    );
    await vi.waitFor(() => expect(fakeReader.read).toHaveBeenCalled());

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fakeReader.cancel).toHaveBeenCalled();
    expect(fakeReader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('normalizes upstream Anthropic abort-shaped stream failures without treating them as chat cancellation', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new DOMException('provider stream aborted', 'AbortError'));
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
    )).rejects.toMatchObject({
      type: AIErrorType.SERVER_ERROR,
      message: 'provider stream aborted',
    });
  });

  it('rejects oversized Anthropic stream lines before parsing them', async () => {
    const cancelStream = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(MAX_OPENAI_STREAM_LINE_CHARS + 1)));
      },
      cancel: cancelStream,
    });
    const response = new Response(stream, { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
    )).rejects.toMatchObject({
      type: AIErrorType.UNKNOWN,
      message: 'AI stream line is too large',
    });

    expect(cancelStream).toHaveBeenCalledTimes(1);
    expect(() => response.body?.getReader()).not.toThrow();
  });

  it('rejects Anthropic stream buffers that grow too large before a newline arrives', async () => {
    const cancelStream = vi.fn();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('x'.repeat(MAX_OPENAI_STREAM_LINE_CHARS)));
        controller.enqueue(encoder.encode('x'));
      },
      cancel: cancelStream,
    });
    const response = new Response(stream, { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
    )).rejects.toMatchObject({
      type: AIErrorType.UNKNOWN,
      message: 'AI stream line is too large',
    });

    expect(cancelStream).toHaveBeenCalledTimes(1);
    expect(() => response.body?.getReader()).not.toThrow();
  });

  it('bounds Anthropic stream error messages before exposing them', async () => {
    const longMessage = 'x'.repeat(MAX_OPENAI_STREAM_ERROR_FIELD_CHARS + 1);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          `data: ${JSON.stringify({ type: 'error', error: { message: longMessage } })}\n`
        ));
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
    )).rejects.toMatchObject({
      type: AIErrorType.UNKNOWN,
      message: 'x'.repeat(MAX_OPENAI_STREAM_ERROR_FIELD_CHARS),
    });
  });

  it('keeps Anthropic request timeout active while reading error response bodies', async () => {
    vi.useFakeTimers();
    try {
      const reader = {
        read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
        cancel: vi.fn(async () => undefined),
        releaseLock: vi.fn(),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
        body: {
          getReader: () => reader,
        },
      }));
      const client = new OpenAICompatibleClient();
      (client as unknown as { timeout: number }).timeout = 10;

      const request = expect(client.sendMessage(
        'hi',
        [],
        buildModel(),
        buildProvider({ endpointType: 'anthropic' }),
        vi.fn(),
      )).rejects.toThrow('The AI request timed out.');
      await vi.advanceTimersByTimeAsync(0);
      expect(reader.read).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(20);

      await request;
      expect(reader.cancel).toHaveBeenCalled();
      expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds oversized Anthropic error response bodies', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(MAX_PROVIDER_ERROR_BODY_BYTES + 1)));
        },
        cancel,
      }),
      { status: 503 },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
    )).rejects.toMatchObject({
      type: AIErrorType.SERVER_ERROR,
      message: 'Unknown error',
      statusCode: 503,
    });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(() => response.body?.getReader()).not.toThrow();
  });

  it('routes GPT image models to the image generation endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: 'abc123', revised_prompt: 'A small red house' }],
      }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onChunk = vi.fn();

    const result = await new OpenAICompatibleClient().sendMessage(
      'draw a house',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      onChunk,
    );

    expect(result).toBe('![A small red house](<data:image/png;base64,abc123>)');
    expect(onChunk).toHaveBeenCalledWith('![A small red house](<data:image/png;base64,abc123>)');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        },
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      model: 'gpt-image-2',
      prompt: 'draw a house',
      n: 1,
    });
  });

  it('keeps the direct image request timeout active while reading the JSON body', async () => {
    vi.useFakeTimers();
    try {
      const reader = {
        read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
        cancel: vi.fn(async () => undefined),
        releaseLock: vi.fn(),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: { getReader: () => reader },
      }));
      const client = new OpenAICompatibleClient();
      (client as unknown as { timeout: number }).timeout = 10;

      const request = expect(client.sendMessage(
        'draw a house',
        [],
        buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
        buildProvider(),
        vi.fn(),
      )).rejects.toThrow('The AI request timed out.');
      await vi.advanceTimersByTimeAsync(0);
      expect(reader.read).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(20);

      await request;
      expect(reader.cancel).toHaveBeenCalled();
      expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns a localized validation error when computer control is enabled for an image model', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new OpenAICompatibleClient().sendMessage(
      'draw a house',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      vi.fn(),
      undefined,
      { computerUseEnabled: true },
    )).rejects.toMatchObject({
      type: AIErrorType.INVALID_REQUEST,
      message: translate('chat.computerUse.unavailableForModel'),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sanitizes current text image references before image generation requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: 'abc123', revised_prompt: 'A small red house' }],
      }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      'draw ![file](file:///tmp/secret.png) and <img src="attachment://safe.png" alt="local">',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      vi.fn(),
    );

    const bodyText = fetchMock.mock.calls[0][1].body;
    expect(JSON.parse(bodyText)).toEqual({
      model: 'gpt-image-2',
      prompt: 'draw [Image] and [Image]',
      n: 1,
    });
    expect(bodyText).not.toContain('file:///tmp/secret.png');
    expect(bodyText).not.toContain('attachment://safe.png');
  });

  it('does not emit direct image results after cancellation during response parsing', async () => {
    const controller = new AbortController();
    const reader = {
      read: vi.fn(async () => {
        controller.abort();
        return {
          done: false,
          value: new TextEncoder().encode(JSON.stringify({
            data: [{ b64_json: 'abc123', revised_prompt: 'A cancelled image' }],
          })),
        };
      }),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: {
        getReader: () => reader,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const onChunk = vi.fn();

    await expect(new OpenAICompatibleClient().sendMessage(
      'draw a house',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      onChunk,
      controller.signal,
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(onChunk).not.toHaveBeenCalled();
  });

  it('does not complete direct image generation after the chunk callback cancels', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: 'abc123', revised_prompt: 'A cancelled image' }],
      }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];

    await expect(new OpenAICompatibleClient().sendMessage(
      'draw a house',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      (chunk) => {
        chunks.push(chunk);
        controller.abort();
      },
      controller.signal,
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(chunks).toEqual(['![A cancelled image](<data:image/png;base64,abc123>)']);
  });

  it('aborts direct image response parsing while provider JSON is still pending', async () => {
    const controller = new AbortController();
    const readStarted = vi.fn();
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => {
        readStarted();
      })),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: {
        getReader: () => reader,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const onChunk = vi.fn();

    const request = new OpenAICompatibleClient().sendMessage(
      'draw a house',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      onChunk,
      controller.signal,
    );

    await vi.waitFor(() => expect(readStarted).toHaveBeenCalled());
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(onChunk).not.toHaveBeenCalled();
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('rejects direct image generation responses when the declared JSON body is too large', async () => {
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
      },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(new OpenAICompatibleClient().sendMessage(
      'draw a house',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      vi.fn(),
    )).rejects.toThrow('AI provider response body is too large.');

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(() => response.body?.getReader()).not.toThrow();
  });

  it('cancels direct provider JSON body reads when the streamed body exceeds the limit', async () => {
    const reader = {
      read: vi.fn(async () => ({
        done: false,
        value: { byteLength: MAX_PROVIDER_JSON_RESPONSE_BODY_BYTES + 1 } as Uint8Array,
      })),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: {
        getReader: () => reader,
      },
    }));

    await expect(new OpenAICompatibleClient().sendMessage(
      'draw a house',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      vi.fn(),
    )).rejects.toThrow('AI provider response body is too large.');

    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('escapes generated image markdown alt text and target', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: ' abc123\n ', revised_prompt: 'A ] weird\n prompt' }],
      }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().sendMessage(
      'draw',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      vi.fn(),
    );

    expect(result).toBe('![A \\] weird prompt](<data:image/png;base64,abc123>)');
  });

  it('drops invalid or oversized generated image base64 payloads', async () => {
    const oversizedPayload = 'A'.repeat(Math.ceil((MAX_INLINE_IMAGE_BYTES + 1) / 3) * 4);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [
          { b64_json: 'not base64!', revised_prompt: 'Invalid' },
          { b64_json: oversizedPayload, revised_prompt: 'Too large' },
        ],
      }), { status: 200 }),
    ));

    const result = await new OpenAICompatibleClient().sendMessage(
      'draw',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      vi.fn(),
    );

    expect(result).toBe('');
  });

  it('drops unsafe generated image URLs before composing markdown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [
          { url: 'javascript:alert(1)', revised_prompt: 'script' },
          { url: 'http://127.0.0.1:3000/secret.png', revised_prompt: 'local' },
          { url: 'https://user:pass@example.com/secret.png', revised_prompt: 'credentials' },
          { url: 'file:///tmp/secret.png', revised_prompt: 'file' },
          { url: 'data:image/svg+xml;base64,PHN2Zz4=', revised_prompt: 'svg' },
          { url: 'https://cdn.example.com/safe.png', revised_prompt: 'Safe image' },
        ],
      }), { status: 200 }),
    ));

    const result = await new OpenAICompatibleClient().sendMessage(
      'draw',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      vi.fn(),
    );

    expect(result).toBe('![Safe image](<https://cdn.example.com/safe.png>)');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('127.0.0.1');
    expect(result).not.toContain('file:///');
    expect(result).not.toContain('data:image/svg+xml');
  });

  it('bounds generated image alt text from revised prompts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: 'abc123', revised_prompt: 'a'.repeat(1000) }],
      }), { status: 200 }),
    ));

    const result = await new OpenAICompatibleClient().sendMessage(
      'draw',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      vi.fn(),
    );

    expect(result).toBe(`![${'a'.repeat(300)}](<data:image/png;base64,abc123>)`);
  });

  it('recognizes standalone image model names with provider prefixes and mixed separators', async () => {
    const cases = [
      'OpenAI/GPT_Image_2',
      'openai/DALL·E 3',
      'google/IMAGEN-4.0-generate-preview',
      'bfl/FLUX.1-dev',
      'stability/Stable Diffusion XL',
      'stability/sd3.5-large',
      'alibaba/Qwen_Image',
      'bytedance/Seedream-3.0',
      'ideogram/Ideogram-V3',
      'midjourney/MJ-v7',
      'HiDream-I1',
      'recraft-v3',
      'leonardo-phoenix',
    ];

    for (const apiModelId of cases) {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ url: `https://cdn.example.com/${encodeURIComponent(apiModelId)}.png` }] }), { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      await new OpenAICompatibleClient().sendMessage(
        'draw a house',
        [],
        buildModel({ apiModelId, name: apiModelId }),
        buildProvider(),
        vi.fn(),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/v1/images/generations',
        expect.any(Object),
      );
    }
  });

  it('routes standalone image model image inputs to the image edit endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ url: 'https://cdn.example.com/edited.png' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().sendMessage(
      [
        { type: 'text', text: 'turn this into a watercolor' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,aGk=' } },
      ],
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      vi.fn(),
    );

    expect(result).toBe('![Generated image 1](<https://cdn.example.com/edited.png>)');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/images/edits',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': expect.stringMatching(/^multipart\/form-data; boundary=/),
        }),
      }),
    );
    expect(fetchMock.mock.calls[0][1].body).toBeInstanceOf(Blob);
  });

  it('rejects unsupported image edit attachment formats before calling the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new OpenAICompatibleClient().sendMessage(
      [
        { type: 'text', text: 'edit this' },
        { type: 'image_url', image_url: { url: 'data:image/gif;base64,aGk=' } },
      ],
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      vi.fn(),
    )).rejects.toThrow('Image edits require a PNG, JPEG, or WebP image attachment.');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized image edit data URLs before decoding or calling the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const oversizedPayload = 'A'.repeat(Math.ceil((MAX_INLINE_IMAGE_BYTES + 1) / 3) * 4);

    await expect(new OpenAICompatibleClient().sendMessage(
      [
        { type: 'text', text: 'edit this' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${oversizedPayload}` } },
      ],
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider(),
      vi.fn(),
    )).rejects.toThrow('Image edits require a PNG, JPEG, or WebP image attachment.');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not leak rendered thinking or OpenAI transcript fields into Anthropic requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const history: ChatMessage[] = [{
      id: 'm1',
      role: 'assistant',
      content: '<think>private plan</think>Visible previous answer',
      apiTranscript: [{
        role: 'assistant',
        content: null,
        reasoning_content: 'private transcript',
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'web_search', arguments: '{"query":"x"}' },
        }],
      }],
      modelId: 'deepseek-chat',
      timestamp: 1,
      versions: [{ content: '<think>private version plan</think>Version answer', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }],
      currentVersionIndex: 0,
    }];

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      history,
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
    );

    const bodyText = fetchMock.mock.calls[0][1].body;
    const body = JSON.parse(bodyText);
    expect(body.messages).toEqual([
      { role: 'assistant', content: 'Visible previous answer' },
      { role: 'user', content: 'continue' },
    ]);
    expect(bodyText).not.toContain('<think>');
    expect(bodyText).not.toContain('private plan');
    expect(bodyText).not.toContain('private transcript');
    expect(bodyText).not.toContain('reasoning_content');
    expect(bodyText).not.toContain('tool_calls');
  });

  it('does not silently ignore web search on Anthropic endpoints', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new OpenAICompatibleClient().sendMessage(
        'hi',
        [],
        buildModel(),
        buildProvider({ endpointType: 'anthropic' }),
        vi.fn(),
        undefined,
        { webSearchEnabled: true },
      ),
    ).rejects.toThrow('Web search is unavailable for this model.');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bounds current OpenAI-compatible user message text before sending', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const oversizedText = `start ${'a'.repeat(MAX_CURRENT_REQUEST_MESSAGE_CHARS + 1000)} end`;

    await new OpenAICompatibleClient().sendMessage(
      oversizedText,
      [],
      buildModel({ apiModelId: 'gpt-4o-mini', name: 'GPT 4o mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const content = body.messages.at(-1).content;
    expect(content).toHaveLength(MAX_CURRENT_REQUEST_MESSAGE_CHARS);
    expect(content).toContain('[Earlier content omitted]');
  });

  it('bounds current Anthropic user message text blocks before sending', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      [
        { type: 'text', text: `first ${'a'.repeat(MAX_CURRENT_REQUEST_MESSAGE_CHARS + 1000)}` },
        { type: 'text', text: 'second text should be omitted' },
      ],
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userContent = body.messages.at(-1).content;
    expect(userContent).toEqual([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('[Earlier content omitted]'),
      }),
    ]);
    expect(userContent[0].text).toHaveLength(MAX_CURRENT_REQUEST_MESSAGE_CHARS);
    expect(JSON.stringify(userContent)).not.toContain('second text should be omitted');
  });

  it('bounds current Anthropic structured user message parts before sending', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      Array.from({ length: MAX_CURRENT_REQUEST_CONTENT_PARTS + 16 }, (_value, index) => ({
        type: 'text' as const,
        text: `part-${index}`,
      })),
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      vi.fn(),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userContent = body.messages.at(-1).content;
    expect(userContent).toHaveLength(MAX_CURRENT_REQUEST_CONTENT_PARTS);
    expect(JSON.stringify(userContent)).toContain(`part-${MAX_CURRENT_REQUEST_CONTENT_PARTS - 1}`);
    expect(JSON.stringify(userContent)).not.toContain(`part-${MAX_CURRENT_REQUEST_CONTENT_PARTS}`);
  });

  it('bounds current structured user message parts before sending', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      Array.from({ length: 160 }, (_value, index) => ({
        type: 'text' as const,
        text: `part-${index}`,
      })),
      [],
      buildModel({ apiModelId: 'gpt-4o-mini', name: 'GPT 4o mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userContent = body.messages.at(-1).content;
    expect(userContent).toHaveLength(MAX_CURRENT_REQUEST_CONTENT_PARTS);
    expect(JSON.stringify(userContent)).toContain(`part-${MAX_CURRENT_REQUEST_CONTENT_PARTS - 1}`);
    expect(JSON.stringify(userContent)).not.toContain(`part-${MAX_CURRENT_REQUEST_CONTENT_PARTS}`);
  });

  it('sanitizes current structured image URLs before OpenAI-compatible requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      [
        { type: 'text', text: 'describe these ![stored](attachment://safe.png)' },
        { type: 'image_url', image_url: { url: 'https://example.test/safe.png', detail: 'low' } },
        { type: 'image_url', image_url: { url: 'https://example.test/no-detail.png', detail: 'full' as never } },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,aGk=' } },
        { type: 'image_url', image_url: { url: 'https://user:pass@example.test/secret.png' } },
        { type: 'image_url', image_url: { url: 'http://127.0.0.1:3000/secret.png' } },
        { type: 'image_url', image_url: { url: 'file:///tmp/secret.png' } },
        { type: 'image_url', image_url: { url: 'attachment://safe.png' } },
        { type: 'image_url', image_url: { url: 'app-file://attachment/local.png' } },
      ],
      [],
      buildModel({ apiModelId: 'gpt-4o-mini', name: 'GPT 4o mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
    );

    const bodyText = fetchMock.mock.calls[0][1].body;
    const body = JSON.parse(bodyText);
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe these [Image]' },
          { type: 'image_url', image_url: { url: 'https://example.test/safe.png', detail: 'low' } },
          { type: 'image_url', image_url: { url: 'https://example.test/no-detail.png' } },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,aGk=' } },
        ],
      },
    ]);
    expect(bodyText).not.toContain('127.0.0.1');
    expect(bodyText).not.toContain('user:pass');
    expect(bodyText).not.toContain('file:///tmp/secret.png');
    expect(bodyText).not.toContain('attachment://safe.png');
    expect(bodyText).not.toContain('app-file://attachment/local.png');
  });

  it('sanitizes current string image markdown before OpenAI-compatible requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      'Look ![file](file:///tmp/secret.png) and <img src="attachment://safe.png" alt="local">',
      [],
      buildModel({ apiModelId: 'gpt-4o-mini', name: 'GPT 4o mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
    );

    const bodyText = fetchMock.mock.calls[0][1].body;
    const body = JSON.parse(bodyText);
    expect(body.messages).toEqual([
      { role: 'user', content: 'Look [Image] and [Image]' },
    ]);
    expect(bodyText).not.toContain('file:///tmp/secret.png');
    expect(bodyText).not.toContain('attachment://safe.png');
  });

  it('uses xAI native web search for official Grok models', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: 'Grok answer with sources.',
      citations: ['https://x.ai/news', 'https://docs.x.ai/docs/guides/live-search'],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];
    const statuses: unknown[] = [];

    const result = await new OpenAICompatibleClient().sendMessage(
      'what is new with xai?',
      [],
      buildModel({ apiModelId: 'grok-4', name: 'Grok 4' }),
      buildProvider({ name: 'xAI', apiHost: 'https://api.x.ai', endpointType: 'openai' }),
      (chunk) => chunks.push(chunk),
      undefined,
      {
        webSearchEnabled: true,
        onWebSearchStatus: (status) => statuses.push(status),
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.x.ai/v1/responses');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'grok-4',
      input: [{ role: 'user', content: 'what is new with xai?' }],
      tools: [{ type: 'web_search' }],
    });
    expect(body.tools[0].function).toBeUndefined();
    expect(result).toContain('<web-search-status>');
    expect(result).toContain('https://x.ai/news');
    expect(result).toContain('Grok answer with sources.');
    expect(chunks[chunks.length - 1]).toBe(result);
    expect(statuses).toEqual([
      { phase: 'searching', query: 'what is new with xai?' },
      {
        phase: 'results',
        results: [
          { title: 'x.ai', url: 'https://x.ai/news', snippet: '', publishedAt: null },
          { title: 'docs.x.ai', url: 'https://docs.x.ai/docs/guides/live-search', snippet: '', publishedAt: null },
        ],
        metrics: { resultCount: 2 },
      },
      {
        phase: 'complete',
        urls: ['https://x.ai/news', 'https://docs.x.ai/docs/guides/live-search'],
        metrics: { successCount: 2 },
      },
    ]);
  });

  it('does not replay xAI native search when the model rejects web search input', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      error: { message: 'Tool calling is unsupported for this model.' },
    }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new OpenAICompatibleClient().sendMessage(
      'search current xAI docs',
      [],
      buildModel({ apiModelId: 'grok-4', name: 'Grok 4' }),
      buildProvider({ name: 'xAI', apiHost: 'https://api.x.ai', endpointType: 'openai' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    )).rejects.toThrow('Web search is unavailable for this model.');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out xAI native web search when the provider never responds', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
      vi.stubGlobal('fetch', fetchMock);
      const client = new OpenAICompatibleClient();
      (client as unknown as { timeout: number }).timeout = 50;

      const request = client.sendMessage(
        'what is new with xai?',
        [],
        buildModel({ apiModelId: 'grok-4', name: 'Grok 4' }),
        buildProvider({ name: 'xAI', apiHost: 'https://api.x.ai', endpointType: 'openai' }),
        vi.fn(),
        undefined,
        { webSearchEnabled: true },
      );
      request.catch(() => undefined);

      await vi.advanceTimersByTimeAsync(50);

      await expect(request).rejects.toThrow('The AI request timed out.');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('filters local network xAI native search citation URLs before emitting sources', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: 'Grok answer with filtered sources.',
      citations: [
        'https://x.ai/news',
        'http://127.0.0.1:3000/admin',
        'http://localhost/admin',
        { url: 'http://192.168.1.1/router' },
        { url: 'https://docs.x.ai/docs/guides/live-search' },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const statuses: unknown[] = [];

    const result = await new OpenAICompatibleClient().sendMessage(
      'what is new with xai?',
      [],
      buildModel({ apiModelId: 'grok-4', name: 'Grok 4' }),
      buildProvider({ name: 'xAI', apiHost: 'https://api.x.ai', endpointType: 'openai' }),
      vi.fn(),
      undefined,
      {
        webSearchEnabled: true,
        onWebSearchStatus: (status) => statuses.push(status),
      },
    );

    expect(statuses).toEqual([
      { phase: 'searching', query: 'what is new with xai?' },
      {
        phase: 'results',
        results: [
          { title: 'x.ai', url: 'https://x.ai/news', snippet: '', publishedAt: null },
          { title: 'docs.x.ai', url: 'https://docs.x.ai/docs/guides/live-search', snippet: '', publishedAt: null },
        ],
        metrics: { resultCount: 2 },
      },
      {
        phase: 'complete',
        urls: ['https://x.ai/news', 'https://docs.x.ai/docs/guides/live-search'],
        metrics: { successCount: 2 },
      },
    ]);
    expect(result).toContain('https://x.ai/news');
    expect(result).toContain('https://docs.x.ai/docs/guides/live-search');
    expect(result).not.toContain('127.0.0.1');
    expect(result).not.toContain('localhost');
    expect(result).not.toContain('192.168.1.1');
  });

  it('does not emit xAI native search results after cancellation during response parsing', async () => {
    const controller = new AbortController();
    const reader = {
      read: vi.fn(async () => {
        controller.abort();
        return {
          done: false,
          value: new TextEncoder().encode(JSON.stringify({
            output_text: 'Grok answer after cancellation.',
            citations: ['https://x.ai/news'],
          })),
        };
      }),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: {
        getReader: () => reader,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];
    const statuses: unknown[] = [];

    await expect(new OpenAICompatibleClient().sendMessage(
      'what is new with xai?',
      [],
      buildModel({ apiModelId: 'grok-4', name: 'Grok 4' }),
      buildProvider({ name: 'xAI', apiHost: 'https://api.x.ai', endpointType: 'openai' }),
      (chunk) => chunks.push(chunk),
      controller.signal,
      {
        webSearchEnabled: true,
        onWebSearchStatus: (status) => statuses.push(status),
      },
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(chunks).toEqual(['<web-search-status>{"phase":"searching"}</web-search-status>']);
    expect(statuses).toEqual([{ phase: 'searching', query: 'what is new with xai?' }]);
  });

  it('does not start xAI native search when the initial status callback cancels', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];
    const statuses: unknown[] = [];

    await expect(new OpenAICompatibleClient().sendMessage(
      'what is new with xai?',
      [],
      buildModel({ apiModelId: 'grok-4', name: 'Grok 4' }),
      buildProvider({ name: 'xAI', apiHost: 'https://api.x.ai', endpointType: 'openai' }),
      (chunk) => chunks.push(chunk),
      controller.signal,
      {
        webSearchEnabled: true,
        onWebSearchStatus: (status) => {
          statuses.push(status);
          controller.abort();
        },
      },
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(chunks).toEqual([]);
    expect(statuses).toEqual([{ phase: 'searching', query: 'what is new with xai?' }]);
  });

  it('aborts xAI native search response parsing while provider JSON is still pending', async () => {
    const controller = new AbortController();
    const readStarted = vi.fn();
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => {
        readStarted();
      })),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: {
        getReader: () => reader,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];
    const statuses: unknown[] = [];

    const request = new OpenAICompatibleClient().sendMessage(
      'what is new with xai?',
      [],
      buildModel({ apiModelId: 'grok-4', name: 'Grok 4' }),
      buildProvider({ name: 'xAI', apiHost: 'https://api.x.ai', endpointType: 'openai' }),
      (chunk) => chunks.push(chunk),
      controller.signal,
      {
        webSearchEnabled: true,
        onWebSearchStatus: (status) => statuses.push(status),
      },
    );

    await vi.waitFor(() => expect(readStarted).toHaveBeenCalled());
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(chunks).toEqual(['<web-search-status>{"phase":"searching"}</web-search-status>']);
    expect(statuses).toEqual([{ phase: 'searching', query: 'what is new with xai?' }]);
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('strips rendered web search statuses from xAI native search conversation input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: 'Follow-up answer.',
      citations: [{ url: 'https://x.ai/news' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const history: ChatMessage[] = [{
      id: 'assistant-1',
      role: 'assistant',
      content: '<web-search-status>{"phase":"results","results":[{"title":"Old","url":"https://old.example","snippet":"","publishedAt":null}]}</web-search-status>\n\nPrevious answer.',
      modelId: 'grok-4',
      timestamp: 1,
      versions: [],
      currentVersionIndex: 0,
    }];

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      history,
      buildModel({ apiModelId: 'grok-4', name: 'Grok 4' }),
      buildProvider({ name: 'xAI', apiHost: 'https://api.x.ai', endpointType: 'openai' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toEqual([
      { role: 'assistant', content: 'Previous answer.' },
      { role: 'user', content: 'continue' },
    ]);
    expect(fetchMock.mock.calls[0][1].body).not.toContain('<web-search-status>');
  });

  it('extracts nested xAI citation URLs for clickable search sources', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{
        type: 'message',
        content: [{
          type: 'output_text',
          text: 'Nested citation answer.',
          annotations: [{
            type: 'url_citation',
            url_citation: { url: 'https://docs.x.ai/docs/guides/live-search' },
          }],
        }],
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().sendMessage(
      'what is new with xai?',
      [],
      buildModel({ apiModelId: 'grok-4', name: 'Grok 4' }),
      buildProvider({ name: 'xAI', apiHost: 'https://api.x.ai', endpointType: 'openai' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toContain('<web-search-status>');
    expect(result).toContain('https://docs.x.ai/docs/guides/live-search');
    expect(result).toContain('Nested citation answer.');
  });

  it('bounds deep xAI citation scans without losing shallow sources', async () => {
    const deepOutput = `${'{"output":['.repeat(20_001)}{"url":"https://deep.example.com/source"}${']}'.repeat(20_001)}`;
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      '{"output_text":"Bounded citation answer.",',
      '"citations":["https://x.ai/news"],',
      `"output":${deepOutput}}`,
    ].join(''), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().sendMessage(
      'what is new with xai?',
      [],
      buildModel({ apiModelId: 'grok-4', name: 'Grok 4' }),
      buildProvider({ name: 'xAI', apiHost: 'https://api.x.ai', endpointType: 'openai' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toContain('<web-search-status>');
    expect(result).toContain('https://x.ai/news');
    expect(result).not.toContain('https://deep.example.com/source');
    expect(result).toContain('Bounded citation answer.');
  });

  it('rejects xAI native search responses that contain sources but no visible answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: '',
      citations: ['https://x.ai/news'],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];

    await expect(
      new OpenAICompatibleClient().sendMessage(
        'what is new with xai?',
        [],
        buildModel({ apiModelId: 'grok-4', name: 'Grok 4' }),
        buildProvider({ name: 'xAI', apiHost: 'https://api.x.ai', endpointType: 'openai' }),
        (chunk) => chunks.push(chunk),
        undefined,
        { webSearchEnabled: true },
      ),
    ).rejects.toThrow('returned no visible answer');

    expect(chunks).toEqual(['<web-search-status>{"phase":"searching"}</web-search-status>']);
  });

  it('does not inject local web search tools for non-xAI Grok-compatible providers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"provider-native answer"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().sendMessage(
      'search something',
      [],
      buildModel({ apiModelId: 'x-ai/grok-4', name: 'Grok 4' }),
      buildProvider({ name: 'OpenRouter', apiHost: 'https://openrouter.ai/api', endpointType: 'openai' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toBe('provider-native answer');
    expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it('lets OpenRouter Claude decide whether to use web search tools', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"claude direct answer"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);
    mocks.bridge = {
      webSearch: {
        search: vi.fn(async () => ({
          query: 'search something current',
          results: [{
            title: 'Current source',
            url: 'https://example.com/source',
            snippet: 'Useful source.',
            publishedAt: null,
            source: null,
            thumbnail: null,
          }],
        })),
        read: vi.fn(),
        readBatch: vi.fn(async () => [{
          url: 'https://example.com/source',
          ok: true,
          page: {
            title: 'Current source',
            summary: '',
            siteName: 'example.com',
            finalUrl: 'https://example.com/source',
            content: 'Readable source content.',
            charCount: 24,
          },
        }]),
        cancelRequest: vi.fn(),
      },
    };

    const result = await new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5' }),
      buildProvider({ name: 'OpenRouter', apiHost: 'https://openrouter.ai/api', endpointType: 'openai' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toBe('claude direct answer');
    expect(mocks.bridge.webSearch?.search).not.toHaveBeenCalled();
    expect(mocks.bridge.webSearch?.readBatch).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('anthropic/claude-sonnet-4.5');
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('<web_search_request>');
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'hi' });
  });

  it('routes managed provider web search through the text protocol without tools', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"managed direct answer"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({
        id: 'vlaina-managed:openai/gpt-oss-20b',
        apiModelId: 'openai/gpt-oss-20b',
        name: 'GPT OSS 20B',
        providerId: 'vlaina-managed',
      }),
      buildProvider({
        id: 'vlaina-managed',
        name: 'vlaina managed',
        endpointType: 'openai',
      }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toBe('managed direct answer');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.vlaina.com/v1/chat/completions');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('openai/gpt-oss-20b');
    expect(body.stream).toBe(true);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('<web_search_request>');
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'hi' });
  });

  it('routes managed computer control through native tool calls', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(streamResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{
          index: 0,
          id: 'call-disk',
          type: 'function',
          function: { name: 'run_command', arguments: '{"command":"df' },
        }] } }] })}`,
        `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{
          index: 0,
          function: { arguments: ' -h","purpose":"Inspect disk usage"}' },
        }] } }] })}`,
        'data: [DONE]',
        '',
      ].join('\n\n')))
      .mockResolvedValueOnce(streamResponse([
        'data: {"choices":[{"delta":{"content":"Disk usage"}}]}',
        'data: {"choices":[{"delta":{"content":" was inspected."}}]}',
        'data: [DONE]',
        '',
      ].join('\n\n')));
    vi.stubGlobal('fetch', fetchMock);
    mocks.bridge = {
      computer: {
        startCommand: vi.fn(async () => ({
          status: 'completed',
          command: 'df -h',
          cwd: '/tmp/project',
          exitCode: 0,
          stdout: 'Filesystem  Size  Used  Avail',
          stderr: '',
          durationMs: 5,
        })),
        cancelCommand: vi.fn(async () => true),
        onCommandEvent: vi.fn(() => () => undefined),
      },
    };

    const onChunk = vi.fn();
    const result = await new OpenAICompatibleClient().sendMessage(
      'Inspect disk usage',
      [],
      buildModel({
        id: 'vlaina-managed:deepseek-v4-flash',
        apiModelId: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        providerId: 'vlaina-managed',
      }),
      buildProvider({ id: 'vlaina-managed', name: 'vlaina managed', apiKey: '' }),
      onChunk,
      undefined,
      { computerUseEnabled: true, computerUseCwd: '/tmp/project' },
    );

    expect(result).toBe('Disk usage was inspected.');
    expect(mocks.bridge.computer?.startCommand).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse(call[1].body);
      expect(body.stream).toBe(true);
      expect(body.tools).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'function', function: expect.objectContaining({ name: 'run_command' }) }),
      ]));
      expect(body.tool_choice).toBe('auto');
    }
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', tool_calls: expect.any(Array) }),
      expect.objectContaining({ role: 'tool', tool_call_id: 'call-disk' }),
    ]));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages.at(-1).content).not.toContain('fileChanges');
    expect(onChunk.mock.calls.map(([content]) => content).filter(Boolean).slice(0, 2)).toEqual([
      'Disk usage',
      'Disk usage was inspected.',
    ]);
  });

  it('keeps accepted managed DSML tool responses out of visible chunks', async () => {
    const commandMarkup = '<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="run_command"><｜｜DSML｜｜parameter name="command">pwd</｜｜DSML｜｜parameter><｜｜DSML｜｜parameter name="purpose">Inspect cwd</｜｜DSML｜｜parameter></｜｜DSML｜｜invoke></｜｜DSML｜｜tool_calls>';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(streamResponse([
        'data: {"choices":[{"delta":{"content":"<"}}]}',
        `data: ${JSON.stringify({ choices: [{ delta: { content: commandMarkup.slice(1) } }] })}`,
        'data: [DONE]',
        '',
      ].join('\n\n')))
      .mockResolvedValueOnce(streamResponse([
        'data: {"choices":[{"delta":{"content":"Directory"}}]}',
        'data: {"choices":[{"delta":{"content":" inspected."}}]}',
        'data: [DONE]',
        '',
      ].join('\n\n')));
    vi.stubGlobal('fetch', fetchMock);
    const startCommand = vi.fn(async () => ({
      status: 'completed',
      command: 'pwd',
      cwd: '/tmp/project',
      exitCode: 0,
      stdout: '/tmp/project\n',
      stderr: '',
      durationMs: 2,
    }));
    mocks.bridge = {
      computer: {
        startCommand,
        cancelCommand: vi.fn(async () => true),
        onCommandEvent: vi.fn(() => () => undefined),
      },
    };
    const onChunk = vi.fn();

    const result = await new OpenAICompatibleClient().sendMessage(
      'Inspect the working directory',
      [],
      buildModel({ id: 'vlaina-managed:test-model', apiModelId: 'test-model', providerId: 'vlaina-managed' }),
      buildProvider({ id: 'vlaina-managed', name: 'vlaina managed', apiKey: '' }),
      onChunk,
      undefined,
      { computerUseEnabled: true, computerUseCwd: '/tmp/project' },
    );

    expect(result).toBe('Directory inspected.');
    expect(startCommand).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(onChunk.mock.calls)).not.toContain('DSML');
    expect(onChunk.mock.calls.map(([content]) => content).filter(Boolean).slice(0, 2)).toEqual([
      'Directory',
      'Directory inspected.',
    ]);
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).tools)).toEqual([
      expect.any(Array),
      expect.any(Array),
    ]);
  });

  it('never re-emits incomplete managed DSML during finalization', async () => {
    const malformedMarkup = '<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="run_command">';
    const fetchMock = vi.fn().mockResolvedValueOnce(streamResponse([
      'data: {"choices":[{"delta":{"content":"<"}}]}',
      `data: ${JSON.stringify({ choices: [{ delta: { content: malformedMarkup.slice(1) } }] })}`,
      'data: [DONE]',
      '',
    ].join('\n\n')));
    vi.stubGlobal('fetch', fetchMock);
    const onChunk = vi.fn();

    await expect(new OpenAICompatibleClient().sendMessage(
      'Inspect the working directory',
      [],
      buildModel({ id: 'vlaina-managed:test-model', apiModelId: 'test-model', providerId: 'vlaina-managed' }),
      buildProvider({ id: 'vlaina-managed', name: 'vlaina managed', apiKey: '' }),
      onChunk,
      undefined,
      { computerUseEnabled: true, computerUseCwd: '/tmp/project' },
    )).rejects.toMatchObject({ type: AIErrorType.INVALID_REQUEST });

    expect(JSON.stringify(onChunk.mock.calls)).not.toContain('DSML');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not replay managed computer-use requests when native tools are unsupported', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      success: false,
      error: 'UNSUPPORTED_TOOL_CALLING',
      errorCode: 'unsupported_tool_calling',
    }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    mocks.bridge = {
      computer: {
        startCommand: vi.fn(async () => ({
          status: 'completed',
          command: 'pwd',
          cwd: '/tmp/project',
          exitCode: 0,
          stdout: '/tmp/project',
          stderr: '',
          durationMs: 2,
        })),
        cancelCommand: vi.fn(async () => true),
        onCommandEvent: vi.fn(() => () => undefined),
      },
    };

    await expect(new OpenAICompatibleClient().sendMessage(
      'Inspect the working directory',
      [],
      buildModel({ id: 'vlaina-managed:test-model', apiModelId: 'test-model', providerId: 'vlaina-managed' }),
      buildProvider({ id: 'vlaina-managed', name: 'vlaina managed', apiKey: '' }),
      vi.fn(),
      undefined,
      { computerUseEnabled: true, computerUseCwd: '/tmp/project' },
    )).rejects.toMatchObject({
      type: AIErrorType.INVALID_REQUEST,
      message: translate('chat.computerUse.unavailableForModel'),
    });

    expect(mocks.bridge.computer?.startCommand).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const nativeBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(nativeBody.tools).toEqual(expect.any(Array));
    expect(nativeBody.stream).toBe(true);
  });

  it('never falls back after a managed native command has entered the local approval flow', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(streamResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{
          index: 0,
          id: 'call-once',
          type: 'function',
          function: {
            name: 'run_command',
            arguments: '{"command":"pwd","purpose":"Inspect working directory"}',
          },
        }] } }] })}`,
        'data: [DONE]',
        '',
      ].join('\n\n')))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false,
        error: 'UNSUPPORTED_TOOL_CALLING',
        errorCode: 'unsupported_tool_calling',
      }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const startCommand = vi.fn(async () => ({
      status: 'completed',
      command: 'pwd',
      cwd: '/tmp/project',
      exitCode: 0,
      stdout: '/tmp/project',
      stderr: '',
      durationMs: 2,
    }));
    mocks.bridge = {
      computer: {
        startCommand,
        cancelCommand: vi.fn(async () => true),
        onCommandEvent: vi.fn(() => () => undefined),
      },
    };

    await expect(new OpenAICompatibleClient().sendMessage(
      'Inspect the working directory',
      [],
      buildModel({ id: 'vlaina-managed:test-model', apiModelId: 'test-model', providerId: 'vlaina-managed' }),
      buildProvider({ id: 'vlaina-managed', name: 'vlaina managed', apiKey: '' }),
      vi.fn(),
      undefined,
      { computerUseEnabled: true, computerUseCwd: '/tmp/project' },
    )).rejects.toMatchObject({
      type: AIErrorType.INVALID_REQUEST,
      message: translate('chat.computerUse.unavailableForModel'),
    });

    expect(startCommand).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses visible text instead of native command transcripts in later managed turns with computer control on or off', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        streamResponse('data: {"choices":[{"delta":{"content":"The second turn works."}}]}\n\ndata: [DONE]\n\n'),
      )
      .mockResolvedValueOnce(
        streamResponse('data: {"choices":[{"delta":{"content":"The second turn works."}}]}\n\ndata: [DONE]\n\n'),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new OpenAICompatibleClient();
    const history: ChatMessage[] = [{
      id: 'previous-assistant',
      role: 'assistant',
      content: 'The first command completed.',
      apiTranscript: [{
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'managed_0_0',
          type: 'function',
          function: { name: 'run_command', arguments: '{"command":"uname -a","purpose":"Inspect system"}' },
        }],
      }, {
        role: 'tool',
        tool_call_id: 'managed_0_0',
        name: 'run_command',
        content: '{"kind":"vlaina-computer-command","version":1,"phase":"completed","command":"uname -a"}',
      }, {
        role: 'assistant',
        content: 'The first command completed.',
      }],
      modelId: 'deepseek-v4-flash',
      timestamp: 1,
      versions: [{
        content: 'The first command completed.',
        createdAt: 1,
        kind: 'original',
        subsequentMessages: [],
      }],
      currentVersionIndex: 0,
    }];
    const model = buildModel({
      id: 'vlaina-managed:deepseek-v4-flash',
      apiModelId: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      providerId: 'vlaina-managed',
    });
    const provider = buildProvider({ id: 'vlaina-managed', name: 'vlaina managed', apiKey: '' });

    const result = await client.sendMessage(
      'Continue with another question',
      history,
      model,
      provider,
      vi.fn(),
      undefined,
      { computerUseEnabled: true, computerUseCwd: '/tmp/project' },
    );
    const resultAfterDisable = await client.sendMessage(
      'Continue after disabling computer control',
      history,
      model,
      provider,
      vi.fn(),
    );

    expect(result).toBe('The second turn works.');
    expect(resultAfterDisable).toBe('The second turn works.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [index, call] of fetchMock.mock.calls.entries()) {
      const body = JSON.parse(call[1].body);
      expect(body.messages).toEqual(expect.arrayContaining([
        { role: 'assistant', content: 'The first command completed.' },
      ]));
      expect(body.messages.some((message: { role: string }) => message.role === 'tool')).toBe(false);
      expect(body.messages.some((message: { tool_calls?: unknown }) => message.tool_calls !== undefined)).toBe(false);
      expect(JSON.stringify(body)).not.toContain('vlaina-computer-command');
      if (index === 0) expect(body.tools).toEqual(expect.any(Array));
      else expect(body.tools).toBeUndefined();
    }
  });

  it('handles OpenRouter Claude search requests through the text protocol without tool messages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse('data: {"choices":[{"delta":{"content":"claude web answer"}}]}\n\ndata: [DONE]\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    mocks.bridge = {
      webSearch: {
        search: vi.fn(async () => ({
          query: 'Claude latest news',
          results: [{
            title: 'Claude source',
            url: 'https://example.com/claude',
            snippet: 'Useful source.',
            publishedAt: null,
            source: null,
            thumbnail: null,
          }],
        })),
        read: vi.fn(),
        readBatch: vi.fn(async () => [{
          url: 'https://example.com/claude',
          ok: true,
          page: {
            title: 'Claude source',
            summary: '',
            siteName: 'example.com',
            finalUrl: 'https://example.com/claude',
            content: 'Readable source content.',
            charCount: 24,
          },
        }]),
        cancelRequest: vi.fn(),
      },
    };

    const result = await new OpenAICompatibleClient().sendMessage(
      'search Claude latest news',
      [],
      buildModel({ apiModelId: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5' }),
      buildProvider({ name: 'OpenRouter', apiHost: 'https://openrouter.ai/api', endpointType: 'openai' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toContain('claude web answer');
    expect(result).toContain('https://example.com/claude');
    expect(mocks.bridge.webSearch?.search).toHaveBeenCalledWith('Claude latest news', { limit: 5 }, undefined);
    expect(mocks.bridge.webSearch?.readBatch).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(firstBody.tools).toBeUndefined();
    expect(firstBody.messages.at(-1).content).toContain('Readable source content.');
  });

  it('handles custom Kimi search requests through the text protocol without tool messages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse('data: {"choices":[{"delta":{"content":"kimi web answer"}}]}\n\ndata: [DONE]\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    mocks.bridge = {
      webSearch: {
        search: vi.fn(async () => ({
          query: 'catime',
          results: [{
            title: 'Catime',
            url: 'https://cati.me/',
            snippet: 'Catime source.',
            publishedAt: null,
            source: null,
            thumbnail: null,
          }],
        })),
        read: vi.fn(),
        readBatch: vi.fn(async () => [{
          url: 'https://cati.me/',
          ok: true,
          page: {
            title: 'Catime',
            summary: '',
            siteName: 'cati.me',
            finalUrl: 'https://cati.me/',
            content: 'Readable catime content.',
            charCount: 24,
          },
        }]),
        cancelRequest: vi.fn(),
      },
    };

    const result = await new OpenAICompatibleClient().sendMessage(
      '搜一下catime',
      [],
      buildModel({ apiModelId: 'moonshotai/kimi-k2', name: 'Kimi K2' }),
      buildProvider({ name: 'OpenRouter', apiHost: 'https://openrouter.ai/api', endpointType: 'openai' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toContain('kimi web answer');
    expect(result).toContain('https://cati.me/');
    expect(mocks.bridge.webSearch?.search).toHaveBeenCalledWith('catime', { limit: 5 }, undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(firstBody.tools).toBeUndefined();
    expect(firstBody.messages.at(-1).content).toContain('Readable catime content.');
  });

  it('detects prefixed and mixed-case custom Grok model ids without injecting local tools', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"custom grok answer"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().sendMessage(
      'search something',
      [],
      buildModel({
        id: 'custom-provider::CompanyPrefix/XAI/GROK-4-Latest',
        apiModelId: 'CompanyPrefix/XAI/GROK-4-Latest',
        name: 'Company Prefix Grok 4 Latest',
        providerId: 'custom-provider',
      }),
      buildProvider({
        id: 'custom-provider',
        name: 'Custom Gateway',
        apiHost: 'https://gateway.example.com/api',
        endpointType: 'openai',
      }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toBe('custom grok answer');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('CompanyPrefix/XAI/GROK-4-Latest');
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it('answers custom Grok web search capability questions before provider routing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().sendMessage(
      'Can you browse the internet?',
      [],
      buildModel({
        id: 'custom-provider::CompanyPrefix/XAI/GROK-4-Latest',
        apiModelId: 'CompanyPrefix/XAI/GROK-4-Latest',
        name: 'Company Prefix Grok 4 Latest',
        providerId: 'custom-provider',
      }),
      buildProvider({
        id: 'custom-provider',
        name: 'Custom Gateway',
        apiHost: 'https://gateway.example.com/api',
        endpointType: 'openai',
      }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toBe('Yes, web search is enabled for this chat.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not inject local web search tools for managed Grok models', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode([
            'data: {"choices":[{"delta":{"content":"managed grok answer"}}]}',
            'data: [DONE]',
            '',
          ].join('\n')));
          controller.close();
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().sendMessage(
      'search something',
      [],
      buildModel({ apiModelId: 'grok-4', name: 'Grok 4' }),
      buildProvider({ id: 'vlaina-managed', apiHost: 'https://api.vlaina.com/v1', apiKey: '' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toBe('managed grok answer');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(body.stream).toBe(true);
  });

  it('does not emit managed image results after cancellation during response parsing', async () => {
    const controller = new AbortController();
    const reader = {
      read: vi.fn(async () => {
        controller.abort();
        return {
          done: false,
          value: new TextEncoder().encode(JSON.stringify({
            data: [{ b64_json: 'abc123', revised_prompt: 'A cancelled managed image' }],
          })),
        };
      }),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: {
        getReader: () => reader,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const onChunk = vi.fn();

    await expect(new OpenAICompatibleClient().sendMessage(
      'draw a house',
      [],
      buildModel({ apiModelId: 'gpt-image-2', name: 'GPT Image 2' }),
      buildProvider({ id: 'vlaina-managed', apiHost: 'https://api.vlaina.com/v1', apiKey: '' }),
      onChunk,
      controller.signal,
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(onChunk).not.toHaveBeenCalled();
  });

  it('does not prefetch web search for casual managed Claude messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);
    mocks.bridge = {
      webSearch: {
        search: vi.fn(),
        read: vi.fn(),
        readBatch: vi.fn(),
        cancelRequest: vi.fn(),
      },
    };

    const result = await new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }),
      buildProvider({ id: 'vlaina-managed', apiHost: 'https://api.vlaina.com/v1', apiKey: '' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toBe('hello');
    expect(mocks.bridge.webSearch?.search).not.toHaveBeenCalled();
    expect(mocks.bridge.webSearch?.readBatch).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(body.stream).toBe(true);
    expect(body.messages[0].content).toContain('<web_search_request>');
  });

  it('answers managed web search capability questions without asking the model', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mocks.bridge = {
      webSearch: {
        search: vi.fn(),
        read: vi.fn(),
        readBatch: vi.fn(),
        cancelRequest: vi.fn(),
      },
    };

    const result = await new OpenAICompatibleClient().sendMessage(
      '你可以联网搜索不',
      [],
      buildModel({ apiModelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }),
      buildProvider({ id: 'vlaina-managed', apiHost: 'https://api.vlaina.com/v1', apiKey: '' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toContain('当前聊天已开启联网搜索');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.bridge.webSearch?.search).not.toHaveBeenCalled();
    expect(mocks.bridge.webSearch?.readBatch).not.toHaveBeenCalled();
  });

  it('answers OpenAI-compatible tool web search capability questions before model routing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onChunk = vi.fn();

    const result = await new OpenAICompatibleClient().sendMessage(
      '你可以联网搜索不',
      [],
      buildModel({ apiModelId: 'gpt-4o-mini', name: 'GPT-4o Mini' }),
      buildProvider({ endpointType: 'openai' }),
      onChunk,
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toBe('可以，当前聊天已开启联网搜索。');
    expect(onChunk).toHaveBeenCalledWith('可以，当前聊天已开启联网搜索。');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefetches managed current price requests before the model can decline search', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      streamResponse('data: {"choices":[{"delta":{"content":"今日金价回答"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);
    mocks.bridge = {
      webSearch: {
        search: vi.fn(async () => ({
          query: '今天的金价',
          results: [{
            title: 'Gold price source',
            url: 'https://example.com/gold',
            snippet: 'Current gold price.',
            publishedAt: null,
            source: null,
            thumbnail: null,
          }],
        })),
        read: vi.fn(),
        readBatch: vi.fn(async () => [{
          url: 'https://example.com/gold',
          ok: true,
          page: {
            title: 'Gold price source',
            summary: '',
            siteName: 'example.com',
            finalUrl: 'https://example.com/gold',
            content: 'Readable gold price content.',
            charCount: 28,
          },
        }]),
        cancelRequest: vi.fn(),
      },
    };

    const result = await new OpenAICompatibleClient().sendMessage(
      '搜一下今天的金价',
      [],
      buildModel({ apiModelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }),
      buildProvider({ id: 'vlaina-managed', apiHost: 'https://api.vlaina.com/v1', apiKey: '' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toContain('今日金价回答');
    expect(result).toContain('https://example.com/gold');
    expect(mocks.bridge.webSearch?.search).toHaveBeenCalledWith('今天的金价', { limit: 5 }, undefined);
    expect(mocks.bridge.webSearch?.readBatch).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
    expect(body.messages.at(-1).content).toContain('Readable gold price content.');
  });

  it('ignores managed Anthropic endpoint hints and uses the managed chat completions stream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        'data: {"choices":[{"delta":{"content":"managed answer"}}]}',
        'data: [DONE]',
        '',
      ].join('\n')),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }),
      buildProvider({
        id: 'vlaina-managed',
        apiHost: 'https://api.vlaina.com/v1',
        apiKey: '',
        endpointType: 'anthropic',
      }),
      vi.fn(),
    );

    expect(result).toBe('managed answer');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.vlaina.com/v1/chat/completions');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'claude-sonnet-4-5',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('prefetches web search context for explicit managed Claude search requests without provider tools', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse('data: {"choices":[{"delta":{"content":"managed claude web answer"}}]}\n\ndata: [DONE]\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    mocks.bridge = {
      webSearch: {
        search: vi.fn(async () => ({
          query: '搜索 Claude 最新消息',
          results: [{
            title: 'Claude source',
            url: 'https://example.com/claude',
            snippet: 'Claude news.',
            publishedAt: null,
            source: null,
            thumbnail: null,
          }],
        })),
        read: vi.fn(),
        readBatch: vi.fn(async () => [{
          url: 'https://example.com/claude',
          ok: true,
          page: {
            title: 'Claude source',
            summary: '',
            siteName: 'example.com',
            finalUrl: 'https://example.com/claude',
            content: 'Readable Claude source content.',
            charCount: 31,
          },
        }]),
        cancelRequest: vi.fn(),
      },
    };

    const result = await new OpenAICompatibleClient().sendMessage(
      '搜索 Claude 最新消息',
      [],
      buildModel({ apiModelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }),
      buildProvider({ id: 'vlaina-managed', apiHost: 'https://api.vlaina.com/v1', apiKey: '' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toContain('managed claude web answer');
    expect(result).toContain('https://example.com/claude');
    expect(mocks.bridge.webSearch?.search).toHaveBeenCalledTimes(1);
    expect(mocks.bridge.webSearch?.search).toHaveBeenCalledWith('Claude 最新消息', { limit: 5 }, undefined);
    expect(mocks.bridge.webSearch?.readBatch).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(firstBody.tools).toBeUndefined();
    expect(firstBody.stream).toBe(true);
    expect(firstBody.messages.at(-1).content).toContain('Answer from web context');
    expect(firstBody.messages.at(-1).content).toContain('Readable Claude source content.');
  });

  it('prefetches web search context for managed Kimi through the text protocol without provider tools', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse('data: {"choices":[{"delta":{"content":"managed kimi web answer"}}]}\n\ndata: [DONE]\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    mocks.bridge = {
      webSearch: {
        search: vi.fn(async () => ({
          query: 'catime',
          results: [{
            title: 'Catime',
            url: 'https://cati.me/',
            snippet: 'Catime source.',
            publishedAt: null,
            source: null,
            thumbnail: null,
          }],
        })),
        read: vi.fn(),
        readBatch: vi.fn(async () => [{
          url: 'https://cati.me/',
          ok: true,
          page: {
            title: 'Catime',
            summary: '',
            siteName: 'cati.me',
            finalUrl: 'https://cati.me/',
            content: 'Readable catime content.',
            charCount: 24,
          },
        }]),
        cancelRequest: vi.fn(),
      },
    };

    const result = await new OpenAICompatibleClient().sendMessage(
      '搜一下catime',
      [],
      buildModel({ apiModelId: 'moonshotai/kimi-k2', name: 'Kimi K2' }),
      buildProvider({ id: 'vlaina-managed', apiHost: 'https://api.vlaina.com/v1', apiKey: '' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toContain('managed kimi web answer');
    expect(result).toContain('https://cati.me/');
    expect(mocks.bridge.webSearch?.search).toHaveBeenCalledWith('catime', { limit: 5 }, undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(firstBody.tools).toBeUndefined();
    expect(firstBody.stream).toBe(true);
    expect(firstBody.messages.at(-1).content).toContain('Readable catime content.');
  });

  it('falls back to the cleaned user query when Claude rewrites search terms too narrowly', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse('data: {"choices":[{"delta":{"content":"<web_search_request>{\\"query\\":\\"Sample app 2026\\",\\"reason\\":\\"current info\\"}</web_search_request>"}}]}\n\ndata: [DONE]\n\n'))
      .mockResolvedValueOnce(streamResponse('data: {"choices":[{"delta":{"content":"sample answer"}}]}\n\ndata: [DONE]\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    mocks.bridge = {
      webSearch: {
        search: vi
          .fn()
          .mockResolvedValueOnce({ query: 'Sample app 2026', results: [] })
          .mockResolvedValueOnce({
            query: 'sample app info',
            results: [{
              title: 'sample app',
              url: 'https://example.com',
              snippet: 'sample app home.',
              publishedAt: null,
              source: null,
              thumbnail: null,
            }],
          }),
        read: vi.fn(),
        readBatch: vi.fn(async () => [{
          url: 'https://example.com',
          ok: true,
          page: {
            title: 'sample app',
            summary: '',
            siteName: 'example.com',
            finalUrl: 'https://example.com',
            content: 'Readable sample app content.',
            charCount: 24,
          },
        }]),
        cancelRequest: vi.fn(),
      },
    };

    const result = await new OpenAICompatibleClient().sendMessage(
      'sample app info',
      [],
      buildModel({ apiModelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }),
      buildProvider({ id: 'vlaina-managed', apiHost: 'https://api.vlaina.com/v1', apiKey: '' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    );

    expect(result).toContain('sample answer');
    expect(result).toContain('https://example.com');
    expect(mocks.bridge.webSearch?.search).toHaveBeenNthCalledWith(1, 'Sample app 2026', { limit: 5 }, undefined);
    expect(mocks.bridge.webSearch?.search).toHaveBeenNthCalledWith(2, 'sample app info', { limit: 5 }, undefined);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.messages.at(-1).content).toContain('Readable sample app content.');
  });

  it('does not replay a transient OpenAI-compatible web search model request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response('<!DOCTYPE html><html><body>Cloudflare 502</body></html>', { status: 502 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];

    await expect(new OpenAICompatibleClient().sendMessage(
      'search current docs',
      [],
      buildModel({ apiModelId: 'gpt-4o-mini', name: 'GPT-4o Mini' }),
      buildProvider({ endpointType: 'openai' }),
      (chunk) => chunks.push(chunk),
      undefined,
      { webSearchEnabled: true },
    )).rejects.toMatchObject({ statusCode: 502 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual([]);
  });

  it('does not replay OpenAI-compatible search when the model rejects tool input', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      error: { message: 'This model does not support tool calling.' },
    }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new OpenAICompatibleClient().sendMessage(
      'search current docs',
      [],
      buildModel({ apiModelId: 'gpt-4o-mini', name: 'GPT-4o Mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
      undefined,
      { webSearchEnabled: true },
    )).rejects.toThrow('Web search is unavailable for this model.');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('wraps Anthropic thinking deltas in think tags', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"plan"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"answer"}}',
        '',
      ].join('\n')),
    );
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];

    const result = await new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel(),
      buildProvider({ endpointType: 'anthropic' }),
      (chunk) => chunks.push(chunk),
    );

    expect(result).toBe('<think>plan</think>answer');
    expect(chunks).toEqual(['<think>plan', '<think>plan</think>answer']);
  });

  it('streams Anthropic computer-use replies while keeping tool input hidden', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(streamResponse([
        'event: content_block_start',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool-pwd","name":"run_command","input":{}}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"command\\":\\"pwd\\","}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"purpose\\":\\"Inspect current directory\\"}"}}',
        '',
      ].join('\n')))
      .mockResolvedValueOnce(streamResponse([
        'event: content_block_start',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"The"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" command completed."}}',
        '',
      ].join('\n')));
    vi.stubGlobal('fetch', fetchMock);
    mocks.bridge = {
      computer: {
        startCommand: vi.fn(async () => ({
          status: 'completed',
          command: 'pwd',
          cwd: '/tmp/project',
          exitCode: 0,
          stdout: '/tmp/project\n',
          stderr: '',
          durationMs: 3,
        })),
        cancelCommand: vi.fn(async () => true),
        onCommandEvent: vi.fn(() => () => undefined),
      },
    };
    const onChunk = vi.fn();

    const result = await new OpenAICompatibleClient().sendMessage(
      'Inspect the current directory',
      [],
      buildModel({ apiModelId: 'claude-sonnet-4-5' }),
      buildProvider({ endpointType: 'anthropic' }),
      onChunk,
      undefined,
      { computerUseEnabled: true, computerUseCwd: '/tmp/project' },
    );

    expect(result).toBe('The command completed.');
    expect(mocks.bridge.computer?.startCommand).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onChunk.mock.calls)).not.toContain('Inspect current directory');
    expect(onChunk.mock.calls.map(([content]) => content).filter(Boolean).slice(0, 2)).toEqual([
      'The',
      'The command completed.',
    ]);
    const requestBodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(requestBodies.every((body) => body.stream === true)).toBe(true);
    expect(requestBodies[0].tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'run_command', input_schema: expect.any(Object) }),
    ]));
    expect(requestBodies[1].messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', content: expect.any(Array) }),
      expect.objectContaining({
        role: 'user',
        content: [expect.objectContaining({ type: 'tool_result', tool_use_id: 'tool-pwd' })],
      }),
    ]));
  });

  it('accepts complete Anthropic JSON replies in computer-use mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'message',
      content: [
        { type: 'thinking', thinking: 'inspect first', signature: 'signed-thinking' },
        { type: 'text', text: 'Complete computer reply.' },
      ],
    }))));
    const onChunk = vi.fn();

    const result = await new OpenAICompatibleClient().sendMessage(
      'Inspect without a tool',
      [],
      buildModel({ apiModelId: 'claude-sonnet-4-5' }),
      buildProvider({ endpointType: 'anthropic' }),
      onChunk,
      undefined,
      { computerUseEnabled: true },
    );

    expect(result).toBe('<think>inspect first</think>Complete computer reply.');
    expect(onChunk).toHaveBeenLastCalledWith(result);
  });

  it('replays hidden API transcript with reasoning content for DeepSeek-compatible history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const history = [{
      id: 'm1',
      role: 'assistant' as const,
      content: 'Visible previous answer',
      apiTranscript: [
        {
          role: 'assistant',
          content: null,
          reasoning_content: 'Need search.',
          tool_calls: [{
            id: 'call-1',
            type: 'function' as const,
            function: { name: 'web_search', arguments: '{"query":"x"}' },
          }],
        },
        {
          role: 'tool',
          tool_call_id: 'call-1',
          name: 'web_search',
          content: 'Search results',
        },
        {
          role: 'assistant',
          content: 'Visible previous answer',
        },
      ],
      modelId: 'deepseek-chat',
      timestamp: 1,
      versions: [{ content: 'Visible previous answer', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }],
      currentVersionIndex: 0,
    }];

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      history,
      buildModel({ apiModelId: 'deepseek-chat', name: 'DeepSeek Chat' }),
      buildProvider({ name: 'DeepSeek', apiHost: 'https://api.deepseek.com', endpointType: 'openai' }),
      vi.fn(),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      {
        ...history[0].apiTranscript![0],
        content: '',
      },
      history[0].apiTranscript![1],
      history[0].apiTranscript![2],
      { role: 'user', content: 'continue' },
    ]);
  });

  it('does not replay local computer file changes to DeepSeek-compatible history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const history = [{
      id: 'm1',
      role: 'assistant' as const,
      content: 'Command complete',
      apiTranscript: [{
        role: 'assistant' as const,
        content: '',
        tool_calls: [{
          id: 'call-1',
          type: 'function' as const,
          function: { name: 'run_command', arguments: '{"command":"printf ok"}' },
        }],
      }, {
        role: 'tool' as const,
        tool_call_id: 'call-1',
        name: 'run_command',
        content: JSON.stringify({
          kind: 'vlaina-computer-command',
          version: 1,
          phase: 'completed',
          command: 'printf ok',
          cwd: '/tmp/project',
          fileChanges: [{
            path: 'src/private.ts',
            kind: 'modified',
            additions: 1,
            deletions: 1,
            patch: `+private-value-${'x'.repeat(MAX_API_TRANSCRIPT_STRING_CHARS)}`,
          }],
        }),
      }, {
        role: 'assistant' as const,
        content: 'Command complete',
      }],
      modelId: 'previous-model',
      timestamp: 1,
      versions: [{ content: 'Command complete', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }],
      currentVersionIndex: 0,
    }];

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      history,
      buildModel({ apiModelId: 'deepseek-chat', name: 'DeepSeek Chat' }),
      buildProvider({ name: 'DeepSeek', apiHost: 'https://api.deepseek.com', endpointType: 'openai' }),
      vi.fn(),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.stringify(body.messages)).not.toContain('fileChanges');
    expect(JSON.stringify(body.messages)).not.toContain('private-value');
    expect(JSON.stringify(body.messages)).toContain('printf ok');
  });

  it('bounds hidden API transcript replay for DeepSeek-compatible history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      [{
        id: 'm1',
        role: 'assistant',
        content: 'Visible previous answer',
        apiTranscript: Array.from({ length: MAX_API_TRANSCRIPT_MESSAGES + 16 }, (_, index) => ({
          role: 'assistant' as const,
          content: `transcript-${index}`,
        })),
        modelId: 'deepseek-chat',
        timestamp: 1,
        versions: [{ content: 'Visible previous answer', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }],
        currentVersionIndex: 0,
      }],
      buildModel({ apiModelId: 'deepseek-chat', name: 'DeepSeek Chat' }),
      buildProvider({ name: 'DeepSeek', apiHost: 'https://api.deepseek.com', endpointType: 'openai' }),
      vi.fn(),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(MAX_API_TRANSCRIPT_MESSAGES + 1);
    expect(body.messages[0]).toEqual({ role: 'assistant', content: 'transcript-16' });
    expect(body.messages[MAX_API_TRANSCRIPT_MESSAGES - 1]).toEqual({
      role: 'assistant',
      content: `transcript-${MAX_API_TRANSCRIPT_MESSAGES + 15}`,
    });
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'continue' });
  });

  it('does not replay unsafe image URLs from hidden API transcripts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      [{
        id: 'm1',
        role: 'assistant',
        content: 'Visible previous answer',
        apiTranscript: [{
          role: 'assistant',
          content: [
            { type: 'text', text: 'Visible previous answer' },
            { type: 'image_url', image_url: { url: 'https://example.com/safe.png', detail: 'low' } },
            { type: 'image_url', image_url: { url: 'http://127.0.0.1:3000/secret.png', detail: 'high' } },
            { type: 'image_url', image_url: { url: 'file:///tmp/secret.png' } },
            { type: 'image_url', image_url: { url: 'attachment://safe.png' } },
            { type: 'image_url', image_url: { url: 'app-file://attachment/local.png' } },
          ],
        }],
        modelId: 'deepseek-chat',
        timestamp: 1,
        versions: [{ content: 'Visible previous answer', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }],
        currentVersionIndex: 0,
      }],
      buildModel({ apiModelId: 'deepseek-chat', name: 'DeepSeek Chat' }),
      buildProvider({ name: 'DeepSeek', apiHost: 'https://api.deepseek.com', endpointType: 'openai' }),
      vi.fn(),
    );

    const bodyText = fetchMock.mock.calls[0][1].body;
    const body = JSON.parse(bodyText);
    expect(body.messages).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Visible previous answer' },
          { type: 'image_url', image_url: { url: 'https://example.com/safe.png', detail: 'low' } },
        ],
      },
      { role: 'user', content: 'continue' },
    ]);
    expect(bodyText).not.toContain('127.0.0.1');
    expect(bodyText).not.toContain('file:///tmp/secret.png');
    expect(bodyText).not.toContain('attachment://');
    expect(bodyText).not.toContain('app-file://');
  });

  it('does not replay local image markdown from hidden API transcript text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      [{
        id: 'm1',
        role: 'assistant',
        content: 'Visible previous answer',
        apiTranscript: [{
          role: 'assistant',
          content: 'Visible ![asset](asset://localhost/chat-inline-image/1',
          reasoning_content: 'Plan <img src="blob:https://vlaina.local/secret"',
        }],
        modelId: 'deepseek-chat',
        timestamp: 1,
        versions: [{ content: 'Visible previous answer', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }],
        currentVersionIndex: 0,
      }],
      buildModel({ apiModelId: 'deepseek-chat', name: 'DeepSeek Chat' }),
      buildProvider({ name: 'DeepSeek', apiHost: 'https://api.deepseek.com', endpointType: 'openai' }),
      vi.fn(),
    );

    const bodyText = fetchMock.mock.calls[0][1].body;
    const body = JSON.parse(bodyText);
    expect(body.messages[0]).toEqual({
      role: 'assistant',
      content: 'Visible [Image]',
      reasoning_content: 'Plan [Image]',
    });
    expect(bodyText).not.toContain('asset://localhost/chat-inline-image/1');
    expect(bodyText).not.toContain('blob:https://vlaina.local/secret');
  });

  it('does not replay hidden reasoning transcript for generic OpenAI-compatible providers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      [{
        id: 'm1',
        role: 'assistant',
        content: 'Visible previous answer',
        apiTranscript: [{ role: 'assistant', content: null, reasoning_content: 'hidden' }],
        modelId: 'gpt-4o-mini',
        timestamp: 1,
        versions: [{ content: 'Visible previous answer', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }],
        currentVersionIndex: 0,
      }],
      buildModel({ apiModelId: 'gpt-4o-mini', name: 'GPT 4o mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: 'assistant', content: 'Visible previous answer' },
      { role: 'user', content: 'continue' },
    ]);
  });

  it('strips rendered thinking from generic OpenAI-compatible assistant history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      [{
        id: 'm1',
        role: 'assistant',
        content: '<think>hidden rendered plan</think>Visible previous answer',
        apiTranscript: [{ role: 'assistant', content: null, reasoning_content: 'hidden transcript' }],
        modelId: 'gpt-4o-mini',
        timestamp: 1,
        versions: [{ content: '<think>version hidden</think>Visible previous answer', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }],
        currentVersionIndex: 0,
      }],
      buildModel({ apiModelId: 'gpt-4o-mini', name: 'GPT 4o mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
    );

    const bodyText = fetchMock.mock.calls[0][1].body;
    const body = JSON.parse(bodyText);
    expect(body.messages).toEqual([
      { role: 'assistant', content: 'Visible previous answer' },
      { role: 'user', content: 'continue' },
    ]);
    expect(bodyText).not.toContain('<think>');
    expect(bodyText).not.toContain('hidden rendered plan');
    expect(bodyText).not.toContain('hidden transcript');
    expect(bodyText).not.toContain('reasoning_content');
  });

  it('sanitizes local image markdown from direct OpenAI-compatible history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      [
        {
          id: 'm1',
          role: 'user',
          content: 'Look ![file](file:///tmp/secret.png) and ![stored](attachment://safe.png)',
          modelId: 'gpt-4o-mini',
          timestamp: 1,
          versions: [],
          currentVersionIndex: 0,
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Seen <img src="app-file://attachment/local.png" alt="local">',
          modelId: 'gpt-4o-mini',
          timestamp: 2,
          versions: [],
          currentVersionIndex: 0,
        },
      ],
      buildModel({ apiModelId: 'gpt-4o-mini', name: 'GPT 4o mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
    );

    const bodyText = fetchMock.mock.calls[0][1].body;
    const body = JSON.parse(bodyText);
    expect(body.messages).toEqual([
      { role: 'user', content: 'Look [Image] and [Image]' },
      { role: 'assistant', content: 'Seen [Image]' },
      { role: 'user', content: 'continue' },
    ]);
    expect(bodyText).not.toContain('file:///tmp/secret.png');
    expect(bodyText).not.toContain('attachment://safe.png');
    expect(bodyText).not.toContain('app-file://attachment/local.png');
  });

  it('sanitizes malformed structured image history before OpenAI-compatible requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      [
        {
          id: 'm1',
          role: 'user',
          content: [
            { type: 'text', text: 'Earlier prompt' },
            { type: 'image_url', image_url: { url: 'attachment://safe.png' } },
            { type: 'image_url', image_url: { url: 'app-file://attachment/local.png' } },
          ] as never,
          modelId: 'gpt-4o-mini',
          timestamp: 1,
          versions: [],
          currentVersionIndex: 0,
        },
        {
          id: 'm2',
          role: 'assistant',
          content: [
            { type: 'text', text: '<think>hidden plan</think>Visible answer' },
            { type: 'image_url', image_url: { url: 'file:///tmp/secret.png' } },
          ] as never,
          modelId: 'gpt-4o-mini',
          timestamp: 2,
          versions: [],
          currentVersionIndex: 0,
        },
      ],
      buildModel({ apiModelId: 'gpt-4o-mini', name: 'GPT 4o mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
    );

    const bodyText = fetchMock.mock.calls[0][1].body;
    const body = JSON.parse(bodyText);
    expect(body.messages).toEqual([
      { role: 'user', content: ['Earlier prompt', '[Image]', '[Image]'].join('\n\n') },
      { role: 'assistant', content: ['Visible answer', '[Image]'].join('\n\n') },
      { role: 'user', content: 'continue' },
    ]);
    expect(bodyText).not.toContain('attachment://safe.png');
    expect(bodyText).not.toContain('app-file://attachment/local.png');
    expect(bodyText).not.toContain('file:///tmp/secret.png');
    expect(bodyText).not.toContain('hidden plan');
  });

  it('falls back to visible content when a replay transcript is malformed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      [{
        id: 'm1',
        role: 'assistant',
        content: 'Visible previous answer',
        apiTranscript: [
          { role: 'tool', content: 'missing tool id' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call-1',
              type: 'function',
              function: { name: 'web_search', arguments: 123 as unknown as string },
            }],
          },
        ],
        modelId: 'deepseek-chat',
        timestamp: 1,
        versions: [{ content: 'Visible previous answer', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }],
        currentVersionIndex: 0,
      }],
      buildModel({ apiModelId: 'deepseek-chat', name: 'DeepSeek Chat' }),
      buildProvider({ name: 'DeepSeek', apiHost: 'https://api.deepseek.com', endpointType: 'openai' }),
      vi.fn(),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: 'assistant', content: 'Visible previous answer' },
      { role: 'user', content: 'continue' },
    ]);
  });

  it('replays hidden API transcript restored only from the active message version', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const apiTranscript = [{ role: 'assistant' as const, content: 'version answer', reasoning_content: 'version hidden' }];

    await new OpenAICompatibleClient().sendMessage(
      'continue',
      [{
        id: 'm1',
        role: 'assistant',
        content: 'Version answer',
        modelId: 'deepseek-chat',
        timestamp: 1,
        versions: [{ content: 'Version answer', createdAt: 1, kind: 'original' as const, subsequentMessages: [], apiTranscript }],
        currentVersionIndex: 0,
      }],
      buildModel({ apiModelId: 'deepseek-chat', name: 'DeepSeek Chat' }),
      buildProvider({ name: 'DeepSeek', apiHost: 'https://api.deepseek.com', endpointType: 'openai' }),
      vi.fn(),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      apiTranscript[0],
      { role: 'user', content: 'continue' },
    ]);
  });

  it('stores hidden API transcript for direct OpenAI-compatible reasoning streams', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"plan"}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"answer"}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n')),
    );
    vi.stubGlobal('fetch', fetchMock);

    const onApiTranscript = vi.fn();
    const result = await new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'deepseek-chat' }),
      buildProvider({ name: 'DeepSeek', apiHost: 'https://api.deepseek.com', endpointType: 'openai' }),
      vi.fn(),
      undefined,
      { onApiTranscript },
    );

    expect(result).toBe('<think>plan</think>answer');
    expect(onApiTranscript).toHaveBeenCalledWith([{
      role: 'assistant',
      content: 'answer',
      reasoning_content: 'plan',
    }]);
  });

  it('does not complete direct OpenAI-compatible streams after the transcript callback cancels', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"plan"}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"answer"}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n')),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const chunks: string[] = [];
    const onApiTranscript = vi.fn(() => controller.abort());

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'deepseek-chat' }),
      buildProvider({ name: 'DeepSeek', apiHost: 'https://api.deepseek.com', endpointType: 'openai' }),
      (chunk) => chunks.push(chunk),
      controller.signal,
      { onApiTranscript },
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(chunks[chunks.length - 1]).toBe('<think>plan</think>answer');
    expect(onApiTranscript).toHaveBeenCalledWith([{
      role: 'assistant',
      content: 'answer',
      reasoning_content: 'plan',
    }]);
  });

  it('stores hidden API transcript for managed reasoning streams', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode([
            'data: {"choices":[{"delta":{"reasoning_content":"managed plan"}}]}',
            'data: {"choices":[{"delta":{"content":"managed answer"}}]}',
            'data: [DONE]',
            '',
          ].join('\n')));
          controller.close();
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const onApiTranscript = vi.fn();
    const result = await new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'gpt-5.4' }),
      buildProvider({ id: 'vlaina-managed', apiHost: 'https://api.vlaina.com/v1', apiKey: '' }),
      vi.fn(),
      undefined,
      { onApiTranscript },
    );

    expect(result).toBe('<think>managed plan</think>managed answer');
    expect(onApiTranscript).toHaveBeenCalledWith([{
      role: 'assistant',
      content: 'managed answer',
      reasoning_content: 'managed plan',
    }]);
  });

  it('bounds rendered thinking transcript extraction for managed streams', async () => {
    const encoder = new TextEncoder();
    const streamLines = Array.from({ length: MAX_THINKING_TAG_MATCHES + 5 }, (_, index) => [
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: `hidden-${index}` } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: `Visible-${index}` } }] })}`,
    ]).flat();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode([
            ...streamLines,
            'data: [DONE]',
            '',
          ].join('\n')));
          controller.close();
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const onApiTranscript = vi.fn();
    await new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'gpt-5.4' }),
      buildProvider({ id: 'vlaina-managed', apiHost: 'https://api.vlaina.com/v1', apiKey: '' }),
      vi.fn(),
      undefined,
      { onApiTranscript },
    );

    const transcript = onApiTranscript.mock.calls[0]?.[0]?.[0];
    expect(transcript.reasoning_content).toContain(`hidden-${MAX_THINKING_TAG_MATCHES - 1}`);
    expect(transcript.reasoning_content).not.toContain(`hidden-${MAX_THINKING_TAG_MATCHES}`);
    expect(transcript.content).toContain(`Visible-${MAX_THINKING_TAG_MATCHES - 2}`);
    expect(transcript.content).not.toContain(`Visible-${MAX_THINKING_TAG_MATCHES - 1}`);
  });

  it('does not send local chat-control options in provider request bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"next"}}]}\n\ndata: [DONE]\n\n'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'gpt-4o-mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
      undefined,
      {
        webSearchEnabled: false,
        onApiTranscript: vi.fn(),
        max_tokens: 32,
      },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(32);
    expect(body.webSearchEnabled).toBeUndefined();
    expect(body.onApiTranscript).toBeUndefined();
    expect(body.onWebSearchStatus).toBeUndefined();
  });

  it('keeps OpenAI-compatible request timeout active while reading the stream body', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => new Response(
      new ReadableStream({
        start(controller) {
          init.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('Aborted', 'AbortError'));
          });
        },
      }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenAICompatibleClient();
    (client as unknown as { timeout: number }).timeout = 10;

    const request = expect(client.sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'gpt-4o-mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
    )).rejects.toThrow('The AI request timed out.');
    await vi.advanceTimersByTimeAsync(20);

    await request;
    vi.useRealTimers();
  });

  it('keeps each computer-use model request timeout active while reading its stream body', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(async (_url: string, init: RequestInit) => new Response(
        new ReadableStream({
          start(controller) {
            init.signal?.addEventListener('abort', () => {
              controller.error(new DOMException('Aborted', 'AbortError'));
            });
          },
        }),
        { status: 200 },
      ));
      vi.stubGlobal('fetch', fetchMock);
      const client = new OpenAICompatibleClient();
      (client as unknown as { timeout: number }).timeout = 10;

      const request = expect(client.sendMessage(
        'inspect the project',
        [],
        buildModel({ apiModelId: 'gpt-4o-mini' }),
        buildProvider({ endpointType: 'openai' }),
        vi.fn(),
        undefined,
        { computerUseEnabled: true },
      )).rejects.toThrow('The AI request timed out.');
      await vi.advanceTimersByTimeAsync(20);

      await request;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps OpenAI-compatible request timeout active while reading error response bodies', async () => {
    vi.useFakeTimers();
    try {
      const reader = {
        read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
        cancel: vi.fn(async () => undefined),
        releaseLock: vi.fn(),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
        body: {
          getReader: () => reader,
        },
      }));
      const client = new OpenAICompatibleClient();
      (client as unknown as { timeout: number }).timeout = 10;

      const request = expect(client.sendMessage(
        'hi',
        [],
        buildModel({ apiModelId: 'gpt-4o-mini' }),
        buildProvider({ endpointType: 'openai' }),
        vi.fn(),
      )).rejects.toThrow('The AI request timed out.');
      await vi.advanceTimersByTimeAsync(0);
      expect(reader.read).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(20);

      await request;
      expect(reader.cancel).toHaveBeenCalled();
      expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds oversized OpenAI-compatible error response bodies', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(MAX_PROVIDER_ERROR_BODY_BYTES + 1)));
        },
        cancel,
      }),
      { status: 400 },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'gpt-4o-mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
    )).rejects.toMatchObject({
      type: AIErrorType.INVALID_REQUEST,
      message: 'Unknown error',
      statusCode: 400,
    });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(() => response.body?.getReader()).not.toThrow();
  });

  it('does not start OpenAI-compatible stream requests when the external signal is already aborted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'gpt-4o-mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
      controller.signal,
    )).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes upstream OpenAI-compatible abort-shaped stream failures without treating them as chat cancellation', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new DOMException('provider stream aborted', 'AbortError'));
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'gpt-4o-mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
    )).rejects.toMatchObject({
      type: AIErrorType.SERVER_ERROR,
      message: 'provider stream aborted',
    });
  });

  it('clears the OpenAI-compatible request timeout after a successful stream', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"done"}}]}\n\ndata: [DONE]\n\n'),
    ));

    const client = new OpenAICompatibleClient();
    (client as unknown as { timeout: number }).timeout = 10_000;

    await expect(client.sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'gpt-4o-mini' }),
      buildProvider({ endpointType: 'openai' }),
      vi.fn(),
    )).resolves.toBe('done');

    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('rejects HTML error documents streamed as assistant content before emitting UI chunks', async () => {
    const onChunk = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      streamResponse('data: {"choices":[{"delta":{"content":"<!DOCTYPE html><html><head><title>nekotick.org | 524: A timeout occurred</title></head><body>Cloudflare Error code 524</body></html>"}}]}\n\ndata: [DONE]\n\n'),
    ));

    await expect(new OpenAICompatibleClient().sendMessage(
      'hi',
      [],
      buildModel({ apiModelId: 'gpt-4o-mini' }),
      buildProvider({ endpointType: 'openai' }),
      onChunk,
    )).rejects.toMatchObject({
      message: 'UPSTREAM_UNAVAILABLE',
    });
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('does not expose direct provider URLs or transport details for chat failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed with fake-transport-secret')));

    const request =
      new OpenAICompatibleClient().sendMessage(
        'hi',
        [],
        buildModel({ apiModelId: 'gpt-4o-mini' }),
        buildProvider(),
        vi.fn(),
      );

    await expect(request).rejects.toMatchObject({
      type: AIErrorType.NETWORK_ERROR,
      message: 'AI_PROVIDER_CONNECTION_FAILED',
      details: undefined,
    });
    await expect(request).rejects.not.toThrow('fake-transport-secret');

    try {
      await new OpenAICompatibleClient().sendMessage(
        'hi',
        [],
        buildModel({ apiModelId: 'gpt-4o-mini' }),
        buildProvider(),
        vi.fn(),
      );
    } catch (error) {
      expect(getUserFacingAIError(error).message).toBe(
        'The custom channel could not be reached. Check your network or the upstream service, then try again.',
      );
    }
  });

  it('does not coerce provider transport rejection objects', async () => {
    const hostileError = {
      toString() {
        throw new Error('provider error should not be coerced');
      },
      [Symbol.toPrimitive]() {
        throw new Error('provider error should not be coerced');
      },
    };

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(hostileError));

    await expect(
      new OpenAICompatibleClient().sendMessage(
        'hi',
        [],
        buildModel({ apiModelId: 'gpt-4o-mini' }),
        buildProvider({ endpointType: 'openai' }),
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      type: AIErrorType.NETWORK_ERROR,
      message: 'AI_PROVIDER_CONNECTION_FAILED',
    });

    await expect(
      new OpenAICompatibleClient().sendMessage(
        'hi',
        [],
        buildModel({ apiModelId: 'claude-sonnet-4-5' }),
        buildProvider({ endpointType: 'anthropic' }),
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      type: AIErrorType.NETWORK_ERROR,
      message: 'AI_PROVIDER_CONNECTION_FAILED',
    });
  });
});
