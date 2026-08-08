import { accountCommands } from '@/lib/account/desktopCommands';
import { requestManagedWebJson } from '@/lib/ai/managed/webRequests';
import { getElectronBridge } from '@/lib/electron/bridge';
import type { WebPageContent, WebPageReadResult, WebSearchResponse } from './types';
import { readErrorField } from '@/lib/ai/errorClassification';
import {
  clearWebSearchQuotaExhausted,
  markWebSearchQuotaExhausted,
} from '@/stores/useWebSearchQuotaStore';

export interface WebSearchClient {
  webSearch(query: string, options?: {
    category?: string;
    timeRange?: string;
    limit?: number;
  }, signal?: AbortSignal): Promise<WebSearchResponse>;
  readWebPage(url: string, options?: { contentLimit?: number; retries?: number }, signal?: AbortSignal): Promise<WebPageContent>;
  readWebPages(urls: string[], options?: { contentLimit?: number; retries?: number }, signal?: AbortSignal): Promise<WebPageReadResult[]>;
}

type WebSearchRequest =
  | { action: 'search'; query: string; category?: string; timeRange?: string }
  | { action: 'extract'; urls: string[]; contentLimit?: number };

async function requestWebSearch<T>(body: WebSearchRequest, signal?: AbortSignal): Promise<T> {
  try {
    const result = getElectronBridge()
      ? await accountCommands.managedWebSearch(body, signal) as T
      : await requestManagedWebJson<T>('/web-search', {
          method: 'POST',
          body: JSON.stringify(body),
          signal,
          timeoutMs: 20_000,
        });
    clearWebSearchQuotaExhausted();
    return result;
  } catch (error) {
    if (readErrorField(error, 'errorCode') === 'web_search_monthly_quota_exceeded') {
      markWebSearchQuotaExhausted();
    }
    throw error;
  }
}

function createPageReadError(result: WebPageReadResult | undefined): Error {
  const error = new Error(result?.error || 'Page extraction failed') as Error & { code?: string };
  if (result?.code) {
    error.code = result.code;
  }
  return error;
}

export function createWebSearchClient(): WebSearchClient {
  return {
    async webSearch(query, options, signal) {
      return await requestWebSearch<WebSearchResponse>({
        action: 'search',
        query,
        ...(options?.category ? { category: options.category } : {}),
        ...(options?.timeRange ? { timeRange: options.timeRange } : {}),
      }, signal);
    },
    async readWebPage(url, options, signal) {
      const response = await requestWebSearch<{ results: WebPageReadResult[] }>({
        action: 'extract',
        urls: [url],
        ...(options?.contentLimit === undefined ? {} : { contentLimit: options.contentLimit }),
      }, signal);
      const result = response.results[0];
      if (!result?.ok || !result.page) {
        throw createPageReadError(result);
      }
      return result.page;
    },
    async readWebPages(urls, options, signal) {
      const response = await requestWebSearch<{ results: WebPageReadResult[] }>({
        action: 'extract',
        urls,
        ...(options?.contentLimit === undefined ? {} : { contentLimit: options.contentLimit }),
      }, signal);
      return response.results;
    },
  };
}
