import { describe, expect, it, vi } from 'vitest';
import { runOpenAIWebSearchJsonToolLoop, runOpenAIWebSearchToolLoop } from './openAIToolLoop';
import { runToolCallsWithConcurrency } from './openAIToolLoopToolRuntime';
import { withSourceLinks } from './openAIToolLoopShared';
import type { WebSearchClient } from './client';
import type { WebSearchStatus } from './types';

const SEARCH_RESULT = {
  title: 'Example',
  url: 'https://example.com/page',
  snippet: 'Example result',
  publishedAt: null,
  source: 'test',
  thumbnail: null,
};

function jsonToolCall(name: string, args: Record<string, unknown>, id = `call-${name}`) {
  return {
    choices: [{
      message: {
        content: '',
        tool_calls: [{
          id,
          type: 'function',
          function: { name, arguments: JSON.stringify(args) },
        }],
      },
    }],
  };
}

function jsonAnswer(content: string) {
  return { choices: [{ message: { content } }] };
}

function streamResponse(payloads: Array<Record<string, unknown>>): Response {
  return new Response(new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const payload of payloads) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  }));
}

function createClient(): WebSearchClient {
  return {
    webSearch: vi.fn(async (query) => ({ query, results: [SEARCH_RESULT] })),
    readWebPage: vi.fn(async (url) => ({
      title: 'Example',
      summary: '',
      siteName: 'example.com',
      finalUrl: url,
      content: 'Trusted facts from the example page.',
      charCount: 36,
    })),
    readWebPages: vi.fn(async (urls: string[]) => urls.map((url: string) => ({
      url,
      ok: true,
      page: {
        title: 'Example',
        summary: '',
        siteName: 'example.com',
        finalUrl: url,
        content: 'Trusted facts from the example page.',
        charCount: 36,
      },
    }))),
  };
}

