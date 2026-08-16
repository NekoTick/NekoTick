import { expect, test } from '@playwright/test';
import http from 'node:http';
import {
  CHAT_COMPOSER_TEXTAREA_SELECTOR,
  CHAT_MESSAGE_SELECTOR,
  cleanupIsolatedElectron,
  createChatModelFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  setAppViewMode,
} from './notesE2E';

const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

type AttachmentProviderRequest = {
  body: string;
  lastUserText: string;
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

async function createAttachmentProviderServer(): Promise<{
  close: () => Promise<void>;
  requests: () => AttachmentProviderRequest[];
  url: string;
}> {
  const requests: AttachmentProviderRequest[] = [];
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
      requests.push({
        body,
        lastUserText: getLastUserTextFromBody(body),
      });

      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
      });
      response.write('data: {"choices":[{"delta":{"content":"Attachment request received."}}]}\n\n');
      response.write('data: [DONE]\n\n');
      response.end();
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
    throw new Error('Unable to allocate attachment provider port.');
  }

  return {
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
    requests: () => requests.slice(),
    url: `http://127.0.0.1:${address.port}/v1`,
  };
}

test.describe('chat attachment preview', () => {
  test.setTimeout(120_000);

  test('shows an image thumbnail above the composer after selecting an image', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-attachment-preview');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await createChatModelFixture(page, {
        providerName: 'E2E Attachment Preview Provider',
        apiModelId: 'e2e-attachment-preview-model',
      });

      await setAppViewMode(page, 'chat');
      const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR);
      await expect(textarea).toBeVisible({ timeout: 30_000 });
      await textarea.fill('Describe this');
      await textarea.evaluate((element) => element.setSelectionRange(0, 0));
      await textarea.evaluate((element) => {
        element.addEventListener('blur', () => {
          const composer = element.closest('[data-chat-input="true"]');
          if (composer?.querySelector('[data-chat-attachment-preview="true"]')) {
            element.dataset.caretLayoutRefocused = 'true';
          }
        });
      });

      await page.locator('[data-chat-input-action="open-actions"]').click();
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.locator('[data-chat-input-action="upload"]').click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: 'e2e-attachment-preview.png',
        mimeType: 'image/png',
        buffer: TINY_PNG_BUFFER,
      });

      const previewList = page.locator('[data-chat-attachment-preview-list="true"]');
      const previewImage = page.locator(
        '[data-chat-attachment-preview="true"] img[alt="e2e-attachment-preview.png"]',
      );

      await expect(previewList).toBeVisible({ timeout: 30_000 });
      await expect(previewImage).toBeVisible({ timeout: 30_000 });
      await expect(previewImage).toHaveAttribute('src', /^data:image\/png;base64,/);
      await expect(textarea).toBeFocused();
      await expect(textarea).toHaveAttribute('data-caret-layout-refocused', 'true');
      await expect(textarea).toHaveJSProperty('selectionStart', 'Describe this'.length);
      await expect(textarea).toHaveJSProperty('selectionEnd', 'Describe this'.length);

      const metrics = await page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('[data-chat-attachment-preview-list="true"]');
        const image = document.querySelector<HTMLImageElement>(
          '[data-chat-attachment-preview="true"] img[alt="e2e-attachment-preview.png"]',
        );
        const composer = document.querySelector<HTMLElement>('[data-chat-input="true"]');
        const textarea = document.querySelector<HTMLTextAreaElement>('[data-chat-input="true"] textarea');
        return {
          previewCount: document.querySelectorAll('[data-chat-attachment-preview="true"]').length,
          imageComplete: Boolean(image?.complete),
          imageNaturalWidth: image?.naturalWidth ?? 0,
          imageSrc: image?.getAttribute('src') ?? null,
          listHeight: list?.getBoundingClientRect().height ?? 0,
          composerHeight: composer?.getBoundingClientRect().height ?? 0,
          imageBottom: image?.getBoundingClientRect().bottom ?? 0,
          textareaTop: textarea?.getBoundingClientRect().top ?? 0,
        };
      });

      console.info('[chat-attachment-preview]', metrics);
      expect(metrics).toMatchObject({
        previewCount: 1,
        imageComplete: true,
        imageNaturalWidth: 1,
      });
      expect(metrics.imageSrc).toMatch(/^data:image\/png;base64,/);
      expect(metrics.listHeight).toBeGreaterThan(0);
      expect(metrics.composerHeight).toBeGreaterThan(metrics.listHeight);
      expect(metrics.textareaTop).toBeGreaterThanOrEqual(metrics.imageBottom);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('renders text files as mention-style tokens and sends saved content to the provider', async () => {
    const provider = await createAttachmentProviderServer();
    const { app, userDataRoot } = await launchIsolatedElectron('chat-file-attachment');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await createChatModelFixture(page, {
        apiHost: provider.url,
        providerName: 'E2E File Attachment Provider',
        apiModelId: 'e2e-file-attachment-model',
      });

      await setAppViewMode(page, 'chat');
      const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR);
      await expect(textarea).toBeVisible({ timeout: 30_000 });

      await page.locator('[data-chat-input-action="open-actions"]').click();
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.locator('[data-chat-input-action="upload"]').click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: 'e2e-notes.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# E2E Notes\n\nThis file should reach the chat request.', 'utf8'),
      });

      await expect(page.locator('[data-chat-attachment-preview="true"]')).toBeVisible({ timeout: 30_000 });
      const fileToken = page.locator('[data-chat-file-attachment-token="true"]', { hasText: 'e2e-notes.md' });
      await expect(fileToken).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-chat-attachment-preview="true"] img')).toHaveCount(0);

      const tokenMetrics = await fileToken.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          borderRadius: Number.parseFloat(style.borderRadius),
          height: rect.height,
          width: rect.width,
        };
      });
      expect(tokenMetrics.height).toBeLessThan(48);
      expect(tokenMetrics.width).toBeGreaterThan(tokenMetrics.height);
      expect(tokenMetrics.borderRadius).toBeGreaterThanOrEqual(10);

      await textarea.fill('Summarize the attached file.');
      await textarea.press('Enter');

      await expect.poll(async () => page.evaluate(() => {
        const state = (window as any).__vlainaE2E.getChatState();
        const sessionId = state.currentSessionId;
        const messages = sessionId ? state.messages[sessionId] ?? [] : [];
        const userMessages = messages.filter((message: { role: string }) => message.role === 'user');
        return userMessages[userMessages.length - 1]?.content ?? '';
      }), { timeout: 30_000 }).toContain('@e2e-notes.md');

      await expect(page.locator(`${CHAT_MESSAGE_SELECTOR}[data-role="assistant"]`, {
        hasText: 'Attachment request received.',
      })).toBeVisible({ timeout: 30_000 });

      const readLastProviderUserText = async () => {
        const request = provider.requests().at(-1);
        return request?.lastUserText ?? '';
      };
      await expect.poll(readLastProviderUserText, { timeout: 30_000 })
        .toContain('Summarize the attached file.');
      await expect.poll(readLastProviderUserText, { timeout: 30_000 })
        .toContain('<attached_file name="e2e-notes.md">');
      await expect.poll(readLastProviderUserText, { timeout: 30_000 })
        .toContain('This file should reach the chat request.');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
      await provider.close();
    }
  });

  test('keeps mixed attachment previews wrapped and bounded when many files are selected', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-many-attachments-layout');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 520, height: 760 });
      await createChatModelFixture(page, {
        providerName: 'E2E Many Attachments Provider',
        apiModelId: 'e2e-many-attachments-model',
      });

      await setAppViewMode(page, 'chat');
      await expect(page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR)).toBeVisible({ timeout: 30_000 });

      await page.locator('[data-chat-input-action="open-actions"]').click();
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.locator('[data-chat-input-action="upload"]').click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles([
        ...Array.from({ length: 7 }, (_value, index) => ({
          name: `e2e-layout-image-${index}.png`,
          mimeType: 'image/png',
          buffer: TINY_PNG_BUFFER,
        })),
        ...Array.from({ length: 12 }, (_value, index) => ({
          name: `e2e-layout-notes-${index}-with-a-long-name.md`,
          mimeType: 'text/markdown',
          buffer: Buffer.from(`# Layout Notes ${index}\n\nAttachment ${index}.`, 'utf8'),
        })),
      ]);

      await expect(page.locator('[data-chat-attachment-preview="true"]')).toHaveCount(19, { timeout: 30_000 });
      await expect(page.locator('[data-chat-file-attachment-token="true"]')).toHaveCount(12);
      await expect(page.locator('[data-chat-attachment-preview="true"] img')).toHaveCount(7);

      const metrics = await page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('[data-chat-attachment-preview-list="true"]');
        const textarea = document.querySelector<HTMLTextAreaElement>('[data-chat-input="true"] textarea');
        const previews = Array.from(document.querySelectorAll<HTMLElement>('[data-chat-attachment-preview="true"]'));
        const tokens = Array.from(document.querySelectorAll<HTMLElement>('[data-chat-file-attachment-token="true"]'));
        const listRect = list?.getBoundingClientRect() ?? null;
        const textareaRect = textarea?.getBoundingClientRect() ?? null;
        const previewRects = previews.map((preview) => preview.getBoundingClientRect());
        const tokenRects = tokens.map((token) => token.getBoundingClientRect());
        const removeButtonRects = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-chat-attachment-preview="true"] button[aria-label="Remove attachment"]',
          ),
          (button) => button.getBoundingClientRect(),
        );
        const rowTops = Array.from(new Set(previewRects.map((rect) => Math.round(rect.top))));
        return {
          horizontalOverflow: list ? list.scrollWidth - list.clientWidth : 0,
          listBottom: listRect?.bottom ?? 0,
          listClientHeight: list?.clientHeight ?? 0,
          listHeight: listRect?.height ?? 0,
          listScrollHeight: list?.scrollHeight ?? 0,
          maxPreviewRight: Math.max(0, ...previewRects.map((rect) => rect.right)),
          maxRemoveButtonRight: Math.max(0, ...removeButtonRects.map((rect) => rect.right)),
          maxTokenHeight: Math.max(0, ...tokenRects.map((rect) => rect.height)),
          minPreviewLeft: Math.min(Number.POSITIVE_INFINITY, ...previewRects.map((rect) => rect.left)),
          minRemoveButtonLeft: Math.min(Number.POSITIVE_INFINITY, ...removeButtonRects.map((rect) => rect.left)),
          rowCount: rowTops.length,
          textareaTop: textareaRect?.top ?? 0,
          textareaVisible: Boolean(textarea && textarea.offsetParent),
          tokenCount: tokens.length,
        };
      });

      expect(metrics.tokenCount).toBe(12);
      expect(metrics.rowCount).toBeGreaterThan(1);
      expect(metrics.listHeight).toBeLessThanOrEqual(161);
      expect(metrics.listScrollHeight).toBeGreaterThan(metrics.listClientHeight);
      expect(metrics.horizontalOverflow).toBeLessThanOrEqual(6);
      expect(metrics.maxTokenHeight).toBeLessThan(40);
      expect(metrics.minRemoveButtonLeft).toBeGreaterThanOrEqual(metrics.minPreviewLeft - 1);
      expect(metrics.maxRemoveButtonRight).toBeLessThanOrEqual(metrics.maxPreviewRight + 1);
      expect(metrics.textareaVisible).toBe(true);
      expect(metrics.listBottom).toBeLessThanOrEqual(metrics.textareaTop + 1);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps a very long file token inside the composer on narrow screens', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-long-attachment-name-layout');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 360, height: 680 });
      await createChatModelFixture(page, {
        providerName: 'E2E Long Attachment Name Provider',
        apiModelId: 'e2e-long-attachment-name-model',
      });

      await setAppViewMode(page, 'chat');
      const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR);
      await expect(textarea).toBeVisible({ timeout: 30_000 });

      await page.locator('[data-chat-input-action="open-actions"]').click();
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.locator('[data-chat-input-action="upload"]').click();
      const fileChooser = await fileChooserPromise;
      const longName = 'e2e-this-is-a-very-long-file-name-that-should-truncate-without-breaking-the-composer-layout-notes.md';
      await fileChooser.setFiles({
        name: longName,
        mimeType: 'text/markdown',
        buffer: Buffer.from('# Long name\n\nThe layout should remain bounded.', 'utf8'),
      });

      const fileToken = page.locator('[data-chat-file-attachment-token="true"]');
      await expect(fileToken).toBeVisible({ timeout: 30_000 });

      const metrics = await page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('[data-chat-attachment-preview-list="true"]');
        const token = document.querySelector<HTMLElement>('[data-chat-file-attachment-token="true"]');
        const label = token?.querySelector<HTMLElement>('span') ?? null;
        const removeButton = token?.querySelector<HTMLElement>('button[aria-label="Remove attachment"]') ?? null;
        const listRect = list?.getBoundingClientRect() ?? null;
        const tokenRect = token?.getBoundingClientRect() ?? null;
        const removeRect = removeButton?.getBoundingClientRect() ?? null;
        return {
          horizontalOverflow: list ? list.scrollWidth - list.clientWidth : 0,
          labelIsTruncated: label ? label.scrollWidth > label.clientWidth : false,
          listClientWidth: list?.clientWidth ?? 0,
          listLeft: listRect?.left ?? 0,
          listRight: listRect?.right ?? 0,
          removeLeft: removeRect?.left ?? 0,
          removeRight: removeRect?.right ?? 0,
          tokenLeft: tokenRect?.left ?? 0,
          tokenRight: tokenRect?.right ?? 0,
          tokenWidth: tokenRect?.width ?? 0,
        };
      });

      expect(metrics.horizontalOverflow).toBeLessThanOrEqual(6);
      expect(metrics.tokenWidth).toBeLessThanOrEqual(metrics.listClientWidth + 1);
      expect(metrics.tokenLeft).toBeGreaterThanOrEqual(metrics.listLeft - 1);
      expect(metrics.tokenRight).toBeLessThanOrEqual(metrics.listRight + 1);
      expect(metrics.removeLeft).toBeGreaterThanOrEqual(metrics.listLeft - 1);
      expect(metrics.removeRight).toBeLessThanOrEqual(metrics.listRight + 1);
      expect(metrics.labelIsTruncated).toBe(true);

      await fileToken.hover();
      await fileToken.getByRole('button', { name: 'Remove attachment' }).click();
      await expect(page.locator('[data-chat-attachment-preview="true"]')).toHaveCount(0);
      await expect(textarea).toBeFocused();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('shows feedback instead of a silent no-op for unsupported files', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-unsupported-attachment');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await createChatModelFixture(page, {
        providerName: 'E2E Unsupported Attachment Provider',
        apiModelId: 'e2e-unsupported-attachment-model',
      });

      await setAppViewMode(page, 'chat');
      await expect(page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR)).toBeVisible({ timeout: 30_000 });

      await page.locator('[data-chat-input-action="open-actions"]').click();
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.locator('[data-chat-input-action="upload"]').click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: 'unsupported.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.7\nunsupported attachment\n', 'utf8'),
      });

      await expect(page.locator('[data-chat-attachment-preview="true"]')).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByText(/Unsupported File|不支持的文件/)).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
