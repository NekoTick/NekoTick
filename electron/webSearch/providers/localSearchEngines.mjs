import { getExcludedSitesForQuery } from '../sourceQuality/searchQualityPolicy.mjs';
import { MAX_WEB_SEARCH_QUERY_CHARS, WebSearchError } from '../types.mjs';

export const MAX_SEARCH_ENGINE_ID_CHARS = 64;
export const MAX_SEARCH_TIME_RANGE_CHARS = 16;

function usesChineseSearchLocale(query) {
  return /[\u3400-\u9fff]/.test(query);
}

export const SEARCH_ENGINES = [
  {
    id: 'brave',
    url: 'https://search.brave.com/search',
    params(query, _limit, options) {
      return {
        q: query,
        source: 'web',
        ...buildTimeRangeParams('brave', options.timeRange),
      };
    },
  },
  {
    id: 'google',
    url: 'https://www.google.com/search',
    params(query, limit, options) {
      const locale = usesChineseSearchLocale(query)
        ? { hl: 'zh-CN', gl: 'cn' }
        : { hl: 'en', gl: 'us' };
      return {
        q: query,
        num: String(Math.max(limit * 3, 10)),
        ...locale,
        pws: '0',
        ...buildTimeRangeParams('google', options.timeRange),
      };
    },
  },
  {
    id: 'bing',
    url: 'https://www.bing.com/search',
    params(query, limit, options) {
      const locale = usesChineseSearchLocale(query)
        ? { mkt: 'zh-CN', setlang: 'zh-Hans', cc: 'CN' }
        : { mkt: 'en-US', setlang: 'en-US', cc: 'US', ensearch: '1' };
      return {
        q: query,
        count: String(Math.max(limit * 3, 10)),
        ...locale,
        ...buildTimeRangeParams('bing', options.timeRange),
      };
    },
  },
  {
    id: 'duckduckgo',
    url: 'https://html.duckduckgo.com/html/',
    params(query, _limit, options) {
      return {
        q: query,
        ...buildTimeRangeParams('duckduckgo', options.timeRange),
      };
    },
  },
];

export function normalizeSearchQuery(query) {
  if (typeof query !== 'string' || query.length > MAX_WEB_SEARCH_QUERY_CHARS) {
    throw new WebSearchError('invalid_query', 'Search query is required.');
  }
  const normalized = query.trim();
  if (!normalized) {
    throw new WebSearchError('invalid_query', 'Search query is required.');
  }
  return normalized;
}

export function boundedInternalQueryText(query) {
  return typeof query === 'string' && query.length <= MAX_WEB_SEARCH_QUERY_CHARS ? query : '';
}

export function buildSearchQuery(query, options) {
  const normalizedQuery = boundedInternalQueryText(query);
  const parts = [
    normalizedQuery,
    ...getExcludedSitesForQuery(normalizedQuery).map((site) => `-site:${site}`),
    '-site:player.bilibili.com',
    '-site:bilibili.com/video',
  ];
  if (options.category === 'news' && !/\bnews\b/i.test(normalizedQuery)) {
    parts.push('news');
  }
  return parts.join(' ');
}

export function buildTimeRangeParams(engineId, timeRange) {
  const normalizedRange = typeof timeRange === 'string' && timeRange.length <= MAX_SEARCH_TIME_RANGE_CHARS
    ? timeRange.toLowerCase()
    : '';
  if (!['day', 'week', 'month', 'year'].includes(normalizedRange)) {
    return {};
  }

  if (engineId === 'google') {
    const value = { day: 'd', week: 'w', month: 'm', year: 'y' }[normalizedRange];
    return { tbs: `qdr:${value}` };
  }

  if (engineId === 'bing') {
    const value = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' }[normalizedRange];
    return { freshness: value };
  }

  if (engineId === 'brave') {
    const value = { day: 'pd', week: 'pw', month: 'pm', year: 'py' }[normalizedRange];
    return { tf: value };
  }

  const value = { day: 'd', week: 'w', month: 'm', year: 'y' }[normalizedRange];
  return { df: value };
}

export function selectSearchEngines(rawEngines) {
  const requested = Array.isArray(rawEngines)
    ? rawEngines
    : typeof rawEngines === 'string'
      ? rawEngines.split(',')
      : [];
  const requestedIds = new Set(
    requested
      .filter((engine) => typeof engine === 'string' && engine.length <= MAX_SEARCH_ENGINE_ID_CHARS)
      .map((engine) => engine.trim().toLowerCase())
      .filter(Boolean)
  );

  if (requestedIds.size === 0) {
    return SEARCH_ENGINES;
  }

  const selected = SEARCH_ENGINES.filter((engine) => requestedIds.has(engine.id));
  return selected.length > 0 ? selected : SEARCH_ENGINES;
}
