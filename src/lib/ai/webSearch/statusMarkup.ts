import type { WebSearchStatus } from './types';
import { isLocalNetworkHttpUrl } from '@/lib/notes/markdown/urlSecurity';

const WEB_SEARCH_STATUS_START_TAG = '<web-search-status>';
const WEB_SEARCH_STATUS_END_TAG = '</web-search-status>';
const VALID_PHASES = new Set(['searching', 'results', 'reading', 'complete', 'error']);
export const MAX_WEB_SEARCH_STATUS_JSON_LENGTH = 20000;
export const MAX_WEB_SEARCH_STATUS_MARKUPS = 32;
const MAX_OVERSIZED_STATUS_JSON_EXTRA_SCAN_CHARS = 4096;
const MAX_SOURCE_URL_LENGTH = 4096;
const MAX_STORED_WEB_SEARCH_STATUSES = 24;
const HTTP_AUTHORITY_URL_PATTERN = /^https?:\/\//i;
const UNSAFE_URL_CHARS_REGEX = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\uFFFD]/;

export function sanitizeWebSearchSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length > MAX_SOURCE_URL_LENGTH) return null;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_SOURCE_URL_LENGTH ||
    !HTTP_AUTHORITY_URL_PATTERN.test(trimmed) ||
    UNSAFE_URL_CHARS_REGEX.test(trimmed) ||
    trimmed.includes('\\')
  ) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (isLocalNetworkHttpUrl(trimmed)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function sanitizeWebSearchStatus(value: unknown): WebSearchStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.phase !== 'string' || !VALID_PHASES.has(input.phase)) return null;

  const status: WebSearchStatus = { phase: input.phase as WebSearchStatus['phase'] };
  if (typeof input.query === 'string') status.query = input.query.slice(0, 500);
  if (typeof input.message === 'string') status.message = input.message.slice(0, 500);
  if (Array.isArray(input.urls)) {
    status.urls = input.urls
      .map(sanitizeWebSearchSourceUrl)
      .filter((url): url is string => Boolean(url))
      .slice(0, 8);
  }
  if (Array.isArray(input.results)) {
    status.results = input.results
      .map((result) => {
        if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
        const url = sanitizeWebSearchSourceUrl((result as Record<string, unknown>).url);
        return url ? { result: result as Record<string, unknown>, url } : null;
      })
      .filter((entry): entry is { result: Record<string, unknown>; url: string } => Boolean(entry))
      .slice(0, 5)
      .map(({ result, url }) => {
        return {
          title: typeof result.title === 'string' ? result.title.slice(0, 300) : url,
          url,
          snippet: typeof result.snippet === 'string' ? result.snippet.slice(0, 1000) : '',
          publishedAt: typeof result.publishedAt === 'string' ? result.publishedAt.slice(0, 100) : null,
        };
      });
  }
  if (Array.isArray(input.failedSources)) {
    status.failedSources = input.failedSources
      .map((source) => {
        if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
        const url = sanitizeWebSearchSourceUrl((source as Record<string, unknown>).url);
        return url ? { source: source as Record<string, unknown>, url } : null;
      })
      .filter((entry): entry is { source: Record<string, unknown>; url: string } => Boolean(entry))
      .slice(0, 4)
      .map(({ source, url }) => ({
        url,
        message: typeof source.message === 'string' ? source.message.slice(0, 200) : 'Unable to read this page.',
      }));
  }
  if (input.metrics && typeof input.metrics === 'object' && !Array.isArray(input.metrics)) {
    const metrics = input.metrics as Record<string, unknown>;
    status.metrics = {};
    for (const key of ['durationMs', 'resultCount', 'successCount', 'failureCount'] as const) {
      if (typeof metrics[key] === 'number' && Number.isFinite(metrics[key])) {
        status.metrics[key] = Math.max(0, Math.round(metrics[key]));
      }
    }
  }
  return status;
}

export function sanitizeWebSearchStatuses(value: unknown): WebSearchStatus[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(sanitizeWebSearchStatus)
    .filter((status): status is WebSearchStatus => Boolean(status))
    .slice(-MAX_STORED_WEB_SEARCH_STATUSES);
}

function unescapeStatusJson(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function stripWebSearchStatusMarkup(content: string): string {
  return extractWebSearchStatuses(content).content;
}

export function extractWebSearchStatuses(content: string): {
  statuses: WebSearchStatus[];
  content: string;
} {
  const firstStart = indexOfAsciiCaseInsensitive(content, WEB_SEARCH_STATUS_START_TAG, 0);
  if (firstStart < 0) {
    return {
      statuses: [],
      content: content.trimStart(),
    };
  }

  const statuses: WebSearchStatus[] = [];
  let strippedContent = '';
  let cursor = 0;
  let statusMarkupCount = 0;

  while (cursor < content.length) {
    const start = cursor === 0
      ? firstStart
      : indexOfAsciiCaseInsensitive(content, WEB_SEARCH_STATUS_START_TAG, cursor);
    if (start < 0) {
      strippedContent += content.slice(cursor);
      break;
    }

    strippedContent += content.slice(cursor, start);
    const jsonStart = start + WEB_SEARCH_STATUS_START_TAG.length;
    const boundedEndSearch = content.slice(
      jsonStart,
      jsonStart
        + MAX_WEB_SEARCH_STATUS_JSON_LENGTH
        + MAX_OVERSIZED_STATUS_JSON_EXTRA_SCAN_CHARS
        + WEB_SEARCH_STATUS_END_TAG.length
    );
    const end = indexOfAsciiCaseInsensitive(boundedEndSearch, WEB_SEARCH_STATUS_END_TAG, 0);
    if (end < 0) {
      strippedContent = strippedContent.trimEnd();
      break;
    }

    const json = content.slice(jsonStart, jsonStart + end);
    cursor = jsonStart + end + WEB_SEARCH_STATUS_END_TAG.length;
    statusMarkupCount += 1;

    if (end > MAX_WEB_SEARCH_STATUS_JSON_LENGTH || statusMarkupCount > MAX_WEB_SEARCH_STATUS_MARKUPS) {
      continue;
    }

    try {
      const parsed = JSON.parse(unescapeStatusJson(json)) as WebSearchStatus;
      const status = sanitizeWebSearchStatus(parsed);
      if (status) statuses.push(status);
    } catch {
      // Ignore malformed status payloads; the assistant text should still render.
    }
  }

  return {
    statuses,
    content: strippedContent.trimStart(),
  };
}

function indexOfAsciiCaseInsensitive(content: string, needle: string, fromIndex: number): number {
  const maxStart = content.length - needle.length;
  for (let index = Math.max(0, fromIndex); index <= maxStart; index += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (content[index + offset]?.toLowerCase() !== needle[offset]?.toLowerCase()) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}
