import http from 'node:http';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createWebSearchServices, registerWebSearchIpc } from '../electron/webSearch/ipc.mjs';

const MAX_ACTIVE_WEB_SEARCH_REQUESTS = 16;

function createRendererSender(id) {
  let destroyed = false;
  const sender = Object.assign(new EventEmitter(), {
    destroy() {
      destroyed = true;
      sender.emit('destroyed');
    },
    id,
    isDestroyed: () => destroyed,
  });
  return sender;
}

function collectHandlers() {
  const handlers = new Map();
  const services = {
    searchService: {
      webSearch: vi.fn(async () => ({ query: 'catime', results: [] })),
    },
    crawler: {
      readUrl: vi.fn(),
    },
  };
  registerWebSearchIpc({
    handleIpc: (channel, handler) => {
      handlers.set(channel, handler);
    },
    services,
  });
  return { handlers, services };
}

describe('web search IPC', () => {
  it('keeps crawler reads on verified-address transport when the search fetch is customized', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('Search fetch should not be used for crawler reads.');
    });
    const services = createWebSearchServices({ fetchImpl });
    const request = new EventEmitter();
    let responseCallback;

    request.setTimeout = vi.fn();
    request.destroy = vi.fn();
    request.end = vi.fn(() => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = { 'content-type': 'text/plain' };
      responseCallback(response);
      response.emit('data', Buffer.from([
        'This public page has enough readable plain text content for the crawler.',
        'It verifies that the crawler keeps using the address-verified native transport.',
        'The customized search fetch must not handle crawler page reads.',
      ].join(' ')));
      response.emit('end');
    });

    const requestSpy = vi.spyOn(http, 'request').mockImplementation((_options, callback) => {
      responseCallback = callback;
      return request;
    });

    try {
      const page = await services.crawler.readUrl('http://93.184.216.34/source.txt');

      expect(page.content).toContain('address-verified native transport');
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalledTimes(1);
    } finally {
      requestSpy.mockRestore();
    }
  });

  it('does not accept provider or engine configuration from the renderer', async () => {
    const { handlers, services } = collectHandlers();
    const searchHandler = handlers.get('desktop:web-search:search');

    await searchHandler(null, 'catime', {
      category: 'general',
      timeRange: 'week',
      engines: ['baidu'],
      provider: 'searxng',
      apiKey: 'secret',
      baseUrl: 'https://attacker.example',
      limit: 5,
    });

    expect(services.searchService.webSearch).toHaveBeenCalledWith('catime', {
      category: 'general',
      timeRange: 'week',
      limit: 5,
      signal: expect.any(AbortSignal),
    });
  });

  it('bounds search IPC inputs before invoking the search service', async () => {
    const { handlers, services } = collectHandlers();
    const searchHandler = handlers.get('desktop:web-search:search');

    await searchHandler(null, '  catime  ', {
      category: ' news ',
      timeRange: 'x'.repeat(65),
      limit: '5',
    });

    expect(services.searchService.webSearch).toHaveBeenCalledWith('catime', {
      category: 'news',
      timeRange: undefined,
      limit: 5,
      signal: expect.any(AbortSignal),
    });

    await searchHandler(null, 'catime', {
      limit: '1e1',
    });

    expect(services.searchService.webSearch).toHaveBeenLastCalledWith('catime', {
      category: undefined,
      timeRange: undefined,
      limit: undefined,
      signal: expect.any(AbortSignal),
    });

    await expect(searchHandler(null, 'x'.repeat(1001), { limit: 5 })).rejects.toMatchObject({
      code: 'invalid_query',
    });
    await expect(searchHandler(null, ' '.repeat(1001), { limit: 5 })).rejects.toMatchObject({
      code: 'invalid_query',
    });
    expect(services.searchService.webSearch).toHaveBeenCalledTimes(2);
  });

  it('does not coerce object request ids or numeric options from IPC', async () => {
    const { handlers, services } = collectHandlers();
    const searchHandler = handlers.get('desktop:web-search:search');
    const cancelHandler = handlers.get('desktop:web-search:cancel');
    const requestId = {
      toString: vi.fn(() => {
        throw new Error('request id coercion');
      }),
    };
    const limit = {
      valueOf: vi.fn(() => {
        throw new Error('limit coercion');
      }),
      toString: vi.fn(() => {
        throw new Error('limit coercion');
      }),
    };

    await expect(searchHandler(null, 'catime', { limit }, requestId)).rejects.toMatchObject({
      code: 'invalid_request_id',
    });
    await expect(cancelHandler(null, requestId)).rejects.toMatchObject({
      code: 'invalid_request_id',
    });
    await searchHandler(null, 'catime', { limit });

    expect(requestId.toString).not.toHaveBeenCalled();
    expect(limit.valueOf).not.toHaveBeenCalled();
    expect(limit.toString).not.toHaveBeenCalled();
    expect(services.searchService.webSearch).toHaveBeenCalledWith('catime', {
      category: undefined,
      timeRange: undefined,
      limit: undefined,
      signal: expect.any(AbortSignal),
    });
  });

  it('rejects duplicate active request ids', async () => {
    const handlers = new Map();
    let signal;
    const services = {
      searchService: {
        webSearch: vi.fn((_query, options) => {
          signal = options.signal;
          return new Promise(() => undefined);
        }),
      },
      crawler: { readUrl: vi.fn() },
    };
    registerWebSearchIpc({
      handleIpc: (channel, handler) => handlers.set(channel, handler),
      services,
    });
    const event = { sender: createRendererSender(1) };
    const first = handlers.get('desktop:web-search:search')(event, 'one', {}, 'duplicate-id');
    first.catch(() => undefined);

    await expect(handlers.get('desktop:web-search:search')(event, 'two', {}, 'duplicate-id'))
      .rejects.toMatchObject({ code: 'duplicate_request_id' });
    expect(services.searchService.webSearch).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(false);

    await expect(handlers.get('desktop:web-search:cancel')(event, 'duplicate-id')).resolves.toBe(true);
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('bounds requests without ids and aborts them when the renderer is destroyed', async () => {
    const handlers = new Map();
    const signals = [];
    const services = {
      searchService: {
        webSearch: vi.fn((_query, options) => {
          signals.push(options.signal);
          return new Promise(() => undefined);
        }),
      },
      crawler: { readUrl: vi.fn() },
    };
    registerWebSearchIpc({
      handleIpc: (channel, handler) => handlers.set(channel, handler),
      services,
    });
    const sender = createRendererSender(2);
    const start = handlers.get('desktop:web-search:search');
    const requests = Array.from({ length: MAX_ACTIVE_WEB_SEARCH_REQUESTS }, (_, index) => (
      start({ sender }, `query-${index}`, {})
    ));
    for (const request of requests) request.catch(() => undefined);

    await expect(start({ sender }, 'overflow', {})).rejects.toMatchObject({ code: 'too_many_requests' });
    sender.destroy();
    await Promise.allSettled(requests);

    expect(signals).toHaveLength(MAX_ACTIVE_WEB_SEARCH_REQUESTS);
    expect(signals.every((entry) => entry.aborted)).toBe(true);
  });

  it('bounds read IPC inputs before invoking the crawler', async () => {
    const { handlers, services } = collectHandlers();
    services.crawler.readUrl.mockResolvedValue({
      title: 'Example',
      summary: '',
      siteName: 'example.com',
      finalUrl: 'https://example.com',
      content: 'content',
      charCount: 7,
    });

    const readBatchHandler = handlers.get('desktop:web-search:read-batch');
    await readBatchHandler(
      null,
      [
        ' https://example.com/one ',
        'https://example.com/two',
        ...Array.from({ length: 10 }, (_, index) => `https://example.com/extra-${index}`),
      ],
      { retries: '1', contentLimit: '3000' },
    );

    expect(services.crawler.readUrl).toHaveBeenCalledTimes(8);
    expect(services.crawler.readUrl).toHaveBeenNthCalledWith(1, 'https://example.com/one', expect.objectContaining({
      retries: 1,
      contentLimit: 3000,
    }));

    await expect(readBatchHandler(null, ['https://example.com/'.padEnd(4097, 'x')], {})).rejects.toMatchObject({
      code: 'invalid_url',
    });
    await expect(readBatchHandler(null, [' '.repeat(4097)], {})).rejects.toMatchObject({
      code: 'invalid_url',
    });
    expect(services.crawler.readUrl).toHaveBeenCalledTimes(8);
  });

  it('cancels an in-flight search request by request id', async () => {
    const handlers = new Map();
    const services = {
      searchService: {
        webSearch: vi.fn((_query, options) => new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(new DOMException('cancelled', 'AbortError'));
          }, { once: true });
        })),
      },
      crawler: {
        readUrl: vi.fn(),
      },
    };
    registerWebSearchIpc({
      handleIpc: (channel, handler) => {
        handlers.set(channel, handler);
      },
      services,
    });

    const searchPromise = handlers.get('desktop:web-search:search')(null, 'catime', { limit: 5 }, 'request-1');
    await expect(handlers.get('desktop:web-search:cancel')(null, 'request-1')).resolves.toBe(true);
    await expect(searchPromise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('scopes request ids and cancellation to the originating renderer', async () => {
    const handlers = new Map();
    const signals = [];
    const services = {
      searchService: {
        webSearch: vi.fn((_query, options) => new Promise((_resolve, reject) => {
          signals.push(options.signal);
          options.signal.addEventListener('abort', () => {
            reject(new DOMException('cancelled', 'AbortError'));
          }, { once: true });
        })),
      },
      crawler: { readUrl: vi.fn() },
    };
    registerWebSearchIpc({
      handleIpc: (channel, handler) => handlers.set(channel, handler),
      services,
    });
    const firstEvent = { sender: { id: 1 } };
    const secondEvent = { sender: { id: 2 } };

    const first = handlers.get('desktop:web-search:search')(firstEvent, 'one', {}, 'same-id');
    const second = handlers.get('desktop:web-search:search')(secondEvent, 'two', {}, 'same-id');
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(false);
    expect(signals[1].aborted).toBe(false);

    await expect(handlers.get('desktop:web-search:cancel')(firstEvent, 'same-id')).resolves.toBe(true);
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(signals[1].aborted).toBe(false);

    await expect(handlers.get('desktop:web-search:cancel')(secondEvent, 'same-id')).resolves.toBe(true);
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects a search result that resolves after the request was cancelled', async () => {
    const handlers = new Map();
    const services = {
      searchService: {
        webSearch: vi.fn((_query, options) => new Promise((resolve) => {
          options.signal.addEventListener('abort', () => {
            resolve({ query: 'catime', results: [] });
          }, { once: true });
        })),
      },
      crawler: {
        readUrl: vi.fn(),
      },
    };
    registerWebSearchIpc({
      handleIpc: (channel, handler) => {
        handlers.set(channel, handler);
      },
      services,
    });

    const searchPromise = handlers.get('desktop:web-search:search')(null, 'catime', { limit: 5 }, 'request-stale-search');
    await expect(handlers.get('desktop:web-search:cancel')(null, 'request-stale-search')).resolves.toBe(true);

    await expect(searchPromise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('passes cancellation signals into page reads', async () => {
    const handlers = new Map();
    const services = {
      searchService: {
        webSearch: vi.fn(),
      },
      crawler: {
        readUrl: vi.fn((_url, options) => new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(new DOMException('cancelled', 'AbortError'));
          }, { once: true });
        })),
      },
    };
    registerWebSearchIpc({
      handleIpc: (channel, handler) => {
        handlers.set(channel, handler);
      },
      services,
    });

    const readPromise = handlers.get('desktop:web-search:read-batch')(null, ['https://example.com'], { retries: 0 }, 'request-2');
    await expect(handlers.get('desktop:web-search:cancel')(null, 'request-2')).resolves.toBe(true);
    await expect(readPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(services.crawler.readUrl).toHaveBeenCalledWith('https://example.com', expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });

  it('rejects page read results that resolve after cancellation', async () => {
    const handlers = new Map();
    const services = {
      searchService: {
        webSearch: vi.fn(),
      },
      crawler: {
        readUrl: vi.fn((_url, options) => new Promise((resolve) => {
          options.signal.addEventListener('abort', () => {
            resolve({
              title: 'Example',
              url: 'https://example.com',
              summary: '',
              content: 'late content',
            });
          }, { once: true });
        })),
      },
    };
    registerWebSearchIpc({
      handleIpc: (channel, handler) => {
        handlers.set(channel, handler);
      },
      services,
    });

    const readPromise = handlers.get('desktop:web-search:read-batch')(
      null,
      ['https://example.com'],
      { retries: 0 },
      'request-stale-read',
    );
    await expect(handlers.get('desktop:web-search:cancel')(null, 'request-stale-read')).resolves.toBe(true);

    await expect(readPromise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
