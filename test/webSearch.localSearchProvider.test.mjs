import { describe, expect, it, vi } from 'vitest';
import { LocalSearchProvider, localSearchInternals } from '../electron/webSearch/localSearchProvider.mjs';

function htmlResponse(html) {
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
}

describe('LocalSearchProvider', () => {
  it('parses and normalizes results from supported engines', () => {
    const brave = '<div class="snippet result" data-type="web"><a href="https://example.com/brave" class="result l1"><div class="title search-snippet-title">Needle Brave</div></a><div class="generic-snippet"><div class="content">Needle summary.</div></div></div>';
    const google = '<a href="/url?q=https%3A%2F%2Fexample.com%2Fg"><h3>Needle Google</h3></a><div class="VwiC3b">Needle summary.</div>';
    const bing = '<li class="b_algo"><h2><a href="https://example.com/b">Needle Bing</a></h2><p>Needle summary.</p></li>';
    const duck = '<a class="result__a" href="https://example.com/d">Needle Duck</a><div class="result__snippet">Needle summary.</div>';

    expect(localSearchInternals.parseBraveResults(brave, 5)[0]).toMatchObject({
      title: 'Needle Brave',
      url: 'https://example.com/brave',
      snippet: 'Needle summary.',
      source: 'local-web-search:brave',
    });
    expect(localSearchInternals.parseGoogleResults(google, 5)[0].url).toBe('https://example.com/g');
    expect(localSearchInternals.parseBingResults(bing, 5)[0].url).toBe('https://example.com/b');
    expect(localSearchInternals.parseDuckDuckGoResults(duck, 5)[0].url).toBe('https://example.com/d');
  });

  it('queries engines in priority order instead of concurrently', async () => {
    const requestedHosts = [];
    let active = 0;
    let maxActive = 0;
    const fetchImpl = vi.fn(async (url, options) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      requestedHosts.push(new URL(url).hostname);
      expect(options.redirect).toBe('error');
      await Promise.resolve();
      active -= 1;
      if (url.includes('search.brave.com')) {
        return htmlResponse('<div class="snippet result" data-type="web"><a href="https://example.com/result" class="result l1"><div class="title search-snippet-title">Needle Result</div></a><div class="generic-snippet"><div class="content">Needle result page.</div></div></div>');
      }
      throw new Error('Fallback engines should not be needed');
    });

    const results = await new LocalSearchProvider({ fetchImpl }).search('Needle Result', { limit: 1 });

    expect(results[0].url).toBe('https://example.com/result');
    expect(requestedHosts).toEqual(['search.brave.com']);
    expect(maxActive).toBe(1);
  });

  it('uses stable official-source hints without network requests', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network should not run'); });
    const results = await new LocalSearchProvider({ fetchImpl }).search('Python documentation official', { limit: 5 });

    expect(results.some((result) => result.url.includes('python.org/doc'))).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('checks live engines for fresh queries even when an official hint exists', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('google.com')) {
        return htmlResponse('<a href="/url?q=https%3A%2F%2Fexample.com%2Flatest"><h3>Python Latest News</h3></a><div class="VwiC3b">Python latest news.</div>');
      }
      return htmlResponse('');
    });

    const results = await new LocalSearchProvider({ fetchImpl }).search('Python latest news', { limit: 5 });
    expect(fetchImpl).toHaveBeenCalled();
    expect(results.some((result) => result.url.includes('example.com/latest'))).toBe(true);
  });

  it('filters blocked and low-relevance results', () => {
    const html = [
      '<li class="b_algo"><h2><a href="http://127.0.0.1/private">Needle Private</a></h2><p>Needle.</p></li>',
      '<li class="b_algo"><h2><a href="https://example.com/other">Unrelated</a></h2><p>Different topic.</p></li>',
    ].join('');

    const parsed = localSearchInternals.parseBingResults(html, 5, new Set(), {
      query: 'needle result',
    });
    expect(localSearchInternals.filterLowRelevanceResults('needle result', parsed)).toEqual([]);
  });

  it('cancels the active engine request', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const pending = new LocalSearchProvider({ fetchImpl }).search('unknown current query', {
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
