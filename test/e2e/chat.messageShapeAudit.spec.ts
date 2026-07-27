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

type AuditProviderRequest = {
  body: string;
  lastUserText: string;
};

type MessageShapeCase = {
  id: string;
  prompt: string;
  responseSentinel: string;
  inputMode: 'fill' | 'explicit-multiline';
  lines?: string[];
};

type LatestTurnLayoutSample = {
  clientHeight: number;
  composerValue: string;
  generating: boolean;
  latestAssistantAfterUserContent: string;
  latestAssistantAfterUserRendered: boolean;
  lastUserContent: string;
  messageCount: number;
  scrollHeight: number;
  scrollTop: number;
  userHeight: number | null;
  userBottomOffset: number | null;
  userRendered: boolean;
  userTopOffset: number | null;
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

function getAuditCaseId(prompt: string): string {
  return /\bE2E_MESSAGE_AUDIT_([A-Z_]+)\b/.exec(prompt)?.[1] ?? 'UNKNOWN';
}

function buildAssistantResponse(prompt: string): string {
  const caseId = getAuditCaseId(prompt);
  const sentinel = `E2E_MESSAGE_RESPONSE_${caseId}`;

  if (caseId === 'MARKDOWN_CODE') {
    return [
      `## Message shape audit ${caseId}`,
      '',
      sentinel,
      '',
      '- rendered list item',
      '- rendered item with `inline code`',
      '',
      '```ts',
      'const auditShape = "markdown-code";',
      '```',
      '',
      '| field | value |',
      '| --- | --- |',
      '| status | ok |',
    ].join('\n');
  }

  if (caseId === 'LONG_WRAP') {
    return [
      `Message shape audit ${caseId}. ${sentinel}`,
      '',
      Array.from({ length: 36 }, (_value, index) => `response-token-${index}`).join(' '),
    ].join('\n');
  }

  return [
    `Message shape audit ${caseId}. ${sentinel}`,
    '',
    'The local provider completed this turn.',
  ].join('\n');
}

async function createMessageShapeProviderServer(): Promise<{
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
      requests.push({ body, lastUserText });

      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
      });

      const chunks = buildAssistantResponse(lastUserText).match(/[\s\S]{1,28}/g) ?? [''];
      let index = 0;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const sendNextChunk = () => {
        if (index >= chunks.length) {
          timer = null;
          response.write('data: [DONE]\n\n');
          response.end();
          return;
        }

        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[index] } }] })}\n\n`);
        index += 1;
        timer = setTimeout(sendNextChunk, 8);
      };
      timer = setTimeout(sendNextChunk, 300);

      const clearTimer = () => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      };
      response.on('close', clearTimer);
      request.on('aborted', clearTimer);
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
    throw new Error('Unable to allocate message shape provider port.');
  }

  return {
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
    requests: () => requests.slice(),
    url: `http://127.0.0.1:${address.port}/v1`,
  };
}

function createAuditHistoryMessages(count: number) {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (let index = 0; index < count; index += 1) {
    messages.push({
      role: 'user',
      content: `History user prompt ${index}`,
    });
    messages.push({
      role: 'assistant',
      content: [
        `### History assistant response ${index}`,
        '',
        'This seeded response keeps the chat virtualized before the audit sends new prompts.',
        '',
        '- historical bullet alpha',
        '- historical bullet beta',
      ].join('\n'),
    });
  }
  return messages;
}

