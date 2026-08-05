import { cleanText } from '../crawler/contentExtraction.mjs';
import { filterLowRelevanceResults, getQueryMatchScore } from '../searchRelevance.mjs';
import { isBlockedResultUrl, normalizeResultUrl } from '../searchResultUrlPolicy.mjs';

export { filterLowRelevanceResults, getQueryMatchScore, isBlockedResultUrl };

function extractPublishedAt(snippet) {
  const match = snippet.match(/^([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}|\d{4}\u5e74\d{1,2}\u6708\d{1,2}\u65e5)\s*[·•\u2002\s-]*/);
  return match ? match[1] : null;
}

function getSearchHtmlString(html) {
  return typeof html === 'string' ? html : '';
}

function collectBingBlocks(html) {
  return [...getSearchHtmlString(html).matchAll(/<li class="b_algo[\s\S]*?<\/li>/g)].map((match) => match[0]);
}

function collectGoogleBlocks(html) {
  const input = getSearchHtmlString(html);
  const matches = [...input.matchAll(/<a[^>]*href="([^"]+)"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
  return matches
    .map((match, index) => ({
      url: match[1],
      title: match[2],
      block: input.slice(match.index ?? 0, matches[index + 1]?.index ?? input.length),
    }));
}

function collectDuckDuckGoBlocks(html) {
  const input = getSearchHtmlString(html);
  const matches = [...input.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  return matches
    .map((match, index) => ({
      url: match[1],
      title: match[2],
      block: input.slice(match.index ?? 0, matches[index + 1]?.index ?? input.length),
    }));
}

function collectBraveBlocks(html) {
  const input = getSearchHtmlString(html);
  const matches = [...input.matchAll(/<div class="[^"]*\bsnippet\b[^"]*"[^>]*data-type="web"[^>]*>/gi)];
  return matches.map((match, index) => input.slice(match.index ?? 0, matches[index + 1]?.index ?? input.length));
}

function extractResultSnippet(block, title) {
  const patterns = [
    /<(?:a|div|span)[^>]*class="[^"]*(?:result__snippet|VwiC3b|IsZvec|BNeawe|st|snippet)[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i,
    /<(?:a|div|span)[^>]*class='[^']*(?:result__snippet|VwiC3b|IsZvec|BNeawe|st|snippet)[^']*'[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i,
    /<p[^>]*>([\s\S]*?)<\/p>/i,
  ];
  const cleanTitle = cleanText(title);
  for (const pattern of patterns) {
    const snippet = cleanText((block.match(pattern) || [])[1] || '');
    if (snippet && snippet !== cleanTitle) {
      return snippet;
    }
  }
  return '';
}

function parseResultItems(items, limit, existingUrls = new Set(), options = {}) {
  const results = [];
  const seenUrls = new Set(existingUrls);
  const minQueryScore = Number(options.minQueryScore) || 0;

  for (const item of items) {
    const url = normalizeResultUrl(item.url);
    if (!url || seenUrls.has(url)) continue;
    if (isBlockedResultUrl(url, { query: options.query })) continue;
    const title = cleanText(item.title);
    const snippet = item.snippet === undefined
      ? extractResultSnippet(item.block, title)
      : cleanText(item.snippet);
    if (!title) continue;
    if (minQueryScore > 0 && getQueryMatchScore(options.query, `${title} ${snippet}`) < minQueryScore) continue;

    seenUrls.add(url);
    results.push({
      title,
      url,
      snippet,
      publishedAt: extractPublishedAt(snippet),
      source: `local-web-search:${options.engine || 'unknown'}`,
      thumbnail: null,
    });

    if (results.length >= limit) break;
  }

  return results;
}

export function parseBingResults(html, limit, existingUrls = new Set(), options = {}) {
  const items = collectBingBlocks(html).map((block) => {
    const anchorMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    return anchorMatch
      ? { url: anchorMatch[1], title: anchorMatch[2], block }
      : null;
  }).filter(Boolean);
  return parseResultItems(items, limit, existingUrls, { ...options, engine: 'bing' });
}

export function parseGoogleResults(html, limit, existingUrls = new Set(), options = {}) {
  return parseResultItems(collectGoogleBlocks(html), limit, existingUrls, { ...options, engine: 'google' });
}

export function parseDuckDuckGoResults(html, limit, existingUrls = new Set(), options = {}) {
  return parseResultItems(collectDuckDuckGoBlocks(html), limit, existingUrls, { ...options, engine: 'duckduckgo' });
}

export function parseBraveResults(html, limit, existingUrls = new Set(), options = {}) {
  const items = collectBraveBlocks(html).map((block) => {
    const anchor = block.match(/<a\b[^>]*class="[^"]*\bl1\b[^"]*"[^>]*>/i)?.[0] || '';
    const url = (anchor.match(/\bhref="([^"]+)"/i) || [])[1];
    const title = (block.match(/<div[^>]*class="[^"]*\bsearch-snippet-title\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
    const snippet = (block.match(/<div[^>]*class="[^"]*\bgeneric-snippet\b[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
    return url && title ? { url, title, snippet, block } : null;
  }).filter(Boolean);
  return parseResultItems(items, limit, existingUrls, { ...options, engine: 'brave' });
}

export function parseResults(engine, html, limit, existingUrls = new Set(), options = {}) {
  if (engine === 'brave') return parseBraveResults(html, limit, existingUrls, options);
  if (engine === 'google') return parseGoogleResults(html, limit, existingUrls, options);
  if (engine === 'duckduckgo') return parseDuckDuckGoResults(html, limit, existingUrls, options);
  return parseBingResults(html, limit, existingUrls, options);
}

export function extractHtmlTitle(html) {
  const title = cleanText((getSearchHtmlString(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  return title || null;
}
