import { expect, test } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
} from './notesE2E';

const SETTINGS_MODAL_SELECTOR = '[data-settings-modal="true"]';
const MODEL_COUNT = 600;
const SAMPLE_FRAME_COUNT = 60;

test('keeps a large AI settings catalog responsive during unrelated chat updates', async () => {
  const { app, userDataRoot } = await launchIsolatedElectron('settings-ai-performance');

  try {
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1360, height: 900 });

    const providerId = await page.evaluate(() => (window as any).__vlainaE2E.addProvider({
      name: 'E2E Performance Channel',
      apiHost: 'https://settings-performance.example.invalid/v1',
      apiKey: 'sk-e2e-performance',
    }));
    const modelIds = Array.from(
      { length: MODEL_COUNT },
      (_, index) => `e2e-performance-model-${String(index).padStart(4, '0')}`,
    );
    await page.evaluate(
      ({ nextProviderId, nextModelIds }) =>
        (window as any).__vlainaE2E.setProviderFetchedModels(nextProviderId, nextModelIds),
      { nextProviderId: providerId, nextModelIds: modelIds },
    );

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'ai' } }));
    });
    await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toHaveAttribute('data-settings-active-tab', 'ai');
    await expect(page.locator('[data-virtual-model-row="true"]')).toHaveCount(MODEL_COUNT);

    const metrics = await page.evaluate(async ({ frameCount }) => {
      const { useUnifiedStore } = await import('/src/stores/unified/useUnifiedStore.ts');
      const scrollRoot = document.querySelector<HTMLElement>('[data-settings-scroll-root="ai"]');
      if (!scrollRoot || scrollRoot.scrollHeight <= scrollRoot.clientHeight) {
        return null;
      }

      const originalMessages = useUnifiedStore.getState().data.ai?.messages ?? {};
      const updateChatMessage = (index: number) => {
        const content = `stream update ${index}`;
        useUnifiedStore.getState().updateAIData({
          messages: {
            ...originalMessages,
            'settings-performance-session': [{
              id: 'settings-performance-message',
              role: 'assistant',
              content,
              modelId: '',
              timestamp: index,
              versions: [{
                content,
                createdAt: index,
                kind: 'original',
                subsequentMessages: [],
              }],
              currentVersionIndex: 0,
            }],
          },
        }, true);
      };

      for (let index = 0; index < 5; index += 1) {
        updateChatMessage(index);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      const maxScrollTop = scrollRoot.scrollHeight - scrollRoot.clientHeight;
      const frameDeltas: number[] = [];
      let lastFrameAt = performance.now();
      for (let index = 0; index < frameCount; index += 1) {
        const phase = index / Math.max(1, frameCount - 1);
        const progress = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
        scrollRoot.scrollTop = Math.round(maxScrollTop * progress);
        updateChatMessage(index + 5);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const now = performance.now();
        frameDeltas.push(now - lastFrameAt);
        lastFrameAt = now;
      }

      useUnifiedStore.getState().updateAIData({ messages: originalMessages }, true);
      const sorted = [...frameDeltas].sort((left, right) => left - right);
      const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
      const average = frameDeltas.reduce((sum, value) => sum + value, 0) / frameDeltas.length;
      return {
        averageFrameMs: Math.round(average * 10) / 10,
        p95FrameMs: Math.round((sorted[p95Index] ?? 0) * 10) / 10,
        maxFrameMs: Math.round(Math.max(...frameDeltas) * 10) / 10,
        longFramesOver50: frameDeltas.filter((value) => value > 50).length,
      };
    }, { frameCount: SAMPLE_FRAME_COUNT });

    console.info('large AI settings frame metrics', metrics);
    expect(metrics).not.toBeNull();
    if (!metrics) {
      return;
    }
    expect(metrics.averageFrameMs).toBeLessThan(60);
    expect(metrics.p95FrameMs).toBeLessThan(200);
    expect(metrics.longFramesOver50).toBeLessThanOrEqual(15);
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});
