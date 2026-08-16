import { expect, test, type Page } from '@playwright/test';
import http from 'node:http';
import {
  CHAT_COMPOSER_TEXTAREA_SELECTOR,
  CHAT_MESSAGE_SELECTOR,
  CHAT_SCROLLABLE_SELECTOR,
  CHAT_VIEW_SELECTOR,
  cleanupIsolatedElectron,
  createChatFixture,
  createChatModelFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  setAppViewMode,
  waitForChatSession,
} from './notesE2E';

async function createDelayedStreamingProvider(): Promise<{
  close: () => Promise<void>;
  url: string;
}> {
  const server = http.createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
      response.writeHead(404);
      response.end();
      return;
    }

    request.resume();
    request.on('end', () => {
      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
      });

      const firstTimer = setTimeout(() => {
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Delayed answer.' } }] })}\n\n`);
        response.write('data: [DONE]\n\n');
        response.end();
      }, 1800);

      response.on('close', () => clearTimeout(firstTimer));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to allocate delayed provider port.');
  }

  return {
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
    url: `http://127.0.0.1:${address.port}/v1`,
  };
}

async function readLastUserMessageGeometry(page: Page) {
  return page.evaluate(({ messageSelector, scrollableSelector }) => {
    const scrollRoot = document.querySelector<HTMLElement>(scrollableSelector);
    const userMessages = Array.from(
      document.querySelectorAll<HTMLElement>(`${messageSelector}[data-role="user"]`),
    );
    const lastUser = userMessages.at(-1) ?? null;
    if (!scrollRoot || !lastUser) {
      return null;
    }

    const rootRect = scrollRoot.getBoundingClientRect();
    const userRect = lastUser.getBoundingClientRect();
    const bubble = lastUser.querySelector<HTMLElement>('[data-vlaina-markdown-font-size-surface="true"]');
    const text = bubble?.firstElementChild instanceof HTMLElement ? bubble.firstElementChild : null;
    const lineHeight = text ? Number.parseFloat(getComputedStyle(text).lineHeight) : 0;
    return {
      rootBottom: rootRect.bottom,
      rootClientHeight: scrollRoot.clientHeight,
      rootScrollHeight: scrollRoot.scrollHeight,
      rootScrollTop: scrollRoot.scrollTop,
      rootTop: rootRect.top,
      userBottom: userRect.bottom,
      userBottomOffset: userRect.bottom - rootRect.top,
      userHeight: userRect.height,
      userLineCount: text && lineHeight > 0
        ? Math.round(text.getBoundingClientRect().height / lineHeight)
        : null,
      userText: lastUser.textContent ?? '',
      userTop: userRect.top,
      userTopOffset: userRect.top - rootRect.top,
    };
  }, {
    messageSelector: CHAT_MESSAGE_SELECTOR,
    scrollableSelector: CHAT_SCROLLABLE_SELECTOR,
  });
}

function createHistoryMessages(count: number) {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (let index = 0; index < count; index += 1) {
    messages.push({
      role: 'user',
      content: `Historical prompt ${index}`,
    });
    messages.push({
      role: 'assistant',
      content: [
        `### Historical response ${index}`,
        '',
        'This response is long enough to make the chat scroll and virtualize realistic message rows.',
        '',
        '- First detail with wrapping text.',
        '- Second detail with wrapping text.',
        '',
        '```ts',
        `const historicalResponseIndex = ${index};`,
        '```',
      ].join('\n'),
    });
  }
  return messages;
}

