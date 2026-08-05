import { readUrlsBatch } from './crawler/batchCrawler.mjs';
import { createIpcSenderAbortRegistry } from '../ipcSenderAbortRegistry.mjs';
import { MAX_WEB_SEARCH_QUERY_CHARS, WebSearchError } from './types.mjs';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const MAX_IPC_OPTION_CHARS = 64;
const MAX_IPC_READ_URL_CHARS = 4096;
const MAX_IPC_BATCH_READ_URLS = 8;
const MAX_ACTIVE_WEB_SEARCH_REQUESTS = 16;
const DECIMAL_NUMBER_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

function normalizeRequestId(rawRequestId) {
  if (typeof rawRequestId !== 'string' || rawRequestId.length > 160) {
    return null;
  }
  const requestId = rawRequestId.trim();
  return REQUEST_ID_PATTERN.test(requestId) ? requestId : null;
}

function createAbortError() {
  return new DOMException('The web search request was cancelled.', 'AbortError');
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw createAbortError();
}

function raceWithAbort(promise, signal) {
  throwIfAborted(signal);
  promise.catch(() => undefined);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => finish(() => reject(createAbortError()));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

function normalizeSearchOptions(rawOptions) {
  return {
    category: normalizeOptionString(rawOptions?.category),
    timeRange: normalizeOptionString(rawOptions?.timeRange),
    limit: normalizeNumberOption(rawOptions?.limit),
  };
}

function normalizeReadOptions(rawOptions) {
  return {
    contentLimit: normalizeNumberOption(rawOptions?.contentLimit),
    retries: normalizeNumberOption(rawOptions?.retries),
  };
}

function normalizeOptionString(value) {
  if (typeof value !== 'string') return undefined;
  if (value.length > MAX_IPC_OPTION_CHARS) return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_IPC_OPTION_CHARS ? trimmed : undefined;
}

function normalizeNumberOption(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string' || value.length > MAX_IPC_OPTION_CHARS) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!DECIMAL_NUMBER_PATTERN.test(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeSearchQuery(query) {
  if (typeof query !== 'string') {
    throw new WebSearchError('invalid_query', 'Search query is required.');
  }
  if (query.length > MAX_WEB_SEARCH_QUERY_CHARS) {
    throw new WebSearchError('invalid_query', 'Search query is required.');
  }
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > MAX_WEB_SEARCH_QUERY_CHARS) {
    throw new WebSearchError('invalid_query', 'Search query is required.');
  }
  return trimmed;
}

function normalizeReadUrl(url) {
  if (typeof url !== 'string') {
    throw new WebSearchError('invalid_url', 'Invalid URL.');
  }
  if (url.length > MAX_IPC_READ_URL_CHARS) {
    throw new WebSearchError('invalid_url', 'Invalid URL.');
  }
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > MAX_IPC_READ_URL_CHARS) {
    throw new WebSearchError('invalid_url', 'Invalid URL.');
  }
  return trimmed;
}

function normalizeReadUrls(urls) {
  const inputUrls = Array.isArray(urls) ? urls : [urls];
  return inputUrls.slice(0, MAX_IPC_BATCH_READ_URLS).map(normalizeReadUrl);
}

export function createWebSearchServices({
  fetchImpl,
  searchFetchImpl = fetchImpl,
  crawlerFetchImpl,
} = {}) {
  let runtimePromise = null;

  const loadRuntime = async () => {
    if (!runtimePromise) {
      runtimePromise = Promise.all([
        import('./crawler/index.mjs'),
        import('./searchService.mjs'),
        import('./providers/localSearchProvider.mjs'),
      ]).then(([crawlerModule, searchServiceModule, localSearchProviderModule]) => {
        const { Crawler } = crawlerModule;
        const { SearchService } = searchServiceModule;
        const { LocalSearchProvider } = localSearchProviderModule;

        return {
          searchService: new SearchService({
            providers: [
              new LocalSearchProvider({ fetchImpl: searchFetchImpl }),
            ],
          }),
          crawler: new Crawler({ fetchImpl: crawlerFetchImpl }),
        };
      }).catch((error) => {
        runtimePromise = null;
        throw error;
      });
    }

    return await runtimePromise;
  };

  return {
    searchService: {
      async webSearch(...args) {
        const runtime = await loadRuntime();
        return await runtime.searchService.webSearch(...args);
      },
    },
    crawler: {
      async readUrl(...args) {
        const runtime = await loadRuntime();
        return await runtime.crawler.readUrl(...args);
      },
    },
  };
}

