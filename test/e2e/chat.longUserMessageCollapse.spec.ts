import { expect, test, type Page } from '@playwright/test';
import http from 'node:http';
import {
  CHAT_COMPOSER_TEXTAREA_SELECTOR,
  CHAT_MESSAGE_SELECTOR,
  cleanupIsolatedElectron,
  createChatFixture,
  createChatModelFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  setAppViewMode,
  waitForChatSession,
} from './notesE2E';

function createLongUserMessage(lineCount: number): string {
  return Array.from({ length: lineCount }, (_value, index) => `E2E_LONG_USER_LINE_${index + 1}`).join('\n');
}

async function createDelayedProvider(): Promise<{
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

      const timer = setTimeout(() => {
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Visual long message acknowledged.' } }] })}\n\n`);
        response.write('data: [DONE]\n\n');
        response.end();
      }, 1800);
      response.on('close', () => clearTimeout(timer));
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

async function readLongUserMessageState(page: Page) {
  return page.evaluate((messageSelector) => {
    const bubble = document.querySelector<HTMLElement>(
      `${messageSelector}[data-role="user"] [data-chat-long-user-message]`,
    );
    const row = bubble?.closest<HTMLElement>(messageSelector) ?? null;
    const toggle = bubble?.querySelector<HTMLButtonElement>('[data-chat-long-user-message-toggle="true"]') ?? null;

    return {
      ariaExpanded: toggle?.getAttribute('aria-expanded') ?? null,
      hasLine8: bubble?.textContent?.includes('E2E_LONG_USER_LINE_8') ?? false,
      hasLine9: bubble?.textContent?.includes('E2E_LONG_USER_LINE_9') ?? false,
      state: bubble?.getAttribute('data-chat-long-user-message') ?? null,
      toggleVisible: Boolean(toggle),
    };
  }, CHAT_MESSAGE_SELECTOR);
}

async function readLatestLongUserMessageState(page: Page) {
  return page.evaluate((messageSelector) => {
    const userRows = Array.from(document.querySelectorAll<HTMLElement>(`${messageSelector}[data-role="user"]`));
    const row = userRows.at(-1) ?? null;
    const bubble = row?.querySelector<HTMLElement>('[data-chat-long-user-message]') ?? null;
    const toggle = bubble?.querySelector<HTMLButtonElement>('[data-chat-long-user-message-toggle="true"]') ?? null;

    return {
      ariaExpanded: toggle?.getAttribute('aria-expanded') ?? null,
      hasBubble: Boolean(bubble),
      state: bubble?.getAttribute('data-chat-long-user-message') ?? null,
      text: row?.textContent ?? '',
      toggleVisible: Boolean(toggle),
    };
  }, CHAT_MESSAGE_SELECTOR);
}

test.describe('chat long user message collapse', () => {
  test('collapses user messages over 8 lines and restores the compact state after toggling', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-long-user-message-collapse');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const fixture = await createChatFixture(page, {
        sessions: [{
          title: 'E2E Long User Message Collapse',
          messages: [
            {
              role: 'user',
              content: createLongUserMessage(200),
            },
            {
              role: 'assistant',
              content: 'E2E_LONG_USER_MESSAGE_ACK',
            },
          ],
        }],
      });

      await setAppViewMode(page, 'chat');
      await waitForChatSession(page, {
        sessionId: fixture.sessionIds[0]!,
        minMessageCount: 2,
        sentinelText: 'E2E_LONG_USER_MESSAGE_ACK',
      });

      await expect.poll(() => readLongUserMessageState(page), { timeout: 30_000 }).toMatchObject({
        ariaExpanded: 'false',
        hasLine8: true,
        hasLine9: false,
        state: 'collapsed',
        toggleVisible: true,
      });

      const toggle = page.locator('[data-chat-long-user-message-toggle="true"]');
      await toggle.click();
      await expect.poll(() => readLongUserMessageState(page), { timeout: 10_000 }).toMatchObject({
        ariaExpanded: 'true',
        hasLine9: true,
        state: 'expanded',
        toggleVisible: true,
      });

      await toggle.scrollIntoViewIfNeeded();
      await toggle.hover();
      await expect.poll(async () => toggle.evaluate((element) => {
        const actions = element.closest<HTMLElement>('[data-message-item="true"]')
          ?.querySelector<HTMLElement>('[data-chat-message-actions="true"]') ?? null;
        return actions ? Number.parseFloat(getComputedStyle(actions).opacity) : 0;
      })).toBe(1);
      const collapseContinuity = await toggle.evaluate(async (element) => {
        element.dataset.e2eCollapseIdentity = 'toggle';
        const row = element.closest<HTMLElement>('[data-message-item="true"]');
        if (row) row.dataset.e2eCollapseIdentity = 'row';

        element.click();
        const actionOpacities: number[] = [];
        await new Promise<void>((resolve) => {
          const sampleFrame = () => {
            const actions = document.querySelector<HTMLElement>('[data-chat-message-actions="true"]');
            actionOpacities.push(actions ? Number.parseFloat(getComputedStyle(actions).opacity) : 0);
            if (actionOpacities.length >= 12) {
              resolve();
              return;
            }
            requestAnimationFrame(sampleFrame);
          };
          requestAnimationFrame(sampleFrame);
        });

        const currentToggle = document.querySelector<HTMLElement>(
          '[data-chat-long-user-message-toggle="true"]',
        );
        return {
          minimumActionOpacity: Math.min(...actionOpacities),
          rowIdentity: currentToggle?.closest<HTMLElement>('[data-message-item="true"]')
            ?.dataset.e2eCollapseIdentity ?? null,
          toggleIdentity: currentToggle?.dataset.e2eCollapseIdentity ?? null,
        };
      });
      expect(collapseContinuity).toEqual({
        minimumActionOpacity: 1,
        rowIdentity: 'row',
        toggleIdentity: 'toggle',
      });
      await expect.poll(() => readLongUserMessageState(page), { timeout: 10_000 }).toMatchObject({
        ariaExpanded: 'false',
        hasLine9: false,
        state: 'collapsed',
        toggleVisible: true,
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('collapses the first visually wrapped user message while waiting for the assistant', async () => {
    const provider = await createDelayedProvider();
    const { app, userDataRoot } = await launchIsolatedElectron('chat-first-visual-long-message-collapse');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await createChatModelFixture(page, {
        apiHost: provider.url,
        apiModelId: 'e2e-first-visual-long-message-model',
        providerName: 'E2E First Visual Long Message Provider',
      });
      await setAppViewMode(page, 'chat');

      const longVisualPrompt = 'E2E_VISUAL_LONG_USER_MESSAGE_' +
        '这是一段没有换行但是会在用户气泡里自动换行的中文内容。'.repeat(36);
      const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR);
      await expect(textarea).toBeVisible({ timeout: 30_000 });
      await textarea.fill(longVisualPrompt);
      await textarea.press('Enter');

      await expect.poll(() => readLatestLongUserMessageState(page), { timeout: 10_000 }).toMatchObject({
        ariaExpanded: 'false',
        hasBubble: true,
        state: 'collapsed',
        toggleVisible: true,
      });
      await expect(page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
        hasText: 'Visual long message acknowledged.',
      })).toHaveCount(0);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
      await provider.close();
    }
  });
});