function createMessageShapeCases(): MessageShapeCase[] {
  const cjk = String.fromCodePoint(0x4f60, 0x597d, 0xff0c, 0x4e16, 0x754c);
  const emoji = String.fromCodePoint(0x1f44b, 0x1f680);

  return [
    {
      id: 'SHORT',
      prompt: 'E2E_MESSAGE_AUDIT_SHORT hi',
      responseSentinel: 'E2E_MESSAGE_RESPONSE_SHORT',
      inputMode: 'fill',
    },
    {
      id: 'MULTILINE',
      prompt: [
        'E2E_MESSAGE_AUDIT_MULTILINE first line',
        '',
        'second line after a blank line',
        'third line with enough text to wrap in the bubble',
      ].join('\n'),
      responseSentinel: 'E2E_MESSAGE_RESPONSE_MULTILINE',
      inputMode: 'explicit-multiline',
      lines: [
        'E2E_MESSAGE_AUDIT_MULTILINE first line',
        '',
        'second line after a blank line',
        'third line with enough text to wrap in the bubble',
      ],
    },
    {
      id: 'MARKDOWN_CODE',
      prompt: [
        'E2E_MESSAGE_AUDIT_MARKDOWN_CODE please inspect this input:',
        '- user bullet one',
        '- user bullet two',
        '',
        '```ts',
        'const userValue = 42;',
        '```',
        '',
        '> quoted user line',
      ].join('\n'),
      responseSentinel: 'E2E_MESSAGE_RESPONSE_MARKDOWN_CODE',
      inputMode: 'explicit-multiline',
      lines: [
        'E2E_MESSAGE_AUDIT_MARKDOWN_CODE please inspect this input:',
        '- user bullet one',
        '- user bullet two',
        '',
        '```ts',
        'const userValue = 42;',
        '```',
        '',
        '> quoted user line',
      ],
    },
    {
      id: 'LONG_WRAP',
      prompt: `E2E_MESSAGE_AUDIT_LONG_WRAP ${Array.from({ length: 72 }, (_value, index) => `segment-${index}`).join(' ')}`,
      responseSentinel: 'E2E_MESSAGE_RESPONSE_LONG_WRAP',
      inputMode: 'fill',
    },
    {
      id: 'UNICODE',
      prompt: `E2E_MESSAGE_AUDIT_UNICODE ${cjk} ${emoji} mixed with ascii text`,
      responseSentinel: 'E2E_MESSAGE_RESPONSE_UNICODE',
      inputMode: 'fill',
    },
  ];
}

async function scrollChatToTop(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const scrollRoot = document.querySelector<HTMLElement>(selector);
    if (!scrollRoot) {
      return;
    }
    scrollRoot.scrollTop = 0;
    scrollRoot.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, CHAT_SCROLLABLE_SELECTOR);
  await page.waitForTimeout(80);
}

async function sendPrompt(page: Page, prompt: string): Promise<void> {
  const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR);
  await expect(textarea).toBeVisible({ timeout: 30_000 });
  await textarea.fill(prompt);
  await textarea.press('Enter');
  await expect(textarea).toHaveValue('', { timeout: 10_000 });
}

async function sendExplicitMultilinePrompt(page: Page, lines: string[]): Promise<void> {
  const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR);
  await expect(textarea).toBeVisible({ timeout: 30_000 });
  await textarea.click();

  if (lines.length > 0) {
    await page.keyboard.insertText(lines[0] ?? '');
  }

  for (let index = 1; index < lines.length; index += 1) {
    await page.keyboard.press('Shift+Enter');
    const nextLine = lines[index] ?? '';
    if (nextLine.length > 0) {
      await page.keyboard.insertText(nextLine);
    }
  }

  await page.keyboard.press('Enter');
  await expect(textarea).toHaveValue('', { timeout: 10_000 });
}

async function readLatestTurnLayout(page: Page, sessionId: string): Promise<LatestTurnLayoutSample> {
  return page.evaluate(({ sessionId, scrollableSelector, textareaSelector }) => {
    const state = (window as any).__vlainaE2E.getChatState();
    const messages = state.messages[sessionId] ?? [];
    const lastUserIndex = messages.findLastIndex((message: { role: string }) => message.role === 'user');
    const latestAssistantAfterUserIndex = lastUserIndex >= 0
      ? messages.findLastIndex((message: { role: string }, index: number) =>
        index > lastUserIndex && message.role === 'assistant')
      : -1;
    const scrollRoot = document.querySelector<HTMLElement>(scrollableSelector);
    const textarea = document.querySelector<HTMLTextAreaElement>(textareaSelector);
    const userRow = lastUserIndex >= 0
      ? document.querySelector<HTMLElement>(`[data-message-index="${lastUserIndex}"]`)
      : null;
    const assistantAfterUserRow = latestAssistantAfterUserIndex >= 0
      ? document.querySelector<HTMLElement>(`[data-message-index="${latestAssistantAfterUserIndex}"]`)
      : null;
    const scrollRect = scrollRoot?.getBoundingClientRect() ?? null;
    const userRect = userRow?.getBoundingClientRect() ?? null;

    return {
      clientHeight: scrollRoot?.clientHeight ?? 0,
      composerValue: textarea?.value ?? '',
      generating: state.generating === true,
      latestAssistantAfterUserContent: latestAssistantAfterUserIndex >= 0
        ? messages[latestAssistantAfterUserIndex]?.content ?? ''
        : '',
      latestAssistantAfterUserRendered: Boolean(assistantAfterUserRow),
      lastUserContent: lastUserIndex >= 0 ? messages[lastUserIndex]?.content ?? '' : '',
      messageCount: messages.length,
      scrollHeight: scrollRoot?.scrollHeight ?? 0,
      scrollTop: scrollRoot?.scrollTop ?? 0,
      userBottomOffset: userRect && scrollRect ? userRect.bottom - scrollRect.top : null,
      userHeight: userRect?.height ?? null,
      userRendered: Boolean(userRow),
      userTopOffset: userRect && scrollRect ? userRect.top - scrollRect.top : null,
    };
  }, {
    scrollableSelector: CHAT_SCROLLABLE_SELECTOR,
    sessionId,
    textareaSelector: CHAT_COMPOSER_TEXTAREA_SELECTOR,
  });
}

