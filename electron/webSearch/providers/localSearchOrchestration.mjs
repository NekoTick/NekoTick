import { WebSearchError } from '../types.mjs';
import { filterLowRelevanceResults, parseResults } from './localSearchHtmlResults.mjs';
import {
  USER_AGENT,
  createAbortError,
  raceWithAbort,
  readResponseText,
} from './localSearchRequestUtils.mjs';

export function isSearchChallengePage(engineId, html) {
  if (engineId === 'brave') {
    return /<(?:form|div)[^>]+(?:id|class)=["'][^"']*(?:captcha|challenge)[^"']*["']/i.test(html);
  }
  if (engineId === 'google') {
    return /(?:\/sorry\/index|unusual traffic from your computer network)/i.test(html);
  }
  if (engineId === 'bing') {
    return /(?:id=["']turnstile-widget["']|challenges\.cloudflare\.com\/turnstile|class=["']captcha["'])/i.test(html);
  }
  return /(?:id=["']challenge-form["']|class=["'][^"']*anomaly-modal|bots use DuckDuckGo too)/i.test(html);
}

export async function searchEngine(
  provider,
  engine,
  searchQuery,
  normalizedQuery,
  limit,
  existingUrls,
  options,
) {
  const params = new URLSearchParams(engine.params(searchQuery, limit, options));
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), provider.timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;
  const acceptLanguage = /[\u3400-\u9fff]/.test(normalizedQuery)
    ? 'zh-CN,zh;q=0.9,en;q=0.6'
    : 'en-US,en;q=0.9';

  try {
    const response = await raceWithAbort(provider.fetchImpl(`${engine.url}?${params.toString()}`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': acceptLanguage,
        'User-Agent': USER_AGENT,
      },
      cache: 'no-store',
      redirect: 'error',
      signal,
    }), signal);

    if (!response.ok) {
      throw new WebSearchError('search_unavailable', 'Web search is temporarily unavailable.');
    }

    const html = await readResponseText(response, signal);
    if (isSearchChallengePage(engine.id, html)) {
      throw new WebSearchError('search_unavailable', 'Web search is temporarily unavailable.');
    }

    const parsedResults = parseResults(
      engine.id,
      html,
      limit,
      existingUrls,
      { query: normalizedQuery },
    );
    return filterLowRelevanceResults(normalizedQuery, parsedResults);
  } catch (error) {
    if (options.signal?.aborted) throw createAbortError();
    if (timeoutController.signal.aborted) {
      throw new WebSearchError('search_unavailable', 'Web search is temporarily unavailable.', error);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