describe('structured web search loop', () => {
  it('runs independent tool calls concurrently while preserving message order', async () => {
    let releaseRequests: (() => void) | null = null;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequests = resolve;
    });
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const client = createClient();
    client.webSearch = vi.fn(async (query) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await requestGate;
      activeRequests -= 1;
      return { query, results: [SEARCH_RESULT] };
    });

    const request = runToolCallsWithConcurrency([
      {
        id: 'search-first',
        type: 'function',
        function: { name: 'web_search', arguments: JSON.stringify({ query: 'first' }) },
      },
      {
        id: 'search-second',
        type: 'function',
        function: { name: 'web_search', arguments: JSON.stringify({ query: 'second' }) },
      },
    ], { client });

    await vi.waitFor(() => expect(client.webSearch).toHaveBeenCalledTimes(2));
    expect(maxActiveRequests).toBe(2);
    releaseRequests!();

    const messages = await request;
    expect(messages.map((message) => message.tool_call_id)).toEqual(['search-first', 'search-second']);
  });

  it('searches, reads an allowed result, and returns plain assistant content', async () => {
    const client = createClient();
    const statuses: WebSearchStatus[] = [];
    const requestJson = vi.fn()
      .mockResolvedValueOnce(jsonToolCall('web_search', { query: 'example' }))
      .mockResolvedValueOnce(jsonToolCall('read_web_page', { url: SEARCH_RESULT.url }))
      .mockResolvedValueOnce(jsonAnswer('Answer based on the page.'));

    const final = await runOpenAIWebSearchJsonToolLoop({
      body: { model: 'test', stream: false, messages: [{ role: 'user', content: 'Tell me about example' }] },
      client,
      requestJson,
      onChunk: vi.fn(),
      onStatus: (status) => statuses.push(status),
    });

    expect(client.webSearch).toHaveBeenCalledTimes(1);
    expect(client.readWebPage).toHaveBeenCalledWith(SEARCH_RESULT.url, {
      contentLimit: 3000,
      retries: 0,
    });
    expect(statuses.map((status) => status.phase)).toEqual([
      'searching',
      'results',
      'reading',
      'complete',
    ]);
    expect(final).toContain('Answer based on the page.');
    expect(final).toContain(SEARCH_RESULT.url);
    expect(final).toContain(`[example.com](${SEARCH_RESULT.url})`);
    expect(final).not.toContain('web-search-status');
  });

  it('formats known raw source URLs without wrapping existing markdown links', () => {
    expect(withSourceLinks(`See ${SEARCH_RESULT.url}.`, [SEARCH_RESULT.url]))
      .toBe(`See [example.com](${SEARCH_RESULT.url}).`);
    expect(withSourceLinks(`See [Example](${SEARCH_RESULT.url}).`, [SEARCH_RESULT.url]))
      .toBe(`See [Example](${SEARCH_RESULT.url}).`);
    expect(withSourceLinks(`[${SEARCH_RESULT.url}](${SEARCH_RESULT.url})`, [SEARCH_RESULT.url]))
      .toBe(`[example.com](${SEARCH_RESULT.url})`);
    expect(withSourceLinks(`<${SEARCH_RESULT.url}>`, [SEARCH_RESULT.url]))
      .toBe(`[example.com](${SEARCH_RESULT.url})`);
  });

  it('blocks page reads that were not returned by the current search', async () => {
    const client = createClient();
    const requestJson = vi.fn()
      .mockResolvedValueOnce(jsonToolCall('read_web_page', { url: 'https://attacker.example/collect' }))
      .mockResolvedValueOnce(jsonAnswer('I could not read that source.'));

    await runOpenAIWebSearchJsonToolLoop({
      body: { model: 'test', stream: false, messages: [{ role: 'user', content: 'Tell me about a page' }] },
      client,
      requestJson,
      onChunk: vi.fn(),
    });

    expect(client.readWebPage).not.toHaveBeenCalled();
    const secondRequestMessages = requestJson.mock.calls[1][0].messages;
    expect(secondRequestMessages.at(-1)?.content).toContain('Only URLs returned by the current web search');
  });

  it('blocks new searches after page reading starts', async () => {
    const client = createClient();
    const requestJson = vi.fn()
      .mockResolvedValueOnce(jsonToolCall('web_search', { query: 'first' }, 'search-1'))
      .mockResolvedValueOnce(jsonToolCall('read_web_page', { url: SEARCH_RESULT.url }, 'read-1'))
      .mockResolvedValueOnce(jsonToolCall('web_search', { query: 'conversation secret' }, 'search-2'))
      .mockResolvedValueOnce(jsonAnswer('Finished safely.'));

    await runOpenAIWebSearchJsonToolLoop({
      body: { model: 'test', stream: false, messages: [{ role: 'user', content: 'Tell me something safely' }] },
      client,
      requestJson,
      onChunk: vi.fn(),
    });

    expect(client.webSearch).toHaveBeenCalledTimes(1);
    expect(requestJson.mock.calls[3][0].messages.at(-1)?.content)
      .toContain('New searches are not allowed after page reading has started.');
  });

  it('forces a result-page read before accepting a streamed final answer', async () => {
    const client = createClient();
    const request = vi.fn()
      .mockResolvedValueOnce(streamResponse([{
        choices: [{ delta: { tool_calls: [{
          index: 0,
          id: 'search-1',
          type: 'function',
          function: { name: 'web_search', arguments: JSON.stringify({ query: 'example' }) },
        }] } }],
      }]))
      .mockResolvedValueOnce(streamResponse([{ choices: [{ delta: { content: 'Premature answer.' } }] }]))
      .mockResolvedValueOnce(streamResponse([{ choices: [{ delta: { content: 'Final streamed answer.' } }] }]));

    const final = await runOpenAIWebSearchToolLoop({
      body: { model: 'test', stream: true, messages: [{ role: 'user', content: 'Tell me about example' }] },
      client,
      request,
      onChunk: vi.fn(),
    });

    expect(client.readWebPages).toHaveBeenCalledWith([SEARCH_RESULT.url], {
      contentLimit: 3000,
      retries: 0,
    });
    expect(final).toContain('Final streamed answer.');
    expect(final).toContain(SEARCH_RESULT.url);
  });

  it('answers capability questions without contacting the model or search backend', async () => {
    const client = createClient();
    const requestJson = vi.fn();

    const final = await runOpenAIWebSearchJsonToolLoop({
      body: { model: 'test', stream: false, messages: [{ role: 'user', content: '你能联网搜索吗？' }] },
      client,
      requestJson,
      onChunk: vi.fn(),
    });

    expect(final).toBe('可以，当前聊天已开启联网搜索。');
    expect(requestJson).not.toHaveBeenCalled();
    expect(client.webSearch).not.toHaveBeenCalled();
  });
});
