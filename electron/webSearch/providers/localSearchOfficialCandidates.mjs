import { buildAllSourceHints } from '../sourceHints/index.mjs';
import { getMeaningfulTerms } from '../searchRelevance.mjs';
import { fetchWithTimeout } from '../crawler/fetch.mjs';
import { resolvePublicUrl } from '../crawler/ssrfGuard.mjs';
import { boundedInternalQueryText } from './localSearchEngines.mjs';
import { extractHtmlTitle } from './localSearchHtmlResults.mjs';
import {
  createAbortError,
  normalizeSearchTimeoutMs,
  readResponseText,
  throwIfAborted,
} from './localSearchRequestUtils.mjs';

export { buildOfficialSourceHints } from '../sourceHints/index.mjs';
export { getMeaningfulTerms };

export function shouldUseFastOfficialHints(query, options, officialResults) {
  if (officialResults.length === 0) return false;
  if (options.category === 'news' || options.timeRange) return false;

  const normalizedQuery = boundedInternalQueryText(query).toLowerCase();
  const asksForFreshSearch = /(\b(today|breaking|current|recent|latest|updated|updates?|news|this week|this month|this year|just released|newly released|release notes?)\b|今天|今日|最新|最近|新闻|资讯|本周|本月|今年|刚发布|新发布|更新|版本说明|发布说明)/.test(normalizedQuery);
  return !asksForFreshSearch;
}

export function getSingleBrandLikeTerm(query) {
  const normalizedQuery = boundedInternalQueryText(query).toLowerCase();
  const terms = [...new Set(getMeaningfulTerms(query))]
    .filter((term) => /^[a-z0-9][a-z0-9-]{2,30}$/.test(term));
  if (terms.length !== 1) return null;

  const term = terms[0];
  const hasExplicitSiteIntent = /(\b(official|site|website|homepage|download|app|github|repo|repository|docs?|documentation)\b|\u5b98\u7f51|\u5b98\u65b9|\u4e0b\u8f7d|\u5e94\u7528|\u4ed3\u5e93|\u6e90\u7801|\u6587\u6863)/.test(normalizedQuery);
  const looksInvented = /\d|-/.test(term)
    || /^(vl|vr|xr|xq|qw|zh|xj|xv|zx|zq)/.test(term)
    || /(qq|zz|xx|jx|xj|qz|zq|vk|kv|vy|yv)/.test(term);

  return hasExplicitSiteIntent || looksInvented ? term : null;
}

export async function fetchDirectOfficialSite(query, options = {}) {
  const term = getSingleBrandLikeTerm(query);
  if (!term) return [];

  const url = `https://${term}.com/`;
  const timeoutMs = normalizeSearchTimeoutMs(options.timeoutMs, 2500, 2500);
  const resolveUrl = options.resolvePublicUrlImpl ?? resolvePublicUrl;
  const fetchResolvedUrl = options.fetchResolvedUrlImpl ?? ((resolvedUrl, requestTimeoutMs, signal) => (
    fetchWithTimeout(undefined, resolvedUrl, requestTimeoutMs, signal)
  ));

  try {
    throwIfAborted(options.signal);
    const resolvedUrl = await resolveUrl(url);
    throwIfAborted(options.signal);
    const response = await fetchResolvedUrl(resolvedUrl, timeoutMs, options.signal);
    throwIfAborted(options.signal);

    if (!response.ok) return [];
    const contentType = response.headers?.get?.('content-type') || '';
    const html = contentType.includes('text/html') ? await readResponseText(response, options.signal) : '';
    throwIfAborted(options.signal);
    const title = extractHtmlTitle(html) || term;
    return [{
      title,
      url,
      snippet: `Official website candidate for ${term}.`,
      publishedAt: null,
      source: 'local-web-search:direct-domain',
      thumbnail: null,
    }];
  } catch (error) {
    if (options.signal?.aborted) {
      throw createAbortError();
    }
    return [];
  }
}

export function buildOfficialResults(query, limit) {
  return buildAllSourceHints(query).slice(0, limit);
}
