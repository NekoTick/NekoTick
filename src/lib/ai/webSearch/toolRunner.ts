import { createWebSearchClient, type WebSearchClient } from './client';
import { readErrorField } from '@/lib/ai/errorClassification';
import {
  formatBatchPagesForModel,
  formatPageForModel,
  formatSafeReadFailure,
  formatSearchResultsForModel,
} from './format';
import { sanitizeWebSearchSourceUrl, sanitizeWebSearchStatus } from './statusMarkup';
import { WEB_SEARCH_TOOL_NAMES } from './toolDefinitions';
import {
  contentLimitArg,
  normalizeToolName,
  parseArguments,
  readBatchUrlsArg,
  readUrlArg,
  searchCategoryArg,
  searchQueryArg,
  searchTimeRangeArg,
} from './toolRunnerArgs';
import type { WebSearchStatus } from './types';
import {
  createWebSearchExecutionSession,
  type WebSearchExecutionSession,
  WebSearchPolicyError,
} from './executionSession';

const AUTO_READ_AFTER_SEARCH_LIMIT = 3;
const AUTO_READ_AFTER_SEARCH_CONTENT_LIMIT = 3000;

interface WebSearchToolCall {
  name: string;
  arguments: string;
}

export interface WebSearchToolRunnerOptions {
  client?: WebSearchClient;
  onStatus?: (status: WebSearchStatus) => void;
  signal?: AbortSignal;
  autoReadAfterSearch?: boolean;
  session?: WebSearchExecutionSession;
}

