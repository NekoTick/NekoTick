import http from 'node:http';
import { EventEmitter } from 'node:events';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Crawler } from '../electron/webSearch/crawler.mjs';
import { crawlerInternals } from '../electron/webSearch/crawler/index.mjs';
import { prepareCrawlerUrl } from '../electron/webSearch/crawlerUrlPolicy.mjs';

describe('crawler error classification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies invalid JSON responses', async () => {
    const crawler = new Crawler({
      fetchImpl: async () => new Response('{bad', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    await expect(crawler.readUrl('http://93.184.216.34/data.json')).rejects.toMatchObject({
      code: 'invalid_json',
    });
  });

  it('classifies fetch failures as network errors', async () => {
    const crawler = new Crawler({
      fetchImpl: async () => {
        throw new Error('socket failed');
      },
    });

    await expect(crawler.readUrl('http://93.184.216.34')).rejects.toMatchObject({
      code: 'network_error',
    });
  });

  it('does not fetch when the crawler signal is already aborted', async () => {
    let fetchCalled = false;
    const controller = new AbortController();
    controller.abort();
    const crawler = new Crawler({
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response('not used');
      },
    });

    await expect(crawler.readUrl('http://93.184.216.34', {
      signal: controller.signal,
    })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchCalled).toBe(false);
  });

  it('does not coerce object timeout values', () => {
    const timeoutMs = {
      toString: vi.fn(() => {
        throw new Error('timeout coercion');
      }),
    };
    const crawler = new Crawler({
      timeoutMs,
      fetchImpl: async () => new Response('not used'),
    });

    expect(crawler.timeoutMs).toBe(12000);
    expect(timeoutMs.toString).not.toHaveBeenCalled();
  });

  it('prioritizes cancellation over URL validation work when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const crawler = new Crawler({
      fetchImpl: async () => new Response('not used'),
    });

    await expect(crawler.readUrl('file:///etc/passwd', {
      signal: controller.signal,
    })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('does not read the response body when the signal aborts after fetch returns', async () => {
    let bodyRead = false;
    const controller = new AbortController();
    const crawler = new Crawler({
      fetchImpl: async () => {
        controller.abort();
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'text/plain' }),
          async arrayBuffer() {
            bodyRead = true;
            return new TextEncoder().encode('not used').buffer;
          },
        };
      },
    });

    await expect(crawler.readUrl('http://93.184.216.34/source.txt', {
      signal: controller.signal,
    })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(bodyRead).toBe(false);
  });

  it('rejects promptly when the crawler fetch implementation ignores cancellation', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(() => new Promise(() => undefined));
    const crawler = new Crawler({ fetchImpl });

    const request = crawler.readUrl('http://93.184.216.34/source.txt', {
      signal: controller.signal,
    });
    request.catch(() => undefined);

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    controller.abort();

    await expect(request).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('cancels response body reads when the signal aborts while the body is pending', async () => {
    const controller = new AbortController();
    const reader = {
      read: vi.fn(() => new Promise(() => undefined)),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    const crawler = new Crawler({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/plain' }),
        body: {
          getReader: () => reader,
        },
      }),
    });

    const request = crawler.readUrl('http://93.184.216.34/source.txt', {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(reader.read).toHaveBeenCalled());
    controller.abort();

    await expect(request).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('keeps crawler timeouts active while response bodies are pending', async () => {
    const reader = {
      read: vi.fn(() => new Promise(() => undefined)),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    const crawler = new Crawler({
      timeoutMs: 1,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/plain' }),
        body: {
          getReader: () => reader,
        },
      }),
    });

    await expect(crawler.readUrl('http://93.184.216.34/source.txt')).rejects.toMatchObject({
      code: 'timeout',
    });
    expect(reader.read).toHaveBeenCalled();
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('bounds oversized crawler response bodies from custom fetch implementations', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(1_000_001)));
        },
        cancel,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      },
    );
    const crawler = new Crawler({
      fetchImpl: async () => response,
    });

    await expect(crawler.readUrl('http://93.184.216.34/source.txt')).rejects.toMatchObject({
      code: 'content_too_large',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(() => response.body?.getReader()).not.toThrow();
  });

  it('keeps crawler timeouts active when fetch ignores the timeout signal', async () => {
    const fetchImpl = vi.fn(() => new Promise(() => undefined));
    const crawler = new Crawler({
      timeoutMs: 1,
      fetchImpl,
    });

    await expect(crawler.readUrl('http://93.184.216.34/source.txt')).rejects.toMatchObject({
      code: 'timeout',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not start native HTTP fallback requests when the internal signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const request = new EventEmitter();
    request.setTimeout = vi.fn();
    request.destroy = vi.fn();
    request.end = vi.fn();
    const requestSpy = vi.spyOn(http, 'request').mockReturnValue(request);

    await expect(crawlerInternals.fetchAddress({
      url: 'http://example.com/',
      parsed: new URL('http://example.com/'),
      addresses: [{ address: '93.184.216.34', family: 4 }],
    }, {
      address: '93.184.216.34',
      family: 4,
    }, controller.signal)).rejects.toMatchObject({
      code: 'timeout',
    });

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(request.destroy).toHaveBeenCalledTimes(1);
    expect(request.end).not.toHaveBeenCalled();
  });

  it('rejects invalid native HTTP statuses inside the request promise', async () => {
    let respond;
    const request = new EventEmitter();
    request.setTimeout = vi.fn();
    request.destroy = vi.fn();
    request.end = vi.fn();
    vi.spyOn(http, 'request').mockImplementation((_options, callback) => {
      respond = callback;
      return request;
    });
    const pending = crawlerInternals.fetchAddress({
      url: 'http://example.com/',
      parsed: new URL('http://example.com/'),
      addresses: [{ address: '93.184.216.34', family: 4 }],
    }, {
      address: '93.184.216.34',
      family: 4,
    });
    pending.catch(() => undefined);
    const response = new EventEmitter();
    response.statusCode = 700;
    response.headers = {};

    respond(response);
    expect(() => response.emit('end')).not.toThrow();
    await expect(pending).rejects.toMatchObject({ code: 'http_error' });
  });

  it('accepts native HTTP responses whose status forbids a body', async () => {
    let respond;
    const request = new EventEmitter();
    request.setTimeout = vi.fn();
    request.destroy = vi.fn();
    request.end = vi.fn();
    vi.spyOn(http, 'request').mockImplementation((_options, callback) => {
      respond = callback;
      return request;
    });
    const pending = crawlerInternals.fetchAddress({
      url: 'http://example.com/',
      parsed: new URL('http://example.com/'),
      addresses: [{ address: '93.184.216.34', family: 4 }],
    }, {
      address: '93.184.216.34',
      family: 4,
    });
    const response = new EventEmitter();
    response.statusCode = 204;
    response.headers = {};

    respond(response);
    response.emit('end');
    await expect(pending).resolves.toMatchObject({ status: 204 });
  });

  it('rejects interrupted native HTTP response streams', async () => {
    let respond;
    const request = new EventEmitter();
    request.setTimeout = vi.fn();
    request.destroy = vi.fn();
    request.end = vi.fn();
    vi.spyOn(http, 'request').mockImplementation((_options, callback) => {
      respond = callback;
      return request;
    });
    const pending = crawlerInternals.fetchAddress({
      url: 'http://example.com/',
      parsed: new URL('http://example.com/'),
      addresses: [{ address: '93.184.216.34', family: 4 }],
    }, {
      address: '93.184.216.34',
      family: 4,
    });
    pending.catch(() => undefined);
    const response = new EventEmitter();
    response.statusCode = 200;
    response.headers = {};

    respond(response);
    expect(() => response.emit('error', new Error('socket reset'))).not.toThrow();
    await expect(pending).rejects.toMatchObject({ code: 'network_error' });
  });

  it('blocks low quality sources before fetching', async () => {
    let fetchCalled = false;
    const crawler = new Crawler({
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response('not used');
      },
    });

    await expect(crawler.readUrl('https://blog.csdn.net/example/article/details/1')).rejects.toMatchObject({
      code: 'blocked_source',
    });
    await expect(crawler.readUrl('https://www.bilibili.com/video/BV123')).rejects.toMatchObject({
      code: 'blocked_source',
    });
    expect(fetchCalled).toBe(false);
  });

  it('transforms GitHub blob URLs to raw content URLs', () => {
    expect(prepareCrawlerUrl('https://github.com/acme/project/blob/main/src/index.ts')).toBe(
      'https://raw.githubusercontent.com/acme/project/main/src/index.ts',
    );
  });

  it('unwraps Bing redirect URLs before reading', () => {
    const targetUrl = 'https://example.com/page';
    const encodedTarget = Buffer.from(targetUrl).toString('base64url');

    expect(prepareCrawlerUrl(`https://www.bing.com/ck/a?u=a1${encodedTarget}`)).toBe(targetUrl);
  });

  it('does not unwrap lookalike search redirect hosts', () => {
    const targetUrl = 'https://example.com/page';
    const encodedTarget = Buffer.from(targetUrl).toString('base64url');
    const rawUrl = `https://evilbing.com/ck/a?u=a1${encodedTarget}`;

    expect(prepareCrawlerUrl(rawUrl)).toBe(rawUrl);
  });

  it('does not unwrap oversized search redirect targets', () => {
    const rawUrl = `https://www.bing.com/ck/a?u=a1${'a'.repeat(4097)}`;

    expect(prepareCrawlerUrl(rawUrl)).toBe(rawUrl);
  });

  it('does not coerce non-string crawler URLs', () => {
    const rawUrl = {
      toString: vi.fn(() => {
        throw new Error('url coercion');
      }),
    };

    expect(prepareCrawlerUrl(rawUrl)).toBe('');
    expect(rawUrl.toString).not.toHaveBeenCalled();
  });

  it('keeps plain text content unchanged', async () => {
    const codeText = 'const value = input < limit ? input : limit;\n'.repeat(5);
    const crawler = new Crawler({
      fetchImpl: async () => new Response(codeText, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    });

    const page = await crawler.readUrl('http://93.184.216.34/source.ts');

    expect(page.content).toContain('input < limit');
    expect(page.content).toContain('const value');
  });

  it('decodes compressed HTML responses before extracting content', async () => {
    const html = `
      <html>
        <head><title>Compressed Page</title></head>
        <body><main>${'Readable compressed page content. '.repeat(8)}</main></body>
      </html>
    `;
    const crawler = new Crawler({
      fetchImpl: async () => new Response(zlib.gzipSync(html), {
        status: 200,
        headers: {
          'Content-Encoding': 'gzip',
          'Content-Type': 'text/html',
        },
      }),
    });

    const page = await crawler.readUrl('http://93.184.216.34/compressed');

    expect(page.title).toBe('Compressed Page');
    expect(page.content).toContain('Readable compressed page content.');
  });

  it('bounds compressed crawler responses after decompression', async () => {
    const crawler = new Crawler({
      fetchImpl: async () => new Response(zlib.gzipSync('x'.repeat(1_000_001)), {
        status: 200,
        headers: {
          'Content-Encoding': 'gzip',
          'Content-Type': 'text/plain',
        },
      }),
    });

    await expect(crawler.readUrl('http://93.184.216.34/compressed')).rejects.toMatchObject({
      code: 'content_too_large',
    });
  });
});
