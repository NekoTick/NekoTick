import { describe, expect, it, vi } from 'vitest';
import { LocalSearchProvider, localSearchInternals } from '../electron/webSearch/localSearchProvider.mjs';
import { MAX_WEB_SEARCH_QUERY_CHARS, normalizeLimit } from '../electron/webSearch/types.mjs';

describe('LocalSearchProvider input bounds', () => {
  it('rejects non-string queries without coercion', async () => {
    const provider = new LocalSearchProvider({ fetchImpl: vi.fn() });
    const query = {
      toString: vi.fn(() => {
        throw new Error('query coercion');
      }),
    };

    await expect(provider.search(query, { limit: 5 })).rejects.toMatchObject({
      code: 'invalid_query',
    });
    expect(query.toString).not.toHaveBeenCalled();
  });

  it('rejects overlong raw queries before provider work starts', async () => {
    const fetchImpl = vi.fn();
    const provider = new LocalSearchProvider({ fetchImpl });

    await expect(provider.search('x'.repeat(MAX_WEB_SEARCH_QUERY_CHARS + 1), { limit: 5 }))
      .rejects.toMatchObject({ code: 'invalid_query' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not coerce object timeout values while probing direct official sites', async () => {
    const timeoutMs = {
      toString: vi.fn(() => {
        throw new Error('timeout coercion');
      }),
    };
    const resolvedUrl = {
      url: 'https://vlainax.com/',
      parsed: new URL('https://vlainax.com/'),
      addresses: [{ address: '203.0.113.10', family: 4 }],
    };
    const resolvePublicUrlImpl = vi.fn(async () => resolvedUrl);
    const fetchResolvedUrlImpl = vi.fn(async () => new Response('', { status: 404 }));

    await expect(localSearchInternals.fetchDirectOfficialSite('vlainax official', {
      timeoutMs,
      resolvePublicUrlImpl,
      fetchResolvedUrlImpl,
    })).resolves.toEqual([]);

    expect(timeoutMs.toString).not.toHaveBeenCalled();
    expect(resolvePublicUrlImpl).toHaveBeenCalledWith('https://vlainax.com/');
    expect(fetchResolvedUrlImpl).toHaveBeenCalledWith(
      resolvedUrl,
      2500,
      undefined,
    );
  });

  it('does not coerce non-string search result HTML', () => {
    const html = {
      toString: vi.fn(() => {
        throw new Error('html coercion');
      }),
    };

    expect(localSearchInternals.parseBingResults(html, 5)).toEqual([]);
    expect(localSearchInternals.parseBraveResults(html, 5)).toEqual([]);
    expect(localSearchInternals.parseGoogleResults(html, 5)).toEqual([]);
    expect(localSearchInternals.parseDuckDuckGoResults(html, 5)).toEqual([]);
    expect(html.toString).not.toHaveBeenCalled();
  });

  it('ignores non-decimal numeric option strings', () => {
    expect(normalizeLimit('5', 3, 10)).toBe(5);
    expect(normalizeLimit('1e1', 3, 10)).toBe(3);
    expect(normalizeLimit('0x5', 3, 10)).toBe(3);
  });
});
