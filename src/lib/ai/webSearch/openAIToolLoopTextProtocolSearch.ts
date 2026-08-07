import { addChatDebugLog } from '@/lib/debug/chatDebugLog';
import { readErrorField } from '@/lib/ai/errorClassification';
import { createWebSearchClient } from './client';
import { formatBatchPagesForModel, formatSearchResultsForModel } from './format';
import {
  appendSuccessfulReadSources,
  emitWebSearchStatus,
  getLatestUserText,
  throwIfAborted,
} from './openAIToolLoopShared';
import {
  buildTextProtocolAnswerPrompt,
  buildTextProtocolSearchQueries,
  sanitizeSearchResults,
} from './openAIToolLoopTextProtocolParsing';
import { getPrefetchReadUrls } from './openAIToolLoopToolRuntime';
import type { PrefetchOptions } from './openAIToolLoopTypes';
import type { OpenAIWireMessage } from './openAIToolTypes';
import { sanitizeWebSearchStatus } from './statusMarkup';
import type { WebSearchStatus } from './types';

export async function buildTextProtocolSearchMessages({
  body,
  query,
  client: providedClient,
  onStatus,
  signal,
}: Pick<PrefetchOptions, 'body' | 'client' | 'onStatus' | 'signal'> & { query: string }): Promise<{
  messages: OpenAIWireMessage[];
  statusHistory: WebSearchStatus[];
  sourceUrls: string[];
  searchUnavailable: boolean;
}> {
  const client = providedClient ?? createWebSearchClient();
  const userText = getLatestUserText(body);
  const statusHistory: WebSearchStatus[] = [];
  const sourceUrls: string[] = [];
  const emitStatus = (status: WebSearchStatus) => {
    const safeStatus = sanitizeWebSearchStatus(status);
    if (!safeStatus) return;
    statusHistory.push(safeStatus);
    appendSuccessfulReadSources(sourceUrls, safeStatus);
    emitWebSearchStatus(onStatus, signal, safeStatus);
  };

  throwIfAborted(signal);
  const searchQueries = buildTextProtocolSearchQueries(query, userText);
  let searchResponse = null as Awaited<ReturnType<typeof client.webSearch>> | null;
  let resultsStatus: WebSearchStatus | null = null;
  let pageContent = '';
  for (const searchQuery of searchQueries) {
    const searchStartedAt = performance.now();
    addChatDebugLog('web-search-text-protocol', 'search attempt started', {
      query: searchQuery,
      isFallback: searchQuery !== query,
    });
    emitStatus({ phase: 'searching', query: searchQuery });
    let attemptResponse: Awaited<ReturnType<typeof client.webSearch>>;
    try {
      attemptResponse = signal
        ? await client.webSearch(searchQuery, { limit: 5 }, signal)
        : await client.webSearch(searchQuery, { limit: 5 });
    } catch (error) {
      addChatDebugLog('web-search-text-protocol', 'search attempt failed', {
        query: searchQuery,
      }, 'warn');
      emitStatus({
        phase: 'error',
        query: searchQuery,
        message: readErrorField(error, 'errorCode') === 'web_search_monthly_quota_exceeded'
          ? 'The web search quota has been used.'
          : 'Web search is temporarily unavailable.',
      });
      return {
        messages: body.messages as OpenAIWireMessage[],
        statusHistory,
        sourceUrls,
        searchUnavailable: true,
      };
    }
    throwIfAborted(signal);
    const safeResults = sanitizeSearchResults(attemptResponse.results, 5);
    const safeSearchResponse = { ...attemptResponse, results: safeResults };
    const attemptStatus: WebSearchStatus = {
      phase: safeResults.length > 0 ? 'results' : 'error',
      query: attemptResponse.query,
      results: safeResults.slice(0, 5),
      metrics: {
        durationMs: elapsedSince(searchStartedAt),
        resultCount: safeResults.length,
      },
      message: safeResults.length > 0 ? undefined : 'No relevant results were found.',
    };
    addChatDebugLog('web-search-text-protocol', 'search attempt completed', {
      query: attemptResponse.query,
      resultCount: safeResults.length,
      durationMs: attemptStatus.metrics?.durationMs,
    }, safeResults.length > 0 ? 'info' : 'warn');
    emitStatus(attemptStatus);
    searchResponse = safeSearchResponse;
    resultsStatus = attemptStatus;
    if (safeResults.length === 0) {
      continue;
    }

    const urls = getPrefetchReadUrls(attemptStatus);
    if (urls.length === 0) {
      break;
    }

    const readStartedAt = performance.now();
    emitStatus({ phase: 'reading', urls });
    const pages = signal
      ? await client.readWebPages(urls, { contentLimit: 3000, retries: 0 }, signal)
      : await client.readWebPages(urls, { contentLimit: 3000, retries: 0 });
    throwIfAborted(signal);
    const successfulPages = pages.filter((page) => page.ok);
    const failedPages = pages.filter((page) => !page.ok);
    emitStatus({
      phase: 'complete',
      urls: successfulPages.map((page) => page.page?.finalUrl || page.url),
      failedSources: failedPages.map((page) => ({
        url: page.url,
        message: page.error || 'Unable to read this page.',
      })),
      metrics: {
        durationMs: elapsedSince(readStartedAt),
        failureCount: failedPages.length,
        successCount: successfulPages.length,
      },
    });
    pageContent = formatBatchPagesForModel(pages);
    if (successfulPages.length > 0 || searchQuery === searchQueries[searchQueries.length - 1]) {
      break;
    }
    addChatDebugLog('web-search-text-protocol', 'read attempt had no readable pages; trying fallback query', {
      query: attemptResponse.query,
      failedUrls: failedPages.map((page) => page.url),
    }, 'warn');
  }

  if (!searchResponse || !resultsStatus) {
    throw new Error('Web search did not run.');
  }

  return {
    messages: [
      ...body.messages as OpenAIWireMessage[],
      buildTextProtocolAnswerPrompt({
        userText,
        searchContent: formatSearchResultsForModel(searchResponse),
        pageContent,
      }),
    ],
    statusHistory,
    sourceUrls,
    searchUnavailable: false,
  };
}

export function elapsedSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
