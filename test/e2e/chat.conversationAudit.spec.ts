import { expect, test, type Page } from '@playwright/test';
import http from 'node:http';
import {
  CHAT_COMPOSER_TEXTAREA_SELECTOR,
  CHAT_MESSAGE_ACTION_SELECTOR,
  CHAT_MESSAGE_SELECTOR,
  CHAT_VIEW_SELECTOR,
  cleanupIsolatedElectron,
  createChatFixture,
  createChatModelFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  setAppViewMode,
  waitForChatSession,
} from './notesE2E';

const HTTP_ERROR_SENTINEL = 'CUSTOM_HTTP_RAW_SENTINEL: channel balance exhausted';
const STREAM_ERROR_SENTINEL = 'CUSTOM_STREAM_RAW_SENTINEL: upstream stream interrupted';
const SUCCESS_SENTINEL = 'AUDIT_SUCCESS_STREAM_DONE';
const STOP_PARTIAL_SENTINEL = 'AUDIT_STOP_PARTIAL_VISIBLE';
const STOP_FINAL_SENTINEL = 'AUDIT_STOP_SHOULD_NOT_FINISH';
const REGENERATED_SENTINEL = 'AUDIT_REGENERATED_DONE';

type AuditProviderRequest = {
  body: string;
  lastUserText: string;
  url: string;
};

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function getLastUserTextFromBody(body: string): string {
  try {
    const payload = JSON.parse(body) as { messages?: Array<{ role?: string; content?: unknown }> };
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'user') {
        return extractMessageText(message.content);
      }
    }
  } catch {
  }
  return '';
}

function writeSseChunk(response: http.ServerResponse, chunk: string): void {
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
}

function writeSseError(response: http.ServerResponse, message: string): void {
  response.write(`data: ${JSON.stringify({ error: { message, code: 'e2e_raw_provider_error' } })}\n\n`);
}

async function createAuditProviderServer(): Promise<{
  close: () => Promise<void>;
  requests: () => AuditProviderRequest[];
  url: string;
}> {
  const requests: AuditProviderRequest[] = [];
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

    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      const lastUserText = getLastUserTextFromBody(body);
      requests.push({ body, lastUserText, url: request.url ?? '' });

      if (lastUserText.includes('AUDIT_HTTP_ERROR_PROMPT')) {
        response.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({
          error: {
            message: HTTP_ERROR_SENTINEL,
            code: 'custom_balance_exhausted',
          },
        }));
        return;
      }

      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
      });

      if (lastUserText.includes('AUDIT_STREAM_ERROR_PROMPT')) {
        writeSseChunk(response, 'Visible partial answer before provider stream error.\n\n');
        setTimeout(() => {
          writeSseError(response, STREAM_ERROR_SENTINEL);
          response.end();
        }, 30);
        return;
      }

      if (lastUserText.includes('AUDIT_STOP_PROMPT')) {
        let index = 0;
        const chunks = [
          `${STOP_PARTIAL_SENTINEL} chunk 1.\n`,
          'The stream is intentionally slow so the stop button can cancel it.\n',
          'More slow text that should be preserved only if it arrived before cancellation.\n',
          `${STOP_FINAL_SENTINEL}\n`,
        ];
        const timer = setInterval(() => {
          if (index >= chunks.length) {
            clearInterval(timer);
            response.write('data: [DONE]\n\n');
            response.end();
            return;
          }
          writeSseChunk(response, chunks[index]!);
          index += 1;
        }, 180);
        const clear = () => clearInterval(timer);
        request.on('aborted', clear);
        response.on('close', clear);
        return;
      }

      const content = lastUserText.includes('AUDIT_REGENERATE_PROMPT')
        ? `${REGENERATED_SENTINEL}: regenerated answer from mocked provider.`
        : [
            '# Audit response',
            '',
            `The conversation path streamed successfully. ${SUCCESS_SENTINEL}`,
          ].join('\n');
      const chunks = content.match(/[\s\S]{1,24}/g) ?? [content];
      let index = 0;
      const timer = setInterval(() => {
        if (index >= chunks.length) {
          clearInterval(timer);
          response.write('data: [DONE]\n\n');
          response.end();
          return;
        }
        writeSseChunk(response, chunks[index]!);
        index += 1;
      }, 8);
      const clear = () => clearInterval(timer);
      request.on('aborted', clear);
      response.on('close', clear);
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
    throw new Error('Unable to allocate audit provider port.');
  }

  return {
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
    requests: () => requests.slice(),
    url: `http://127.0.0.1:${address.port}/v1`,
  };
}

