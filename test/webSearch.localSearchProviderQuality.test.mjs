import { describe, expect, it } from 'vitest';
import { LocalSearchProvider, localSearchInternals } from '../electron/webSearch/localSearchProvider.mjs';
import { MAX_WEB_SEARCH_QUERY_CHARS } from '../electron/webSearch/types.mjs';

describe('LocalSearchProvider quality controls', () => {
  it('filters irrelevant fallback results before trying the next engine', async () => {
    const calls = [];
    const provider = new LocalSearchProvider({
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.startsWith('https://search.brave.com/search')) {
          return {
            ok: true,
            async text() {
              return '';
            },
          };
        }
        if (url.startsWith('https://www.google.com/search')) {
          return {
            ok: true,
            async text() {
              return '';
            },
          };
        }
        if (url.startsWith('https://www.bing.com/search')) {
          return {
            ok: true,
            async text() {
              return `
                <li class="b_algo">
                  <h2><a href="https://time.is/Japan">Time in Japan now</a></h2>
                  <div class="b_caption"><p>Exact time now, time zone, and sunrise facts for Japan.</p></div>
                </li>
              `;
            },
          };
        }
        return {
          ok: true,
          async text() {
            return `
              <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Frareproducttimer">RareProductTimer</a>
              <a class="result__snippet">RareProductTimer is a lightweight timer app.</a>
            `;
          },
        };
      },
    });

    await expect(provider.search('rareproducttimer', { limit: 5 })).resolves.toEqual([
      expect.objectContaining({
        title: 'RareProductTimer',
        url: 'https://example.com/rareproducttimer',
        source: 'local-web-search:duckduckgo',
      }),
    ]);
    expect(calls[0]).toMatch(/^https:\/\/search\.brave\.com\/search/);
    expect(calls[1]).toMatch(/^https:\/\/www\.google\.com\/search/);
    expect(calls[2]).toMatch(/^https:\/\/www\.bing\.com\/search/);
    expect(calls[3]).toMatch(/^https:\/\/html\.duckduckgo\.com\/html\//);
  });

  it('returns Catime official sources without waiting on external engines', async () => {
    const provider = new LocalSearchProvider({
      fetchImpl: async () => {
        throw new Error('external search should not be called');
      },
    });

    await expect(provider.search('\u4ec0\u4e48\u662fcatime', { limit: 5 })).resolves.toEqual([
      expect.objectContaining({
        title: 'Catime - Timer & Pomodoro',
        url: 'https://cati.me/',
      }),
    ]);
    await expect(provider.search('Catime GitHub repository', { limit: 5 })).resolves.toEqual([
      expect.objectContaining({
        title: 'Catime - Timer & Pomodoro',
        url: 'https://cati.me/',
      }),
      expect.objectContaining({
        title: 'vladelaina/Catime',
        url: 'https://github.com/vladelaina/Catime',
      }),
    ]);
  });

  it('returns the official WeChat entry before external search can surface clones', async () => {
    const provider = new LocalSearchProvider({
      fetchImpl: async () => {
        throw new Error('external search should not be called');
      },
    });

    await expect(provider.search('wechat pc download official', { limit: 5 })).resolves.toEqual([
      expect.objectContaining({
        title: 'WeChat',
        url: 'https://www.wechat.com/en/',
      }),
    ]);
  });

  it('uses a bounded internal timeout for external search requests', async () => {
    const provider = new LocalSearchProvider({
      timeoutMs: 1,
      fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
    });

    await expect(provider.search('unknown query without official hint', { limit: 5 })).rejects.toMatchObject({
      code: 'search_unavailable',
    });
  });

  it('keeps local search timeouts active while response bodies are pending', async () => {
    const textStarted = vi.fn();
    const provider = new LocalSearchProvider({
      timeoutMs: 1,
      fetchImpl: async () => ({
        ok: true,
        text: vi.fn(() => new Promise(() => {
          textStarted();
        })),
      }),
    });

    await expect(provider.search('unknown query without official hint', {
      engines: ['bing'],
      limit: 5,
    })).rejects.toMatchObject({
      code: 'search_unavailable',
    });
    expect(textStarted).toHaveBeenCalled();
  });

  it('treats direct-domain probe timeouts as unavailable sources, not user cancellation', async () => {
    const provider = new LocalSearchProvider({
      timeoutMs: 1,
      fetchImpl: async (url, options) => {
        if (String(url) === 'https://xqtimer.com/') {
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('internal timeout', 'AbortError'));
            }, { once: true });
          });
        }
        return {
          ok: true,
          async text() {
            return `
              <li class="b_algo">
                <h2><a href="https://weather.com/timer">Weather Timer</a></h2>
                <div class="b_caption"><p>Unrelated timer result.</p></div>
              </li>
            `;
          },
        };
      },
    });

    await expect(provider.search('xqtimer official', { engines: ['bing'], limit: 5 }))
      .resolves.toEqual([]);
  });

  it('returns an empty result set instead of unavailable when search succeeds with only irrelevant results', async () => {
    const provider = new LocalSearchProvider({
      fetchImpl: async () => ({
        ok: true,
        async text() {
          return `
            <li class="b_algo">
              <h2><a href="https://weather.com/us/washington/city/seattle/tenday">10-Day Weather Forecast for Seattle</a></h2>
              <div class="b_caption"><p>Seattle weather forecast and conditions.</p></div>
            </li>
          `;
        },
      }),
    });

    await expect(provider.search('weather in shanghai today', { engines: ['bing'], limit: 5 })).resolves.toEqual([]);
  });

  it('treats search engine challenge pages as unavailable instead of empty results', async () => {
    const provider = new LocalSearchProvider({
      fetchImpl: async () => ({
        ok: true,
        async text() {
          return '<div class="captcha"><div id="turnstile-widget"></div></div>';
        },
      }),
    });

    await expect(provider.search('Beijing weather today', { engines: ['bing'], limit: 5 }))
      .rejects.toMatchObject({ code: 'search_unavailable' });
  });

  it('uses Chinese market parameters for Chinese queries', () => {
    const engines = localSearchInternals.selectSearchEngines(['google', 'bing']);
    const googleParams = engines.find((engine) => engine.id === 'google').params('北京天气', 5, {});
    const bingParams = engines.find((engine) => engine.id === 'bing').params('北京天气', 5, {});

    expect(googleParams).toMatchObject({ hl: 'zh-CN', gl: 'cn' });
    expect(bingParams).toMatchObject({ mkt: 'zh-CN', setlang: 'zh-Hans', cc: 'CN' });
    expect(bingParams).not.toHaveProperty('ensearch');
  });

  it('probes a direct .com site for single-token products when search results are irrelevant', async () => {
    const calls = [];
    const provider = new LocalSearchProvider({
      fetchImpl: async (url) => {
        calls.push(String(url));
        if (String(url).startsWith('https://vlaina.com/')) {
          return new Response('<title>vlaina</title>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        }
        return {
          ok: true,
          async text() {
            return `
              <li class="b_algo">
                <h2><a href="https://www.zjzwfw.gov.cn/">浙江政务服务网</a></h2>
                <div class="b_caption"><p>浙江政务服务网提供便捷的在线政务服务。</p></div>
              </li>
            `;
          },
        };
      },
    });

    await expect(provider.search('\u4ec0\u4e48\u662fvlaina', { engines: ['bing'], limit: 5 })).resolves.toEqual([
      expect.objectContaining({
        title: 'vlaina',
        url: 'https://vlaina.com/',
        source: 'local-web-search:direct-domain',
      }),
    ]);
    expect(calls).toContain('https://vlaina.com/');
    expect(calls).toContainEqual(expect.stringMatching(/^https:\/\/www\.bing\.com\/search/));
  });

  it('keeps hyphenated product names together for direct-domain probing', async () => {
    const calls = [];
    const provider = new LocalSearchProvider({
      fetchImpl: async (url) => {
        calls.push(String(url));
        if (String(url).startsWith('https://my-app-demo.com/')) {
          return new Response('<title>my-app-demo</title>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        }
        return {
          ok: true,
          async text() {
            return '';
          },
        };
      },
    });

    await expect(provider.search('my-app-demo official', { engines: ['bing'], limit: 5 })).resolves.toEqual([
      expect.objectContaining({
        title: 'my-app-demo',
        url: 'https://my-app-demo.com/',
        source: 'local-web-search:direct-domain',
      }),
    ]);
    expect(calls).toContain('https://my-app-demo.com/');
    expect(calls).toContainEqual(expect.stringMatching(/^https:\/\/www\.bing\.com\/search/));
  });

  it('does not direct-domain probe broad multi-term informational searches', async () => {
    const calls = [];
    const provider = new LocalSearchProvider({
      fetchImpl: async (url) => {
        calls.push(String(url));
        return {
          ok: true,
          async text() {
            return `
              <li class="b_algo">
                <h2><a href="https://weather.com/us/washington/city/seattle/tenday">10-Day Weather Forecast for Seattle</a></h2>
                <div class="b_caption"><p>Seattle weather forecast and conditions.</p></div>
              </li>
            `;
          },
        };
      },
    });

    await expect(provider.search('weather in shanghai today', { engines: ['bing'], limit: 5 })).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('does not direct-domain probe ordinary single-word concepts', async () => {
    const calls = [];
    const provider = new LocalSearchProvider({
      fetchImpl: async (url) => {
        calls.push(String(url));
        if (String(url).startsWith('https://gravity.com/')) {
          return new Response('<title>Gravity - WordPress forms</title>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        }
        return {
          ok: true,
          async text() {
            return `
              <li class="b_algo">
                <h2><a href="https://example.com/noise">Unrelated result</a></h2>
                <div class="b_caption"><p>Unrelated snippet.</p></div>
              </li>
            `;
          },
        };
      },
    });

    await expect(provider.search('what is gravity', { engines: ['bing'], limit: 5 })).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('keeps low relevance result filtering explicit for catime-like queries', () => {
    expect(localSearchInternals.filterLowRelevanceResults('catime', [
      {
        title: 'Time in Japan now',
        url: 'https://time.is/Japan',
        snippet: 'Exact time now and time zone facts for Japan.',
      },
      {
        title: 'Catime - Timer & Pomodoro',
        url: 'https://cati.me/',
        snippet: 'Catime is a lightweight timer app.',
      },
    ])).toEqual([
      expect.objectContaining({
        title: 'Catime - Timer & Pomodoro',
      }),
    ]);
  });

  it('requires enough meaningful terms to avoid ambiguous Bing-style matches', () => {
    expect(localSearchInternals.getMeaningfulTerms('fish shell official documentation')).toEqual(['fish', 'shell']);
    expect(localSearchInternals.getMeaningfulTerms('my-app-demo official')).toEqual(['my-app-demo']);
    expect(localSearchInternals.getMeaningfulTerms('current CISA known exploited vulnerabilities catalog official'))
      .toEqual(['cisa', 'known', 'exploited', 'vulnerabilities', 'catalog']);
    expect(localSearchInternals.filterLowRelevanceResults('fish shell official documentation', [
      {
        title: 'Oregon Fishing Forum',
        url: 'https://www.oregonfishingforum.com/',
        snippet: 'Fishing reports and local waterbody discussions.',
      },
      {
        title: 'fish shell',
        url: 'https://fishshell.com/docs/current/',
        snippet: 'Official fish shell documentation.',
      },
    ])).toEqual([
      expect.objectContaining({
        title: 'fish shell',
      }),
    ]);
    expect(localSearchInternals.filterLowRelevanceResults('MCP Inspector npm official', [
      {
        title: 'Microsoft MCP certification profile',
        url: 'https://trainingsupport.microsoft.com/en-us/mcp/forum/all/example',
        snippet: 'Certification support forum.',
      },
      {
        title: 'MCP Inspector',
        url: 'https://modelcontextprotocol.io/docs/tools/inspector',
        snippet: 'Inspector documentation for MCP development.',
      },
    ])).toEqual([
      expect.objectContaining({
        title: 'MCP Inspector',
      }),
    ]);
    expect(localSearchInternals.filterLowRelevanceResults('current CISA known exploited vulnerabilities catalog official', [
      {
        title: 'Current Catalog - Checks, Address Labels, Wrapping Paper',
        url: 'https://www.currentcatalog.com/',
        snippet: 'Shop checks, address labels, wrapping paper, and cards.',
      },
      {
        title: 'Known Exploited Vulnerabilities Catalog',
        url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
        snippet: 'Official CISA KEV catalog.',
      },
    ])).toEqual([
      expect.objectContaining({
        title: 'Known Exploited Vulnerabilities Catalog',
      }),
    ]);
  });

  it('does not coerce internal helper query options', () => {
    const hostileValue = {
      toString() {
        throw new Error('value should not be coerced');
      },
      valueOf() {
        throw new Error('value should not be coerced');
      },
    };
    const overlongQuery = `${'x'.repeat(MAX_WEB_SEARCH_QUERY_CHARS + 1)} official`;

    expect(localSearchInternals.getMeaningfulTerms(hostileValue)).toEqual([]);
    expect(localSearchInternals.getMeaningfulTerms(overlongQuery)).toEqual([]);
    expect(localSearchInternals.getQueryMatchScore('react', hostileValue)).toBe(0);
    expect(localSearchInternals.buildSearchQuery(hostileValue, {})).not.toContain('[object Object]');
    expect(localSearchInternals.buildSearchQuery(overlongQuery, {})).not.toContain(overlongQuery);
    expect(localSearchInternals.getSingleBrandLikeTerm(hostileValue)).toBeNull();
    expect(localSearchInternals.buildTimeRangeParams('google', hostileValue)).toEqual({});
    expect(localSearchInternals.selectSearchEngines([hostileValue, 'bing']).map((engine) => engine.id)).toEqual(['bing']);
  });

  it('returns official sources for random developer tool queries without external engines', async () => {
    const provider = new LocalSearchProvider({
      fetchImpl: async () => {
        throw new Error('external search should not be called');
      },
    });

    const cases = [
      ['Ghostty terminal official download', 'https://ghostty.org/'],
      ['what is Zed editor official site', 'https://zed.dev/'],
      ['Biome formatter official docs', 'https://biomejs.dev/'],
      ['Rspack official documentation', 'https://rspack.dev/'],
      ['uv Python package manager official docs', 'https://docs.astral.sh/uv/'],
      ['Ruff formatter official docs', 'https://docs.astral.sh/ruff/'],
      ['mise version manager official docs', 'https://mise.jdx.dev/'],
      ['Starship prompt install official', 'https://starship.rs/'],
      ['fish shell official documentation', 'https://fishshell.com/docs/current/'],
      ['OpenCode AI terminal GitHub', 'https://opencode.ai/'],
      ['MCP Inspector npm official', 'https://modelcontextprotocol.io/docs/tools/inspector'],
      ['Ladybird browser official website', 'https://ladybird.org/'],
      ['Python 3.14 release notes official', 'https://docs.python.org/3.14/whatsnew/3.14.html'],
    ];

    for (const [query, url] of cases) {
      await expect(provider.search(query, { limit: 5 }), query).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ url }),
        ]),
      );
    }
  });
});