function collectUniqueSearchResultUrls(
  results: Array<{ url?: unknown }>,
  limit: number,
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (urls.length >= limit) break;
    const url = sanitizeWebSearchSourceUrl(result.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function sanitizeSearchResults<T extends { url?: unknown }>(results: T[], limit: number): Array<T & { url: string }> {
  return results.slice(0, limit).flatMap((result) => {
    const url = sanitizeWebSearchSourceUrl(result.url);
    return url ? [{ ...result, url }] : [];
  });
}

function invalidToolArgumentsResult(
  options: Pick<WebSearchToolRunnerOptions, 'onStatus' | 'signal'>,
): string {
  const message = 'Tool call arguments were invalid.';
  emitStatus(options, { phase: 'error', message });
  return `Tool error: ${message}`;
}

function errorCode(error: unknown): string | undefined {
  const code = readErrorField(error, 'code');
  return typeof code === 'string'
    ? code
    : undefined;
}

function friendlyToolErrorMessage(toolName: string, error?: unknown): string {
  try {
    if (error instanceof WebSearchPolicyError) {
      const message = readErrorField(error, 'message');
      return typeof message === 'string' ? message : 'Tool call failed.';
    }
  } catch {
  }
  if (toolName === WEB_SEARCH_TOOL_NAMES.search) {
    return 'Web search is temporarily unavailable.';
  }
  if (toolName === WEB_SEARCH_TOOL_NAMES.read || toolName === WEB_SEARCH_TOOL_NAMES.readBatch) {
    return `${formatSafeReadFailure(errorCode(error))} The source was skipped.`;
  }
  return 'Tool call failed.';
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function safeFailedSourceMessage(code?: string): string {
  return formatSafeReadFailure(code);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException('The web search request was cancelled.', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return readErrorField(error, 'name') === 'AbortError';
}

function emitStatus(
  options: Pick<WebSearchToolRunnerOptions, 'onStatus' | 'signal'>,
  status: Parameters<NonNullable<WebSearchToolRunnerOptions['onStatus']>>[0],
): void {
  throwIfAborted(options.signal);
  const safeStatus = sanitizeWebSearchStatus(status);
  if (safeStatus) {
    options.onStatus?.(safeStatus);
  }
  throwIfAborted(options.signal);
}

function callWebSearchClient<T>(
  signal: AbortSignal | undefined,
  callWithSignal: (signal: AbortSignal) => Promise<T>,
  callWithoutSignal: () => Promise<T>,
): Promise<T> {
  return signal ? callWithSignal(signal) : callWithoutSignal();
}

export async function runWebSearchToolCall(
  toolCall: WebSearchToolCall,
  options: WebSearchToolRunnerOptions = {},
): Promise<string> {
  const client = options.client ?? createWebSearchClient();
  const session = options.session ?? createWebSearchExecutionSession();
  const args = parseArguments(toolCall.arguments);
  const toolName = normalizeToolName(toolCall.name);

  try {
    throwIfAborted(options.signal);
    if (toolName === WEB_SEARCH_TOOL_NAMES.search) {
      const query = searchQueryArg(args);
      if (!query) {
        return invalidToolArgumentsResult(options);
      }
      session.beginSearch(query);
      const startedAt = performance.now();
      emitStatus(options, { phase: 'searching', query });
      const searchOptions = {
        category: searchCategoryArg(args),
        timeRange: searchTimeRangeArg(args),
        limit: 5,
      };
      const response = await callWebSearchClient(
        options.signal,
        (signal) => client.webSearch(query, searchOptions, signal),
        () => client.webSearch(query, searchOptions),
      );
      throwIfAborted(options.signal);
      const safeResults = sanitizeSearchResults(response.results, 5);
      session.registerSearchResults(safeResults);
      const safeResponse = { ...response, results: safeResults };
      emitStatus(options, {
        phase: safeResults.length > 0 ? 'results' : 'error',
        query: response.query,
        results: safeResults.slice(0, 5),
        metrics: {
          durationMs: elapsedSince(startedAt),
          resultCount: safeResults.length,
        },
        message: safeResults.length > 0 ? undefined : 'No relevant results were found.',
      });
      const searchContent = formatSearchResultsForModel(safeResponse);
      if (options.autoReadAfterSearch !== true) {
        return searchContent;
      }

      const urls = collectUniqueSearchResultUrls(safeResults, AUTO_READ_AFTER_SEARCH_LIMIT);

      if (urls.length === 0) {
        return searchContent;
      }

      const readStartedAt = performance.now();
      emitStatus(options, { phase: 'reading', urls });
      const allowedUrls = session.authorizeReadUrls(urls);
      const pages = await callWebSearchClient(
        options.signal,
        (signal) => client.readWebPages(allowedUrls, { contentLimit: AUTO_READ_AFTER_SEARCH_CONTENT_LIMIT, retries: 0 }, signal),
        () => client.readWebPages(allowedUrls, { contentLimit: AUTO_READ_AFTER_SEARCH_CONTENT_LIMIT, retries: 0 }),
      );
      throwIfAborted(options.signal);
      const successfulPages = pages.filter((page) => page.ok);
      const failedPages = pages.filter((page) => !page.ok);
      emitStatus(options, {
        phase: 'complete',
        urls: successfulPages.map((page) => page.page?.finalUrl || page.url),
        failedSources: failedPages.map((page) => ({
          url: page.url,
          message: safeFailedSourceMessage(page.code),
        })),
        metrics: {
          durationMs: elapsedSince(readStartedAt),
          failureCount: failedPages.length,
          successCount: successfulPages.length,
        },
      });
      return [
        searchContent,
        '',
        'Automatically read top search results:',
        formatBatchPagesForModel(pages),
      ].join('\n');
    }

    if (toolName === WEB_SEARCH_TOOL_NAMES.read) {
      const url = sanitizeWebSearchSourceUrl(readUrlArg(args));
      if (!url) {
        return invalidToolArgumentsResult(options);
      }
      const [allowedUrl] = session.authorizeReadUrls([url]);
      const startedAt = performance.now();
      emitStatus(options, { phase: 'reading', urls: [allowedUrl] });
      const readOptions = { contentLimit: contentLimitArg(args), retries: 0 };
      const page = await callWebSearchClient(
        options.signal,
        (signal) => client.readWebPage(allowedUrl, readOptions, signal),
        () => client.readWebPage(allowedUrl, readOptions),
      );
      throwIfAborted(options.signal);
      emitStatus(options, {
        phase: 'complete',
        urls: [page.finalUrl],
        metrics: {
          durationMs: elapsedSince(startedAt),
          failureCount: 0,
          successCount: 1,
        },
      });
      return formatPageForModel(page);
    }

    if (toolName === WEB_SEARCH_TOOL_NAMES.readBatch) {
      const urls = readBatchUrlsArg(args)
        .map(sanitizeWebSearchSourceUrl)
        .filter((url): url is string => Boolean(url));
      if (urls.length === 0) {
        return invalidToolArgumentsResult(options);
      }
      const allowedUrls = session.authorizeReadUrls(urls);
      const startedAt = performance.now();
      emitStatus(options, { phase: 'reading', urls: allowedUrls });
      const readOptions = { contentLimit: contentLimitArg(args), retries: 0 };
      const pages = await callWebSearchClient(
        options.signal,
        (signal) => client.readWebPages(allowedUrls, readOptions, signal),
        () => client.readWebPages(allowedUrls, readOptions),
      );
      throwIfAborted(options.signal);
      const successfulPages = pages.filter((page) => page.ok);
      const failedPages = pages.filter((page) => !page.ok);
      emitStatus(options, {
        phase: 'complete',
        urls: successfulPages.map((page) => page.page?.finalUrl || page.url),
        failedSources: failedPages.map((page) => ({
          url: page.url,
          message: safeFailedSourceMessage(page.code),
        })),
        metrics: {
          durationMs: elapsedSince(startedAt),
          failureCount: failedPages.length,
          successCount: successfulPages.length,
        },
      });
      return formatBatchPagesForModel(pages);
    }

    return `Unsupported web search tool: ${toolName}`;
  } catch (error) {
    if (isAbortError(error) && options.signal?.aborted) {
      throw error;
    }
    const message = friendlyToolErrorMessage(toolName, error);
    emitStatus(options, { phase: 'error', message });
    return `Tool error: ${message}`;
  }
}