export function registerWebSearchIpc({
  handleIpc,
  services = createWebSearchServices(),
}) {
  const pendingRequests = new Map();
  const activeRequests = new Set();
  const senderAbortRegistry = createIpcSenderAbortRegistry(createAbortError);
  const requestKey = (event, requestId) => {
    if (requestId == null) return null;
    const safeRequestId = normalizeRequestId(requestId);
    if (!safeRequestId) {
      throw new WebSearchError('invalid_request_id', 'Invalid web search request id.');
    }
    const senderId = Number.isInteger(event?.sender?.id) ? event.sender.id : 'unknown';
    return `${senderId}:${safeRequestId}`;
  };
  const beginRequest = (event, requestId) => {
    const key = requestKey(event, requestId);
    if (key && pendingRequests.has(key)) {
      throw new WebSearchError('duplicate_request_id', 'A web search request with this id is already active.');
    }
    if (activeRequests.size >= MAX_ACTIVE_WEB_SEARCH_REQUESTS) {
      throw new WebSearchError('too_many_requests', 'Too many web search requests are active.');
    }
    const controller = new AbortController();
    const active = {
      controller,
      finished: false,
      finish: () => {},
      key,
      untrackSender: () => {},
    };
    const finish = () => {
      if (active.finished) return;
      active.finished = true;
      if (key && pendingRequests.get(key) === active) {
        pendingRequests.delete(key);
      }
      activeRequests.delete(active);
      active.untrackSender();
    };
    active.finish = finish;
    activeRequests.add(active);
    if (key) pendingRequests.set(key, active);
    active.untrackSender = senderAbortRegistry.track(event?.sender, controller);
    if (event?.sender?.isDestroyed?.()) controller.abort(createAbortError());
    return {
      signal: controller.signal,
      finish,
    };
  };

  handleIpc('desktop:web-search:search', async (event, query, options, requestId) => {
    const request = beginRequest(event, requestId);
    try {
      const result = await raceWithAbort(services.searchService.webSearch(normalizeSearchQuery(query), {
        ...normalizeSearchOptions(options),
        signal: request.signal,
      }), request.signal);
      throwIfAborted(request.signal);
      return result;
    } finally {
      request.finish();
    }
  });

  handleIpc('desktop:web-search:read', async (event, url, options, requestId) => {
    const request = beginRequest(event, requestId);
    try {
      const [result] = await raceWithAbort(readUrlsBatch(services.crawler, [normalizeReadUrl(url)], {
        ...normalizeReadOptions(options),
        signal: request.signal,
      }), request.signal);
      throwIfAborted(request.signal);
      if (result?.ok && result.page) {
        return result.page;
      }
      const error = new Error(result?.error || 'Unable to read this page.');
      error.code = result?.code || 'read_failed';
      throw error;
    } finally {
      request.finish();
    }
  });

  handleIpc('desktop:web-search:read-batch', async (event, urls, options, requestId) => {
    const request = beginRequest(event, requestId);
    try {
      const results = await raceWithAbort(readUrlsBatch(services.crawler, normalizeReadUrls(urls), {
        ...normalizeReadOptions(options),
        signal: request.signal,
      }), request.signal);
      throwIfAborted(request.signal);
      return results;
    } finally {
      request.finish();
    }
  });

  handleIpc('desktop:web-search:cancel', async (event, requestId) => {
    const key = requestKey(event, requestId);
    if (!key) return false;
    const active = pendingRequests.get(key);
    if (!active) return false;
    active.controller.abort(createAbortError());
    active.finish();
    return true;
  });
}
