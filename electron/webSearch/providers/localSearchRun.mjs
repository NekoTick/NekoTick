import { DEFAULT_SEARCH_LIMIT, WebSearchError, normalizeLimit } from '../types.mjs';
import {
  buildSearchQuery,
  normalizeSearchQuery,
  selectSearchEngines,
} from './localSearchEngines.mjs';
import {
  buildOfficialResults,
  fetchDirectOfficialSite,
  getSingleBrandLikeTerm,
  shouldUseFastOfficialHints,
} from './localSearchOfficialCandidates.mjs';
import { throwIfAborted } from './localSearchRequestUtils.mjs';
import { searchEngine } from './localSearchOrchestration.mjs';

export async function runLocalSearch(provider, query, options = {}) {
  throwIfAborted(options.signal);
  const normalizedQuery = normalizeSearchQuery(query);
  const limit = normalizeLimit(options.limit, DEFAULT_SEARCH_LIMIT, 10);
  const officialResults = buildOfficialResults(normalizedQuery, limit);
  if (shouldUseFastOfficialHints(normalizedQuery, options, officialResults)) {
    return officialResults;
  }

  const results = [...officialResults];
  const existingUrls = new Set(results.map((result) => result.url));
  const searchQuery = buildSearchQuery(normalizedQuery, options);
  const engines = selectSearchEngines(options.engines);
  let lastError = null;
  let sawSuccessfulSearch = false;

  for (const engine of engines) {
    throwIfAborted(options.signal);
    let engineResults;
    try {
      engineResults = await searchEngine(
        provider,
        engine,
        searchQuery,
        normalizedQuery,
        limit - results.length,
        existingUrls,
        options,
      );
    } catch (error) {
      throwIfAborted(options.signal);
      lastError = error;
      continue;
    }

    sawSuccessfulSearch = true;
    for (const result of engineResults) {
      if (existingUrls.has(result.url)) continue;
      existingUrls.add(result.url);
      results.push(result);
      if (results.length >= limit) return results.slice(0, limit);
    }
  }

  if (results.length > 0) return results.slice(0, limit);

  if (getSingleBrandLikeTerm(query)) {
    const directOfficialResults = await fetchDirectOfficialSite(normalizedQuery, {
      signal: options.signal,
      timeoutMs: provider.timeoutMs,
    });
    throwIfAborted(options.signal);
    if (directOfficialResults.length > 0) return directOfficialResults.slice(0, limit);
  }

  if (sawSuccessfulSearch) return [];
  throw new WebSearchError('search_unavailable', 'Web search is temporarily unavailable.', lastError);
}
