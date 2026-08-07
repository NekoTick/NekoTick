import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bridge: null as object | null,
  managedWebSearch: vi.fn(),
  requestManagedWebJson: vi.fn(),
}));

vi.mock('@/lib/electron/bridge', () => ({
  getElectronBridge: () => mocks.bridge,
}));

vi.mock('@/lib/account/desktopCommands', () => ({
  accountCommands: {
    managedWebSearch: mocks.managedWebSearch,
  },
}));

vi.mock('@/lib/ai/managed/webRequests', () => ({
  requestManagedWebJson: mocks.requestManagedWebJson,
}));

import { createWebSearchClient } from './client';
import { useWebSearchQuotaStore } from '@/stores/useWebSearchQuotaStore';

describe('web search client', () => {
  beforeEach(() => {
    mocks.bridge = null;
    mocks.managedWebSearch.mockReset();
    mocks.requestManagedWebJson.mockReset();
    useWebSearchQuotaStore.setState({ exhausted: false });
  });

  it('uses the authenticated managed web endpoint in browsers', async () => {
    mocks.requestManagedWebJson.mockResolvedValue({ query: 'openai', results: [] });
    const controller = new AbortController();

    await expect(createWebSearchClient().webSearch('openai', {
      category: 'news',
      timeRange: 'week',
      limit: 5,
    }, controller.signal)).resolves.toEqual({ query: 'openai', results: [] });

    expect(mocks.requestManagedWebJson).toHaveBeenCalledWith('/web-search', {
      method: 'POST',
      body: JSON.stringify({
        action: 'search',
        query: 'openai',
        category: 'news',
        timeRange: 'week',
      }),
      signal: controller.signal,
      timeoutMs: 20_000,
    });
    expect(mocks.managedWebSearch).not.toHaveBeenCalled();
  });

  it('uses the cancellable account bridge in Electron', async () => {
    mocks.bridge = { platform: 'electron' };
    mocks.managedWebSearch.mockResolvedValue({ query: 'openai', results: [] });
    const controller = new AbortController();

    await createWebSearchClient().webSearch('openai', undefined, controller.signal);

    expect(mocks.managedWebSearch).toHaveBeenCalledWith({
      action: 'search',
      query: 'openai',
    }, controller.signal);
    expect(mocks.requestManagedWebJson).not.toHaveBeenCalled();
  });

  it('maps batch and single page reads onto Tavily extract requests', async () => {
    const page = {
      title: 'Example',
      summary: '',
      siteName: 'example.test',
      finalUrl: 'https://example.test/a',
      content: 'Body',
      charCount: 4,
    };
    mocks.requestManagedWebJson
      .mockResolvedValueOnce({ results: [{ url: page.finalUrl, ok: true, page }] })
      .mockResolvedValueOnce({ results: [
        { url: page.finalUrl, ok: true, page },
        { url: 'https://example.test/b', ok: false, code: 'page_unreachable', error: 'Page extraction failed' },
      ] });

    await expect(createWebSearchClient().readWebPage(page.finalUrl, { contentLimit: 3000 }))
      .resolves.toEqual(page);
    await expect(createWebSearchClient().readWebPages([
      page.finalUrl,
      'https://example.test/b',
    ], { contentLimit: 3000 })).resolves.toHaveLength(2);

    expect(mocks.requestManagedWebJson).toHaveBeenNthCalledWith(1, '/web-search', expect.objectContaining({
      body: JSON.stringify({ action: 'extract', urls: [page.finalUrl], contentLimit: 3000 }),
    }));
    expect(mocks.requestManagedWebJson).toHaveBeenNthCalledWith(2, '/web-search', expect.objectContaining({
      body: JSON.stringify({
        action: 'extract',
        urls: [page.finalUrl, 'https://example.test/b'],
        contentLimit: 3000,
      }),
    }));
  });

  it('preserves safe extract failure codes for tool status messages', async () => {
    mocks.requestManagedWebJson.mockResolvedValue({
      results: [{
        url: 'https://example.test',
        ok: false,
        code: 'page_unreachable',
        error: 'Page extraction failed',
      }],
    });

    await expect(createWebSearchClient().readWebPage('https://example.test'))
      .rejects.toMatchObject({ message: 'Page extraction failed', code: 'page_unreachable' });
  });

  it('tracks quota exhaustion without hiding later successful searches', async () => {
    const quotaError = Object.assign(new Error('WEB_SEARCH_QUOTA_EXHAUSTED'), {
      errorCode: 'web_search_monthly_quota_exceeded',
    });
    mocks.requestManagedWebJson
      .mockRejectedValueOnce(quotaError)
      .mockResolvedValueOnce({ query: 'openai', results: [] });
    const client = createWebSearchClient();

    await expect(client.webSearch('openai')).rejects.toBe(quotaError);
    expect(useWebSearchQuotaStore.getState().exhausted).toBe(true);

    await expect(client.webSearch('openai')).resolves.toEqual({ query: 'openai', results: [] });
    expect(useWebSearchQuotaStore.getState().exhausted).toBe(false);
  });
});
