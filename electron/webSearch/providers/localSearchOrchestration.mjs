import { WebSearchError } from '../types.mjs';
import { filterLowRelevanceResults, parseResults } from './localSearchHtmlResults.mjs';
import {
  USER_AGENT,
  createAbortError,
  raceWithAbort,
  readResponseText,
} from './localSearchRequestUtils.mjs';

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

  try {
    const response = await raceWithAbort(provider.fetchImpl(`${engine.url}?${params.toString()}`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': USER_AGENT,
      },
      cache: 'no-store',
      redirect: 'error',
      signal,
    }), signal);

    if (!response.ok) {
      throw new WebSearchError('search_unavailable', 'Web search is temporarily unavailable.');
    }

    const parsedResults = parseResults(
      engine.id,
      await readResponseText(response, signal),
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