async function getChatState(page: Page) {
  return page.evaluate(() => (window as any).__vlainaE2E.getChatState());
}

async function sendPrompt(page: Page, prompt: string): Promise<void> {
  const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR);
  await expect(textarea).toBeVisible({ timeout: 30_000 });
  await textarea.fill(prompt);
  await textarea.press('Enter');
  await expect(textarea).toHaveValue('', { timeout: 10_000 });
}

test.describe('chat conversation audit', () => {
  test.setTimeout(180_000);

  test('streams successful replies and shows custom provider HTTP errors without managed rewriting', async () => {
    const provider = await createAuditProviderServer();
    const { app, userDataRoot } = await launchIsolatedElectron('chat-conversation-audit-success-errors');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await createChatModelFixture(page, {
        apiHost: provider.url,
        apiModelId: 'e2e-conversation-audit-model',
        providerName: 'E2E Conversation Audit Provider',
      });
      const fixture = await createChatFixture(page, {
        sessions: [{ title: 'E2E Conversation Audit', messages: [] }],
      });
      await setAppViewMode(page, 'chat');
      await expect(page.locator(CHAT_VIEW_SELECTOR)).toBeVisible({ timeout: 30_000 });

      await sendPrompt(page, 'AUDIT_SUCCESS_PROMPT please answer with streamed markdown.');
      await expect(page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
        hasText: SUCCESS_SENTINEL,
      })).toBeVisible({ timeout: 30_000 });

      await expect.poll(async () => {
        const state = await getChatState(page);
        const messages = state.messages[fixture.sessionIds[0]!] ?? [];
        return {
          messageCount: messages.length,
          lastAssistant: [...messages].reverse().find((message: { role: string }) => message.role === 'assistant')?.content ?? '',
        };
      }, { timeout: 10_000 }).toMatchObject({
        messageCount: 2,
        lastAssistant: expect.stringContaining(SUCCESS_SENTINEL),
      });

      await sendPrompt(page, 'AUDIT_HTTP_ERROR_PROMPT trigger custom channel HTTP error.');
      await expect(page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
        hasText: HTTP_ERROR_SENTINEL,
      })).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-chat-input-region="true"] [role="alert"]')).toHaveCount(0);
      await expect(page.locator(CHAT_VIEW_SELECTOR)).not.toContainText('Unable to reach the AI service');
      await expect(page.locator(CHAT_VIEW_SELECTOR)).not.toContainText('upstream_unavailable');

      const state = await getChatState(page);
      const messages = state.messages[fixture.sessionIds[0]!] ?? [];
      const lastAssistant = [...messages].reverse().find((message: { role: string }) => message.role === 'assistant');
      expect(lastAssistant?.content).toContain(HTTP_ERROR_SENTINEL);
      expect(lastAssistant?.content).toContain('<error type="custom_provider"');

      const prompts = provider.requests().map((request) => request.lastUserText);
      expect(prompts.some((prompt) => prompt.includes('AUDIT_SUCCESS_PROMPT'))).toBe(true);
      expect(prompts.some((prompt) => prompt.includes('AUDIT_HTTP_ERROR_PROMPT'))).toBe(true);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
      await provider.close();
    }
  });

  test('surfaces stream errors, supports stop, and leaves no stuck loading state', async () => {
    const provider = await createAuditProviderServer();
    const { app, userDataRoot } = await launchIsolatedElectron('chat-conversation-audit-stop-stream-error');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await createChatModelFixture(page, {
        apiHost: provider.url,
        apiModelId: 'e2e-conversation-audit-model',
        providerName: 'E2E Conversation Audit Provider',
      });
      const fixture = await createChatFixture(page, {
        sessions: [{ title: 'E2E Stream Error And Stop Audit', messages: [] }],
      });
      await setAppViewMode(page, 'chat');

      await sendPrompt(page, 'AUDIT_STREAM_ERROR_PROMPT trigger stream error.');
      await expect(page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
        hasText: STREAM_ERROR_SENTINEL,
      })).toBeVisible({ timeout: 30_000 });

      let state = await getChatState(page);
      let messages = state.messages[fixture.sessionIds[0]!] ?? [];
      let lastAssistant = [...messages].reverse().find((message: { role: string }) => message.role === 'assistant');
      expect(lastAssistant?.content).toContain(STREAM_ERROR_SENTINEL);
      expect(lastAssistant?.content).toContain('<error type="custom_provider"');

      await sendPrompt(page, 'AUDIT_STOP_PROMPT start a slow stream then cancel it.');
      await expect(page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
        hasText: STOP_PARTIAL_SENTINEL,
      })).toBeVisible({ timeout: 30_000 });
      await page.locator('[data-chat-input-action="stop"]').click();
      await expect(page.locator('[data-chat-input-action="stop"]')).toHaveCount(0, { timeout: 10_000 });
      await page.waitForTimeout(250);

      state = await getChatState(page);
      messages = state.messages[fixture.sessionIds[0]!] ?? [];
      lastAssistant = [...messages].reverse().find((message: { role: string }) => message.role === 'assistant');
      expect(lastAssistant?.content).toContain(STOP_PARTIAL_SENTINEL);
      expect(lastAssistant?.content).not.toContain(STOP_FINAL_SENTINEL);
      expect(lastAssistant?.content).not.toContain('<error');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
      await provider.close();
    }
  });

  test('regenerates assistant replies through the selected custom provider', async () => {
    const provider = await createAuditProviderServer();
    const { app, userDataRoot } = await launchIsolatedElectron('chat-conversation-audit-regenerate');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const { modelId } = await createChatModelFixture(page, {
        apiHost: provider.url,
        apiModelId: 'e2e-conversation-audit-model',
        providerName: 'E2E Conversation Audit Provider',
      });
      const fixture = await createChatFixture(page, {
        sessions: [
          {
            title: 'E2E Regenerate Audit',
            messages: [
              {
                id: 'audit-regenerate-user',
                role: 'user',
                modelId,
                content: 'AUDIT_REGENERATE_PROMPT please regenerate this answer.',
              },
              {
                id: 'audit-regenerate-assistant',
                role: 'assistant',
                modelId,
                content: 'Old answer before regeneration.',
              },
            ],
          },
        ],
      });
      await setAppViewMode(page, 'chat');
      await waitForChatSession(page, {
        sessionId: fixture.sessionIds[0]!,
        minMessageCount: 2,
        sentinelText: 'Old answer before regeneration',
      });

      const assistant = page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
        hasText: 'Old answer before regeneration',
      }).first();
      await assistant.hover();
      await assistant.locator(`${CHAT_MESSAGE_ACTION_SELECTOR}[data-chat-message-action="regenerate"]`).click();
      await expect(page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
        hasText: REGENERATED_SENTINEL,
      })).toBeVisible({ timeout: 30_000 });

      const state = await getChatState(page);
      const message = state.messages[fixture.sessionIds[0]!]?.find((item: { id: string }) =>
        item.id === 'audit-regenerate-assistant'
      );
      expect(message?.content).toContain(REGENERATED_SENTINEL);
      expect(message?.versions?.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(message?.currentVersionIndex).toBe((message?.versions?.length ?? 1) - 1);
      expect(provider.requests().some((request) => request.lastUserText.includes('AUDIT_REGENERATE_PROMPT'))).toBe(true);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
      await provider.close();
    }
  });
});