async function scrollChatToTop(page: Page): Promise<void> {
  await page.evaluate((scrollableSelector) => {
    const scrollRoot = document.querySelector<HTMLElement>(scrollableSelector);
    if (!scrollRoot) {
      return;
    }
    scrollRoot.scrollTop = 0;
    scrollRoot.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, CHAT_SCROLLABLE_SELECTOR);
  await page.waitForTimeout(120);
}

type ShortPromptPlacement = 'near-composer' | 'near-top';

async function expectShortPromptPositionBeforeAssistant(
  page: Page,
  placement: ShortPromptPlacement,
): Promise<void> {
  await expect(page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="user"]`, { hasText: /^hi$/ })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
    hasText: 'Delayed answer.',
  })).toHaveCount(0);

  const geometry = await readLastUserMessageGeometry(page);
  expect(geometry).not.toBeNull();
  expect(geometry!.userText).toContain('hi');
  expect(geometry!.userLineCount, JSON.stringify(geometry, null, 2)).toBe(1);
  expect(geometry!.userTop).toBeGreaterThanOrEqual(geometry!.rootTop - 1);
  expect(geometry!.userBottom).toBeLessThanOrEqual(geometry!.rootBottom + 1);
  if (placement === 'near-top') {
    expect(geometry!.userTopOffset, JSON.stringify(geometry, null, 2))
      .toBeLessThan(geometry!.rootClientHeight * 0.25);
    return;
  }
  expect(geometry!.userBottomOffset, JSON.stringify(geometry, null, 2))
    .toBeGreaterThan(geometry!.rootClientHeight * 0.55);
}

async function expectLastUserMessagePositionBeforeAssistant(
  page: Page,
  text: string,
  placement: ShortPromptPlacement,
): Promise<void> {
  await expect(page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="user"]`, { hasText: text })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
    hasText: 'Delayed answer.',
  })).toHaveCount(0);

  const geometry = await readLastUserMessageGeometry(page);
  expect(geometry).not.toBeNull();
  expect(geometry!.userText).toContain(text);
  expect(geometry!.userTopOffset, JSON.stringify(geometry, null, 2)).toBeGreaterThanOrEqual(-1);
  expect(geometry!.userBottom).toBeLessThanOrEqual(geometry!.rootBottom + 1);
  if (placement === 'near-top') {
    expect(geometry!.userTopOffset, JSON.stringify(geometry, null, 2))
      .toBeLessThan(geometry!.rootClientHeight * 0.25);
    return;
  }
  expect(geometry!.userBottomOffset, JSON.stringify(geometry, null, 2))
    .toBeGreaterThan(geometry!.rootClientHeight * 0.55);
}

test.describe('chat send scroll anchoring', () => {
  test('moves the first short user message near the top while waiting for the assistant', async () => {
    const provider = await createDelayedStreamingProvider();
    const { app, userDataRoot } = await launchIsolatedElectron('chat-send-scroll');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await createChatModelFixture(page, {
        apiHost: provider.url,
        apiModelId: 'e2e-send-scroll-model',
        providerName: 'E2E Send Scroll Provider',
      });
      await setAppViewMode(page, 'chat');
      await expect(page.locator(CHAT_VIEW_SELECTOR)).toBeVisible({ timeout: 30_000 });

      const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR);
      await expect(textarea).toBeVisible({ timeout: 30_000 });
      await textarea.fill('hi');
      await textarea.press('Enter');

      await expectShortPromptPositionBeforeAssistant(page, 'near-top');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
      await provider.close();
    }
  });

  test('moves a short user message near the top when sent from the top of a long chat', async () => {
    const provider = await createDelayedStreamingProvider();
    const { app, userDataRoot } = await launchIsolatedElectron('chat-send-scroll-history');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await createChatModelFixture(page, {
        apiHost: provider.url,
        apiModelId: 'e2e-send-scroll-history-model',
        providerName: 'E2E Send Scroll History Provider',
      });
      const fixture = await createChatFixture(page, {
        sessions: [{
          title: 'E2E Send Scroll History',
          messages: createHistoryMessages(24),
        }],
      });
      await setAppViewMode(page, 'chat');
      await waitForChatSession(page, {
        sessionId: fixture.sessionIds[0]!,
        minMessageCount: 48,
      });
      await scrollChatToTop(page);

      const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR);
      await expect(textarea).toBeVisible({ timeout: 30_000 });
      await textarea.fill('hi');
      await textarea.press('Enter');

      await expectShortPromptPositionBeforeAssistant(page, 'near-top');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
      await provider.close();
    }
  });

  test('keeps the top of a long user message visible after sending from the top of a long chat', async () => {
    const provider = await createDelayedStreamingProvider();
    const { app, userDataRoot } = await launchIsolatedElectron('chat-send-scroll-long-user-history');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await createChatModelFixture(page, {
        apiHost: provider.url,
        apiModelId: 'e2e-send-scroll-long-user-history-model',
        providerName: 'E2E Send Scroll Long User History Provider',
      });
      const fixture = await createChatFixture(page, {
        sessions: [{
          title: 'E2E Send Scroll Long User History',
          messages: createHistoryMessages(24),
        }],
      });
      await setAppViewMode(page, 'chat');
      await waitForChatSession(page, {
        sessionId: fixture.sessionIds[0]!,
        minMessageCount: 48,
      });
      await scrollChatToTop(page);

      const promptPrefix = 'E2E_LONG_USER_TOP_VISIBLE';
      const prompt = `${promptPrefix} ${'这是一段会在用户气泡里自动换行的长内容。'.repeat(48)}`;
      const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR);
      await expect(textarea).toBeVisible({ timeout: 30_000 });
      await textarea.fill(prompt);
      await textarea.press('Enter');

      await expectLastUserMessagePositionBeforeAssistant(page, promptPrefix, 'near-top');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
      await provider.close();
    }
  });
});