function expectLatestUserVisible(sample: LatestTurnLayoutSample, id: string): void {
  expect(sample.scrollHeight, id).toBeGreaterThan(0);
  expect(sample.userRendered, id).toBe(true);
  expect(sample.userHeight, id).not.toBeNull();
  expect(sample.userBottomOffset ?? 0, id).toBeGreaterThan(24);
  expect(sample.userBottomOffset ?? 0, id).toBeLessThanOrEqual(sample.clientHeight + 1);

  if ((sample.userHeight ?? 0) < sample.clientHeight) {
    expect(sample.userTopOffset ?? Number.NaN, id).toBeGreaterThanOrEqual(-1);
    expect(sample.userTopOffset ?? sample.clientHeight, id).toBeLessThan(sample.clientHeight * 0.5);
    return;
  }

  expect(sample.userBottomOffset ?? 0, id).toBeGreaterThan(80);
}

test.describe('chat message shape audit', () => {
  test.setTimeout(180_000);

  test('preserves and anchors representative prompt shapes through real sends', async () => {
    const provider = await createMessageShapeProviderServer();
    const { app, userDataRoot } = await launchIsolatedElectron('chat-message-shape-audit');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await createChatModelFixture(page, {
        apiHost: provider.url,
        apiModelId: 'e2e-message-shape-audit-model',
        providerName: 'E2E Message Shape Audit Provider',
      });
      const fixture = await createChatFixture(page, {
        sessions: [{
          title: 'E2E Message Shape Audit',
          messages: createAuditHistoryMessages(16),
        }],
      });

      await setAppViewMode(page, 'chat');
      await expect(page.locator(CHAT_VIEW_SELECTOR)).toBeVisible({ timeout: 30_000 });
      await waitForChatSession(page, {
        sessionId: fixture.sessionIds[0]!,
        minMessageCount: 32,
      });

      for (const auditCase of createMessageShapeCases()) {
        await scrollChatToTop(page);
        if (auditCase.inputMode === 'explicit-multiline') {
          await sendExplicitMultilinePrompt(page, auditCase.lines ?? []);
        } else {
          await sendPrompt(page, auditCase.prompt);
        }
        await expect.poll(async () => readLatestTurnLayout(page, fixture.sessionIds[0]!), {
          timeout: 10_000,
        }).toMatchObject({
          composerValue: '',
          generating: true,
          latestAssistantAfterUserContent: '',
          lastUserContent: auditCase.prompt,
          userRendered: true,
        });

        const sendingSample = await readLatestTurnLayout(page, fixture.sessionIds[0]!);
        expectLatestUserVisible(sendingSample, `${auditCase.id}:sending`);
        await expect(page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
          hasText: auditCase.responseSentinel,
        })).toBeVisible({ timeout: 30_000 });

        await expect.poll(async () => readLatestTurnLayout(page, fixture.sessionIds[0]!), {
          timeout: 30_000,
        }).toMatchObject({
          composerValue: '',
          generating: false,
          latestAssistantAfterUserContent: expect.stringContaining(auditCase.responseSentinel),
          latestAssistantAfterUserRendered: true,
          lastUserContent: auditCase.prompt,
          userRendered: true,
        });

        const sample = await readLatestTurnLayout(page, fixture.sessionIds[0]!);
        expectLatestUserVisible(sample, `${auditCase.id}:completed`);
      }

      const prompts = provider.requests().map((request) => request.lastUserText);
      for (const auditCase of createMessageShapeCases()) {
        expect(prompts.some((prompt) => prompt === auditCase.prompt)).toBe(true);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
      await provider.close();
    }
  });
});
